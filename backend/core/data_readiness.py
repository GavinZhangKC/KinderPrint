"""Core runtime-readiness checks for configured backend datasets."""

from typing import Any

from geography import load_boundary_features
from loaders.air_quality import load_station_year_observations
from loaders.community_context import load_community_context
from loaders.digital_health import (
    load_abs_child_health,
    load_health_facilities,
    load_vcams_area_context,
    load_vcams_lga_context,
)
from loaders.early_childhood import load_early_childhood_context
from loaders.geocoding_quality import load_geocoding_quality
from loaders.population import load_population_projections
from validation import (
    load_comparison_data, load_environmental_differences, load_explanations,
    load_outcome_comparisons, load_pattern_insights, load_priority_results, load_profiles,
    load_suitability_rankings, profile_boundary_limitations,
)


def _state(limitations: list[dict[str, Any]]) -> str:
    codes = {item["code"] for item in limitations}
    return "not_configured" if any(code.endswith("_not_configured") for code in codes) else "invalid"


def _check(identifier: str, value: Any, limitations: list[dict[str, Any]],
           record_count: int | None = None) -> dict[str, Any]:
    return {
        "id": identifier,
        "readiness": "ready" if value is not None and not limitations else _state(limitations),
        "record_count": record_count if value is not None and not limitations else None,
        "limitation_codes": [item["code"] for item in limitations],
    }


def runtime_data_readiness() -> list[dict[str, Any]]:
    """Run schema and cross-geography checks without exposing source records or paths."""
    profiles, profile_limitations = load_profiles()
    boundaries, boundary_limitations = load_boundary_features()
    locality_limitations = [*profile_limitations, *boundary_limitations]
    if profiles is not None and boundaries is not None:
        locality_limitations.extend(profile_boundary_limitations(profiles, list(boundaries)))
    locality_value = profiles if profiles is not None and boundaries is not None else None

    projections, projection_limitations = load_population_projections()
    observations, observation_limitations = load_station_year_observations()
    geocoding, geocoding_limitations = load_geocoding_quality()
    early_childhood, early_childhood_limitations = load_early_childhood_context()
    outcome_comparisons, _, outcome_limitations = load_outcome_comparisons()
    environmental, _, environmental_limitations = load_environmental_differences()
    pattern_insights, _, pattern_insight_limitations = load_pattern_insights()
    community_context, community_context_limitations = load_community_context()
    vcams_area, vcams_area_limitations = load_vcams_area_context()
    vcams_lga, vcams_lga_limitations = load_vcams_lga_context()
    health_facilities, health_facility_limitations = load_health_facilities()
    abs_child_health, abs_child_health_limitations = load_abs_child_health()
    priorities, _, priority_limitations = load_priority_results()
    explanations, _, explanation_limitations = load_explanations()
    comparisons, _, comparison_limitations = load_comparison_data()
    suitability, _, suitability_limitations = load_suitability_rankings()

    return [
        _check("aedc_locality_profiles", locality_value, locality_limitations,
               len(profiles) if profiles is not None else None),
        _check("vif_child_population_projections", projections, projection_limitations,
               len(projections) if projections is not None else None),
        _check("epa_historical_air_quality", observations, observation_limitations,
               len(observations) if observations is not None else None),
        _check("acecqa_gnaf_geocoding", geocoding, geocoding_limitations,
               geocoding["total_services"] if geocoding is not None else None),
        _check("acecqa_gnaf_locality_context", early_childhood, early_childhood_limitations,
               len(early_childhood) if early_childhood is not None else None),
        _check("aedc_outcome_comparisons", outcome_comparisons, outcome_limitations,
               len(outcome_comparisons) if outcome_comparisons is not None else None),
        _check("harmonised_environmental_differences", environmental,
               environmental_limitations,
               len(environmental) if environmental is not None else None),
        _check("pattern_insights", pattern_insights, pattern_insight_limitations,
               len(pattern_insights) if pattern_insights is not None else None),
        _check("declared_road_and_industrial_context", community_context,
               community_context_limitations,
               len(community_context) if community_context is not None else None),
        _check("vcams_department_area_context", vcams_area, vcams_area_limitations,
               len(vcams_area) if vcams_area is not None else None),
        _check("vcams_lga_context", vcams_lga, vcams_lga_limitations,
               len(vcams_lga) if vcams_lga is not None else None),
        _check("healthdirect_facilities", health_facilities,
               health_facility_limitations,
               len(health_facilities) if health_facilities is not None else None),
        _check("abs_child_health_sa2", abs_child_health,
               abs_child_health_limitations,
               len(abs_child_health) if abs_child_health is not None else None),
        _check("priority_for_investigation", priorities, priority_limitations,
               len(priorities) if priorities is not None else None),
        _check("priority_explanations", explanations, explanation_limitations,
               len(explanations) if explanations is not None else None),
        _check("approved_neighbourhood_comparisons", comparisons,
               comparison_limitations,
               (len(comparisons["matches"]) + len(comparisons["comparisons"]))
               if comparisons is not None else None),
        _check("locality_suitability", suitability, suitability_limitations,
               len(suitability) if suitability is not None else None),
    ]
