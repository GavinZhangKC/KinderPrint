import importlib
import json

from data_loader import BOUNDARY_DATA_PATH_ENV, PROFILE_DATA_PATH_ENV


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


def test_backend_loads_repo_env_file(monkeypatch) -> None:
    monkeypatch.delenv(BOUNDARY_DATA_PATH_ENV, raising=False)
    import data_loader

    importlib.reload(data_loader)

    assert data_loader.boundary_data_path() is not None
    assert data_loader.boundary_data_path().name == "boundaries.geojson"


def test_locality_suitability_ranks_profiles(client, monkeypatch, write_json) -> None:
    profile_path = write_json(
        "profiles.json",
        json.dumps({
            "profiles": [
                {
                    "neighbourhood": {"id": "best", "name": "Best", "geographic_unit": "SA2"},
                    "domains": [
                        {"id": "development", "name": "Child Development",
                         "indicators": [
                             {"id": "aedc_on_track_five", "name": "On track on all five domains", "value": 80, "status": "available", "source": "approved", "geographic_unit": "SA2", "reference_year": "2024"},
                             {"id": "aedc_vulnerable_one_or_more", "name": "Developmentally vulnerable on one or more domains", "value": 10, "status": "available", "source": "approved", "geographic_unit": "SA2", "reference_year": "2024"},
                         ]},
                        {"id": "social", "name": "Social",
                         "indicators": [
                             {"id": "seifa_irsd_decile", "name": "SEIFA IRSD decile", "value": 9, "status": "available", "source": "approved", "geographic_unit": "SA2", "reference_year": "2024"},
                         ]},
                        {"id": "environment", "name": "Environment",
                         "indicators": [
                             {"id": "env_vegetation_cover", "name": "Tree canopy cover", "value": 40, "status": "available", "source": "approved", "geographic_unit": "SA2", "reference_year": "2024"},
                             {"id": "env_urban_heat", "name": "Urban heat", "value": 18, "status": "available", "source": "approved", "geographic_unit": "SA2", "reference_year": "2024"},
                             {"id": "env_open_space_access", "name": "Open space access", "value": 70, "status": "available", "source": "approved", "geographic_unit": "SA2", "reference_year": "2024"},
                         ]},
                    ],
                },
                {
                    "neighbourhood": {"id": "worst", "name": "Worst", "geographic_unit": "SA2"},
                    "domains": [
                        {"id": "development", "name": "Child Development",
                         "indicators": [
                             {"id": "aedc_on_track_five", "name": "On track on all five domains", "value": 40, "status": "available", "source": "approved", "geographic_unit": "SA2", "reference_year": "2024"},
                             {"id": "aedc_vulnerable_one_or_more", "name": "Developmentally vulnerable on one or more domains", "value": 50, "status": "available", "source": "approved", "geographic_unit": "SA2", "reference_year": "2024"},
                         ]},
                        {"id": "social", "name": "Social",
                         "indicators": [
                             {"id": "seifa_irsd_decile", "name": "SEIFA IRSD decile", "value": 2, "status": "available", "source": "approved", "geographic_unit": "SA2", "reference_year": "2024"},
                         ]},
                        {"id": "environment", "name": "Environment",
                         "indicators": [
                             {"id": "env_vegetation_cover", "name": "Tree canopy cover", "value": 10, "status": "available", "source": "approved", "geographic_unit": "SA2", "reference_year": "2024"},
                             {"id": "env_urban_heat", "name": "Urban heat", "value": 32, "status": "available", "source": "approved", "geographic_unit": "SA2", "reference_year": "2024"},
                             {"id": "env_open_space_access", "name": "Open space access", "value": 20, "status": "available", "source": "approved", "geographic_unit": "SA2", "reference_year": "2024"},
                         ]},
                    ],
                },
            ],
        }),
    )
    monkeypatch.setenv("KINDERPRINT_PROFILE_DATA_PATH", str(profile_path))

    body = client.get("/api/localities/suitable?criteria=child_development,green_space,low_disadvantage&limit=5").json()

    assert_envelope(body)
    assert body["status"] == "available"
    assert body["data"]["localities"][0]["id"] == "best"
    assert body["data"]["localities"][0]["score"] >= body["data"]["localities"][1]["score"]
    assert body["data"]["criteria"][0] == "child_development"


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
