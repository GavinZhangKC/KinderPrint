import json
from collections import Counter
from pathlib import Path

from air_quality import _load_station_year_observations, load_station_year_observations
from community_context import _load_community_context
from data_loader import (
    ACECQA_CONTEXT_DATA_PATH_ENV,
    ACECQA_GEOCODING_DATA_PATH_ENV,
    BOUNDARY_DATA_PATH_ENV,
    COMMUNITY_CONTEXT_DATA_PATH_ENV,
    COMMUNITY_IDENTITY_DATA_PATH_ENV,
    EPA_STATION_YEAR_DATA_PATH_ENV,
    PROFILE_DATA_PATH_ENV,
    SUITABILITY_DATA_PATH_ENV,
    VIF_PROJECTION_DATA_PATH_ENV,
)
from early_childhood import _load_early_childhood_context, load_early_childhood_context
from geocoding_quality import _load_geocoding_quality, load_geocoding_quality
from population import _load_population_projections, load_population_projections


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
    assert products["declared_road_and_industrial_context"]["interpretation_status"] == "context_only"
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


def test_population_projections_are_paginated(client, monkeypatch, tmp_path) -> None:
    path = tmp_path / "vif-page.csv"
    header = (
        "sa2_code_2021,sa2_name_2021,projection_year,sex,population_age_0_4_projected,"
        "population_age_5_9_projected,population_age_10_14_projected,"
        "population_age_0_9_projected,population_age_0_14_projected,"
        "population_all_ages_projected,source_id,value_status\n"
    )
    path.write_text(header +
        "201011001,One,2026,persons,1,1,1,2,3,10,vif,PROJECTED\n"
        "201011002,Two,2026,persons,1,1,1,2,3,10,vif,PROJECTED\n",
        encoding="utf-8")
    monkeypatch.setenv("KINDERPRINT_VIF_PROJECTION_DATA_PATH", str(path))

    body = client.get("/api/population-projections?limit=1&offset=1").json()

    assert [row["sa2_code"] for row in body["data"]["projections"]] == ["201011002"]
    assert body["metadata"]["result_count"] == 1
    assert body["metadata"]["total_result_count"] == 2
    assert body["metadata"]["offset"] == 1


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


def test_air_quality_catalog_exposes_available_filter_dimensions(client, monkeypatch, tmp_path) -> None:
    path = tmp_path / "epa-catalog.csv"
    path.write_text(
        "year,station_id,station_name,pollutant,unit,method_code,validation_status,"
        "observed_days,valid_hours,first_observed_date,last_observed_date,"
        "annual_mean_of_hourly_values,negative_hours_retained,monitoring_status,sa2_exposure_status\n"
        "2021,2,Bravo,PM2.5,ug/m3,BAM,PUBLISHED,1,1,2021-01-01,2021-01-01,5,0,STATION_OBSERVATION_CONTEXT_ONLY,NOT_DERIVED\n"
        "2022,1,Alpha,NO2,ppb,NO2,PUBLISHED,1,1,2022-01-01,2022-01-01,4,0,STATION_OBSERVATION_CONTEXT_ONLY,NOT_DERIVED\n"
        "2022,1,Alpha,O3,ppb,O3,PUBLISHED,1,1,2022-01-01,2022-01-01,3,0,STATION_OBSERVATION_CONTEXT_ONLY,NOT_DERIVED\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("KINDERPRINT_EPA_STATION_YEAR_DATA_PATH", str(path))

    body = client.get("/api/air-quality/station-catalog").json()

    assert body["status"] == "available"
    assert [station["station_name"] for station in body["data"]["stations"]] == ["Alpha", "Bravo"]
    assert body["data"]["stations"][0]["pollutants"] == ["NO2", "O3"]
    assert body["metadata"]["station_identifier_count"] == 2
    assert body["metadata"]["station_name_count"] == 2
    assert body["metadata"]["sa2_exposure_status"] == "not_derived"


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


def test_new_collection_page_limits_are_validated(client) -> None:
    population = client.get("/api/population-projections?limit=1001").json()
    air = client.get("/api/air-quality/stations?limit=501").json()

    assert population["status"] == "unavailable"
    assert population["limitations"][0]["code"] == "invalid_request"
    assert air["status"] == "unavailable"
    assert air["limitations"][0]["code"] == "invalid_request"


def test_geocoding_quality_reports_aggregates_without_addresses(client, monkeypatch, tmp_path) -> None:
    path = tmp_path / "geocoding.csv"
    path.write_text(
        "service_approval_number,match_status,assigned_sa2,assigned_kinderprint_locality,"
        "included_in_spatial_analysis,original_address\n"
        "SE-1,EXACT,201011001,MEL001,true,Secret Street\n"
        "SE-2,HIGH_CONFIDENCE,201011002,MEL002,true,Private Road\n"
        "SE-3,REVIEW,,,false,Hidden Avenue\n"
        "SE-4,UNMATCHED,,,false,Unknown Place\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("KINDERPRINT_ACECQA_GEOCODING_DATA_PATH", str(path))

    body = client.get("/api/data-quality/acecqa-geocoding").json()

    assert_envelope(body)
    assert body["status"] == "available"
    assert body["data"] == {
        "total_services": 4, "exact_matches": 1, "high_confidence_matches": 1,
        "review_matches": 1, "unmatched": 1, "sa2_assignment_success": 2,
        "locality_assignment_success": 2, "included_in_spatial_analysis": 2,
        "excluded_from_spatial_analysis": 2,
    }
    assert body["metadata"]["address_fields_exposed"] is False
    assert "Secret Street" not in str(body)


def test_geocoding_quality_rejects_weak_match_inclusion(client, monkeypatch, tmp_path) -> None:
    path = tmp_path / "invalid-geocoding.csv"
    path.write_text(
        "service_approval_number,match_status,assigned_sa2,assigned_kinderprint_locality,"
        "included_in_spatial_analysis\nSE-1,REVIEW,201011001,MEL001,true\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("KINDERPRINT_ACECQA_GEOCODING_DATA_PATH", str(path))

    body = client.get("/api/data-quality/acecqa-geocoding").json()

    assert body["status"] == "unavailable"
    assert body["limitations"][0]["code"] == "geocoding_dataset_invalid"


def test_early_childhood_context_exposes_only_locality_aggregates(client, monkeypatch, tmp_path) -> None:
    path = tmp_path / "context.csv"
    path.write_text(
        "community_id,neighbourhood_id,community_name,active_education_care_services,"
        "exact_match_services,high_confidence_match_services,services_with_approved_places,"
        "total_approved_places,long_day_care_services,kindergarten_services,"
        "services_with_current_rating,rating_coverage_pct,geocoding_source,match_policy,context_status\n"
        "MEL0001,206011106,Brunswick East,4,3,1,4,249,3,1,4,100,Open G-NAF,"
        "EXACT_OR_HIGH_CONFIDENCE_WITHIN_REPORTING_SCOPE,AGGREGATE_SERVICE_CONTEXT\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("KINDERPRINT_ACECQA_CONTEXT_DATA_PATH", str(path))

    body = client.get("/api/neighbourhoods/206011106/early-childhood-services").json()

    assert_envelope(body)
    assert body["status"] == "available"
    assert body["data"]["active_education_care_services"] == 4
    assert body["data"]["high_confidence_match_services"] == 1
    assert body["metadata"]["address_fields_exposed"] is False
    assert "community_id" not in body["data"]
    assert "address" not in body["data"]


def test_early_childhood_context_rejects_unreconciled_match_counts(client, monkeypatch, tmp_path) -> None:
    path = tmp_path / "invalid-context.csv"
    path.write_text(
        "community_id,neighbourhood_id,community_name,active_education_care_services,"
        "exact_match_services,high_confidence_match_services,services_with_approved_places,"
        "total_approved_places,long_day_care_services,kindergarten_services,"
        "services_with_current_rating,rating_coverage_pct,geocoding_source,match_policy,context_status\n"
        "MEL0001,206011106,Brunswick East,4,2,1,4,249,3,1,4,100,Open G-NAF,"
        "EXACT_OR_HIGH_CONFIDENCE_WITHIN_REPORTING_SCOPE,AGGREGATE_SERVICE_CONTEXT\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("KINDERPRINT_ACECQA_CONTEXT_DATA_PATH", str(path))

    body = client.get("/api/neighbourhoods/206011106/early-childhood-services").json()

    assert body["status"] == "unavailable"
    assert body["limitations"][0]["code"] == "early_childhood_context_dataset_invalid"


def configure_community_context(monkeypatch, tmp_path, *, missing_traffic: bool = False):
    identities = tmp_path / "communities.csv"
    identities.write_text(
        "community_id,community_name,neighbourhood_id\n"
        "MEL0001,Brunswick East,206011106\n",
        encoding="utf-8",
    )
    context = tmp_path / "community-context.csv"
    traffic = ",,,,," if missing_traffic else "11,7000,400,1,9,68"
    context.write_text(
        "community_id,declared_road_km,length_weighted_aadt,length_weighted_heavy_aadt,"
        "high_traffic_road_km,high_traffic_road_share_pct,actual_observation_road_share_pct,"
        "npi_facilities,npi_respiratory_reporting_facilities,nearest_npi_facility_km,"
        "nearest_npi_respiratory_reporting_facility_km,context_quality_flag\n"
        f"MEL0001,{traffic},2,1,3.5,4.5,CONTEXT_ONLY\n",
        encoding="utf-8",
    )
    monkeypatch.setenv(COMMUNITY_CONTEXT_DATA_PATH_ENV, str(context))
    monkeypatch.setenv(COMMUNITY_IDENTITY_DATA_PATH_ENV, str(identities))
    _load_community_context.cache_clear()
    return context, identities


def test_traffic_context_returns_precomputed_values(client, monkeypatch, tmp_path) -> None:
    configure_community_context(monkeypatch, tmp_path)

    body = client.get("/api/neighbourhoods/206011106/traffic-context").json()

    assert_envelope(body)
    assert body["status"] == "available"
    assert body["data"]["neighbourhood"]["name"] == "Brunswick East"
    assert body["data"]["metrics"]["length_weighted_aadt"] == {
        "value": 7000.0, "status": "available",
    }
    assert body["metadata"]["data_quality"] == "CONTEXT_ONLY"
    assert body["notices"][1]["code"] == "traffic_context_only"


def test_traffic_context_preserves_missing_null(client, monkeypatch, tmp_path) -> None:
    configure_community_context(monkeypatch, tmp_path, missing_traffic=True)

    body = client.get("/api/neighbourhoods/206011106/traffic-context").json()

    assert body["status"] == "limited"
    assert all(metric == {"value": None, "status": "missing"}
               for metric in body["data"]["metrics"].values())
    assert body["limitations"][0]["code"] == "traffic_context_missing"


def test_community_context_loader_is_cached(client, monkeypatch, tmp_path) -> None:
    context, identity = configure_community_context(monkeypatch, tmp_path)
    reads: Counter[Path] = Counter()
    original_open = Path.open

    def counted_open(path, *args, **kwargs):
        if path in {context, identity}:
            reads[path] += 1
        return original_open(path, *args, **kwargs)

    monkeypatch.setattr(Path, "open", counted_open)

    client.get("/api/neighbourhoods/206011106/traffic-context")
    client.get("/api/neighbourhoods/206011106/traffic-context")

    assert reads == Counter({context: 1, identity: 1})


def test_static_csv_loaders_reuse_validated_files(monkeypatch, tmp_path) -> None:
    population_path = tmp_path / "vif-cache.csv"
    population_path.write_text(
        "sa2_code_2021,sa2_name_2021,projection_year,sex,population_age_0_4_projected,"
        "population_age_5_9_projected,population_age_10_14_projected,"
        "population_age_0_9_projected,population_age_0_14_projected,"
        "population_all_ages_projected,source_id,value_status\n"
        "201011001,Alfredton,2026,persons,10,20,30,30,60,100,vif,PROJECTED\n",
        encoding="utf-8",
    )
    air_path = tmp_path / "epa-cache.csv"
    air_path.write_text(
        "year,station_id,station_name,pollutant,unit,method_code,validation_status,"
        "observed_days,valid_hours,first_observed_date,last_observed_date,"
        "annual_mean_of_hourly_values,negative_hours_retained,monitoring_status,sa2_exposure_status\n"
        "2022,10001,Alphington,NO2,ppb,NO2,PUBLISHED,360,8000,2022-01-01,2022-12-31,"
        "8.5,0,STATION_OBSERVATION_CONTEXT_ONLY,NOT_DERIVED\n",
        encoding="utf-8",
    )
    geocoding_path = tmp_path / "geocoding-cache.csv"
    geocoding_path.write_text(
        "service_approval_number,match_status,assigned_sa2,assigned_kinderprint_locality,"
        "included_in_spatial_analysis\nSE-1,EXACT,201011001,MEL001,true\n",
        encoding="utf-8",
    )
    context_path = tmp_path / "context-cache.csv"
    context_path.write_text(
        "community_id,neighbourhood_id,community_name,active_education_care_services,"
        "exact_match_services,high_confidence_match_services,services_with_approved_places,"
        "total_approved_places,long_day_care_services,kindergarten_services,"
        "services_with_current_rating,rating_coverage_pct,geocoding_source,match_policy,context_status\n"
        "MEL0001,201011001,Alfredton,1,1,0,1,10,1,0,1,100,Open G-NAF,"
        "EXACT_OR_HIGH_CONFIDENCE_WITHIN_REPORTING_SCOPE,AGGREGATE_SERVICE_CONTEXT\n",
        encoding="utf-8",
    )
    configured = {
        population_path: (VIF_PROJECTION_DATA_PATH_ENV, load_population_projections),
        air_path: (EPA_STATION_YEAR_DATA_PATH_ENV, load_station_year_observations),
        geocoding_path: (ACECQA_GEOCODING_DATA_PATH_ENV, load_geocoding_quality),
        context_path: (ACECQA_CONTEXT_DATA_PATH_ENV, load_early_childhood_context),
    }
    for path, (variable, _) in configured.items():
        monkeypatch.setenv(variable, str(path))
    for cached_loader in (
        _load_population_projections,
        _load_station_year_observations,
        _load_geocoding_quality,
        _load_early_childhood_context,
    ):
        cached_loader.cache_clear()

    reads: Counter[Path] = Counter()
    original_open = Path.open

    def counted_open(path, *args, **kwargs):
        if path in configured:
            reads[path] += 1
        return original_open(path, *args, **kwargs)

    monkeypatch.setattr(Path, "open", counted_open)

    for _, loader in configured.values():
        assert loader()[0] is not None
        assert loader()[0] is not None

    assert reads == Counter({path: 1 for path in configured})


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


def test_data_health_distinguishes_process_health_from_unconfigured_data(client) -> None:
    body = client.get("/api/health/data").json()

    assert_envelope(body)
    assert body["status"] == "limited"
    assert body["metadata"] == {"check_count": 8, "ready_count": 0}
    assert {check["readiness"] for check in body["data"]["checks"]} == {"not_configured"}
    assert all(check["record_count"] is None for check in body["data"]["checks"])


def test_scientific_notices_do_not_expose_placeholders(client) -> None:
    profile = client.get("/api/neighbourhoods/example/profile").json()

    assert profile["notices"][0]["code"] == "area_level_information"
    assert profile["notices"][0]["message"] != "TBC"
    assert "not individual children" in profile["notices"][0]["message"]


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


def test_child_development_endpoint_excludes_other_profile_domains(
    client, monkeypatch, write_json
) -> None:
    source_profile = profile("child-area")
    source_profile["domains"][0]["id"] = "child-development"
    source_profile["domains"][0]["indicators"][0].update(
        source="AEDC 2024", reference_year="2024")
    source_profile["domains"][1]["indicators"][0].update(
        source="ABS Census", reference_year="2021")
    path = write_json("profiles.json", json.dumps({"profiles": [source_profile]}))
    monkeypatch.setenv(PROFILE_DATA_PATH_ENV, str(path))

    body = client.get("/api/neighbourhoods/child-area/child-development").json()

    assert_envelope(body)
    assert body["status"] == "available"
    assert [item["id"] for item in body["data"]["indicators"]] == ["development"]
    assert body["metadata"]["sources"] == ["AEDC 2024"]
    assert body["metadata"]["primary_outcome_dataset"] == "AEDC"
    assert "social" not in str(body["data"]["indicators"])


def test_child_development_preserves_suppressed_null(
    client, monkeypatch, write_json
) -> None:
    source_profile = profile("suppressed-area")
    source_profile["domains"][0]["id"] = "child-development"
    source_profile["domains"][0]["indicators"][0].update(
        status="suppressed", value=None)
    path = write_json("profiles.json", json.dumps({"profiles": [source_profile]}))
    monkeypatch.setenv(PROFILE_DATA_PATH_ENV, str(path))

    body = client.get("/api/neighbourhoods/suppressed-area/child-development").json()

    assert body["status"] == "suppressed"
    assert body["data"]["indicators"][0]["value"] is None
    assert body["limitations"][0]["code"] == "indicator_suppressed"


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
