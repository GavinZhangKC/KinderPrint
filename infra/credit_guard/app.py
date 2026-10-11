"""Vkinder credit guard: stop paid resources before the AWS credits run out.

Runs once a day (EventBridge schedule in template.yaml). It reads the account's
free-plan state (remaining credits and expiry date) and:

* warns by email when credits fall below WARN_CREDITS_USD or the plan expires
  within WARN_DAYS;
* stops spending when credits fall below STOP_CREDITS_USD, the plan expires
  within STOP_DAYS, or the plan has expired:
  - stops the database instance (RDS restarts a stopped instance after 7 days,
    so the daily run stops it again), and
  - sets the API and loader functions' reserved concurrency to 0, so they
    cannot run.

If the plan state cannot be read, it emails a warning and changes nothing; the
monthly budget alert remains as a second safety net.

To resume after adding credit: aws rds start-db-instance and
aws lambda delete-function-concurrency (see docs/AWS_VKINDER.md).
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Any

import boto3


def _float_env(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, default))
    except ValueError:
        return default


def read_plan(freetier: Any) -> dict[str, Any]:
    """Return remaining credits (USD), days left and status from the Free Tier API."""
    state = freetier.get_account_plan_state()
    credits = state.get("accountPlanRemainingCredits") or {}
    expiry = state.get("accountPlanExpirationDate")
    days_left = None
    if expiry is not None:
        if isinstance(expiry, str):
            expiry = datetime.fromisoformat(expiry.replace("Z", "+00:00"))
        days_left = (expiry - datetime.now(timezone.utc)).total_seconds() / 86400
    return {
        "type": state.get("accountPlanType"),
        "status": state.get("accountPlanStatus"),
        "credits_usd": float(credits["amount"]) if "amount" in credits else None,
        "days_left": days_left,
    }


def decide(plan: dict[str, Any], *, stop_credits: float, stop_days: float,
           warn_credits: float, warn_days: float) -> str:
    """Return 'stop', 'warn' or 'ok'."""
    credits, days = plan.get("credits_usd"), plan.get("days_left")
    if plan.get("status") == "EXPIRED":
        return "stop"
    if credits is not None and credits < stop_credits:
        return "stop"
    if days is not None and days <= stop_days:
        return "stop"
    if (credits is not None and credits < warn_credits) or (days is not None and days <= warn_days):
        return "warn"
    return "ok"


def stop_spending(rds: Any, lambda_client: Any, db_instance: str, functions: list[str]) -> list[str]:
    actions: list[str] = []
    try:
        status = rds.describe_db_instances(DBInstanceIdentifier=db_instance)["DBInstances"][0]["DBInstanceStatus"]
    except Exception as error:  # instance already deleted, or no permission
        actions.append(f"database {db_instance}: not checked ({type(error).__name__})")
    else:
        if status == "available":
            rds.stop_db_instance(DBInstanceIdentifier=db_instance)
            actions.append(f"database {db_instance}: stop requested")
        else:
            actions.append(f"database {db_instance}: already {status}")
    for name in functions:
        lambda_client.put_function_concurrency(FunctionName=name, ReservedConcurrentExecutions=0)
        actions.append(f"function {name}: disabled (reserved concurrency 0)")
    return actions


def _notify(sns: Any, topic: str, subject: str, body: str) -> None:
    if topic:
        sns.publish(TopicArn=topic, Subject=subject[:99], Message=body)


def handler(event: Any, context: Any, *, clients: dict[str, Any] | None = None) -> dict[str, Any]:
    clients = clients or {
        # The Free Tier API is served from us-east-1.
        "freetier": boto3.client("freetier", region_name="us-east-1"),
        "rds": boto3.client("rds"),
        "lambda": boto3.client("lambda"),
        "sns": boto3.client("sns"),
    }
    topic = os.environ.get("ALERT_TOPIC_ARN", "")
    db_instance = os.environ["DB_INSTANCE_ID"]
    functions = [name for name in os.environ.get("FUNCTION_NAMES", "").split(",") if name]

    try:
        plan = read_plan(clients["freetier"])
    except Exception as error:
        body = (f"The Vkinder credit guard could not read the account's credit balance "
                f"({type(error).__name__}). Nothing was changed. Check Billing > Credits.")
        _notify(clients["sns"], topic, "Vkinder: credit check failed", body)
        return {"decision": "unknown", "error": type(error).__name__}

    decision = decide(
        plan,
        stop_credits=_float_env("STOP_CREDITS_USD", 10),
        stop_days=_float_env("STOP_DAYS", 3),
        warn_credits=_float_env("WARN_CREDITS_USD", 30),
        warn_days=_float_env("WARN_DAYS", 14),
    )
    summary = json.dumps(plan, default=str)
    result: dict[str, Any] = {"decision": decision, "plan": plan}
    if decision == "stop":
        result["actions"] = stop_spending(clients["rds"], clients["lambda"], db_instance, functions)
        _notify(clients["sns"], topic, "Vkinder stopped: AWS credits nearly used or expiring",
                "The credit guard stopped Vkinder's paid resources.\n\n"
                f"Plan: {summary}\n\nActions:\n- " + "\n- ".join(result["actions"]) +
                "\n\nA stopped database still has a small storage charge. To remove everything, "
                "delete the stack (see docs/AWS_VKINDER.md).")
    elif decision == "warn":
        _notify(clients["sns"], topic, "Vkinder: AWS credits running low",
                f"Credits or time are running low. Vkinder will stop automatically at the "
                f"stop threshold.\n\nPlan: {summary}")
    print(json.dumps(result, default=str))
    return result
