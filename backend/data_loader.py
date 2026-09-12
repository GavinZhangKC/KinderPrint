"""Configuration and generic approved JSON source loading."""

import json
import os
from pathlib import Path
from typing import Any

from responses import limitation


def _load_env_file(path: Path) -> None:
    """Load environment variables from a .env file without requiring an extra dependency."""
    if not path.exists():
        return

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue

        if line.startswith("export "):
            line = line[len("export "):].strip()

        if "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()

        if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
            value = value[1:-1]

        os.environ.setdefault(key, value)


def _load_project_env_files() -> None:
    """Load the repo root .env and any backend-local .env before reading config."""
    project_root = Path(__file__).resolve().parent.parent
    backend_root = Path(__file__).resolve().parent

    for candidate in (
        project_root / ".env",
        backend_root / ".env",
    ):
        _load_env_file(candidate)


_load_project_env_files()

BOUNDARY_DATA_PATH_ENV = "KINDERPRINT_BOUNDARY_DATA_PATH"
PROFILE_DATA_PATH_ENV = "KINDERPRINT_PROFILE_DATA_PATH"
PRIORITY_DATA_PATH_ENV = "KINDERPRINT_PRIORITY_DATA_PATH"
EXPLANATION_DATA_PATH_ENV = "KINDERPRINT_EXPLANATION_DATA_PATH"
COMPARISON_DATA_PATH_ENV = "KINDERPRINT_COMPARISON_DATA_PATH"


def boundary_data_path() -> Path | None:
    value = os.getenv(BOUNDARY_DATA_PATH_ENV)
    return Path(value).expanduser() if value else None


def profile_data_path() -> Path | None:
    value = os.getenv(PROFILE_DATA_PATH_ENV)
    return Path(value).expanduser() if value else None


def priority_data_path() -> Path | None:
    value = os.getenv(PRIORITY_DATA_PATH_ENV)
    return Path(value).expanduser() if value else None


def explanation_data_path() -> Path | None:
    value = os.getenv(EXPLANATION_DATA_PATH_ENV)
    return Path(value).expanduser() if value else None


def comparison_data_path() -> Path | None:
    value = os.getenv(COMPARISON_DATA_PATH_ENV)
    return Path(value).expanduser() if value else None


def load_json_source(path: Path | None, env_name: str, resource_name: str) -> tuple[dict[str, Any] | None, list[dict[str, Any]]]:
    """Load an approved JSON source, reporting configuration errors in-band."""
    if path is None:
        return None, [limitation(
            f"{resource_name}_dataset_not_configured",
            f"No {resource_name} dataset is configured. Set {env_name} to an approved JSON file.",
            resource_name)]
    if not path.is_file():
        return None, [limitation(
            f"{resource_name}_dataset_unavailable",
            f"The configured {resource_name} dataset could not be found.", resource_name)]
    try:
        source = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None, [limitation(
            f"{resource_name}_dataset_unreadable",
            f"The configured {resource_name} dataset could not be read as valid JSON.", resource_name)]
    if not isinstance(source, dict):
        return None, [limitation(
            f"{resource_name}_dataset_invalid",
            f"The configured {resource_name} dataset must contain a JSON object.", resource_name)]
    return source, []
