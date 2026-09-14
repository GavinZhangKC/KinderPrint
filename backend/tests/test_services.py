import json
from collections import Counter
from pathlib import Path

import pytest

from core.data_loader import (
    COMPARISON_DATA_PATH_ENV,
    ENVIRONMENTAL_DIFFERENCE_DATA_PATH_ENV,
    EXPLANATION_DATA_PATH_ENV,
    OUTCOME_COMPARISON_DATA_PATH_ENV,
    PATTERN_INSIGHT_DATA_PATH_ENV,
    PREVENTION_OPPORTUNITY_DATA_PATH_ENV,
    PRIORITY_DATA_PATH_ENV,
    PROFILE_DATA_PATH_ENV,
)
from validation import _load_environmental_differences, _load_outcome_comparisons

METADATA = {
    "source": "approved",
    "reference_year": "TBC",
    "geographic_unit": "TBC",
    "data_quality": "TBC",
}


def test_priority_endpoint_returns_band_without_score(client, monkeypatch, write_json) -> None:
    source = {
        "approved": True,
        "metadata": METADATA,
        "results": [{
            "status": "available",
            "neighbourhood": {"id": "n", "name": "N"},
            "label": "Priority for Investigation",
            "priority_band": "TBC band",
            "contributing_domains": ["Social"],
        }],
    }
    path = write_json("priorities.json", json.dumps(source))
    monkeypatch.setenv(PRIORITY_DATA_PATH_ENV, str(path))
    body = client.get("/api/neighbourhoods/n/priority").json()
    assert body["status"] == "available"
    assert body["data"]["priority_band"] == "TBC band"
    assert "score" not in body["data"]
    assert body["notices"][0]["code"] == "human_decision"


def test_unapproved_priority_dataset_is_unavailable(client, monkeypatch, write_json) -> None:
    path = write_json("priorities.json", json.dumps({"approved": False, "metadata": METADATA, "results": []}))
    monkeypatch.setenv(PRIORITY_DATA_PATH_ENV, str(path))
    body = client.get("/api/priority").json()
    assert body["status"] == "unavailable"
    assert body["limitations"][0]["code"] == "priority_dataset_invalid"


def test_priority_shortlist_returns_withheld_reason(client, monkeypatch, write_json) -> None:
    source = {
        "approved": True,
        "metadata": METADATA,
        "results": [{
            "status": "incompatible",
            "neighbourhood": {"id": "n", "name": "N"},
            "label": "Priority for Investigation",
            "priority_band": None,
            "contributing_domains": [],
            "limitations": [{"code": "incompatible", "message": "TBC"}],
        }],
    }
    path = write_json("priorities.json", json.dumps(source))
    monkeypatch.setenv(PRIORITY_DATA_PATH_ENV, str(path))
    body = client.get("/api/priority").json()
    assert body["status"] == "unavailable"
    assert body["data"] == []
    assert body["limitations"][0]["code"] == "incompatible"
    assert "n" in body["limitations"][0]["affected_fields"]


def test_priority_shortlist_is_limited_when_some_results_are_withheld(client, monkeypatch, write_json) -> None:
    available = {
        "status": "available",
        "neighbourhood": {"id": "a", "name": "A"},
        "label": "Priority for Investigation",
        "priority_band": "TBC band",
        "contributing_domains": ["Social"],
    }
    withheld = {
        "status": "missing",
        "neighbourhood": {"id": "b", "name": "B"},
        "label": "Priority for Investigation",
        "priority_band": None,
        "contributing_domains": [],
        "limitations": [{"code": "missing", "message": "TBC"}],
    }
    source = {"approved": True, "metadata": METADATA, "results": [available, withheld]}
    path = write_json("priorities.json", json.dumps(source))
    monkeypatch.setenv(PRIORITY_DATA_PATH_ENV, str(path))
    body = client.get("/api/priority").json()
    assert body["status"] == "limited"
    assert [result["neighbourhood"]["id"] for result in body["data"]] == ["a"]
    assert body["limitations"][0]["code"] == "missing"


def test_explanation_endpoint_preserves_incomplete_input(client, monkeypatch, write_json) -> None:
    factor = {
        "id": "f", "name": "Factor", "status": "missing", "source": "approved",
        "geographic_unit": "TBC", "reference_year": "TBC",
    }
    source = {
        "approved": True,
        "metadata": METADATA,
        "explanations": [{
            "status": "missing",
            "neighbourhood": {"id": "n", "name": "N"},
            "factor_domains": [
                {"domain": "Child Development", "factors": [factor]},
                {"domain": "Social", "factors": []},
                {"domain": "Environment", "factors": []},
            ],
            "highlighted_factor_ids": [],
            "incomplete_inputs": [{"indicator": "f", "reason": "TBC"}],
            "limitations": [{"code": "missing", "message": "TBC"}],
        }],
    }
    path = write_json("explanations.json", json.dumps(source))
    monkeypatch.setenv(EXPLANATION_DATA_PATH_ENV, str(path))
    body = client.get("/api/neighbourhoods/n/explanation").json()
    assert body["status"] == "missing"
    assert body["data"]["incomplete_inputs"] == [{"indicator": "f", "reason": "TBC"}]
    assert {notice["code"] for notice in body["notices"]} == {
        "association_not_causation", "investigation_leads",
    }


def comparison_source() -> dict:
    area_a = {"id": "a", "name": "A", "geographic_unit": "TBC"}
    area_b = {"id": "b", "name": "B", "geographic_unit": "TBC"}
    field = {
        "id": "field", "name": "Field", "source_value": 1, "comparison_value": 2,
        "source_status": "available", "comparison_status": "available",
    }
    return {
        "approved": True,
        "metadata": METADATA,
        "matches": [{
            "status": "limited", "source_neighbourhood": area_a,
            "matched_neighbourhood": area_b, "similarity_basis": ["TBC"],
            "match_strength": "TBC",
        }],
        "comparisons": [{
            "status": "available", "source_neighbourhood": area_a,
            "comparison_neighbourhood": area_b, "similarity_basis": ["TBC"],
            "match_strength": "TBC", "side_by_side": [field],
        }],
    }


def profile(identifier: str, value: int, *, geographic_unit: str = "TBC",
            social_status: str = "available") -> dict:
    def indicator(indicator_id: str, indicator_value, status: str = "available") -> dict:
        return {
            "id": indicator_id,
            "name": indicator_id.replace("_", " ").title(),
            "value": indicator_value,
            "status": status,
            "source": "approved",
            "geographic_unit": geographic_unit,
            "reference_year": "TBC",
            "unit": "percent",
        }

    social_value = value + 1 if social_status == "available" else None
    return {
        "neighbourhood": {
            "id": identifier,
            "name": identifier.upper(),
            "geographic_unit": geographic_unit,
        },
        "domains": [
            {
                "id": "development",
                "name": "Child Development",
                "indicators": [indicator("development", value)],
            },
            {
                "id": "social",
                "name": "Social",
                "indicators": [indicator("social", social_value, social_status)],
            },
            {
                "id": "environment",
                "name": "Environment",
                "indicators": [indicator("environment", value + 2)],
            },
        ],
    }


def test_limited_match_is_returned_without_forcing_strength(client, monkeypatch, write_json) -> None:
    path = write_json("comparisons.json", json.dumps(comparison_source()))
    monkeypatch.setenv(COMPARISON_DATA_PATH_ENV, str(path))
    body = client.get("/api/neighbourhoods/a/match").json()
    assert body["status"] == "limited"
    assert body["data"]["matched_neighbourhood"]["id"] == "b"


def test_no_match_is_explicit(client, monkeypatch, write_json) -> None:
    path = write_json("comparisons.json", json.dumps(comparison_source()))
    monkeypatch.setenv(COMPARISON_DATA_PATH_ENV, str(path))
    body = client.get("/api/neighbourhoods/unknown/match").json()
    assert body["status"] == "no_match"
    assert body["data"]["matched_neighbourhood"] is None
    assert body["limitations"][0]["code"] == "no_approved_match"


def test_manual_comparison_supports_any_two_profiles(client, monkeypatch, write_json) -> None:
    path = write_json("profiles.json", json.dumps({
        "profiles": [profile("a", 0), profile("b", 2)],
    }))
    monkeypatch.setenv(PROFILE_DATA_PATH_ENV, str(path))
    body = client.get("/api/compare", params={"neighbourhood_id_a": "b", "neighbourhood_id_b": "a"}).json()
    assert body["status"] == "available"
    assert body["data"]["source_neighbourhood"]["id"] == "b"
    assert body["data"]["side_by_side"][0]["source_value"] == 2
    assert body["data"]["side_by_side"][0]["comparison_value"] == 0
    assert body["data"]["side_by_side"][0]["unit"] == "percent"
    assert body["data"]["side_by_side"][0]["source"] == "approved"
    assert body["data"]["side_by_side"][0]["reference_year"] == "TBC"
    assert body["data"]["side_by_side"][0]["geographic_unit"] == "TBC"
    assert body["data"]["similarity_basis"] == []
    assert body["data"]["match_strength"] is None


def test_manual_comparison_preserves_missing_null(client, monkeypatch, write_json) -> None:
    path = write_json("profiles.json", json.dumps({
        "profiles": [profile("a", 1, social_status="missing"), profile("b", 2)],
    }))
    monkeypatch.setenv(PROFILE_DATA_PATH_ENV, str(path))
    body = client.get("/api/compare", params={"neighbourhood_id_a": "a", "neighbourhood_id_b": "b"}).json()
    social = next(field for field in body["data"]["side_by_side"] if field["id"] == "social")
    assert body["status"] == "limited"
    assert social["source_value"] is None
    assert social["source_status"] == "missing"


def test_manual_comparison_marks_absent_indicator_unavailable(client, monkeypatch, write_json) -> None:
    source = profile("a", 1)
    source["domains"][2]["indicators"] = []
    path = write_json("profiles.json", json.dumps({
        "profiles": [source, profile("b", 2)],
    }))
    monkeypatch.setenv(PROFILE_DATA_PATH_ENV, str(path))
    body = client.get("/api/compare", params={"neighbourhood_id_a": "a", "neighbourhood_id_b": "b"}).json()
    environment = next(field for field in body["data"]["side_by_side"] if field["id"] == "environment")
    assert body["status"] == "limited"
    assert environment["source_value"] is None
    assert environment["source_status"] == "unavailable"
    assert "indicator_unavailable_for_comparison" in {
        item["code"] for item in body["limitations"]
    }


def test_manual_comparison_reports_unconfigured_profiles(client) -> None:
    body = client.get("/api/compare", params={"neighbourhood_id_a": "a", "neighbourhood_id_b": "b"}).json()
    assert body["status"] == "unavailable"
    assert body["limitations"][0]["code"] == "profile_dataset_not_configured"


def test_manual_comparison_rejects_unknown_profile(client, monkeypatch, write_json) -> None:
    path = write_json("profiles.json", json.dumps({"profiles": [profile("a", 1)]}))
    monkeypatch.setenv(PROFILE_DATA_PATH_ENV, str(path))
    body = client.get("/api/compare", params={"neighbourhood_id_a": "a", "neighbourhood_id_b": "unknown"}).json()
    assert body["status"] == "missing"
    assert body["limitations"][0]["code"] == "unsupported_neighbourhood"
    assert body["limitations"][0]["affected_fields"] == ["neighbourhood_id_b"]


def test_manual_comparison_rejects_incompatible_geography(client, monkeypatch, write_json) -> None:
    path = write_json("profiles.json", json.dumps({
        "profiles": [profile("a", 1), profile("b", 2, geographic_unit="other")],
    }))
    monkeypatch.setenv(PROFILE_DATA_PATH_ENV, str(path))
    body = client.get("/api/compare", params={"neighbourhood_id_a": "a", "neighbourhood_id_b": "b"}).json()
    assert body["status"] == "incompatible"
    assert body["limitations"][0]["code"] == "incompatible_geographic_unit"


def test_manual_comparison_rejects_same_neighbourhood(client, monkeypatch, write_json) -> None:
    path = write_json("profiles.json", json.dumps({"profiles": [profile("a", 1)]}))
    monkeypatch.setenv(PROFILE_DATA_PATH_ENV, str(path))
    body = client.get("/api/compare", params={"neighbourhood_id_a": "a", "neighbourhood_id_b": "a"}).json()
    assert body["status"] == "no_match"
    assert body["limitations"][0]["code"] == "same_neighbourhood_selected"
    assert body["data"] == {
        "source_neighbourhood": {
            "id": "a", "name": None, "geographic_unit": None,
        },
        "comparison_neighbourhood": {
            "id": "a", "name": None, "geographic_unit": None,
        },
        "side_by_side": [],
        "similarity_basis": [],
        "match_strength": None,
    }


def test_manual_same_neighbourhood_preserves_unconfigured_dataset_precedence(
    client,
) -> None:
    body = client.get("/api/compare", params={
        "neighbourhood_id_a": "a", "neighbourhood_id_b": "a",
    }).json()

    assert body["status"] == "unavailable"
    assert body["limitations"][0]["code"] == "profile_dataset_not_configured"


def test_manual_comparison_supports_three_or_four_profiles(
    client, monkeypatch, write_json
) -> None:
    path = write_json("profiles.json", json.dumps({
        "profiles": [profile(identifier, value) for identifier, value in (
            ("a", 1), ("b", 2), ("c", 3), ("d", 4),
        )],
    }))
    monkeypatch.setenv(PROFILE_DATA_PATH_ENV, str(path))

    repeated = client.get("/api/compare", params=[
        ("neighbourhood_ids", "a"),
        ("neighbourhood_ids", "b"),
        ("neighbourhood_ids", "c"),
    ]).json()
    comma_separated = client.get(
        "/api/compare", params={"neighbourhood_ids": "a,b,c,d"}).json()

    assert repeated["status"] == "available"
    assert [area["id"] for area in repeated["data"]["neighbourhoods"]] == [
        "a", "b", "c",
    ]
    assert repeated["data"]["side_by_side"][0]["values"] == [
        {"neighbourhood_id": "a", "value": 1, "status": "available"},
        {"neighbourhood_id": "b", "value": 2, "status": "available"},
        {"neighbourhood_id": "c", "value": 3, "status": "available"},
    ]
    assert len(comma_separated["data"]["neighbourhoods"]) == 4
    assert repeated["notices"][1]["code"] == "user_selected_comparison"


@pytest.mark.parametrize("ids", ["a", "a,b,c,d,e", "a,a"])
def test_manual_multi_comparison_validates_selection_count_and_uniqueness(
    client, ids
) -> None:
    body = client.get("/api/compare", params={"neighbourhood_ids": ids}).json()

    assert body["status"] in {"unavailable", "no_match"}
    assert body["limitations"][0]["code"] in {
        "invalid_comparison_count", "duplicate_neighbourhood_selected",
    }


def test_manual_multi_comparison_rejects_unknown_and_mixed_parameters(
    client, monkeypatch, write_json
) -> None:
    path = write_json("profiles.json", json.dumps({
        "profiles": [profile("a", 1), profile("b", 2)],
    }))
    monkeypatch.setenv(PROFILE_DATA_PATH_ENV, str(path))

    unknown = client.get(
        "/api/compare", params={"neighbourhood_ids": "a,unknown"}).json()
    mixed = client.get("/api/compare", params={
        "neighbourhood_id_a": "a",
        "neighbourhood_id_b": "b",
        "neighbourhood_ids": "a,b",
    }).json()

    assert unknown["status"] == "missing"
    assert unknown["limitations"][0]["affected_fields"] == ["unknown"]
    assert mixed["status"] == "unavailable"
    assert mixed["limitations"][0]["code"] == "conflicting_comparison_parameters"


def test_manual_multi_comparison_preserves_missing_null(
    client, monkeypatch, write_json
) -> None:
    path = write_json("profiles.json", json.dumps({
        "profiles": [
            profile("a", 1, social_status="missing"),
            profile("b", 2),
            profile("c", 3),
        ],
    }))
    monkeypatch.setenv(PROFILE_DATA_PATH_ENV, str(path))

    body = client.get(
        "/api/compare", params={"neighbourhood_ids": "a,b,c"}).json()
    social = next(
        field for field in body["data"]["side_by_side"]
        if field["id"] == "social"
    )

    assert body["status"] == "limited"
    assert social["values"][0] == {
        "neighbourhood_id": "a", "value": None, "status": "missing",
    }


def outcome_comparison_source(*, missing: bool = False) -> dict:
    status = "missing" if missing else "available"
    comparison_status = "limited" if missing else "available"
    comparison = {
        "status": comparison_status,
        "neighbourhood_a": {
            "id": "a", "name": "A", "geographic_unit": "TBC",
            "internal_key": "must not be exposed",
        },
        "neighbourhood_b": {"id": "b", "name": "B", "geographic_unit": "TBC"},
        "outcome_indicators": [{
            "id": "outcome",
            "name": "Outcome",
            "unit": "TBC",
            "neighbourhood_a": {"value": 0, "status": "available"},
            "neighbourhood_b": {"value": None if missing else 2, "status": status},
            "approved_difference": {"value": None if missing else 0,
                                    "status": status},
            "source": "approved",
            "reference_year": "TBC",
            "geographic_unit": "TBC",
            "internal_score": 99,
        }],
    }
    if comparison_status != "available":
        comparison["limitations"] = [{
            "code": "outcome_missing",
            "message": "The approved output identifies a missing outcome.",
            "affected_fields": ["outcome"],
        }]
    return {
        "approved": True,
        "metadata": METADATA,
        "comparisons": [comparison],
    }


def configure_outcome_sources(monkeypatch, write_json, source: dict) -> Path:
    profile_path = write_json("profiles.json", json.dumps({
        "profiles": [profile("a", 1), profile("b", 2)],
    }))
    outcome_path = write_json("outcome_comparisons.json", json.dumps(source))
    monkeypatch.setenv(PROFILE_DATA_PATH_ENV, str(profile_path))
    monkeypatch.setenv(OUTCOME_COMPARISON_DATA_PATH_ENV, str(outcome_path))
    return outcome_path


def test_outcome_comparison_returns_only_approved_values(client, monkeypatch, write_json) -> None:
    configure_outcome_sources(monkeypatch, write_json, outcome_comparison_source())

    body = client.get("/api/outcome-comparison", params={
        "neighbourhood_id_a": "a", "neighbourhood_id_b": "b",
    }).json()

    assert body["status"] == "available"
    indicator = body["data"]["outcome_indicators"][0]
    assert indicator["neighbourhood_a"]["value"] == 0
    assert indicator["approved_difference"]["value"] == 0
    assert "internal_score" not in indicator
    assert "internal_key" not in body["data"]["neighbourhood_a"]
    assert {notice["code"] for notice in body["notices"]} == {
        "area_level_comparison", "association_not_causation",
    }


def test_outcome_comparison_preserves_missing_null(client, monkeypatch, write_json) -> None:
    configure_outcome_sources(
        monkeypatch, write_json, outcome_comparison_source(missing=True))

    body = client.get("/api/outcome-comparison", params={
        "neighbourhood_id_a": "a", "neighbourhood_id_b": "b",
    }).json()

    assert body["status"] == "limited"
    indicator = body["data"]["outcome_indicators"][0]
    assert indicator["neighbourhood_b"]["value"] is None
    assert indicator["approved_difference"]["value"] is None
    assert body["limitations"][0]["code"] == "outcome_missing"


def test_outcome_comparison_reports_unconfigured_output(client, monkeypatch, write_json) -> None:
    profile_path = write_json("profiles.json", json.dumps({
        "profiles": [profile("a", 1), profile("b", 2)],
    }))
    monkeypatch.setenv(PROFILE_DATA_PATH_ENV, str(profile_path))

    body = client.get("/api/outcome-comparison", params={
        "neighbourhood_id_a": "a", "neighbourhood_id_b": "b",
    }).json()

    assert body["status"] == "unavailable"
    assert body["limitations"][0]["code"] == "outcome_comparison_dataset_not_configured"


def test_outcome_comparison_rejects_unknown_neighbourhood(client, monkeypatch, write_json) -> None:
    profile_path = write_json("profiles.json", json.dumps({"profiles": [profile("a", 1)]}))
    monkeypatch.setenv(PROFILE_DATA_PATH_ENV, str(profile_path))

    body = client.get("/api/outcome-comparison", params={
        "neighbourhood_id_a": "a", "neighbourhood_id_b": "unknown",
    }).json()

    assert body["status"] == "missing"
    assert body["limitations"][0]["affected_fields"] == ["neighbourhood_id_b"]


def test_outcome_comparison_does_not_reverse_an_unapproved_direction(client, monkeypatch, write_json) -> None:
    configure_outcome_sources(monkeypatch, write_json, outcome_comparison_source())

    body = client.get("/api/outcome-comparison", params={
        "neighbourhood_id_a": "b", "neighbourhood_id_b": "a",
    }).json()

    assert body["status"] == "unavailable"
    assert body["data"]["outcome_indicators"] == []
    assert body["limitations"][0]["code"] == "outcome_comparison_unavailable"


def environmental_difference_source(*, missing: bool = False,
                                    standout_ids=None) -> dict:
    value_status = "missing" if missing else "available"
    result_status = "limited" if missing else "available"
    result = {
        "status": result_status,
        "neighbourhood_a": {"id": "a", "name": "A", "geographic_unit": "TBC"},
        "neighbourhood_b": {"id": "b", "name": "B", "geographic_unit": "TBC"},
        "environmental_indicators": [{
            "id": "heat",
            "name": "Heat",
            "unit": "TBC",
            "neighbourhood_a": {"value": 0, "status": "available"},
            "neighbourhood_b": {"value": None if missing else 2,
                                  "status": value_status},
            "approved_difference": {"value": None if missing else -2,
                                    "status": value_status},
            "source": "approved",
            "reference_year": "TBC",
            "geographic_unit": "TBC",
            "internal_rank": 1,
        }],
        "approved_standout_indicator_ids": (
            ["heat"] if standout_ids is None else standout_ids),
    }
    if result_status != "available":
        result["limitations"] = [{
            "code": "environmental_value_missing",
            "message": "The approved output identifies a missing environmental value.",
            "affected_fields": ["heat"],
        }]
    return {
        "approved": True,
        "metadata": METADATA,
        "differences": [result],
    }


def configure_environmental_sources(monkeypatch, write_json, source: dict) -> Path:
    profile_path = write_json("profiles.json", json.dumps({
        "profiles": [profile("a", 1), profile("b", 2)],
    }))
    difference_path = write_json("environmental_differences.json", json.dumps(source))
    monkeypatch.setenv(PROFILE_DATA_PATH_ENV, str(profile_path))
    monkeypatch.setenv(ENVIRONMENTAL_DIFFERENCE_DATA_PATH_ENV, str(difference_path))
    return difference_path


def test_environmental_difference_returns_approved_output(client, monkeypatch, write_json) -> None:
    configure_environmental_sources(
        monkeypatch, write_json, environmental_difference_source())

    body = client.get("/api/environmental-difference", params={
        "neighbourhood_id_a": "a", "neighbourhood_id_b": "b",
    }).json()

    assert body["status"] == "available"
    indicator = body["data"]["environmental_indicators"][0]
    assert indicator["neighbourhood_a"]["value"] == 0
    assert indicator["approved_difference"]["value"] == -2
    assert body["data"]["approved_standout_indicator_ids"] == ["heat"]
    assert "internal_rank" not in indicator
    assert body["notices"][1]["code"] == "association_not_causation"


def test_environmental_difference_preserves_missing_null(client, monkeypatch, write_json) -> None:
    configure_environmental_sources(
        monkeypatch, write_json, environmental_difference_source(missing=True))

    body = client.get("/api/environmental-difference", params={
        "neighbourhood_id_a": "a", "neighbourhood_id_b": "b",
    }).json()

    assert body["status"] == "limited"
    indicator = body["data"]["environmental_indicators"][0]
    assert indicator["neighbourhood_b"]["value"] is None
    assert indicator["approved_difference"]["value"] is None


def test_environmental_difference_rejects_unknown_standout(client, monkeypatch, write_json) -> None:
    configure_environmental_sources(
        monkeypatch, write_json,
        environmental_difference_source(standout_ids=["not-an-indicator"]))

    body = client.get("/api/environmental-difference", params={
        "neighbourhood_id_a": "a", "neighbourhood_id_b": "b",
    }).json()

    assert body["status"] == "unavailable"
    assert body["limitations"][0]["code"] == "environmental_difference_dataset_invalid"


def test_environmental_difference_reports_unconfigured_output(client, monkeypatch, write_json) -> None:
    profile_path = write_json("profiles.json", json.dumps({
        "profiles": [profile("a", 1), profile("b", 2)],
    }))
    monkeypatch.setenv(PROFILE_DATA_PATH_ENV, str(profile_path))

    body = client.get("/api/environmental-difference", params={
        "neighbourhood_id_a": "a", "neighbourhood_id_b": "b",
    }).json()

    assert body["status"] == "unavailable"
    assert body["limitations"][0]["code"] == (
        "environmental_difference_dataset_not_configured")


def test_environmental_difference_does_not_reverse_difference(client, monkeypatch, write_json) -> None:
    configure_environmental_sources(
        monkeypatch, write_json, environmental_difference_source())

    body = client.get("/api/environmental-difference", params={
        "neighbourhood_id_a": "b", "neighbourhood_id_b": "a",
    }).json()

    assert body["status"] == "unavailable"
    assert body["data"]["environmental_indicators"] == []
    assert body["limitations"][0]["code"] == "environmental_difference_unavailable"


def test_comparison_endpoints_reuse_cached_pair_indexes(
    client, monkeypatch, write_json
) -> None:
    outcome_path = configure_outcome_sources(
        monkeypatch, write_json, outcome_comparison_source())
    environmental_path = configure_environmental_sources(
        monkeypatch, write_json, environmental_difference_source())
    _load_outcome_comparisons.cache_clear()
    _load_environmental_differences.cache_clear()
    reads: Counter[Path] = Counter()
    tracked_paths = {outcome_path, environmental_path}
    original_read_text = Path.read_text

    def counted_read_text(path, *args, **kwargs):
        if path in tracked_paths:
            reads[path] += 1
        return original_read_text(path, *args, **kwargs)

    monkeypatch.setattr(Path, "read_text", counted_read_text)
    parameters = {"neighbourhood_id_a": "a", "neighbourhood_id_b": "b"}

    for endpoint in ("/api/outcome-comparison", "/api/environmental-difference"):
        assert client.get(endpoint, params=parameters).json()["status"] == "available"
        assert client.get(endpoint, params=parameters).json()["status"] == "available"

    assert reads == Counter({outcome_path: 1, environmental_path: 1})


def pattern_insight_source(*, no_pattern: bool = False,
                           invalid_reference: bool = False,
                           limited: bool = False) -> dict:
    outcome = outcome_comparison_source()["comparisons"][0]["outcome_indicators"][0]
    environmental = environmental_difference_source()["differences"][0][
        "environmental_indicators"][0]
    patterns = [] if no_pattern else [{
        "id": "pattern-1",
        "title": "Approved pattern",
        "description": "Approved area-level description.",
        "status": "limited" if limited else "available",
        "supporting_outcome_indicator_ids": [
            "unknown" if invalid_reference else "outcome"],
        "supporting_environmental_indicator_ids": ["heat"],
        "confidence": {"value": None if limited else "TBC",
                       "status": "missing" if limited else "available"},
        "quality": {"value": "TBC", "status": "available"},
        "stability": {"value": "TBC", "status": "available"},
        "model_explanation": "This internal field must not be exposed.",
    }]
    status = "no_pattern" if no_pattern else "limited" if limited else "available"
    insight = {
        "status": status,
        "neighbourhood_a": {"id": "a", "name": "A", "geographic_unit": "TBC"},
        "neighbourhood_b": {"id": "b", "name": "B", "geographic_unit": "TBC"},
        "patterns": patterns,
        "supporting_outcome_indicators": [] if no_pattern else [outcome],
        "supporting_environmental_indicators": [] if no_pattern else [environmental],
    }
    if no_pattern or limited:
        insight["limitations"] = [{
            "code": "no_supported_pattern" if no_pattern else "confidence_missing",
            "message": "The approved output does not support a complete pattern result.",
            "affected_fields": ["patterns"],
        }]
    return {
        "approved": True,
        "metadata": METADATA,
        "insights": [insight],
    }


def configure_pattern_sources(monkeypatch, write_json, source: dict) -> None:
    profile_path = write_json("profiles.json", json.dumps({
        "profiles": [profile("a", 1), profile("b", 2)],
    }))
    insight_path = write_json("pattern_insights.json", json.dumps(source))
    monkeypatch.setenv(PROFILE_DATA_PATH_ENV, str(profile_path))
    monkeypatch.setenv(PATTERN_INSIGHT_DATA_PATH_ENV, str(insight_path))


def test_pattern_insight_returns_approved_patterns(client, monkeypatch, write_json) -> None:
    configure_pattern_sources(monkeypatch, write_json, pattern_insight_source())

    body = client.get("/api/pattern-insight", params={
        "neighbourhood_id_a": "a", "neighbourhood_id_b": "b",
    }).json()

    assert body["status"] == "available"
    assert body["data"]["patterns"][0]["id"] == "pattern-1"
    assert body["data"]["supporting_outcome_indicators"][0]["id"] == "outcome"
    assert body["data"]["supporting_environmental_indicators"][0]["id"] == "heat"
    assert "model_explanation" not in body["data"]["patterns"][0]
    assert "internal_score" not in body["data"]["supporting_outcome_indicators"][0]
    assert "internal_rank" not in body["data"]["supporting_environmental_indicators"][0]
    assert {notice["code"] for notice in body["notices"]} == {
        "association_not_causation", "investigation_leads",
    }


def test_pattern_insight_preserves_missing_assessment(client, monkeypatch, write_json) -> None:
    configure_pattern_sources(
        monkeypatch, write_json, pattern_insight_source(limited=True))

    body = client.get("/api/pattern-insight", params={
        "neighbourhood_id_a": "a", "neighbourhood_id_b": "b",
    }).json()

    assert body["status"] == "limited"
    confidence = body["data"]["patterns"][0]["confidence"]
    assert confidence == {"value": None, "status": "missing"}


def test_pattern_insight_returns_explicit_no_pattern(client, monkeypatch, write_json) -> None:
    configure_pattern_sources(
        monkeypatch, write_json, pattern_insight_source(no_pattern=True))

    body = client.get("/api/pattern-insight", params={
        "neighbourhood_id_a": "a", "neighbourhood_id_b": "b",
    }).json()

    assert body["status"] == "no_pattern"
    assert body["data"]["patterns"] == []
    assert body["limitations"][0]["code"] == "no_supported_pattern"


def test_pattern_insight_rejects_unknown_evidence_reference(client, monkeypatch, write_json) -> None:
    configure_pattern_sources(
        monkeypatch, write_json, pattern_insight_source(invalid_reference=True))

    body = client.get("/api/pattern-insight", params={
        "neighbourhood_id_a": "a", "neighbourhood_id_b": "b",
    }).json()

    assert body["status"] == "unavailable"
    assert body["limitations"][0]["code"] == "pattern_insight_dataset_invalid"


def test_available_pattern_cannot_hide_incomplete_evidence(client, monkeypatch, write_json) -> None:
    source = pattern_insight_source()
    evidence = source["insights"][0]["supporting_outcome_indicators"][0]
    evidence["neighbourhood_b"] = {"value": None, "status": "suppressed"}
    configure_pattern_sources(monkeypatch, write_json, source)

    body = client.get("/api/pattern-insight", params={
        "neighbourhood_id_a": "a", "neighbourhood_id_b": "b",
    }).json()

    assert body["status"] == "unavailable"
    assert body["limitations"][0]["code"] == "pattern_insight_dataset_invalid"


def test_pattern_insight_reports_unconfigured_output(client, monkeypatch, write_json) -> None:
    profile_path = write_json("profiles.json", json.dumps({
        "profiles": [profile("a", 1), profile("b", 2)],
    }))
    monkeypatch.setenv(PROFILE_DATA_PATH_ENV, str(profile_path))

    body = client.get("/api/pattern-insight", params={
        "neighbourhood_id_a": "a", "neighbourhood_id_b": "b",
    }).json()

    assert body["status"] == "unavailable"
    assert body["limitations"][0]["code"] == "pattern_insight_dataset_not_configured"


def prevention_opportunity_source(*, no_opportunity: bool = False,
                                  invalid_reference: bool = False,
                                  limited: bool = False) -> dict:
    outcome = outcome_comparison_source()["comparisons"][0]["outcome_indicators"][0]
    environmental = environmental_difference_source()["differences"][0][
        "environmental_indicators"][0]
    related_patterns = [] if no_opportunity else [{
        "id": "pattern-1",
        "title": "Approved pattern",
        "description": "Approved area-level description.",
        "status": "available",
        "model_details": "This internal field must not be exposed.",
    }]
    opportunities = [] if no_opportunity else [{
        "id": "opportunity-1",
        "condition": "Approved potentially modifiable condition",
        "description": "Approved investigation framing.",
        "status": "limited" if limited else "available",
        "supporting_outcome_indicator_ids": ["outcome"],
        "supporting_environmental_indicator_ids": [
            "unknown" if invalid_reference else "heat"],
        "related_pattern_ids": ["pattern-1"],
        "modifiability": {"value": None if limited else "TBC",
                          "status": "missing" if limited else "available"},
        "quality": {"value": "TBC", "status": "available"},
        "uncertainty": {"value": "TBC", "status": "available"},
        "intervention_recommendation": "This field must not be exposed.",
    }]
    status = (
        "no_opportunity" if no_opportunity
        else "limited" if limited
        else "available"
    )
    result = {
        "status": status,
        "neighbourhood_a": {"id": "a", "name": "A", "geographic_unit": "TBC"},
        "neighbourhood_b": {"id": "b", "name": "B", "geographic_unit": "TBC"},
        "opportunities": opportunities,
        "supporting_outcome_indicators": [] if no_opportunity else [outcome],
        "supporting_environmental_indicators": [] if no_opportunity else [environmental],
        "related_patterns": related_patterns,
    }
    if no_opportunity or limited:
        result["limitations"] = [{
            "code": "no_supported_opportunity" if no_opportunity else "modifiability_missing",
            "message": "The approved output does not support a complete opportunity result.",
            "affected_fields": ["opportunities"],
        }]
    return {
        "approved": True,
        "metadata": METADATA,
        "results": [result],
    }


def configure_prevention_sources(monkeypatch, write_json, source: dict) -> None:
    profile_path = write_json("profiles.json", json.dumps({
        "profiles": [profile("a", 1), profile("b", 2)],
    }))
    opportunity_path = write_json("prevention_opportunities.json", json.dumps(source))
    monkeypatch.setenv(PROFILE_DATA_PATH_ENV, str(profile_path))
    monkeypatch.setenv(PREVENTION_OPPORTUNITY_DATA_PATH_ENV, str(opportunity_path))


def test_prevention_opportunity_returns_only_approved_fields(client, monkeypatch, write_json) -> None:
    configure_prevention_sources(
        monkeypatch, write_json, prevention_opportunity_source())

    body = client.get("/api/prevention-opportunity", params={
        "neighbourhood_id_a": "a", "neighbourhood_id_b": "b",
    }).json()

    assert body["status"] == "available"
    opportunity = body["data"]["opportunities"][0]
    assert opportunity["id"] == "opportunity-1"
    assert opportunity["related_pattern_ids"] == ["pattern-1"]
    assert "intervention_recommendation" not in opportunity
    assert "internal_score" not in body["data"]["supporting_outcome_indicators"][0]
    assert "internal_rank" not in body["data"]["supporting_environmental_indicators"][0]
    assert "model_details" not in body["data"]["related_patterns"][0]
    assert {notice["code"] for notice in body["notices"]} == {
        "association_not_causation", "investigation_leads", "human_decision",
    }


def test_prevention_opportunity_preserves_missing_assessment(client, monkeypatch, write_json) -> None:
    configure_prevention_sources(
        monkeypatch, write_json, prevention_opportunity_source(limited=True))

    body = client.get("/api/prevention-opportunity", params={
        "neighbourhood_id_a": "a", "neighbourhood_id_b": "b",
    }).json()

    assert body["status"] == "limited"
    assert body["data"]["opportunities"][0]["modifiability"] == {
        "value": None, "status": "missing",
    }


def test_prevention_opportunity_returns_explicit_no_opportunity(client, monkeypatch, write_json) -> None:
    configure_prevention_sources(
        monkeypatch, write_json, prevention_opportunity_source(no_opportunity=True))

    body = client.get("/api/prevention-opportunity", params={
        "neighbourhood_id_a": "a", "neighbourhood_id_b": "b",
    }).json()

    assert body["status"] == "no_opportunity"
    assert body["data"]["opportunities"] == []
    assert body["limitations"][0]["code"] == "no_supported_opportunity"


def test_prevention_opportunity_rejects_unknown_evidence_reference(client, monkeypatch, write_json) -> None:
    configure_prevention_sources(
        monkeypatch, write_json,
        prevention_opportunity_source(invalid_reference=True))

    body = client.get("/api/prevention-opportunity", params={
        "neighbourhood_id_a": "a", "neighbourhood_id_b": "b",
    }).json()

    assert body["status"] == "unavailable"
    assert body["limitations"][0]["code"] == "prevention_opportunity_dataset_invalid"


def test_available_opportunity_cannot_hide_incomplete_evidence(client, monkeypatch, write_json) -> None:
    source = prevention_opportunity_source()
    evidence = source["results"][0]["supporting_environmental_indicators"][0]
    evidence["approved_difference"] = {"value": None, "status": "suppressed"}
    configure_prevention_sources(monkeypatch, write_json, source)

    body = client.get("/api/prevention-opportunity", params={
        "neighbourhood_id_a": "a", "neighbourhood_id_b": "b",
    }).json()

    assert body["status"] == "unavailable"
    assert body["limitations"][0]["code"] == "prevention_opportunity_dataset_invalid"


def test_prevention_opportunity_reports_unconfigured_output(client, monkeypatch, write_json) -> None:
    profile_path = write_json("profiles.json", json.dumps({
        "profiles": [profile("a", 1), profile("b", 2)],
    }))
    monkeypatch.setenv(PROFILE_DATA_PATH_ENV, str(profile_path))

    body = client.get("/api/prevention-opportunity", params={
        "neighbourhood_id_a": "a", "neighbourhood_id_b": "b",
    }).json()

    assert body["status"] == "unavailable"
    assert body["limitations"][0]["code"] == (
        "prevention_opportunity_dataset_not_configured")


ITERATION_TWO_ENDPOINTS = (
    "/api/outcome-comparison",
    "/api/environmental-difference",
    "/api/pattern-insight",
    "/api/prevention-opportunity",
)


@pytest.mark.parametrize("endpoint", ITERATION_TWO_ENDPOINTS)
def test_iteration_two_services_reject_unknown_neighbourhood(
    endpoint, client, monkeypatch, write_json,
) -> None:
    profile_path = write_json("profiles.json", json.dumps({"profiles": [profile("a", 1)]}))
    monkeypatch.setenv(PROFILE_DATA_PATH_ENV, str(profile_path))

    body = client.get(endpoint, params={
        "neighbourhood_id_a": "a", "neighbourhood_id_b": "unknown",
    }).json()

    assert set(body) == {"status", "data", "metadata", "limitations", "notices"}
    assert body["status"] == "missing"
    assert body["limitations"][0]["affected_fields"] == ["neighbourhood_id_b"]


@pytest.mark.parametrize("endpoint", ITERATION_TWO_ENDPOINTS)
def test_iteration_two_services_reject_same_neighbourhood(
    endpoint, client, monkeypatch, write_json,
) -> None:
    profile_path = write_json("profiles.json", json.dumps({"profiles": [profile("a", 1)]}))
    monkeypatch.setenv(PROFILE_DATA_PATH_ENV, str(profile_path))

    body = client.get(endpoint, params={
        "neighbourhood_id_a": "a", "neighbourhood_id_b": "a",
    }).json()

    assert body["status"] == "incompatible"
    assert body["limitations"][0]["code"] == "same_neighbourhood_selected"


@pytest.mark.parametrize("endpoint", ITERATION_TWO_ENDPOINTS)
def test_iteration_two_services_reject_incompatible_geography(
    endpoint, client, monkeypatch, write_json,
) -> None:
    profile_path = write_json("profiles.json", json.dumps({
        "profiles": [profile("a", 1), profile("b", 2, geographic_unit="other")],
    }))
    monkeypatch.setenv(PROFILE_DATA_PATH_ENV, str(profile_path))

    body = client.get(endpoint, params={
        "neighbourhood_id_a": "a", "neighbourhood_id_b": "b",
    }).json()

    assert body["status"] == "incompatible"
    assert body["limitations"][0]["code"] == "incompatible_geographic_unit"
