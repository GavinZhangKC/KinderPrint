from loaders.digital_health import _read


def test_vcams_area_endpoint_preserves_native_geography(client, monkeypatch, tmp_path):
    _read.cache_clear()
    path = tmp_path / "area.csv"
    path.write_text(
        "reference_year,area_name,geography,indicator_id,indicator_label,age_group,percent,rse_percent,quality_flag,source_id,geography_warning\n"
        "2021,Hume Moreland,Victorian Department area,fruit,Fruit,4-12 years,69.21,4.83,available,vcams,Broad-area context only\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("KINDERPRINT_VCAMS_AREA_DATA_PATH", str(path))
    body = client.get("/api/digital-health/vcams-area?area_name=Hume%20Moreland&year=2021").json()
    assert body["status"] == "available"
    assert body["data"]["indicators"][0]["percent"] == 69.21
    assert body["metadata"]["geographic_unit"] == "Victorian Department area"


def test_vcams_lga_endpoint_preserves_suppression(client, monkeypatch, tmp_path):
    _read.cache_clear()
    path = tmp_path / "lga.csv"
    path.write_text(
        "reference_period,lga_code,lga_name,geography,indicator_id,numerator,denominator,percent,publication_status,source_id,geography_warning\n"
        "2021,24780,Merri-bek (C),Victorian Local Government Area,speech,,,,suppressed,vcams,LGA only\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("KINDERPRINT_VCAMS_LGA_DATA_PATH", str(path))
    body = client.get("/api/digital-health/vcams-lga?lga_name=Merri-bek%20(C)").json()
    assert body["data"]["indicators"][0]["publication_status"] == "suppressed"
    assert body["data"]["indicators"][0]["percent"] is None


def test_health_facility_endpoint_does_not_invent_access_fields(client, monkeypatch, tmp_path):
    _read.cache_clear()
    path = tmp_path / "facilities.csv"
    path.write_text(
        "facility_id,facility_name,facility_category,official_service_type,operational_status,address,suburb,postcode,gnaf_address_detail_pid,longitude,latitude,sa2_code,sa2_name,source_date,source_id\n"
        "1,Example Clinic,general_practice,General practice service,active,1 Test St,Brunswick East,3057,,144.9,-37.7,206011106,Brunswick East,2025-03-07,healthdirect\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("KINDERPRINT_HEALTH_FACILITY_DATA_PATH", str(path))
    body = client.get("/api/digital-health/facilities?sa2_code=206011106").json()
    facility = body["data"]["facilities"][0]
    assert facility["name"] == "Example Clinic"
    assert "fee" not in facility
    assert "availability" not in facility


def test_digital_health_missing_result_includes_reason(client, monkeypatch, tmp_path):
    path = tmp_path / "area.csv"
    path.write_text(
        "reference_year,area_name,geography,indicator_id,indicator_label,age_group,percent,rse_percent,quality_flag,source_id,geography_warning\n"
        "2021,Hume Moreland,Victorian Department area,fruit,Fruit,4-12 years,69.21,4.83,available,vcams,Broad-area context only\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("KINDERPRINT_VCAMS_AREA_DATA_PATH", str(path))

    body = client.get("/api/digital-health/vcams-area?area_name=Unknown%20Area&year=2021").json()

    assert body["status"] == "missing"
    assert body["data"] == {"indicators": []}
    assert body["limitations"] == [{
        "code": "vcams_area_context_not_found",
        "message": "No VCAMS area indicators match the requested area and reference year.",
        "affected_fields": ["area_name", "year"],
    }]


def test_digital_health_rejects_malformed_dataset(client, monkeypatch, tmp_path):
    path = tmp_path / "area.csv"
    path.write_text("reference_year,area_name\n2021,Hume Moreland\n", encoding="utf-8")
    monkeypatch.setenv("KINDERPRINT_VCAMS_AREA_DATA_PATH", str(path))

    body = client.get("/api/digital-health/vcams-area?area_name=Hume%20Moreland&year=2021").json()

    assert body["status"] == "unavailable"
    assert body["limitations"][0]["code"] == "vcams_area_context_invalid"


def test_abs_child_health_endpoint_returns_published_sa2_values(client, monkeypatch, tmp_path):
    path = tmp_path / "abs-child-health.csv"
    path.write_text(
        "sa2_code_2021,sa2_name_2021,sa3_code_2021,sa3_name_2021,reference_year,age_group,indicator,count,population_denominator,percent,geography,quality_flag,source_id\n"
        "206011106,Brunswick East,20601,Brunswick - Coburg,2021,0-14 years,asthma,68,1264,5.38,SA2 (ASGS Edition 3 2021),available,census_2021_gcp_sa2_g19\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("KINDERPRINT_ABS_CHILD_HEALTH_DATA_PATH", str(path))

    body = client.get(
        "/api/digital-health/child-conditions?sa2_code=206011106&year=2021",
    ).json()

    assert body["status"] == "available"
    assert body["data"]["indicators"][0]["percent"] == 5.38
    assert body["data"]["indicators"][0]["count"] == 68
    assert body["metadata"]["geographic_unit"] == "SA2 (ASGS Edition 3, 2021)"


def test_child_health_context_keeps_sa2_and_pha_geographies_separate(client, monkeypatch, tmp_path):
    abs_path = tmp_path / "abs.csv"
    abs_path.write_text(
        "sa2_code_2021,sa2_name_2021,sa3_code_2021,sa3_name_2021,reference_year,age_group,indicator,count,population_denominator,percent,geography,quality_flag,source_id\n"
        "206011106,Brunswick East,20601,Brunswick - Coburg,2021,0-14 years,asthma,40,800,5.0,SA2,available,abs\n", encoding="utf-8")
    pha_path = tmp_path / "pha.csv"
    pha_path.write_text(
        "pha_code_2021,pha_name_2021,indicator_id,reference_period,methodology_class,count_or_numerator,denominator,rate_or_percent,lower_95_ci,upper_95_ci,standardised_ratio,rrmse,publication_status,source_id,geography_warning\n"
        "20001,Brunswick/ Brunswick East,child_obese,2022,modelled_estimate,100,,4.8,3.5,6.1,60,,PUBLISHED,phidu,PHA only\n", encoding="utf-8")
    bridge_path = tmp_path / "bridge.csv"
    bridge_path.write_text(
        "sa2_code_2021,sa2_name_2021,pha_code_2021,pha_name_2021\n"
        "206011106,Brunswick East,20001,Brunswick/ Brunswick East\n", encoding="utf-8")
    monkeypatch.setenv("KINDERPRINT_ABS_CHILD_HEALTH_DATA_PATH", str(abs_path))
    monkeypatch.setenv("KINDERPRINT_PHIDU_CHILD_HEALTH_DATA_PATH", str(pha_path))
    monkeypatch.setenv("KINDERPRINT_PHIDU_PHA_SA2_BRIDGE_DATA_PATH", str(bridge_path))
    body = client.get("/api/digital-health/child-health-context?sa2_code=206011106").json()
    assert body["status"] == "available"
    assert body["data"]["sa2_indicators"][0]["percent"] == 5.0
    assert body["data"]["pha_context"][0]["rate_or_percent"] == 4.8
    assert "not an SA2 estimate" in body["metadata"]["pha_interpretation"]


def test_immunisation_pools_victoria_from_numerators_and_labels_pha(client, monkeypatch, tmp_path):
    _read.cache_clear()
    header = "pha_code_2021,pha_name_2021,indicator_id,reference_period,methodology_class,count_or_numerator,denominator,rate_or_percent,lower_95_ci,upper_95_ci,standardised_ratio,rrmse,publication_status,source_id,geography_warning\n"
    pha_path = tmp_path / "pha.csv"
    pha_path.write_text(
        header
        + "20001,Brunswick/ Brunswick East,immunised_age_2,2023,administrative,90,100,90.0,,,,,PUBLISHED,phidu,PHA only\n"
        + "20002,Elsewhere,immunised_age_2,2023,administrative,285,300,95.0,,,,,PUBLISHED,phidu,PHA only\n",
        encoding="utf-8",
    )
    bridge_path = tmp_path / "bridge.csv"
    bridge_path.write_text(
        "sa2_code_2021,sa2_name_2021,pha_code_2021,pha_name_2021\n"
        "206011106,Brunswick East,20001,Brunswick/ Brunswick East\n", encoding="utf-8")
    monkeypatch.setenv("KINDERPRINT_PHIDU_CHILD_HEALTH_DATA_PATH", str(pha_path))
    monkeypatch.setenv("KINDERPRINT_PHIDU_PHA_SA2_BRIDGE_DATA_PATH", str(bridge_path))

    body = client.get("/api/digital-health/immunisation?sa2_code=206011106").json()

    assert body["status"] == "available"
    indicator = body["data"]["indicators"][0]
    assert indicator["pha"]["percent"] == 90.0
    # (90 + 285) / (100 + 300), not the mean of 90% and 95%
    assert round(indicator["victoria"]["percent"], 4) == 93.75
    assert indicator["gap_to_target"] == 5.0
    assert body["data"]["locality"]["pha_name"] == "Brunswick/ Brunswick East"
    assert "not an SA2 estimate" in body["metadata"]["interpretation"]


def test_immunisation_reports_missing_for_unbridged_sa2(client, monkeypatch, tmp_path):
    _read.cache_clear()
    pha_path = tmp_path / "pha.csv"
    pha_path.write_text(
        "pha_code_2021,pha_name_2021,indicator_id,reference_period,methodology_class,count_or_numerator,denominator,rate_or_percent,lower_95_ci,upper_95_ci,standardised_ratio,rrmse,publication_status,source_id,geography_warning\n"
        "20001,Brunswick/ Brunswick East,immunised_age_1,2023,administrative,90,100,90.0,,,,,PUBLISHED,phidu,PHA only\n",
        encoding="utf-8",
    )
    bridge_path = tmp_path / "bridge.csv"
    bridge_path.write_text("sa2_code_2021,sa2_name_2021,pha_code_2021,pha_name_2021\n"
                           "206011106,Brunswick East,20001,Brunswick/ Brunswick East\n", encoding="utf-8")
    monkeypatch.setenv("KINDERPRINT_PHIDU_CHILD_HEALTH_DATA_PATH", str(pha_path))
    monkeypatch.setenv("KINDERPRINT_PHIDU_PHA_SA2_BRIDGE_DATA_PATH", str(bridge_path))

    body = client.get("/api/digital-health/immunisation?sa2_code=999999999").json()

    assert body["status"] == "missing"
    assert body["limitations"][-1]["code"] == "immunisation_context_not_found"
