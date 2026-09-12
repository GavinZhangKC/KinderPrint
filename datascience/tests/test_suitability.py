"""Regression tests for the migrated locality-suitability prototype."""

import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from kinderprint.analytics.suitability import build_rankings, rank_profiles


def _indicator(identifier, value):
    return {
        "id": identifier,
        "value": value,
        "status": "available" if value is not None else "unavailable",
    }


def _profile(identifier, on_track, vulnerability, social, vegetation, heat, open_space):
    return {
        "neighbourhood": {
            "id": identifier,
            "name": identifier.title(),
            "geographic_unit": "SA2",
        },
        "domains": [
            {"indicators": [
                _indicator("aedc_on_track_five", on_track),
                _indicator("aedc_vulnerable_one_or_more", vulnerability),
            ]},
            {"indicators": [_indicator("seifa_irsd_decile", social)]},
            {"indicators": [
                _indicator("env_vegetation_cover", vegetation),
                _indicator("env_urban_heat", heat),
                _indicator("env_open_space_access", open_space),
            ]},
        ],
    }


def test_migrated_formula_preserves_existing_ranking():
    profiles = [
        _profile("best", 80, 10, 9, 40, 18, 70),
        _profile("worst", 40, 50, 2, 10, 32, 20),
    ]

    result = rank_profiles(
        profiles,
        ["child_development", "green_space", "low_disadvantage"],
    )

    assert [item["id"] for item in result] == ["best", "worst"]
    assert result[0]["score"] == 49.33
    assert result[1]["score"] == 20.33


def test_all_supported_criteria_combinations_are_precomputed():
    profiles = [_profile("area", 80, 10, 9, 40, 18, 70)]

    rankings = build_rankings(profiles)

    assert len(rankings) == 15


def test_missing_selected_input_withholds_score_instead_of_using_zero():
    profile = _profile("missing", 80, 10, 9, None, 18, 70)

    result = rank_profiles([profile], ["green_space"])[0]

    assert result["score"] is None
    assert result["status"] == "limited"
    assert result["limitations"][0]["code"] == "suitability_inputs_incomplete"
