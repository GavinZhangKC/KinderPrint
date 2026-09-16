"""Provisional locality-suitability ranking used by the Iteration 2 prototype."""

from __future__ import annotations

from itertools import combinations
from typing import Any


PRECISE_CRITERIA = (
    "development_on_track",
    "lower_developmental_vulnerability",
    "physical_health_on_track",
    "social_competence_on_track",
    "emotional_maturity_on_track",
    "language_cognitive_on_track",
    "communication_knowledge_on_track",
    "tree_canopy",
    "public_open_space",
    "lower_urban_heat",
    "socioeconomic_resources",
    "general_practice_access",
    "hospital_access",
    "pharmacy_access",
    "lower_industrial_emission_source_presence",
    "lower_declared_road_traffic",
    "public_transport_availability",
    "lower_bushfire_prone_share",
    "approved_early_childhood_places",
    "long_day_care_availability",
    "kindergarten_availability",
    "primary_school_campus_availability",
)

LEGACY_CRITERIA = (
    "child_development",
    "green_space",
    "low_disadvantage",
    "low_heat",
    "service_access",
    "future_demand",
    "environment_quality",
)

VALID_CRITERIA = PRECISE_CRITERIA + LEGACY_CRITERIA


def _value_for(profile: dict[str, Any], indicator_id: str) -> float | None:
    for domain in profile["domains"]:
        for indicator in domain["indicators"]:
            if indicator["id"] == indicator_id and indicator["status"] == "available":
                value = indicator.get("value")
                if isinstance(value, (int, float)) and not isinstance(value, bool):
                    return float(value)
    return None


def _score_from_aliases(profile: dict[str, Any], *aliases: str) -> float | None:
    for alias in aliases:
        value = _value_for(profile, alias)
        if value is not None:
            return value
    return None


def _clamp_0_100(value: float) -> float:
    return max(0.0, min(100.0, value))


def _average(values: list[float]) -> float | None:
    if not values:
        return None
    return sum(values) / len(values)


def _normalise_pollutant(value: float | None, threshold: float) -> float | None:
    if value is None:
        return None
    return _clamp_0_100(100.0 - (value / threshold) * 100.0)


def rank_profiles(
    profiles: list[dict[str, Any]], criteria: list[str]
) -> list[dict[str, Any]]:
    """Apply the composite locality-suitability formula and withhold incomplete results."""
    ranked: list[dict[str, Any]] = []
    for profile in profiles:
        subtotal = 0.0
        weight_total = 0.0
        missing_criteria: list[str] = []
        for criterion in criteria:
            if criterion == "child_development":
                on_track = _value_for(profile, "aedc_on_track_five")
                vulnerability = _value_for(profile, "aedc_vulnerable_one_or_more")
                if on_track is None or vulnerability is None:
                    missing_criteria.append(criterion)
                else:
                    subtotal += on_track * 0.6 + (100.0 - vulnerability) * 0.4
                    weight_total += 1.0
            elif criterion == "green_space":
                vegetation = _value_for(profile, "env_vegetation_cover")
                open_space = _value_for(profile, "env_open_space_access")
                if vegetation is None or open_space is None:
                    missing_criteria.append(criterion)
                else:
                    subtotal += (vegetation + open_space) / 2.0
                    weight_total += 1.0
            elif criterion == "low_disadvantage":
                social_decile = _value_for(profile, "seifa_irsd_decile")
                if social_decile is None:
                    missing_criteria.append(criterion)
                else:
                    subtotal += social_decile * 10.0
                    weight_total += 1.0
            elif criterion == "low_heat":
                heat = _value_for(profile, "env_urban_heat")
                if heat is None:
                    missing_criteria.append(criterion)
                else:
                    subtotal += max(0.0, 100.0 - heat * 3.0)
                    weight_total += 1.0
            elif criterion == "development_on_track":
                on_track = _value_for(profile, "aedc_on_track_five")
                if on_track is None:
                    missing_criteria.append(criterion)
                else:
                    subtotal += on_track
                    weight_total += 1.0
            elif criterion == "lower_developmental_vulnerability":
                vulnerability = _value_for(profile, "aedc_vulnerable_one_or_more")
                if vulnerability is None:
                    missing_criteria.append(criterion)
                else:
                    subtotal += 100.0 - vulnerability
                    weight_total += 1.0
            elif criterion in {
                "physical_health_on_track",
                "social_competence_on_track",
                "emotional_maturity_on_track",
                "language_cognitive_on_track",
                "communication_knowledge_on_track",
            }:
                indicator_id = {
                    "physical_health_on_track": "aedc_physical_on_track",
                    "social_competence_on_track": "aedc_social_on_track",
                    "emotional_maturity_on_track": "aedc_emotional_on_track",
                    "language_cognitive_on_track": "aedc_language_on_track",
                    "communication_knowledge_on_track": "aedc_communication_on_track",
                }[criterion]
                value = _value_for(profile, indicator_id)
                if value is None:
                    missing_criteria.append(criterion)
                else:
                    subtotal += value
                    weight_total += 1.0
            elif criterion == "tree_canopy":
                vegetation = _value_for(profile, "env_vegetation_cover")
                if vegetation is None:
                    missing_criteria.append(criterion)
                else:
                    subtotal += vegetation
                    weight_total += 1.0
            elif criterion == "public_open_space":
                open_space = _value_for(profile, "env_open_space_access")
                if open_space is None:
                    missing_criteria.append(criterion)
                else:
                    subtotal += open_space
                    weight_total += 1.0
            elif criterion == "socioeconomic_resources":
                social_decile = _value_for(profile, "seifa_irsd_decile")
                if social_decile is None:
                    missing_criteria.append(criterion)
                else:
                    # IRSD is a 1-10 decile; normalise it to the same 0-100
                    # range as the other criteria before averaging.
                    subtotal += social_decile * 10.0
                    weight_total += 1.0
            elif criterion == "lower_urban_heat":
                heat = _value_for(profile, "env_urban_heat")
                if heat is None:
                    missing_criteria.append(criterion)
                else:
                    subtotal += max(0.0, 100.0 - heat * 3.0)
                    weight_total += 1.0
            elif criterion == "service_access":
                service_score = _score_from_aliases(
                    profile,
                    "service_access_score",
                    "early_childhood_service_access",
                    "acecqa_service_access",
                    "service_availability_score",
                )
                if service_score is None:
                    service_components: list[float] = []
                    service_count = _value_for(profile, "active_education_care_services")
                    if service_count is not None:
                        service_components.append(_clamp_0_100(service_count * 12.5))
                    services_with_places = _value_for(profile, "services_with_approved_places")
                    if services_with_places is not None:
                        service_components.append(_clamp_0_100(services_with_places * 25.0))
                    total_places = _value_for(profile, "total_approved_places")
                    if total_places is not None:
                        service_components.append(_clamp_0_100(total_places / 8.0))
                    nearest_service_km = _value_for(profile, "nearest_active_service_km")
                    if nearest_service_km is not None:
                        service_components.append(_clamp_0_100((1.5 - nearest_service_km) / 1.5 * 100.0))
                    rating_coverage = _value_for(profile, "rating_coverage_pct")
                    if rating_coverage is not None:
                        service_components.append(_clamp_0_100(rating_coverage))
                    service_score = _average(service_components)
                if service_score is None:
                    missing_criteria.append(criterion)
                else:
                    subtotal += service_score
                    weight_total += 1.0
            elif criterion == "future_demand":
                demand_score = _score_from_aliases(
                    profile,
                    "future_demand_score",
                    "projected_child_demand_score",
                    "vif_child_demand_score",
                    "population_projection_score",
                )
                if demand_score is None:
                    projected_population = _score_from_aliases(
                        profile,
                        "population_age_0_14_projected",
                        "population_age_0_9_projected",
                        "population_age_0_4_projected",
                    )
                    if projected_population is not None:
                        demand_score = _clamp_0_100((projected_population / 5000.0) * 100.0)
                if demand_score is None:
                    missing_criteria.append(criterion)
                else:
                    subtotal += demand_score
                    weight_total += 1.0
            elif criterion == "environment_quality":
                quality_score = _score_from_aliases(
                    profile,
                    "environment_quality_score",
                    "environmental_quality_score",
                    "air_quality_score",
                )
                if quality_score is not None:
                    subtotal += quality_score
                    weight_total += 1.0
                else:
                    components: list[float] = []
                    pollutions = {
                        "pm25": _normalise_pollutant(_value_for(profile, "pm25"), 25.0),
                        "pm10": _normalise_pollutant(_value_for(profile, "pm10"), 50.0),
                        "no2": _normalise_pollutant(_value_for(profile, "no2"), 40.0),
                        "o3": _normalise_pollutant(_value_for(profile, "o3"), 50.0),
                    }
                    for value in pollutions.values():
                        if value is not None:
                            components.append(value)
                    vegetation = _value_for(profile, "env_vegetation_cover")
                    heat = _value_for(profile, "env_urban_heat")
                    open_space = _value_for(profile, "env_open_space_access")
                    if vegetation is not None:
                        components.append(vegetation)
                    if heat is not None:
                        components.append(max(0.0, 100.0 - heat * 3.0))
                    if open_space is not None:
                        components.append(open_space)
                    if not components:
                        missing_criteria.append(criterion)
                    else:
                        subtotal += sum(components) / len(components)
                        weight_total += 1.0

        score = (
            None
            if missing_criteria or weight_total == 0
            else max(0.0, min(100.0, subtotal / weight_total))
        )
        limitations = []
        if missing_criteria:
            limitations.append({
                "code": "suitability_inputs_incomplete",
                "message": "One or more selected suitability inputs are unavailable; no score has been produced.",
                "affected_fields": missing_criteria,
            })

        ranked.append({
            "id": profile["neighbourhood"]["id"],
            "name": profile["neighbourhood"]["name"],
            "geographic_unit": profile["neighbourhood"]["geographic_unit"],
            "score": round(score, 2) if score is not None else None,
            "status": "limited" if missing_criteria else "available",
            "criteria": criteria,
            "limitations": limitations,
        })

    available = sorted(
        (item for item in ranked if item["status"] == "available"),
        key=lambda item: item["score"],
        reverse=True,
    )
    withheld = [item for item in ranked if item["status"] != "available"]
    return available + withheld


def build_rankings(
    profiles: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Precompute legacy combinations without expanding the scalable precise criteria."""
    rankings = []
    for count in range(1, len(LEGACY_CRITERIA) + 1):
        for criteria in combinations(LEGACY_CRITERIA, count):
            selected = list(criteria)
            rankings.append({
                "criteria": selected,
                "localities": rank_profiles(profiles, selected),
            })
    return rankings


def build_criterion_scores(profiles: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Store one source-derived score per criterion for scalable API composition."""
    rows = []
    for profile in profiles:
        scores = {}
        measures = {criterion: None for criterion in VALID_CRITERIA}
        measures.update({
            "development_on_track": _value_for(profile, "aedc_on_track_five"),
            "lower_developmental_vulnerability": _value_for(profile, "aedc_vulnerable_one_or_more"),
            "physical_health_on_track": _value_for(profile, "aedc_physical_on_track"),
            "social_competence_on_track": _value_for(profile, "aedc_social_on_track"),
            "emotional_maturity_on_track": _value_for(profile, "aedc_emotional_on_track"),
            "language_cognitive_on_track": _value_for(profile, "aedc_language_on_track"),
            "communication_knowledge_on_track": _value_for(profile, "aedc_communication_on_track"),
            "tree_canopy": _value_for(profile, "env_vegetation_cover"),
            "public_open_space": _value_for(profile, "env_open_space_access"),
            "lower_urban_heat": _value_for(profile, "env_urban_heat"),
            "socioeconomic_resources": _value_for(profile, "seifa_irsd_decile"),
            "low_disadvantage": _value_for(profile, "seifa_irsd_decile"),
            "low_heat": _value_for(profile, "env_urban_heat"),
            "service_access": _score_from_aliases(profile, "service_access_score"),
            "future_demand": _score_from_aliases(profile, "future_demand_score"),
            "environment_quality": _score_from_aliases(profile, "environment_quality_score"),
        })
        for criterion in VALID_CRITERIA:
            result = rank_profiles([profile], [criterion])[0]
            scores[criterion] = result["score"]
        rows.append({
            "id": profile["neighbourhood"]["id"],
            "name": profile["neighbourhood"]["name"],
            "geographic_unit": profile["neighbourhood"]["geographic_unit"],
            "scores": scores,
            "measures": measures,
        })
    return rows
