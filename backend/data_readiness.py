"""Runtime validation summary for configured backend datasets."""

from typing import Any

from air_quality import load_station_year_observations
from early_childhood import load_early_childhood_context
from geography import load_boundary_features
from geocoding_quality import load_geocoding_quality
from population import load_population_projections
from validation import (
    load_environmental_differences, load_outcome_comparisons, load_profiles,
    profile_boundary_limitations,
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
    ]
