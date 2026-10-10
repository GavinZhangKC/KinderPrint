"""Core configuration and generic approved JSON source loading."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from core.responses import limitation
from core.sources import read_json, source_exists

BOUNDARY_DATA_PATH_ENV = "KINDERPRINT_BOUNDARY_DATA_PATH"
PROFILE_DATA_PATH_ENV = "KINDERPRINT_PROFILE_DATA_PATH"
PRIORITY_DATA_PATH_ENV = "KINDERPRINT_PRIORITY_DATA_PATH"
EXPLANATION_DATA_PATH_ENV = "KINDERPRINT_EXPLANATION_DATA_PATH"
COMPARISON_DATA_PATH_ENV = "KINDERPRINT_COMPARISON_DATA_PATH"
OUTCOME_COMPARISON_DATA_PATH_ENV = "KINDERPRINT_OUTCOME_COMPARISON_DATA_PATH"
ENVIRONMENTAL_DIFFERENCE_DATA_PATH_ENV = "KINDERPRINT_ENVIRONMENTAL_DIFFERENCE_DATA_PATH"
PATTERN_INSIGHT_DATA_PATH_ENV = "KINDERPRINT_PATTERN_INSIGHT_DATA_PATH"
PREVENTION_OPPORTUNITY_DATA_PATH_ENV = "KINDERPRINT_PREVENTION_OPPORTUNITY_DATA_PATH"
SUITABILITY_DATA_PATH_ENV = "KINDERPRINT_SUITABILITY_DATA_PATH"
VIF_PROJECTION_DATA_PATH_ENV = "KINDERPRINT_VIF_PROJECTION_DATA_PATH"
EPA_STATION_YEAR_DATA_PATH_ENV = "KINDERPRINT_EPA_STATION_YEAR_DATA_PATH"
ACECQA_GEOCODING_DATA_PATH_ENV = "KINDERPRINT_ACECQA_GEOCODING_DATA_PATH"
ACECQA_CONTEXT_DATA_PATH_ENV = "KINDERPRINT_ACECQA_CONTEXT_DATA_PATH"
COMMUNITY_CONTEXT_DATA_PATH_ENV = "KINDERPRINT_COMMUNITY_CONTEXT_DATA_PATH"
COMMUNITY_IDENTITY_DATA_PATH_ENV = "KINDERPRINT_COMMUNITY_IDENTITY_DATA_PATH"
VCAMS_AREA_DATA_PATH_ENV = "KINDERPRINT_VCAMS_AREA_DATA_PATH"
VCAMS_LGA_DATA_PATH_ENV = "KINDERPRINT_VCAMS_LGA_DATA_PATH"
HEALTH_FACILITY_DATA_PATH_ENV = "KINDERPRINT_HEALTH_FACILITY_DATA_PATH"
ABS_CHILD_HEALTH_DATA_PATH_ENV = "KINDERPRINT_ABS_CHILD_HEALTH_DATA_PATH"
PHIDU_CHILD_HEALTH_DATA_PATH_ENV = "KINDERPRINT_PHIDU_CHILD_HEALTH_DATA_PATH"
PHIDU_PHA_SA2_BRIDGE_DATA_PATH_ENV = "KINDERPRINT_PHIDU_PHA_SA2_BRIDGE_DATA_PATH"
DEPARTMENT_AREA_BRIDGE_DATA_PATH_ENV = "KINDERPRINT_DEPARTMENT_AREA_BRIDGE_DATA_PATH"
BUSHFIRE_CONTEXT_DATA_PATH_ENV = "KINDERPRINT_BUSHFIRE_CONTEXT_DATA_PATH"
TRANSPORT_CONTEXT_DATA_PATH_ENV = "KINDERPRINT_TRANSPORT_CONTEXT_DATA_PATH"
SEASONAL_AIR_DATA_PATH_ENV = "KINDERPRINT_SEASONAL_AIR_DATA_PATH"
NEARBY_SERVICES_DATA_PATH_ENV = "KINDERPRINT_NEARBY_SERVICES_DATA_PATH"
VACCINATION_PLACES_DATA_PATH_ENV = "KINDERPRINT_VACCINATION_PLACES_DATA_PATH"
COUNCIL_IMMUNISATION_DATA_PATH_ENV = "KINDERPRINT_COUNCIL_IMMUNISATION_DATA_PATH"


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


def pattern_insight_data_path() -> Path | None:
    value = os.getenv(PATTERN_INSIGHT_DATA_PATH_ENV)
    return Path(value).expanduser() if value else None


def prevention_opportunity_data_path() -> Path | None:
    value = os.getenv(PREVENTION_OPPORTUNITY_DATA_PATH_ENV)
    return Path(value).expanduser() if value else None


def suitability_data_path() -> Path | None:
    value = os.getenv(SUITABILITY_DATA_PATH_ENV)
    return Path(value).expanduser() if value else None


def vif_projection_data_path() -> Path | None:
    value = os.getenv(VIF_PROJECTION_DATA_PATH_ENV)
    return Path(value).expanduser() if value else None


def epa_station_year_data_path() -> Path | None:
    value = os.getenv(EPA_STATION_YEAR_DATA_PATH_ENV)
    return Path(value).expanduser() if value else None


def acecqa_geocoding_data_path() -> Path | None:
    value = os.getenv(ACECQA_GEOCODING_DATA_PATH_ENV)
    return Path(value).expanduser() if value else None


def acecqa_context_data_path() -> Path | None:
    value = os.getenv(ACECQA_CONTEXT_DATA_PATH_ENV)
    return Path(value).expanduser() if value else None


def community_context_data_path() -> Path | None:
    value = os.getenv(COMMUNITY_CONTEXT_DATA_PATH_ENV)
    return Path(value).expanduser() if value else None


def community_identity_data_path() -> Path | None:
    value = os.getenv(COMMUNITY_IDENTITY_DATA_PATH_ENV)
    return Path(value).expanduser() if value else None


def vcams_area_data_path() -> Path | None:
    value = os.getenv(VCAMS_AREA_DATA_PATH_ENV)
    return Path(value).expanduser() if value else None


def vcams_lga_data_path() -> Path | None:
    value = os.getenv(VCAMS_LGA_DATA_PATH_ENV)
    return Path(value).expanduser() if value else None


def health_facility_data_path() -> Path | None:
    value = os.getenv(HEALTH_FACILITY_DATA_PATH_ENV)
    return Path(value).expanduser() if value else None


def abs_child_health_data_path() -> Path | None:
    value = os.getenv(ABS_CHILD_HEALTH_DATA_PATH_ENV)
    return Path(value).expanduser() if value else None


def phidu_child_health_data_path() -> Path | None:
    value = os.getenv(PHIDU_CHILD_HEALTH_DATA_PATH_ENV)
    return Path(value).expanduser() if value else None


def phidu_pha_sa2_bridge_data_path() -> Path | None:
    value = os.getenv(PHIDU_PHA_SA2_BRIDGE_DATA_PATH_ENV)
    return Path(value).expanduser() if value else None


def department_area_bridge_data_path() -> Path | None:
    value = os.getenv(DEPARTMENT_AREA_BRIDGE_DATA_PATH_ENV)
    return Path(value).expanduser() if value else None


def bushfire_context_data_path() -> Path | None:
    value = os.getenv(BUSHFIRE_CONTEXT_DATA_PATH_ENV)
    return Path(value).expanduser() if value else None


def transport_context_data_path() -> Path | None:
    value = os.getenv(TRANSPORT_CONTEXT_DATA_PATH_ENV)
    return Path(value).expanduser() if value else None


def seasonal_air_data_path() -> Path | None:
    value = os.getenv(SEASONAL_AIR_DATA_PATH_ENV)
    return Path(value).expanduser() if value else None


def nearby_services_data_path() -> Path | None:
    value = os.getenv(NEARBY_SERVICES_DATA_PATH_ENV)
    return Path(value).expanduser() if value else None


def vaccination_places_data_path() -> Path | None:
    value = os.getenv(VACCINATION_PLACES_DATA_PATH_ENV)
    return Path(value).expanduser() if value else None


def council_immunisation_data_path() -> Path | None:
    value = os.getenv(COUNCIL_IMMUNISATION_DATA_PATH_ENV)
    return Path(value).expanduser() if value else None


def load_json_source(path: Path | None, env_name: str, resource_name: str) -> tuple[dict[str, Any] | None, list[dict[str, Any]]]:
    """Load an approved JSON source, reporting configuration errors in-band."""
    if path is None:
        return None, [limitation(
            f"{resource_name}_dataset_not_configured",
            f"No {resource_name} dataset is configured. Set {env_name} to an approved JSON file.",
            resource_name)]
    if not source_exists(path, env_name):
        return None, [limitation(
            f"{resource_name}_dataset_unavailable",
            f"The configured {resource_name} dataset could not be found.", resource_name)]
    try:
        source = read_json(path, env_name)
    except (OSError, json.JSONDecodeError):
        return None, [limitation(
            f"{resource_name}_dataset_unreadable",
            f"The configured {resource_name} dataset could not be read as valid JSON.", resource_name)]
    if not isinstance(source, dict):
        return None, [limitation(
            f"{resource_name}_dataset_invalid",
            f"The configured {resource_name} dataset must contain a JSON object.", resource_name)]
    return source, []


# Iteration 3 care, seasonal and nutrition context: one validated CSV per resource.
CARE_CONTEXT_ENV = {
    "hospital_capability": "KINDERPRINT_HOSPITAL_CAPABILITY_DATA_PATH",
    "care_compare": "KINDERPRINT_CARE_COMPARE_DATA_PATH",
    "urgent_care_clinics": "KINDERPRINT_URGENT_CARE_CLINICS_DATA_PATH",
    "primary_care_cost": "KINDERPRINT_PRIMARY_CARE_COST_DATA_PATH",
    "seasonal_illness": "KINDERPRINT_SEASONAL_ILLNESS_DATA_PATH",
    "food_outlets": "KINDERPRINT_FOOD_OUTLETS_DATA_PATH",
    "food_access": "KINDERPRINT_FOOD_ACCESS_DATA_PATH",
    "child_nutrient_foods": "KINDERPRINT_CHILD_NUTRIENT_FOODS_DATA_PATH",
    "child_nutrient_targets": "KINDERPRINT_CHILD_NUTRIENT_TARGETS_DATA_PATH",
    "practitioner_context": "KINDERPRINT_PRACTITIONER_CONTEXT_DATA_PATH",
}


def care_context_path(resource: str) -> Path | None:
    value = os.getenv(CARE_CONTEXT_ENV[resource])
    return Path(value).expanduser() if value else None
