"""Core public-readiness metadata for Iteration 2 data products."""

from pathlib import Path
from typing import Any

from core.data_loader import (
    ACECQA_CONTEXT_DATA_PATH_ENV,
    ACECQA_GEOCODING_DATA_PATH_ENV,
    COMMUNITY_CONTEXT_DATA_PATH_ENV,
    EPA_STATION_YEAR_DATA_PATH_ENV,
    ENVIRONMENTAL_DIFFERENCE_DATA_PATH_ENV,
    OUTCOME_COMPARISON_DATA_PATH_ENV,
    PROFILE_DATA_PATH_ENV,
    VIF_PROJECTION_DATA_PATH_ENV,
    acecqa_context_data_path,
    acecqa_geocoding_data_path,
    community_context_data_path,
    epa_station_year_data_path,
    environmental_difference_data_path,
    outcome_comparison_data_path,
    profile_data_path,
    vif_projection_data_path,
)


def _configured(path: Path | None) -> bool:
    return path is not None and path.is_file()


def dataset_statuses() -> list[dict[str, Any]]:
    """Describe product-use boundaries without exposing local filesystem paths."""
    return [
        {
            "id": "aedc_child_development",
            "role": "primary_outcome",
            "geographic_unit": "KinderPrint reporting locality from approved profile output",
            "interpretation_status": "approved_output_required",
            "configured": _configured(profile_data_path()),
            "configuration_variable": PROFILE_DATA_PATH_ENV,
            "user_facing": True,
        },
        {
            "id": "aedc_outcome_comparisons",
            "role": "matched_area_outcome_comparison",
            "geographic_unit": "KinderPrint reporting locality",
            "interpretation_status": "approved_aggregate_comparison",
            "configured": _configured(outcome_comparison_data_path()),
            "configuration_variable": OUTCOME_COMPARISON_DATA_PATH_ENV,
            "user_facing": True,
            "boundary": "Self-pairs are excluded and non-significance is preserved.",
        },
        {
            "id": "vif_child_population_projections",
            "role": "population_context",
            "geographic_unit": "ASGS Edition 3 SA2",
            "interpretation_status": "integration_ready",
            "configured": _configured(vif_projection_data_path()),
            "configuration_variable": VIF_PROJECTION_DATA_PATH_ENV,
            "user_facing": True,
        },
        {
            "id": "harmonised_environmental_differences",
            "role": "matched_area_environmental_comparison",
            "geographic_unit": "KinderPrint reporting locality",
            "interpretation_status": "approved_aggregate_comparison",
            "configured": _configured(environmental_difference_data_path()),
            "configuration_variable": ENVIRONMENTAL_DIFFERENCE_DATA_PATH_ENV,
            "user_facing": True,
            "boundary": "Only complete harmonised pairs are published; association is not causation.",
        },
        {
            "id": "declared_road_and_industrial_context",
            "role": "provisional_locality_context",
            "geographic_unit": "KinderPrint reporting locality",
            "interpretation_status": "context_only",
            "configured": _configured(community_context_data_path()),
            "configuration_variable": COMMUNITY_CONTEXT_DATA_PATH_ENV,
            "user_facing": False,
            "boundary": "Traffic and industrial-emission context are not personal exposure or health-risk measures.",
        },
        {
            "id": "epa_historical_air_quality",
            "role": "environmental_monitoring_context",
            "geographic_unit": "monitoring_station",
            "interpretation_status": "station_context_only",
            "configured": _configured(epa_station_year_data_path()),
            "configuration_variable": EPA_STATION_YEAR_DATA_PATH_ENV,
            "user_facing": False,
            "boundary": "No SA2 or KinderPrint-locality exposure has been derived.",
        },
        {
            "id": "phidu_child_health",
            "role": "exploratory_health_outcome",
            "geographic_unit": "Population Health Area",
            "interpretation_status": "research_only",
            "configured": False,
            "configuration_variable": None,
            "user_facing": False,
            "boundary": "PHA values must not be assigned to component SA2s.",
        },
        {
            "id": "acecqa_gnaf_locality_context",
            "role": "early_childhood_service_context",
            "geographic_unit": "KinderPrint reporting locality",
            "interpretation_status": "aggregate_context",
            "configured": _configured(acecqa_context_data_path()),
            "configuration_variable": ACECQA_CONTEXT_DATA_PATH_ENV,
            "user_facing": True,
            "boundary": "Counts include only accepted in-scope matches and expose no addresses.",
        },
        {
            "id": "acecqa_gnaf_geocoding",
            "role": "service_location_quality_assurance",
            "geographic_unit": "service address to SA2",
            "interpretation_status": "quality_control_only",
            "configured": _configured(acecqa_geocoding_data_path()),
            "configuration_variable": ACECQA_GEOCODING_DATA_PATH_ENV,
            "user_facing": False,
            "boundary": "Only accepted matches may enter spatial analysis; addresses are not exposed.",
        },
    ]
