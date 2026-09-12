"""Provisional locality-suitability ranking used by the Iteration 2 prototype."""

from __future__ import annotations

from itertools import combinations
from typing import Any


VALID_CRITERIA = (
    "child_development",
    "green_space",
    "low_disadvantage",
    "low_heat",
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
            if criterion == "child_development":
                on_track = _value_for(profile, "aedc_on_track_five")
                vulnerability = _value_for(
                    profile, "aedc_vulnerable_one_or_more"
                )
                if on_track is None or vulnerability is None:
                    missing_criteria.append(criterion)
                else:
                    subtotal += on_track * 0.6
                    subtotal += (100.0 - vulnerability) * 0.4
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
                    subtotal += social_decile
                    weight_total += 1.0
            elif criterion == "low_heat":
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
