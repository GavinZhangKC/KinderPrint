"""Contract tests against the backend's expectations for the five JSON artefacts."""
import json
from pathlib import Path
import pytest

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "outputs/iteration_1"
DOMAINS = {"Child Development", "Social", "Environment"}
STATUSES = {"available", "missing", "incompatible", "unavailable", "limited"}


def load(name): return json.loads((OUT / name).read_text())

@pytest.fixture(scope="module")
def profiles(): return load("profiles.json")["profiles"]

@pytest.fixture(scope="module")
def priorities(): return load("priorities.json")

@pytest.fixture(scope="module")
def comparisons(): return load("comparisons.json")

@pytest.fixture(scope="module")
def boundaries(): return load("boundaries.geojson")


def test_ids_are_url_safe(profiles):
    """A slash breaks /api/neighbourhoods/{id}/profile."""
    for p in profiles:
        assert "/" not in p["neighbourhood"]["id"]

def test_every_profile_has_all_three_domains(profiles):
    for p in profiles:
        assert {d["name"] for d in p["domains"]} == DOMAINS

def test_value_is_null_exactly_when_not_available(profiles):
    for p in profiles:
        for d in p["domains"]:
            for i in d["indicators"]:
                assert i["status"] in STATUSES
                assert (i["value"] is not None) == (i["status"] == "available")

def test_indicators_carry_full_provenance(profiles):
    for p in profiles:
        for d in p["domains"]:
            for i in d["indicators"]:
                for f in ("id", "name", "source", "geographic_unit", "reference_year"):
                    assert str(i[f]).strip()

def test_priority_never_exposes_a_numeric_score(priorities):
    for r in priorities["results"]:
        assert not {"score", "priority_score", "numeric_score"} & set(r)
        band = r.get("priority_band")
        if band is not None:
            with pytest.raises(ValueError):
                float(band)

def test_priority_dataset_is_explicitly_approved(priorities):
    assert priorities["approved"] is True

def test_match_strength_is_a_string(comparisons):
    for m in comparisons["matches"]:
        s = m.get("match_strength")
        assert s is None or isinstance(s, str)

def test_no_match_records_are_complete(comparisons):
    for m in comparisons["matches"]:
        if m["status"] == "no_match":
            assert m["matched_neighbourhood"] is None
            assert m["similarity_basis"] == []
            assert m["limitations"]

def test_non_significant_differences_are_disclosed(comparisons):
    codes = {l["code"] for c in comparisons["comparisons"] for l in c.get("limitations", [])}
    assert "difference_not_significant" in codes

def test_boundary_ids_match_profile_ids(boundaries, profiles):
    assert {f["properties"]["id"] for f in boundaries["features"]} == \
           {p["neighbourhood"]["id"] for p in profiles}

def test_coordinates_are_wgs84_lon_lat(boundaries):
    for f in boundaries["features"][:20]:
        c = f["geometry"]["coordinates"]
        while isinstance(c[0][0], list): c = c[0]
        lon, lat = c[0][:2]
        assert -180 <= lon <= 180 and -90 <= lat <= 90
        assert 140 < lon < 150 and -40 < lat < -36, "not in Victoria"
