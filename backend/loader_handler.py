"""Admin-only Lambda entry point that loads the packaged datasets into PostgreSQL.

Deployed only by the Vkinder database stack (template.yaml, CreateDatabase=true).
It runs inside the same private network as the database, reads the dataset files
bundled in /var/task/data (the same files the API serves in files mode) and runs
datascience/scripts/load_to_db.py, which prepare_lambda_package.sh copies next
to this file.

Invoke it with the AWS CLI; nothing public can reach it:

    aws lambda invoke --function-name vkinder-loader --payload '{}' out.json
    aws lambda invoke --function-name vkinder-loader \
        --cli-binary-format raw-in-base64-out --payload '{"only": ["family_fit"]}' out.json
"""

from __future__ import annotations

import contextlib
import io
from typing import Any

_MAX_OUTPUT = 20000


def build_args(event: Any) -> list[str]:
    """Translate the invoke payload into load_to_db.py arguments."""
    event = event if isinstance(event, dict) else {}
    args: list[str] = []
    only = event.get("only") or []
    if isinstance(only, str):
        only = [only]
    for key in only:
        args += ["--only", str(key)]
    if event.get("dry_run"):
        args.append("--dry-run")
    return args


def handler(event: Any, context: Any) -> dict[str, Any]:
    import load_to_db  # imported here so the API bundle never loads it by accident

    out, err = io.StringIO(), io.StringIO()
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        code = load_to_db.main(build_args(event))
    result = {
        "status": "loaded" if code == 0 else "failed",
        "exit_code": code,
        "output": out.getvalue()[-_MAX_OUTPUT:],
        "errors": err.getvalue()[-_MAX_OUTPUT:],
    }
    print(result["output"])
    if result["errors"]:
        print(result["errors"])
    return result
