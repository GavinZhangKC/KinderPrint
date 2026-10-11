"""Play spaces near each Greater Melbourne SA2, for "Where to play today".

Input
-----
data/raw/vicmap_foi/<date>/child_health_active_living_foi.geojson
    Vicmap Features of Interest (Victorian Government), downloaded by
    scripts/acquire_vicmap_foi.py. Points for playgrounds, picnic sites, day
    visitor areas and swimming pools.
data/reference/sa2_lga_2023_vic.csv           SA2 label points
data/processed/healthdirect_facility_counts_sa2.csv  the 361 SA2s in scope

Method
------
* Straight-line distance from the SA2 label point (haversine).
* Names: the feature's own label, otherwise "Playground at <park>" when Vicmap
  records the park it sits in, otherwise "Playground" with its direction. No
  name is invented.
* Up to 8 places of each kind within 3 km are listed; counts within 1 km and
  2 km and the nearest distance are kept for every kind.

Outputs (data/processed)
------------------------
play_spaces_sa2.csv   listed places
play_access_sa2.csv   counts per SA2 and kind, with the SA2 label point used

Shade, toilets, fencing and accessibility are not recorded in Vicmap, so they
are never claimed.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data" / "raw" / "vicmap_foi"
SA2_POINTS = ROOT / "data" / "reference" / "sa2_lga_2023_vic.csv"
SA2_SCOPE = ROOT / "data" / "processed" / "healthdirect_facility_counts_sa2.csv"
OUT_DIR = ROOT / "data" / "processed"
SOURCE_ID = "vicmap_foi_play_spaces"
KINDS = {
    "playground": "Playground",
    "picnic site": "Picnic area",
    "day visitor area": "Day visitor area",
    "swimming pool": "Swimming pool",
}
LIST_RADIUS_KM = 3.0
MAX_PER_KIND = 8
DIRECTIONS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"]


def latest_source(raw_dir: Path = RAW_DIR) -> Path:
    files = sorted(raw_dir.glob("*/child_health_active_living_foi.geojson"))
    if not files:
        raise FileNotFoundError("Run scripts/acquire_vicmap_foi.py first.")
    return files[-1]


def tidy(text: str | None) -> str | None:
    """Title-case Vicmap upper-case names and drop the 'Playground Equipment-' prefix."""
    if not text or not str(text).strip():
        return None
    value = str(text).strip()
    for prefix in ("PLAYGROUND EQUIPMENT-", "Playground Equipment-", "PLAYGROUND EQUIPMENT - "):
        if value.startswith(prefix):
            value = value[len(prefix):]
    if value.isupper():
        value = " ".join(w if w in {"&"} else w.capitalize() for w in value.lower().split())
    return value


def places(geojson: dict) -> pd.DataFrame:
    rows = []
    for feature in geojson["features"]:
        p = feature["properties"]
        kind = KINDS.get(p.get("feature_subtype"))
        if kind is None or feature.get("geometry", {}).get("type") != "Point":
            continue
        lon, lat = feature["geometry"]["coordinates"][:2]
        own = tidy(p.get("name_label") or p.get("name"))
        park = tidy(p.get("parent_name"))
        if own and park and kind == "Playground" and park.lower() in own.lower():
            own = None  # "Playground Equipment-Little Mcmillan Park" becomes "Playground at Little Mcmillan Park"
        if own:
            name = own
        elif park:
            name = f"{kind} at {park}"
        else:
            name = None
        rows.append({"feature_id": str(p.get("pfi") or p.get("feature_id")), "kind": kind, "name": name,
                     "park": park, "latitude": round(float(lat), 6), "longitude": round(float(lon), 6)})
    frame = pd.DataFrame(rows).drop_duplicates("feature_id")
    return frame


def distances_km(lat: float, lon: float, lats: np.ndarray, lons: np.ndarray) -> np.ndarray:
    p1, p2 = np.radians(lat), np.radians(lats)
    a = np.sin((p2 - p1) / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(np.radians(lons - lon) / 2) ** 2
    return 2 * 6371.0088 * np.arcsin(np.sqrt(a))


def bearing(lat1: float, lon1: float, lat2: float, lon2: float) -> str:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dl = math.radians(lon2 - lon1)
    x = math.sin(dl) * math.cos(p2)
    y = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)
    degrees = (math.degrees(math.atan2(x, y)) + 360) % 360
    return DIRECTIONS[int((degrees + 22.5) // 45) % 8]


def build(spaces: pd.DataFrame, points: pd.DataFrame, scope: pd.Series) -> tuple[pd.DataFrame, pd.DataFrame]:
    wanted = set(scope.astype(str).str.zfill(9))
    points = points.assign(sa2_code_2021=points.sa2_code_2021.astype(str).str.zfill(9))
    points = points[points.sa2_code_2021.isin(wanted)]
    if set(points.sa2_code_2021) != wanted:
        raise ValueError("Every SA2 in scope needs a label point")
    lats, lons = spaces.latitude.to_numpy(float), spaces.longitude.to_numpy(float)
    listed, counts = [], []
    for sa2 in points.sort_values("sa2_code_2021").itertuples():
        lat0, lon0 = sa2.label_point_latitude, sa2.label_point_longitude
        d = distances_km(lat0, lon0, lats, lons)
        for kind in KINDS.values():
            mask = (spaces.kind == kind).to_numpy()
            counts.append({"sa2_code": sa2.sa2_code_2021, "kind": kind,
                           "origin_latitude": round(float(lat0), 6), "origin_longitude": round(float(lon0), 6),
                           "within_1km": int((mask & (d <= 1)).sum()), "within_2km": int((mask & (d <= 2)).sum()),
                           "nearest_km": round(float(d[mask].min()), 2) if mask.any() else None})
            near = np.where(mask & (d <= LIST_RADIUS_KM))[0]
            order = near[np.lexsort((spaces.feature_id.to_numpy()[near], np.round(d[near], 4)))][:MAX_PER_KIND]
            for rank, index in enumerate(order, start=1):
                row = spaces.iloc[index]
                listed.append({"sa2_code": sa2.sa2_code_2021, "kind": kind, "rank": rank,
                               "feature_id": row.feature_id, "name": row["name"] or "", "park": row.park or "",
                               "latitude": row.latitude, "longitude": row.longitude,
                               "distance_km": round(float(d[index]), 2),
                               "direction": bearing(lat0, lon0, row.latitude, row.longitude)})
    listed_df = pd.DataFrame(listed)
    listed_df["source_id"] = SOURCE_ID
    counts_df = pd.DataFrame(counts)
    counts_df["source_id"] = SOURCE_ID
    return listed_df, counts_df


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--source", type=Path, default=None)
    parser.add_argument("--out-dir", type=Path, default=OUT_DIR)
    args = parser.parse_args(argv)
    source = args.source or latest_source()
    spaces = places(json.loads(source.read_text(encoding="utf-8")))
    listed, counts = build(spaces, pd.read_csv(SA2_POINTS, dtype={"sa2_code_2021": str}),
                           pd.read_csv(SA2_SCOPE, dtype={"sa2_code": str}).sa2_code)
    with_playground = counts[(counts.kind == "Playground") & (counts.within_2km > 0)].sa2_code.nunique()
    if with_playground < 0.9 * counts.sa2_code.nunique():
        print(f"Gate failed: only {with_playground} SA2s have a playground within 2 km.", file=sys.stderr)
        return 1
    listed.to_csv(args.out_dir / "play_spaces_sa2.csv", index=False)
    counts.to_csv(args.out_dir / "play_access_sa2.csv", index=False)
    print(f"Wrote {len(listed)} listed places for {counts.sa2_code.nunique()} SA2s "
          f"({with_playground} with a playground within 2 km) from {source.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
