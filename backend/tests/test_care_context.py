import pytest

from core.data_loader import CARE_CONTEXT_ENV
from loaders.care_context import _integer, _read


def _write(path, text):
    path.write_text(text, encoding="utf-8")
    return str(path)


HOSPITAL_HEADER = (
    "hospital_code,hospital_name,private,latitude,longitude,lhn,specialised_units,specialised_units_period_end,"
    "has_paediatric_service,has_neonatal_intensive_care,has_obstetric_service,has_emergency_department_data,"
    "ed_on_time_resuscitation_pct,ed_on_time_emergency_pct,ed_on_time_urgent_pct,ed_on_time_semi_urgent_pct,"
    "ed_on_time_non_urgent_pct,ed_departed_within_4h_pct,ed_median_minutes,ed_90th_percentile_minutes,"
    "surgery_median_days_urgent,surgery_median_days_semi_urgent,surgery_median_days_non_urgent,ed_period,"
    "surgery_period,source_id\n"
)


def _configure(monkeypatch, tmp_path, hospital_rows=None):
    _read.cache_clear()
    monkeypatch.setenv("KINDERPRINT_HOSPITAL_CAPABILITY_DATA_PATH", _write(tmp_path / "h.csv", HOSPITAL_HEADER + (hospital_rows or (
        "H0364,Royal Children's Hospital [Parkville],0,-37.795,144.951,RCH,Paediatric service; Neonatal intensive care unit,"
        "2025-06-30,True,True,False,True,100,71,82,70,88,74,167,355,9,102,241,2024-07-01 to 2025-06-30,"
        "2024-07-01 to 2025-06-30,aihw\n"
        "H0002,Small Private,1,-37.8,145.0,,Psychiatric unit,2025-06-30,False,False,False,False,,,,,,,,,,,,,,aihw\n"))))
    monkeypatch.setenv("KINDERPRINT_CARE_COMPARE_DATA_PATH", _write(tmp_path / "c.csv",
        "sa2_code,sa2_name,kind,facility_id,distance_km\n"
        "206011106,Brunswick East,hospital,H0002,6.0\n"
        "206011106,Brunswick East,hospital,H0364,4.0\n"
        "206011106,Brunswick East,urgent_care_clinic,UCC-coburg,2.9\n"
        "206011107,Brunswick West,hospital,H0364,3.0\n"))
    monkeypatch.setenv("KINDERPRINT_URGENT_CARE_CLINICS_DATA_PATH", _write(tmp_path / "u.csv",
        "facility_id,name,address,suburb_postcode,phone,listing_url,latitude,longitude,cost,source_id\n"
        "UCC-coburg,Coburg Medicare Urgent Care Clinic,444-446 Sydney Road,Coburg 3058,03 9961 7329,https://example.org,"
        "-37.74,144.97,Free,bh\n"))
    monkeypatch.setenv("KINDERPRINT_PRIMARY_CARE_COST_DATA_PATH", _write(tmp_path / "p.csv",
        "geography,sa3_code,sa3_name,service,demographic,population,patients,services,services_per_100,percent_people,"
        "provider_fees,benefits_paid,patient_contribution_per_service,benefit_share_of_fees_pct,reference_period,source_id\n"
        "SA3,20601,Brunswick - Coburg,GP attendances (total),All persons,99537,76814,568757,571.4,77.17,43897578,34383990,16.73,78.3,2024-25,aihw\n"
        "National,001NAT,National,GP attendances (total),All persons,1,1,1,614.81,83.76,1,1,10.84,84.3,2024-25,aihw\n"))


def test_compare_care_joins_capability_distance_and_area_cost(client, monkeypatch, tmp_path):
    _configure(monkeypatch, tmp_path)
    body = client.get("/api/digital-health/compare-care?sa2_code=206011106").json()
    assert body["status"] == "available"
    hospitals = body["data"]["hospitals"]
    assert [h["id"] for h in hospitals] == ["H0364", "H0002"]
    assert hospitals[0]["emergency_department"]["on_time_pct"]["urgent"] == 82
    assert hospitals[0]["specialised_units"] == ["Paediatric service", "Neonatal intensive care unit"]
    assert hospitals[1]["emergency_department"] is None and hospitals[1]["sector"] == "private"
    assert body["data"]["urgent_care_clinics"][0]["address"] == "444-446 Sydney Road, Coburg 3058"
    gp = body["data"]["area_cost"]["services"][0]
    assert gp["patient_contribution_per_service"] == 16.73 and gp["national_patient_contribution_per_service"] == 10.84
    assert "Not a ranking" in body["metadata"]["interpretation"]


def test_compare_care_rejects_invalid_boolean(client, monkeypatch, tmp_path):
    _configure(monkeypatch, tmp_path, hospital_rows=(
        "H0364,RCH,0,-37.8,144.9,,,2025-06-30,maybe,False,False,False,,,,,,,,,,,,,,aihw\n"))
    body = client.get("/api/digital-health/compare-care?sa2_code=206011106").json()
    assert body["status"] == "unavailable"
    assert any(item["code"] == "hospital_capability_invalid" for item in body["limitations"])


def test_seasonal_illness_groups_children_and_all_ages(client, monkeypatch, tmp_path):
    _read.cache_clear()
    monkeypatch.setenv("KINDERPRINT_SEASONAL_ILLNESS_DATA_PATH", _write(tmp_path / "s.csv",
        "disease,disease_label,age_band,month,average_notifications,share_of_year_pct,reference_years,geography,source_id\n"
        "influenza,Influenza,0-14 years,6,3221.0,22.6,\"2016-2019, 2022-2024\",Victoria,nndss\n"
        "influenza,Influenza,All ages,6,9000.0,21.0,\"2016-2019, 2022-2024\",Victoria,nndss\n"))
    body = client.get("/api/digital-health/seasonal-illness").json()
    month = body["data"]["diseases"][0]["months"][0]
    assert month == {"month": 6, "children_average": 3221.0, "children_share_pct": 22.6,
                     "all_ages_average": 9000.0, "all_ages_share_pct": 21.0}


def test_nutrition_report_filters_outlets_to_sa2(client, monkeypatch, tmp_path):
    _read.cache_clear()
    monkeypatch.setenv("KINDERPRINT_CHILD_NUTRIENT_TARGETS_DATA_PATH", _write(tmp_path / "t.csv",
        "nutrient_id,nutrient,unit,basis,age_1_3,age_4_8,age_9_13_boys,age_9_13_girls,why_it_matters,source_url\n"
        "iron,Iron,mg,RDI,9,10,8,8,Carries oxygen,https://example.org\n"))
    monkeypatch.setenv("KINDERPRINT_CHILD_NUTRIENT_FOODS_DATA_PATH", _write(tmp_path / "f.csv",
        "nutrient_id,nutrient,unit,rank,food_key,food_name,food_group,amount_per_100g,source_id\n"
        "iron,Iron,mg,1,F1,\"Lentil, red\",Vegetables and legumes,9.1,afcd\n"))
    monkeypatch.setenv("KINDERPRINT_FOOD_OUTLETS_DATA_PATH", _write(tmp_path / "o.csv",
        "sa2_code,osm_id,name,outlet_type,organic,address,opening_hours,latitude,longitude,distance_km,source_id\n"
        "206011106,node/2,Far,Supermarket,False,,,-37.7,144.9,0.9,osm\n"
        "206011106,node/1,Near,Greengrocer,True,,,-37.7,144.9,0.2,osm\n"
        "206011107,node/3,Other,Bakery,False,,,-37.7,144.9,0.1,osm\n"))
    monkeypatch.setenv("KINDERPRINT_FOOD_ACCESS_DATA_PATH", _write(tmp_path / "a.csv",
        "sa2_code,outlet_type,within_1km,within_2km,nearest_km,source_id\n206011106,Greengrocer,1,6,0.2,osm\n"))
    body = client.get("/api/digital-health/nutrition-report?sa2_code=206011106").json()
    assert body["status"] == "available"
    assert [o["name"] for o in body["data"]["outlets"]] == ["Near", "Far"]
    assert body["data"]["outlets"][0]["organic"] is True
    assert body["data"]["targets"][0]["age_4_8"] == 10


def test_new_endpoints_unavailable_without_configuration(client):
    assert client.get("/api/digital-health/compare-care?sa2_code=206011106").json()["status"] == "unavailable"
    assert client.get("/api/digital-health/seasonal-illness").json()["status"] == "unavailable"
    assert client.get("/api/digital-health/nutrition-report?sa2_code=206011106").json()["status"] == "unavailable"


PRACTITIONER_HEADER = (
    "sa2_code,sa2_name,community_id,community_name,n_children,observed_pct,expected_pct,expected_range_lo_pct,"
    "expected_range_hi_pct,priority_band,band_stability,expectation_drivers,gp_access_5km,gp_access_percentile,"
    "gp_nearest_km,ecec_access_5km,ecec_access_percentile,ecec_nearest_km,model_version,source_id\n"
)


def _practitioner(monkeypatch, tmp_path, band="Higher"):
    _read.cache_clear()
    monkeypatch.setenv("KINDERPRINT_PRACTITIONER_CONTEXT_DATA_PATH", _write(tmp_path / "pc.csv", PRACTITIONER_HEADER + (
        f"206011106,Brunswick East,MEL0001,Brunswick East,80,23.75,13.38,6.3,20.5,{band},0.98,"
        "adults without qualifications lowers expectation by 2.6 pp; crowding lowers expectation by 1.7 pp,"
        "3.852,84.5,0.11,110.468,87.8,0.22,V2-M2,aedc\n"
        "213011339,Point Cook - East,,,,,,,,,,,1.2,10.0,2.5,40.1,5.0,1.9,,aedc\n")))


def test_practitioner_context_returns_band_evidence_and_access(client, monkeypatch, tmp_path):
    _practitioner(monkeypatch, tmp_path)
    body = client.get("/api/digital-health/practitioner-context?sa2_code=206011106").json()
    assert body["status"] == "available"
    development = body["data"]["development"]
    assert development["priority_band"] == "Higher"
    assert development["expected_range_pct"] == [6.3, 20.5]
    assert len(development["expectation_drivers"]) == 2
    assert not any(key in development for key in ("z", "z_v2", "score", "priority_score"))
    assert body["data"]["access"]["general_practice"]["percentile"] == 84.5


def test_practitioner_context_without_band_still_serves_access(client, monkeypatch, tmp_path):
    _practitioner(monkeypatch, tmp_path)
    body = client.get("/api/digital-health/practitioner-context?sa2_code=213011339").json()
    assert body["data"]["development"] is None
    assert body["data"]["access"]["early_childhood_education_and_care"]["nearest_km"] == 1.9


def test_practitioner_context_rejects_numeric_band(client, monkeypatch, tmp_path):
    _practitioner(monkeypatch, tmp_path, band="1.83")
    body = client.get("/api/digital-health/practitioner-context?sa2_code=206011106").json()
    assert body["status"] == "unavailable"
    assert body["limitations"][0]["code"] == "practitioner_context_invalid"


def test_practitioner_context_unavailable_without_configuration(client):
    assert client.get("/api/digital-health/practitioner-context?sa2_code=206011106").json()["status"] == "unavailable"


@pytest.mark.parametrize("month", ["0", "13", "-1", "1.5", "inf", "-inf", "NaN", "", "nonsense"])
def test_seasonal_illness_rejects_invalid_month_without_crashing(client, monkeypatch, tmp_path, month):
    monkeypatch.setenv(CARE_CONTEXT_ENV["seasonal_illness"], _write(tmp_path / "s.csv",
        "disease,disease_label,age_band,month,average_notifications,share_of_year_pct,reference_years\n"
        f"influenza,Influenza,0-14 years,{month},100,10,2024\n"))
    response = client.get("/api/digital-health/seasonal-illness")
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"status", "data", "metadata", "limitations", "notices"}
    assert body["status"] == "unavailable"
    assert body["limitations"][0]["code"] == "seasonal_illness_invalid"
    assert body["data"] == {"diseases": []}


@pytest.mark.parametrize("value", ["-1", "2.5", "inf", "NaN", "", None])
def test_context_integer_validation_rejects_invalid_counts(value):
    with pytest.raises(ValueError):
        _integer(value)


@pytest.mark.parametrize("value, expected", [("0", 0), ("1.0", 1), ("12", 12)])
def test_context_integer_validation_preserves_valid_integers(value, expected):
    assert _integer(value) == expected


@pytest.mark.parametrize("value, minimum, maximum", [("2", 0, 1), ("0", 1, None), ("13", 1, 12)])
def test_context_integer_validation_enforces_field_bounds(value, minimum, maximum):
    with pytest.raises(ValueError):
        _integer(value, minimum, maximum)


def test_data_readiness_and_status_include_all_new_context_resources(client):
    identifiers = {"seasonal_air", "nearby_services", "vaccination_places", "council_immunisation", *CARE_CONTEXT_ENV}
    checks = {row["id"]: row for row in client.get("/api/health/data").json()["data"]["checks"]}
    products = {row["id"]: row for row in client.get("/api/datasets/status").json()["data"]["datasets"]}
    assert identifiers <= checks.keys() and identifiers <= products.keys()
    assert all(checks[key]["readiness"] == "not_configured" for key in identifiers)
    assert all(products[key]["configured"] is False for key in identifiers)
    assert all("path" not in row for row in products.values())


def test_data_readiness_checks_loaded_and_invalid_context_resources(client, monkeypatch, tmp_path):
    _configure(monkeypatch, tmp_path)
    monkeypatch.setenv(CARE_CONTEXT_ENV["seasonal_illness"], _write(tmp_path / "invalid.csv", "bad_header\n"))
    body = client.get("/api/health/data").json()
    checks = {row["id"]: row for row in body["data"]["checks"]}
    assert checks["hospital_capability"]["readiness"] == "ready"
    assert checks["hospital_capability"]["record_count"] == 2
    assert checks["seasonal_illness"]["readiness"] == "invalid"
    assert checks["seasonal_illness"]["limitation_codes"] == ["seasonal_illness_invalid"]
    products = {row["id"]: row for row in client.get("/api/datasets/status").json()["data"]["datasets"]}
    assert products["hospital_capability"]["configured"] is True
    assert products["hospital_capability"]["configuration_variable"] == CARE_CONTEXT_ENV["hospital_capability"]


def test_care_context_static_csv_is_reused(client, monkeypatch, tmp_path):
    _configure(monkeypatch, tmp_path)
    client.get("/api/digital-health/compare-care?sa2_code=206011106")
    first = _read.cache_info()
    client.get("/api/digital-health/compare-care?sa2_code=206011107")
    second = _read.cache_info()
    assert second.misses == first.misses == 4
    assert second.hits == first.hits + 4
