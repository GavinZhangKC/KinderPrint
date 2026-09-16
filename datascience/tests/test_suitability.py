"""Regression tests for the migrated locality-suitability prototype."""

import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from kinderprint.analytics.suitability import build_criterion_scores, rank_profiles
from kinderprint.api.build_artefacts import build_suitability


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


def test_supported_criteria_are_normalised_and_ranked():
    profiles = [
        _profile("best", 80, 10, 9, 40, 18, 70),
        _profile("worst", 40, 50, 2, 10, 32, 20),
    ]

    result = rank_profiles(
        profiles,
        ["development_on_track", "tree_canopy", "socioeconomic_resources"],
    )

    assert [item["id"] for item in result] == ["best", "worst"]
    assert result[0]["score"] == 70.0
    assert result[1]["score"] == 23.33


def test_all_supported_criteria_scores_are_materialised():
    profiles = [_profile("area", 80, 10, 9, 40, 18, 70)]

    scores = build_criterion_scores(profiles)

    assert len(scores) == 1
    assert scores[0]["scores"]["development_on_track"] == 80.0
    assert scores[0]["scores"]["physical_health_on_track"] is None


def test_missing_selected_input_withholds_score_instead_of_using_zero():
    profile = _profile("missing", 80, 10, 9, None, 18, 70)

    result = rank_profiles([profile], ["tree_canopy"])[0]

    assert result["score"] is None
    assert result["status"] == "limited"
    assert result["limitations"][0]["code"] == "suitability_inputs_incomplete"


def test_development_dimensions_remain_separate():
    profile = _profile("area", 80, 10, 9, 40, 18, 70)

    on_track = rank_profiles([profile], ["development_on_track"])[0]
    lower_vulnerability = rank_profiles(
        [profile], ["lower_developmental_vulnerability"]
    )[0]

    assert on_track["score"] == 80.0
    assert lower_vulnerability["score"] == 90.0


def test_supplemental_facility_scores_are_added_without_estimation():
    import pandas as pd

    profile = _profile("area", 80, 10, 9, 40, 18, 70)
    supplemental = pd.DataFrame([{
        "neighbourhood_id": "area",
        "general_practice_access_score": 75,
        "hospital_access_score": 25,
        "pharmacy_access_score": 50,
    }])

    result = build_suitability([profile], supplemental)["localities"][0]["scores"]

    assert result["general_practice_access"] == 75.0
    assert result["hospital_access"] == 25.0
    assert result["pharmacy_access"] == 50.0
