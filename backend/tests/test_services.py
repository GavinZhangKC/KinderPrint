import json

from data_loader import COMPARISON_DATA_PATH_ENV, EXPLANATION_DATA_PATH_ENV, PRIORITY_DATA_PATH_ENV

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


def test_manual_comparison_can_reverse_approved_pair(client, monkeypatch, write_json) -> None:
    path = write_json("comparisons.json", json.dumps(comparison_source()))
    monkeypatch.setenv(COMPARISON_DATA_PATH_ENV, str(path))
    body = client.get("/api/compare", params={"neighbourhood_id_a": "b", "neighbourhood_id_b": "a"}).json()
    assert body["status"] == "available"
    assert body["data"]["source_neighbourhood"]["id"] == "b"
    assert body["data"]["side_by_side"][0]["source_value"] == 2


def test_manual_comparison_rejects_same_neighbourhood(client) -> None:
    body = client.get("/api/compare", params={"neighbourhood_id_a": "a", "neighbourhood_id_b": "a"}).json()
    assert body["status"] == "no_match"
    assert body["limitations"][0]["code"] == "same_neighbourhood_selected"
