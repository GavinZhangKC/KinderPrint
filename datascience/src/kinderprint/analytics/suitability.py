"""Provisional locality-suitability ranking used by the Iteration 2 prototype."""

from __future__ import annotations

from itertools import combinations
from typing import Any


VALID_CRITERIA = (
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
)


def _value_for(profile: dict[str, Any], indicator_id: str) -> float | None:
    for domain in profile["domains"]:
        for indicator in domain["indicators"]:
            if indicator["id"] == indicator_id and indicator["status"] == "available":
                value = indicator.get("value")
                if isinstance(value, (int, float)) and not isinstance(value, bool):
                    return float(value)
    return None


def rank_profiles(
    profiles: list[dict[str, Any]], criteria: list[str]
) -> list[dict[str, Any]]:
    """Apply the provisional formula and withhold incomplete results."""
    ranked: list[dict[str, Any]] = []
    for profile in profiles:
        subtotal = 0.0
        weight_total = 0.0
        missing_criteria: list[str] = []
        for criterion in criteria:
            if criterion == "development_on_track":
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
    """Precompute the existing ranking for every supported criteria combination."""
    rankings = []
    for count in range(1, len(VALID_CRITERIA) + 1):
        for criteria in combinations(VALID_CRITERIA, count):
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
        for criterion in VALID_CRITERIA:
            result = rank_profiles([profile], [criterion])[0]
            scores[criterion] = result["score"]
        rows.append({
            "id": profile["neighbourhood"]["id"],
            "name": profile["neighbourhood"]["name"],
            "geographic_unit": profile["neighbourhood"]["geographic_unit"],
            "scores": scores,
        })
    return rows
