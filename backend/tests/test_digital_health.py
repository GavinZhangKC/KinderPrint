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
