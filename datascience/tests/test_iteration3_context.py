import sys
from pathlib import Path

import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import build_care_compare as care
import build_child_nutrient_foods as foods
import build_food_environment as food_env
import build_hospital_capability as hosp
import build_primary_care_cost as cost
import build_seasonal_illness as illness

POINT = pd.DataFrame({"sa2_code_2021": ["206011106"], "sa2_name_2021": ["Brunswick East"],
                      "label_point_longitude": [144.98], "label_point_latitude": [-37.77]})
SCOPE = pd.Series(["206011106"])


def _hospitals():
    return pd.DataFrame({
        "code": ["H0364", "LHN223", "H0001", "H0002"],
        "name": ["Children's", "Network row", "Closed", "Small"],
        "private": [0, 0, 0, 1], "closed": [0, 0, 1, 0],
        "latitude": [-37.795, -37.795, -37.8, -37.9], "longitude": [144.951, 144.951, 144.9, 145.0],
        "lhn": ["RCH", "", "", ""], "alternative_names": ["", "", "", ""],
    })


def _items():
    return pd.DataFrame({
        "code": ["H0364", "H0364", "H0364", "H0364", "H0002"],
        "reported_measure_code": ["MYH-RM0761", "MYH-RM0300", "MYH-RM0037", "MYH-RM0037", "MYH-RM0762"],
        "value": [1, 167, 82, 50, 1],
        "start": ["2024-07-01", "2024-07-01", "2024-07-01", "2017-07-01", "2024-07-01"],
        "end": ["2025-06-30", "2025-06-30", "2025-06-30", "2018-06-30", "2025-06-30"],
        "suppressions": ["", "", "", "", ""], "peer_group": ["", "", "", "", ""],
    }).drop_duplicates(["code", "reported_measure_code"], keep="first")


MEASURES = pd.DataFrame({
    "reported_measure_code": ["MYH-RM0761", "MYH-RM0300", "MYH-RM0037", "MYH-RM0762"],
    "measure_code": ["MYH0039", "MYH0036", "MYH0010", "MYH0039"],
    "reported_measure_name": ["Paediatric service", "All patients", "Urgent", "Psychiatric unit"],
})


def test_hospital_capability_keeps_open_hospitals_only_and_current_measures():
    out = hosp.build(_hospitals(), _items(), MEASURES).set_index("hospital_code")
    assert list(out.index) == ["H0002", "H0364"]
    rch = out.loc["H0364"]
    assert rch.has_paediatric_service and rch.has_emergency_department_data
    assert rch.ed_median_minutes == 167 and rch.ed_on_time_urgent_pct == 82
    assert out.loc["H0002"].specialised_units == "Psychiatric unit"


def test_hospital_capability_rejects_unknown_measure():
    items = _items().assign(reported_measure_code="MYH-RM9999")
    with pytest.raises(ValueError):
        hosp.build(_hospitals(), items, MEASURES)


def test_care_compare_lists_relevant_hospitals_and_clinics_nearest_first():
    hospitals = hosp.build(_hospitals(), _items(), MEASURES)
    clinics = pd.DataFrame({"name": ["Coburg UCC", "Far UCC"], "latitude": [-37.743, -36.0], "longitude": [144.967, 146.0]})
    out = care.build(hospitals, clinics, POINT, SCOPE)
    assert set(out.facility_id) == {"H0364", "UCC-coburg-ucc"}
    assert out[out.kind == "urgent_care_clinic"].distance_km.iloc[0] == pytest.approx(3.1, abs=0.3)


def test_primary_care_cost_derives_patient_contribution_and_keeps_suppression_empty():
    raw = pd.DataFrame({
        "unit": ["SA3"] * 4 + ["SA3"], "code": ["20601"] * 4 + ["20602"], "name": ["Brunswick - Coburg"] * 4 + ["X"],
        "service": ["GP attendances (total)"] * 5, "demographic": ["All persons"] * 5,
        "measure": ["No. services", "Total provider fees ($)", "Total Medicare benefits paid ($)", "No. patients", "No. services"],
        "value": ["1,000", "$50000", "$40000", "400", "n.p."], "flag": ["", "", "", "", "n.p."],
    })
    out = cost.build(raw).set_index("sa3_code")
    assert out.loc["20601"].patient_contribution_per_service == 10.0
    assert out.loc["20601"].benefit_share_of_fees_pct == 80.0
    assert pd.isna(out.loc["20602"].patient_contribution_per_service)


def test_seasonal_illness_excludes_covid_years_and_shares_sum_to_100():
    rows = []
    for year in [*illness.REFERENCE_YEARS, 2020]:
        rows += [{"year_month": f"{year}-07", "age_group": "00-04", "notifications": 10 if year != 2020 else 999},
                 {"year_month": f"{year}-01", "age_group": "30-34", "notifications": 5}]
    frame = pd.DataFrame(rows)
    out = illness.build({"influenza": frame, "salmonella": frame})
    kids = out[(out.disease == "influenza") & (out.age_band == "0-14 years")].set_index("month")
    assert kids.loc[7].average_notifications == 10.0
    assert kids.share_of_year_pct.sum() == pytest.approx(100.0)


def test_food_environment_counts_by_type_and_lists_named_outlets():
    osm = pd.DataFrame({
        "osm_id": ["node/1", "node/2", "node/3", "node/4"], "name": ["Coles", None, "Market", "Clothes"],
        "shop": ["supermarket", "greengrocer", None, "clothes"], "amenity": [None, None, "marketplace", None],
        "organic": [None, "yes", None, None], "brand": [None] * 4, "address": [None] * 4, "opening_hours": [None] * 4,
        "latitude": [-37.771, -37.772, -37.78, -37.771], "longitude": [144.981, 144.982, 144.98, 144.981],
    })
    listed, counts = food_env.build(osm, POINT, SCOPE)
    assert list(listed.name) == ["Coles", "Market"]
    c = counts.set_index("outlet_type")
    assert c.loc["Greengrocer"].within_1km == 1 and c.loc["Tagged organic"].within_1km == 1
    assert "Clothes" not in set(listed.name)


def test_child_nutrient_foods_excludes_small_amount_ingredients():
    targets = pd.read_csv(ROOT / "config" / "child_nutrient_targets.csv")
    base = {column: 0 for column in foods.COLUMNS.values()}
    frame = pd.DataFrame([
        {"Public Food Key": "A", "Classification": 24101, "Food Name": "Parsley, fresh, raw", **base, "Vitamin C (mg)": 180},
        {"Public Food Key": "B", "Classification": 24101, "Food Name": "Capsicum, red, fresh, raw", **base, "Vitamin C (mg)": 140},
        {"Public Food Key": "C", "Classification": 31101, "Food Name": "Spice mix", **base, "Vitamin C (mg)": 500},
    ])
    out = foods.build(frame, targets)
    assert list(out[out.nutrient_id == "vitamin_c"].food_name) == ["Capsicum, red, fresh, raw"]


def test_cost_gap_not_derived_when_published_fees_are_below_benefits():
    raw = pd.DataFrame({
        "unit": ["National"] * 3, "code": ["001NAT"] * 3, "name": ["National"] * 3,
        "service": ["GP attendances (total)"] * 3, "demographic": ["0-24"] * 3,
        "measure": ["No. services", "Total provider fees ($)", "Total Medicare benefits paid ($)"],
        "value": ["29618204", "837958823", "1585081122"], "flag": ["", "", ""]})
    row = cost.build(raw).iloc[0]
    assert pd.isna(row.patient_contribution_per_service)
    assert pd.isna(row.benefit_share_of_fees_pct)
