import json

from data_loader import (
    COMPARISON_DATA_PATH_ENV,
    EXPLANATION_DATA_PATH_ENV,
    PRIORITY_DATA_PATH_ENV,
    PROFILE_DATA_PATH_ENV,
)

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
