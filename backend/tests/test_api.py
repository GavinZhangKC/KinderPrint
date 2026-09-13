import json

from data_loader import (
    BOUNDARY_DATA_PATH_ENV,
    PROFILE_DATA_PATH_ENV,
    SUITABILITY_DATA_PATH_ENV,
)


def test_dataset_status_exposes_boundaries_without_local_paths(client, monkeypatch, tmp_path) -> None:
    configured = tmp_path / "vif.csv"
    configured.write_text("header\n", encoding="utf-8")
    monkeypatch.setenv("KINDERPRINT_VIF_PROJECTION_DATA_PATH", str(configured))

    body = client.get("/api/datasets/status").json()

    assert_envelope(body)
    assert body["status"] == "available"
    products = {item["id"]: item for item in body["data"]["datasets"]}
    assert products["vif_child_population_projections"]["configured"] is True
    assert products["epa_historical_air_quality"]["interpretation_status"] == "station_context_only"
    assert products["epa_historical_air_quality"]["user_facing"] is False
    assert products["phidu_child_health"]["interpretation_status"] == "research_only"
    assert products["acecqa_gnaf_geocoding"]["boundary"].startswith("Only accepted matches")
    assert str(tmp_path) not in str(body)


def test_population_projections_filter_native_sa2_values(client, monkeypatch, tmp_path) -> None:
    path = tmp_path / "vif.csv"
    path.write_text(
        "sa2_code_2021,sa2_name_2021,projection_year,sex,population_age_0_4_projected,"
        "population_age_5_9_projected,population_age_10_14_projected,"
        "population_age_0_9_projected,population_age_0_14_projected,"
        "population_all_ages_projected,source_id,value_status\n"
        "201011001,Alfredton,2026,persons,10,20,30,30,60,100,vif2023,PROJECTED\n"
        "201011002,Ballarat,2026,persons,11,21,31,32,63,101,vif2023,PROJECTED\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("KINDERPRINT_VIF_PROJECTION_DATA_PATH", str(path))

    body = client.get("/api/population-projections?sa2_code=201011001&year=2026").json()

    assert_envelope(body)
    assert body["status"] == "available"
    assert body["data"]["projections"] == [{
        "sa2_code": "201011001", "sa2_name": "Alfredton", "projection_year": 2026,
        "sex": "persons", "population_age_0_4_projected": 10.0,
        "population_age_5_9_projected": 20.0, "population_age_10_14_projected": 30.0,
        "population_age_0_9_projected": 30.0, "population_age_0_14_projected": 60.0,
        "population_all_ages_projected": 100.0, "status": "projected",
    }]
    assert body["metadata"]["geographic_unit"] == "ASGS Edition 3 SA2"
    assert body["metadata"]["value_type"] == "projection"


def test_population_projections_reject_invalid_source(client, monkeypatch, tmp_path) -> None:
    path = tmp_path / "invalid.csv"
    path.write_text("sa2_code_2021\nnot-a-code\n", encoding="utf-8")
    monkeypatch.setenv("KINDERPRINT_VIF_PROJECTION_DATA_PATH", str(path))

    body = client.get("/api/population-projections").json()

    assert body["status"] == "unavailable"
    assert body["limitations"][0]["code"] == "population_projection_dataset_invalid"


def test_air_quality_serves_station_context_without_area_exposure(client, monkeypatch, tmp_path) -> None:
    path = tmp_path / "epa.csv"
    path.write_text(
        "year,station_id,station_name,pollutant,unit,method_code,validation_status,"
        "observed_days,valid_hours,first_observed_date,last_observed_date,"
        "annual_mean_of_hourly_values,negative_hours_retained,monitoring_status,sa2_exposure_status\n"
        "2022,10001,Alphington,NO2,ppb,NO2,PUBLISHED,360,8000,2022-01-01,2022-12-31,"
        "8.5,0,STATION_OBSERVATION_CONTEXT_ONLY,NOT_DERIVED\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("KINDERPRINT_EPA_STATION_YEAR_DATA_PATH", str(path))

    body = client.get("/api/air-quality/stations?station_id=10001&year=2022&pollutant=NO2").json()

    assert_envelope(body)
    assert body["status"] == "available"
    assert body["data"]["observations"][0]["annual_mean_of_hourly_values"] == 8.5
    assert body["data"]["observations"][0]["sa2_exposure_status"] == "not_derived"
    assert body["metadata"]["geographic_unit"] == "monitoring_station"
    assert body["notices"][0]["code"] == "station_context_only"


def test_air_quality_rejects_claimed_sa2_exposure(client, monkeypatch, tmp_path) -> None:
    path = tmp_path / "invalid-epa.csv"
    path.write_text(
        "year,station_id,station_name,pollutant,unit,method_code,validation_status,"
        "observed_days,valid_hours,first_observed_date,last_observed_date,"
        "annual_mean_of_hourly_values,negative_hours_retained,monitoring_status,sa2_exposure_status\n"
        "2022,10001,Alphington,NO2,ppb,NO2,PUBLISHED,360,8000,2022-01-01,2022-12-31,"
        "8.5,0,STATION_OBSERVATION_CONTEXT_ONLY,DERIVED\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("KINDERPRINT_EPA_STATION_YEAR_DATA_PATH", str(path))

    body = client.get("/api/air-quality/stations").json()

    assert body["status"] == "unavailable"
    assert body["limitations"][0]["code"] == "air_quality_dataset_invalid"


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
            "criteria": ["child_development", "green_space", "low_disadvantage"],
            "localities": [
                {"id": "best", "name": "Best", "geographic_unit": "SA2", "score": 80.0,
                 "status": "available", "limitations": [],
                 "criteria": ["child_development", "green_space", "low_disadvantage"]},
                {"id": "worst", "name": "Worst", "geographic_unit": "SA2", "score": 20.0,
                 "status": "available", "limitations": [],
                 "criteria": ["child_development", "green_space", "low_disadvantage"]},
            ],
        }],
        "metadata": {"source": "Approved profile dataset"},
    }))
    monkeypatch.setenv(SUITABILITY_DATA_PATH_ENV, str(suitability_path))

    body = client.get("/api/localities/suitable?criteria=child_development,green_space,low_disadvantage&limit=5").json()

    assert_envelope(body)
    assert body["status"] == "available"
    assert body["data"]["localities"][0]["id"] == "best"
    assert body["data"]["localities"][0]["score"] >= body["data"]["localities"][1]["score"]
    assert body["data"]["criteria"][0] == "child_development"
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
            "criteria": ["green_space"],
            "localities": [
                {"id": "complete", "name": "Complete", "geographic_unit": "SA2",
                 "score": 75.0, "status": "available", "criteria": ["green_space"],
                 "limitations": []},
                {"id": "missing", "name": "Missing", "geographic_unit": "SA2",
                 "score": None, "status": "limited", "criteria": ["green_space"],
                 "limitations": [{"code": "suitability_inputs_incomplete",
                                  "message": "Inputs unavailable.",
                                  "affected_fields": ["green_space"]}]},
            ],
        }],
        "metadata": {"source": "Approved profile dataset"},
    }))
    monkeypatch.setenv(SUITABILITY_DATA_PATH_ENV, str(suitability_path))

    body = client.get("/api/localities/suitable?criteria=green_space&limit=5").json()

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
