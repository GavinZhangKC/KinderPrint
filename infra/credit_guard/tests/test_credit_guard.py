"""Tests for the Vkinder credit guard (run: python3 -m pytest infra/credit_guard/tests)."""

from __future__ import annotations

import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

GUARD_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(GUARD_DIR))

import app  # noqa: E402


class FakeFreeTier:
    def __init__(self, credits=134.66, days=120, status="ACTIVE", error=None):
        self.credits, self.days, self.status, self.error = credits, days, status, error

    def get_account_plan_state(self):
        if self.error:
            raise self.error
        return {
            "accountPlanType": "FREE",
            "accountPlanStatus": self.status,
            "accountPlanRemainingCredits": {"amount": self.credits, "unit": "USD"},
            "accountPlanExpirationDate": datetime.now(timezone.utc) + timedelta(days=self.days),
        }


class FakeRds:
    def __init__(self, status="available"):
        self.status, self.stopped = status, []

    def describe_db_instances(self, DBInstanceIdentifier):
        return {"DBInstances": [{"DBInstanceStatus": self.status}]}

    def stop_db_instance(self, DBInstanceIdentifier):
        self.stopped.append(DBInstanceIdentifier)


class FakeLambda:
    def __init__(self):
        self.calls = []

    def put_function_concurrency(self, FunctionName, ReservedConcurrentExecutions):
        self.calls.append((FunctionName, ReservedConcurrentExecutions))


class FakeSns:
    def __init__(self):
        self.messages = []

    def publish(self, TopicArn, Subject, Message):
        self.messages.append((Subject, Message))


@pytest.fixture(autouse=True)
def guard_env(monkeypatch):
    monkeypatch.setenv("DB_INSTANCE_ID", "vkinder-db")
    monkeypatch.setenv("FUNCTION_NAMES", "vkinder-api,vkinder-loader")
    monkeypatch.setenv("ALERT_TOPIC_ARN", "arn:aws:sns:ap-southeast-2:000000000000:vkinder-alerts")
    for name in ("STOP_CREDITS_USD", "STOP_DAYS", "WARN_CREDITS_USD", "WARN_DAYS"):
        monkeypatch.delenv(name, raising=False)


def run(freetier, rds=None):
    clients = {"freetier": freetier, "rds": rds or FakeRds(), "lambda": FakeLambda(), "sns": FakeSns()}
    return app.handler({}, None, clients=clients), clients


def test_healthy_balance_changes_nothing():
    result, clients = run(FakeFreeTier(credits=134.66, days=120))
    assert result["decision"] == "ok"
    assert clients["rds"].stopped == [] and clients["lambda"].calls == [] and clients["sns"].messages == []


@pytest.mark.parametrize("credits,days", [(25, 120), (134, 10)])
def test_low_balance_or_close_expiry_warns_only(credits, days):
    result, clients = run(FakeFreeTier(credits=credits, days=days))
    assert result["decision"] == "warn"
    assert clients["rds"].stopped == [] and clients["lambda"].calls == []
    assert len(clients["sns"].messages) == 1


@pytest.mark.parametrize("kwargs", [{"credits": 9.5}, {"days": 2}, {"status": "EXPIRED"}])
def test_stop_conditions_stop_database_and_disable_functions(kwargs):
    result, clients = run(FakeFreeTier(**kwargs))
    assert result["decision"] == "stop"
    assert clients["rds"].stopped == ["vkinder-db"]
    assert clients["lambda"].calls == [("vkinder-api", 0), ("vkinder-loader", 0)]
    assert "stopped" in clients["sns"].messages[0][0]


def test_already_stopped_database_is_not_stopped_again():
    result, clients = run(FakeFreeTier(credits=1), rds=FakeRds(status="stopped"))
    assert clients["rds"].stopped == []
    assert "already stopped" in result["actions"][0]


def test_unreadable_balance_alerts_and_changes_nothing():
    result, clients = run(FakeFreeTier(error=RuntimeError("no access")))
    assert result["decision"] == "unknown"
    assert clients["rds"].stopped == [] and clients["lambda"].calls == []
    assert "could not read" in clients["sns"].messages[0][1]


def test_thresholds_come_from_environment(monkeypatch):
    monkeypatch.setenv("STOP_CREDITS_USD", "50")
    result, _ = run(FakeFreeTier(credits=40))
    assert result["decision"] == "stop"


def test_bundled_model_provides_the_free_tier_operation(monkeypatch):
    import botocore.session

    monkeypatch.setenv("AWS_DATA_PATH", str(GUARD_DIR / "models"))
    session = botocore.session.get_session()
    client = session.create_client("freetier", region_name="us-east-1",
                                   aws_access_key_id="x", aws_secret_access_key="y")
    assert hasattr(client, "get_account_plan_state")
