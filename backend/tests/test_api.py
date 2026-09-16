import json

from data_loader import (
    BOUNDARY_DATA_PATH_ENV,
    PROFILE_DATA_PATH_ENV,
    SUITABILITY_DATA_PATH_ENV,
)


def assert_envelope(response: dict) -> None:
    assert set(response) == {"status", "data", "metadata", "limitations", "notices"}


def indicator(identifier: str, value, status: str = "available") -> dict:
    return {
        "id": identifier,
        "name": identifier.upper(),
        "value": value,
        "status": status,
        "source": "approved",
        "geographic_unit": "TBC",
        "reference_year": "TBC",
    }


def profile(identifier: str = "n") -> dict:
    return {
        "neighbourhood": {"id": identifier, "name": identifier.upper(), "geographic_unit": "TBC"},
        "domains": [
            {"id": "development", "name": "Child Development", "indicators": [indicator("development", 0)]},
            {"id": "social", "name": "Social", "indicators": [indicator("social", None, "missing")]},
            {"id": "environment", "name": "Environment", "indicators": []},
        ],
    }


def boundary(identifier: str = "n", geographic_unit: str = "TBC") -> dict:
    return {
        "type": "Feature",
        "properties": {
            "id": identifier,
            "name": identifier.upper(),
            "geographic_unit": geographic_unit,
        },
        "geometry": {
            "type": "Polygon",
            "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 0]]],
        },
    }


def test_health_is_minimal(client) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "available"}


def test_validation_error_uses_envelope(client) -> None:
    response = client.get("/api/compare")
    assert response.status_code == 422
    body = response.json()
    assert_envelope(body)
    assert body["status"] == "unavailable"
    assert body["limitations"][0]["code"] == "invalid_request"


def test_locality_suitability_serves_precomputed_ranking(client, monkeypatch, write_json) -> None:
    suitability_path = write_json("suitability.json", json.dumps({
        "rankings": [{
            "criteria": ["development_on_track", "tree_canopy", "socioeconomic_resources"],
            "localities": [
                {"id": "best", "name": "Best", "geographic_unit": "SA2", "score": 80.0,
                 "status": "available", "limitations": [],
                 "criteria": ["development_on_track", "tree_canopy", "socioeconomic_resources"]},
                {"id": "worst", "name": "Worst", "geographic_unit": "SA2", "score": 20.0,
                 "status": "available", "limitations": [],
                 "criteria": ["development_on_track", "tree_canopy", "socioeconomic_resources"]},
            ],
        }],
        "metadata": {"source": "Approved profile dataset"},
    }))
    monkeypatch.setenv(SUITABILITY_DATA_PATH_ENV, str(suitability_path))

    body = client.get("/api/localities/suitable?criteria=development_on_track,tree_canopy,socioeconomic_resources&limit=5").json()

    assert_envelope(body)
    assert body["status"] == "available"
    assert body["data"]["localities"][0]["id"] == "best"
    assert body["data"]["localities"][0]["score"] >= body["data"]["localities"][1]["score"]
    assert body["data"]["criteria"][0] == "development_on_track"
    assert body["data"]["withheld_count"] == 0


def test_locality_suitability_requires_supported_criteria(client, monkeypatch, write_json) -> None:
    suitability_path = write_json("suitability.json", json.dumps({
        "rankings": [],
        "metadata": {"source": "Approved profile dataset"},
    }))
    monkeypatch.setenv(SUITABILITY_DATA_PATH_ENV, str(suitability_path))

    empty = client.get("/api/localities/suitable?criteria=").json()
    invalid = client.get("/api/localities/suitable?criteria=childcare").json()

    assert empty["status"] == "unavailable"
    assert empty["limitations"][0]["code"] == "suitability_criteria_required"
    assert invalid["status"] == "unavailable"
    assert invalid["limitations"][0]["code"] == "unsupported_suitability_criteria"


def test_locality_suitability_withholds_incomplete_results(client, monkeypatch, write_json) -> None:
    suitability_path = write_json("suitability.json", json.dumps({
        "rankings": [{
            "criteria": ["tree_canopy"],
            "localities": [
                {"id": "complete", "name": "Complete", "geographic_unit": "SA2",
                 "score": 75.0, "status": "available", "criteria": ["tree_canopy"],
                 "limitations": []},
                {"id": "missing", "name": "Missing", "geographic_unit": "SA2",
                 "score": None, "status": "limited", "criteria": ["tree_canopy"],
                 "limitations": [{"code": "suitability_inputs_incomplete",
                                  "message": "Inputs unavailable.",
                                  "affected_fields": ["tree_canopy"]}]},
            ],
        }],
        "metadata": {"source": "Approved profile dataset"},
    }))
    monkeypatch.setenv(SUITABILITY_DATA_PATH_ENV, str(suitability_path))

    body = client.get("/api/localities/suitable?criteria=tree_canopy&limit=5").json()

    assert body["status"] == "limited"
    assert [item["id"] for item in body["data"]["localities"]] == ["complete"]
    assert body["data"]["withheld_count"] == 1
    assert body["limitations"][0]["code"] == "suitability_results_withheld"


def test_unconfigured_profile_is_explicit(client) -> None:
    body = client.get("/api/neighbourhoods/example/profile").json()
    assert_envelope(body)
    assert body["status"] == "unavailable"
    assert body["limitations"][0]["code"] == "profile_dataset_not_configured"
    assert body["notices"][0]["code"] == "area_level_information"


def test_unknown_profile_is_missing(client, monkeypatch, write_json) -> None:
    path = write_json("profiles.json", json.dumps({"profiles": []}))
    monkeypatch.setenv(PROFILE_DATA_PATH_ENV, str(path))
    body = client.get("/api/neighbourhoods/unknown/profile").json()
    assert_envelope(body)
    assert body["status"] == "missing"
    assert body["data"]["neighbourhood"]["id"] == "unknown"


def test_invalid_profile_dataset_is_unavailable(client, monkeypatch, write_json) -> None:
    path = write_json("profiles.json", "[]")
    monkeypatch.setenv(PROFILE_DATA_PATH_ENV, str(path))
    body = client.get("/api/neighbourhoods/example/profile").json()
    assert body["status"] == "unavailable"
    assert body["limitations"][0]["code"] == "profile_dataset_invalid"


def test_unconfigured_map_indicators_are_explicit(client) -> None:
    body = client.get("/api/neighbourhoods/indicators").json()
    assert_envelope(body)
    assert body["status"] == "unavailable"
    assert body["data"] == {"neighbourhoods": []}
    assert body["limitations"][0]["code"] == "profile_dataset_not_configured"


def test_map_indicators_preserve_zero_and_missing_null(client, monkeypatch, write_json) -> None:
    path = write_json("profiles.json", json.dumps({"profiles": [profile()]}))
    monkeypatch.setenv(PROFILE_DATA_PATH_ENV, str(path))

    body = client.get("/api/neighbourhoods/indicators").json()

    assert_envelope(body)
    assert body["status"] == "limited"
    result = body["data"]["neighbourhoods"][0]
    assert result["id"] == "n"
    assert result["geographic_unit"] == "TBC"
    assert result["indicators"]["development"] == {"value": 0, "status": "available"}
    assert result["indicators"]["social"] == {"value": None, "status": "missing"}
    assert body["metadata"]["result_count"] == 1
    assert body["notices"][0]["code"] == "area_level_information"


def test_empty_map_indicator_collection_is_unavailable(client, monkeypatch, write_json) -> None:
    path = write_json("profiles.json", json.dumps({"profiles": []}))
    monkeypatch.setenv(PROFILE_DATA_PATH_ENV, str(path))
    body = client.get("/api/neighbourhoods/indicators").json()
    assert body["status"] == "unavailable"
    assert body["limitations"][0]["code"] == "profile_inputs_unavailable"


def test_map_indicators_report_boundary_join_mismatches(client, monkeypatch, write_json) -> None:
    profile_path = write_json("profiles.json", json.dumps({"profiles": [profile("profile-only"), profile("shared")]}))
    boundaries = {
        "type": "FeatureCollection",
        "features": [boundary("boundary-only"), boundary("shared", "different-unit")],
    }
    boundary_path = write_json("boundaries.json", json.dumps(boundaries))
    monkeypatch.setenv(PROFILE_DATA_PATH_ENV, str(profile_path))
    monkeypatch.setenv(BOUNDARY_DATA_PATH_ENV, str(boundary_path))

    body = client.get("/api/neighbourhoods/indicators").json()

    assert body["status"] == "limited"
    codes = {item["code"] for item in body["limitations"]}
    assert "boundary_missing_for_profile" in codes
    assert "profile_missing_for_boundary" in codes
    assert "incompatible_geographic_unit" in codes
