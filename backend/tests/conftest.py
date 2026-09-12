import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from data_loader import (  # noqa: E402
    BOUNDARY_DATA_PATH_ENV,
    COMPARISON_DATA_PATH_ENV,
    EXPLANATION_DATA_PATH_ENV,
    OUTCOME_COMPARISON_DATA_PATH_ENV,
    PRIORITY_DATA_PATH_ENV,
    PROFILE_DATA_PATH_ENV,
)
from main import app  # noqa: E402


@pytest.fixture(autouse=True)
def clear_dataset_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    for variable in (
        BOUNDARY_DATA_PATH_ENV,
        PROFILE_DATA_PATH_ENV,
        PRIORITY_DATA_PATH_ENV,
        EXPLANATION_DATA_PATH_ENV,
        COMPARISON_DATA_PATH_ENV,
        OUTCOME_COMPARISON_DATA_PATH_ENV,
    ):
        monkeypatch.delenv(variable, raising=False)


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def write_json(tmp_path: Path):
    def write(name: str, content: str) -> Path:
        path = tmp_path / name
        path.write_text(content, encoding="utf-8")
        return path

    return write
