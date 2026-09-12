"""Configuration and generic approved JSON source loading."""

import json
import os
from pathlib import Path
from typing import Any

from responses import limitation

BOUNDARY_DATA_PATH_ENV = "KINDERPRINT_BOUNDARY_DATA_PATH"
PROFILE_DATA_PATH_ENV = "KINDERPRINT_PROFILE_DATA_PATH"
PRIORITY_DATA_PATH_ENV = "KINDERPRINT_PRIORITY_DATA_PATH"
EXPLANATION_DATA_PATH_ENV = "KINDERPRINT_EXPLANATION_DATA_PATH"
COMPARISON_DATA_PATH_ENV = "KINDERPRINT_COMPARISON_DATA_PATH"
OUTCOME_COMPARISON_DATA_PATH_ENV = "KINDERPRINT_OUTCOME_COMPARISON_DATA_PATH"
ENVIRONMENTAL_DIFFERENCE_DATA_PATH_ENV = "KINDERPRINT_ENVIRONMENTAL_DIFFERENCE_DATA_PATH"


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


def outcome_comparison_data_path() -> Path | None:
    value = os.getenv(OUTCOME_COMPARISON_DATA_PATH_ENV)
    return Path(value).expanduser() if value else None


def environmental_difference_data_path() -> Path | None:
    value = os.getenv(ENVIRONMENTAL_DIFFERENCE_DATA_PATH_ENV)
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
