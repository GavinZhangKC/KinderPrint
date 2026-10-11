"""Play spaces near each SA2 (Vicmap Features of Interest)."""
import sys
from pathlib import Path

import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import build_play_spaces as bp  # noqa: E402

LISTED = ROOT / "data" / "processed" / "play_spaces_sa2.csv"
COUNTS = ROOT / "data" / "processed" / "play_access_sa2.csv"


def feature(subtype, lon, lat, pfi, name=None, parent=None):
    return {"type": "Feature", "geometry": {"type": "Point", "coordinates": [lon, lat]},
            "properties": {"feature_subtype": subtype, "pfi": pfi, "name": name, "name_label": name, "parent_name": parent}}


def test_names_are_never_invented():
    frame = bp.places({"features": [
        feature("playground", 144.98, -37.77, 1, parent="FLEMING PARK"),
        feature("playground", 144.98, -37.76, 2),
        feature("playground", 144.98, -37.75, 3, name="PLAYGROUND EQUIPMENT-LITTLE MCMILLAN PARK", parent="LITTLE MCMILLAN PARK"),
        feature("swimming pool", 144.96, -37.77, 4, name="BRUNSWICK CITY BATHS"),
        feature("child care", 144.96, -37.77, 5, name="IGNORED"),
    ]})
    names = {k: (None if pd.isna(v) else v) for k, v in zip(frame.feature_id, frame.name)}
    assert names == {"1": "Playground at Fleming Park", "2": None,
                     "3": "Playground at Little Mcmillan Park", "4": "Brunswick City Baths"}


def test_bearing_and_distance():
    assert bp.bearing(-37.77, 144.98, -37.76, 144.98) == "north"
    assert bp.bearing(-37.77, 144.98, -37.77, 144.99) == "east"
    d = bp.distances_km(-37.77, 144.98, pd.Series([-37.76]).to_numpy(), pd.Series([144.98]).to_numpy())
    assert d[0] == pytest.approx(1.11, abs=0.01)


@pytest.mark.skipif(not LISTED.exists(), reason="outputs not built")
def test_outputs_cover_every_sa2_and_stay_within_radius():
    listed = pd.read_csv(LISTED, dtype={"sa2_code": str})
    counts = pd.read_csv(COUNTS, dtype={"sa2_code": str})
    assert counts.sa2_code.nunique() == 361
    assert set(counts.kind) == set(bp.KINDS.values())
    assert listed.distance_km.max() <= bp.LIST_RADIUS_KM
    assert listed.groupby(["sa2_code", "kind"]).size().max() <= bp.MAX_PER_KIND
    assert not listed.duplicated(["sa2_code", "kind", "rank"]).any()
    within = counts.within_1km <= counts.within_2km
    assert within.all()
