"""Regression tests for the migrated locality-suitability prototype."""

import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from kinderprint.analytics.suitability import build_criterion_scores, build_rankings, rank_profiles
from kinderprint.api.build_artefacts import build_suitability


def test_published_aedc_domain_scores_match_runtime_profiles():
    profiles = json.loads((ROOT / "outputs/iteration_2/profiles.json").read_text())["profiles"]
    suitability = json.loads((ROOT / "outputs/iteration_2/suitability.json").read_text())["localities"]
    by_id = {item["id"]: item for item in suitability}
    criterion_indicators = {
        "physical_health_on_track": "aedc_physical_on_track",
        "social_competence_on_track": "aedc_social_on_track",
        "emotional_maturity_on_track": "aedc_emotional_on_track",
        "language_cognitive_on_track": "aedc_language_on_track",
        "communication_knowledge_on_track": "aedc_communication_on_track",
    }

    assert len(profiles) == len(by_id) == 346
    for criterion, indicator_id in criterion_indicators.items():
        available = 0
        for profile in profiles:
            identifier = profile["neighbourhood"]["id"]
            indicator = next(item for domain in profile["domains"]
                             for item in domain["indicators"] if item["id"] == indicator_id)
            expected = indicator["value"] if indicator["status"] == "available" else None
            row = by_id[identifier]
            assert row["measures"][criterion] == expected
            assert row["scores"][criterion] == (round(expected, 2) if expected is not None else None)
            available += expected is not None
        assert available == 342


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


def test_legacy_criteria_and_combinations_remain_supported():
    profiles = [_profile("area", 80, 10, 9, 40, 18, 70)]

    result = rank_profiles(
        profiles, ["child_development", "green_space", "low_disadvantage"]
    )[0]

    assert result["status"] == "available"
    assert len(build_rankings(profiles)) == 127


def test_service_demand_and_environment_context_remain_supported():
    profile = {
        "neighbourhood": {"id": "context", "name": "Context", "geographic_unit": "SA2"},
        "domains": [{"indicators": [
            _indicator("service_access_score", 80),
            _indicator("future_demand_score", 70),
            _indicator("environment_quality_score", 60),
        ]}],
    }

    result = rank_profiles(
        [profile], ["service_access", "future_demand", "environment_quality"]
    )[0]

    assert result["score"] == 70.0
    assert result["status"] == "available"
