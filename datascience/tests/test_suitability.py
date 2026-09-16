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

    assert len(rankings) == 127


def test_missing_selected_input_withholds_score_instead_of_using_zero():
    profile = _profile("missing", 80, 10, 9, None, 18, 70)

    result = rank_profiles([profile], ["green_space"])[0]

    assert result["score"] is None
    assert result["status"] == "limited"
    assert result["limitations"][0]["code"] == "suitability_inputs_incomplete"


def test_new_service_and_future_demand_criteria_are_supported():
    profile = {
        "neighbourhood": {
            "id": "new-area",
            "name": "New Area",
            "geographic_unit": "SA2",
        },
        "domains": [
            {"indicators": [
                _indicator("service_access_score", 80),
                _indicator("future_demand_score", 70),
                _indicator("environment_quality_score", 60),
            ]},
        ],
    }

    result = rank_profiles([profile], ["service_access", "future_demand", "environment_quality"])[0]

    assert result["score"] == 70.0
    assert result["status"] == "available"
    assert result["limitations"] == []


def test_real_service_and_demand_inputs_are_accepted():
    profile = {
        "neighbourhood": {
            "id": "area-with-context",
            "name": "Area With Context",
            "geographic_unit": "SA2",
        },
        "domains": [
            {"indicators": [
                _indicator("env_vegetation_cover", 40),
                _indicator("env_urban_heat", 20),
                _indicator("env_open_space_access", 70),
                _indicator("active_education_care_services", 4),
                _indicator("services_with_approved_places", 3),
                _indicator("total_approved_places", 200),
                _indicator("nearest_active_service_km", 0.5),
                _indicator("population_age_0_14_projected", 3200),
            ]},
        ],
    }

    result = rank_profiles([profile], ["service_access", "future_demand", "environment_quality"])[0]

    assert result["status"] == "available"
    assert result["score"] is not None
    assert result["limitations"] == []
