import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from core.data_loader import (  # noqa: E402
    ABS_CHILD_HEALTH_DATA_PATH_ENV,
    PHIDU_CHILD_HEALTH_DATA_PATH_ENV,
    PHIDU_PHA_SA2_BRIDGE_DATA_PATH_ENV,
    DEPARTMENT_AREA_BRIDGE_DATA_PATH_ENV,
    BUSHFIRE_CONTEXT_DATA_PATH_ENV,
    TRANSPORT_CONTEXT_DATA_PATH_ENV,
    SEASONAL_AIR_DATA_PATH_ENV,
    NEARBY_SERVICES_DATA_PATH_ENV,
    ACECQA_CONTEXT_DATA_PATH_ENV,
    ACECQA_GEOCODING_DATA_PATH_ENV,
    BOUNDARY_DATA_PATH_ENV,
    COMPARISON_DATA_PATH_ENV,
    COMMUNITY_CONTEXT_DATA_PATH_ENV,
    COMMUNITY_IDENTITY_DATA_PATH_ENV,
    EPA_STATION_YEAR_DATA_PATH_ENV,
    ENVIRONMENTAL_DIFFERENCE_DATA_PATH_ENV,
    EXPLANATION_DATA_PATH_ENV,
    OUTCOME_COMPARISON_DATA_PATH_ENV,
    PATTERN_INSIGHT_DATA_PATH_ENV,
    PREVENTION_OPPORTUNITY_DATA_PATH_ENV,
    PRIORITY_DATA_PATH_ENV,
    PROFILE_DATA_PATH_ENV,
    SUITABILITY_DATA_PATH_ENV,
    VIF_PROJECTION_DATA_PATH_ENV,
    VCAMS_AREA_DATA_PATH_ENV,
    VCAMS_LGA_DATA_PATH_ENV,
    HEALTH_FACILITY_DATA_PATH_ENV,
)
from core.data_loader import CARE_CONTEXT_ENV  # noqa: E402
from loaders.care_context import _read as load_care_context_csv  # noqa: E402
from main import app  # noqa: E402
from loaders.digital_health import _read as load_digital_health_csv  # noqa: E402
from validation import (  # noqa: E402
    load_comparison_data,
    load_explanations,
    load_priority_results,
    load_profiles,
    load_suitability_rankings,
)


@pytest.fixture(autouse=True)
def clear_dataset_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    load_digital_health_csv.cache_clear()
    load_care_context_csv.cache_clear()
    for variable in CARE_CONTEXT_ENV.values():
        monkeypatch.delenv(variable, raising=False)
    for loader in (
        load_profiles,
        load_suitability_rankings,
        load_priority_results,
        load_explanations,
        load_comparison_data,
    ):
        loader.cache_clear()
    for variable in (
        ABS_CHILD_HEALTH_DATA_PATH_ENV,
        PHIDU_CHILD_HEALTH_DATA_PATH_ENV,
        PHIDU_PHA_SA2_BRIDGE_DATA_PATH_ENV,
        DEPARTMENT_AREA_BRIDGE_DATA_PATH_ENV,
        BUSHFIRE_CONTEXT_DATA_PATH_ENV,
        TRANSPORT_CONTEXT_DATA_PATH_ENV,
        SEASONAL_AIR_DATA_PATH_ENV,
        NEARBY_SERVICES_DATA_PATH_ENV,
        ACECQA_CONTEXT_DATA_PATH_ENV,
        ACECQA_GEOCODING_DATA_PATH_ENV,
        BOUNDARY_DATA_PATH_ENV,
        PROFILE_DATA_PATH_ENV,
        PRIORITY_DATA_PATH_ENV,
        EXPLANATION_DATA_PATH_ENV,
        COMPARISON_DATA_PATH_ENV,
        COMMUNITY_CONTEXT_DATA_PATH_ENV,
        COMMUNITY_IDENTITY_DATA_PATH_ENV,
        EPA_STATION_YEAR_DATA_PATH_ENV,
        ENVIRONMENTAL_DIFFERENCE_DATA_PATH_ENV,
        OUTCOME_COMPARISON_DATA_PATH_ENV,
        PATTERN_INSIGHT_DATA_PATH_ENV,
        PREVENTION_OPPORTUNITY_DATA_PATH_ENV,
        SUITABILITY_DATA_PATH_ENV,
        VIF_PROJECTION_DATA_PATH_ENV,
        VCAMS_AREA_DATA_PATH_ENV,
        VCAMS_LGA_DATA_PATH_ENV,
        HEALTH_FACILITY_DATA_PATH_ENV,
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
