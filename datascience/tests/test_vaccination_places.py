import sys
from pathlib import Path

import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import build_vaccination_places as vp

POINTS = pd.DataFrame({
    "sa2_code_2021": ["206011106"], "sa2_name_2021": ["Brunswick East"], "lga_name_2023": ["Merri-bek"],
    "label_point_longitude": [144.98], "label_point_latitude": [-37.77],
})


def _facilities(n_gp=8):
    rows = [{"facility_id": f"gp{i}", "facility_name": f"GP {i}", "official_service_type": "General practice service",
             "operational_status": "active", "address": f"{i} A St", "suburb": "Brunswick",
             "latitude": -37.77 - i * 0.005, "longitude": 144.98, "source_date": "2025-03-07"} for i in range(n_gp)]
    rows += [
        {"facility_id": "closed", "facility_name": "Closed GP", "official_service_type": "General practice service",
         "operational_status": "inactive", "address": "x", "suburb": "Brunswick", "latitude": -37.77, "longitude": 144.98, "source_date": "2025-03-07"},
        {"facility_id": "far", "facility_name": "Far pharmacy", "official_service_type": "Pharmacy service",
         "operational_status": "active", "address": "y", "suburb": "Geelong", "latitude": -38.15, "longitude": 144.36, "source_date": "2025-03-07"},
        {"facility_id": "ed", "facility_name": "Children's ED", "official_service_type": "Emergency department service",
         "operational_status": "active", "address": "z", "suburb": "Parkville", "latitude": -37.79, "longitude": 144.95, "source_date": "2025-03-07"},
        {"facility_id": "mch", "facility_name": "MCH Lygon East", "official_service_type": "Maternal, child and family health service",
         "operational_status": "active", "address": "m", "suburb": "Brunswick East", "latitude": -37.769, "longitude": 144.975, "source_date": "2025-03-07"},
    ]
    return pd.DataFrame(rows)


def test_places_keep_nearest_active_facilities_per_kind_within_range():
    out = vp.build_places(_facilities(), POINTS, pd.Series(["206011106"]))
    gps = out[out.kind == "general_practice"]
    assert list(gps["rank"]) == [1, 2, 3, 4, 5, 6]
    assert list(gps.name) == [f"GP {i}" for i in range(6)]
    assert "Closed GP" not in set(out.name)
    assert "Far pharmacy" not in set(out.name)          # beyond MAX_KM
    assert "Children's ED" not in set(out.name)         # not a vaccination service type
    assert out[out.kind == "maternal_child_health"].name.tolist() == ["MCH Lygon East"]
    assert (out.origin_latitude == -37.77).all()
    assert gps.distance_km.is_monotonic_increasing


def test_councils_link_each_sa2_to_its_council_page():
    councils = pd.DataFrame({"lga_name_2023": ["Merri-bek"], "council_name": ["Merri-bek City Council"],
                             "immunisation_url": ["https://www.merri-bek.vic.gov.au/x"], "phone": ["(03) 9240 1111"],
                             "retrieved": ["2026-10-08"], "source_id": ["mvec_council_immunisation_sessions_2026"]})
    out = vp.build_councils(POINTS, councils, pd.Series(["206011106"]))
    assert out.loc[0, "council_name"] == "Merri-bek City Council"
    assert out.loc[0, "sa2_code"] == "206011106"


def test_councils_fail_loudly_when_an_lga_has_no_entry():
    councils = pd.DataFrame({"lga_name_2023": ["Darebin"], "council_name": ["City of Darebin"], "immunisation_url": ["u"],
                             "phone": ["p"], "retrieved": ["2026-10-08"], "source_id": ["s"]})
    with pytest.raises(ValueError):
        vp.build_councils(POINTS, councils, pd.Series(["206011106"]))


def test_reference_covers_every_lga_in_scope():
    points = pd.read_csv(vp.SA2_POINTS, dtype={"sa2_code_2021": str})
    scope = pd.read_csv(vp.SA2_SCOPE, dtype={"sa2_code": str}).sa2_code
    out = vp.build_councils(points, pd.read_csv(vp.COUNCILS), scope)
    assert len(out) == scope.nunique()
    assert out.immunisation_url.str.startswith("http").all()
