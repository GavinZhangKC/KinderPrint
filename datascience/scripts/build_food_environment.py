"""Fresh-food outlets near each SA2 from OpenStreetMap.

Input
-----
data/reference/iteration3/osm_food_outlets_melbourne.csv
    OpenStreetMap features in the Greater Melbourne bounding box
    (-38.55,144.3,-37.4,145.9) tagged shop=supermarket, greengrocer, butcher,
    seafood, bakery, deli, health_food or farm, amenity=marketplace, or
    organic=yes|only, queried from the Overpass API on 29 September 2026
    (OSM base 2026-09-29T00:02:35Z). (c) OpenStreetMap contributors, ODbL 1.0.

Method
------
Straight-line distance from the SA2 label point. Counts within 1 km and 2 km by
outlet type, and the 15 nearest named outlets within 3 km. OpenStreetMap is
volunteer-mapped: an outlet can be missing, and the organic tag is recorded for
only a few shops, so absence is not evidence that nothing exists. Prices and
stock are not available.

Outputs
-------
data/processed/food_outlets_sa2.csv   nearest named outlets per SA2
data/processed/food_access_sa2.csv    counts per SA2 and outlet type
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data" / "reference" / "iteration3" / "osm_food_outlets_melbourne.csv"
SA2_POINTS = ROOT / "data" / "reference" / "sa2_lga_2023_vic.csv"
SA2_SCOPE = ROOT / "data" / "processed" / "healthdirect_facility_counts_sa2.csv"
OUT_DIR = ROOT / "data" / "processed"
SHOP_TYPES = {
    "supermarket": "Supermarket", "greengrocer": "Greengrocer", "butcher": "Butcher", "seafood": "Seafood",
    "bakery": "Bakery", "deli": "Delicatessen", "health_food": "Health food", "farm": "Farm shop",
}
MAX_LIST = 15
LIST_RADIUS_KM = 3.0


def outlet_type(row: pd.Series) -> str | None:
    if row.get("amenity") == "marketplace":
        return "Market"
    return SHOP_TYPES.get(row.get("shop"))


def distances_km(lat: float, lon: float, lats: np.ndarray, lons: np.ndarray) -> np.ndarray:
    p1, p2 = np.radians(lat), np.radians(lats)
    a = np.sin((p2 - p1) / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(np.radians(lons - lon) / 2) ** 2
    return 2 * 6371.0088 * np.arcsin(np.sqrt(a))


def build(osm: pd.DataFrame, points: pd.DataFrame, scope: pd.Series) -> tuple[pd.DataFrame, pd.DataFrame]:
    osm = osm.copy()
    osm["outlet_type"] = osm.apply(outlet_type, axis=1)
    osm = osm[osm.outlet_type.notna() & osm.latitude.notna()].reset_index(drop=True)
    osm["organic"] = osm.organic.fillna("").isin(["yes", "only"])
    wanted = set(scope.astype(str).str.zfill(9))
    points = points.assign(sa2_code_2021=points.sa2_code_2021.astype(str).str.zfill(9))
    points = points[points.sa2_code_2021.isin(wanted)]
    if set(points.sa2_code_2021) != wanted:
        raise ValueError("Every SA2 in scope needs a label point")
    lats, lons = osm.latitude.to_numpy(float), osm.longitude.to_numpy(float)
    listed, counts = [], []
    for sa2 in points.itertuples():
        d = distances_km(sa2.label_point_latitude, sa2.label_point_longitude, lats, lons)
        for kind in [*SHOP_TYPES.values(), "Market"]:
            mask = (osm.outlet_type == kind).to_numpy()
            counts.append({"sa2_code": sa2.sa2_code_2021, "outlet_type": kind,
                           "within_1km": int((mask & (d <= 1)).sum()), "within_2km": int((mask & (d <= 2)).sum()),
                           "nearest_km": round(float(d[mask].min()), 1) if mask.any() else None})
        counts.append({"sa2_code": sa2.sa2_code_2021, "outlet_type": "Tagged organic",
                       "within_1km": int((osm.organic.to_numpy() & (d <= 1)).sum()),
                       "within_2km": int((osm.organic.to_numpy() & (d <= 2)).sum()),
                       "nearest_km": round(float(d[osm.organic.to_numpy()].min()), 1) if osm.organic.any() else None})
        named = np.where(osm.name.notna().to_numpy() & (d <= LIST_RADIUS_KM))[0]
        for index in named[np.argsort(d[named])][:MAX_LIST]:
            row = osm.loc[index]
            listed.append({"sa2_code": sa2.sa2_code_2021, "osm_id": row.osm_id, "name": row["name"],
                           "outlet_type": row.outlet_type, "organic": bool(row.organic),
                           "address": row.address if isinstance(row.address, str) else "",
                           "opening_hours": row.opening_hours if isinstance(row.opening_hours, str) else "",
                           "latitude": row.latitude, "longitude": row.longitude,
                           "distance_km": round(float(d[index]), 2)})
    listed_df = pd.DataFrame(listed)
    listed_df["source_id"] = "osm_overpass_food_outlets_2026"
    counts_df = pd.DataFrame(counts)
    counts_df["source_id"] = "osm_overpass_food_outlets_2026"
    return listed_df, counts_df


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--out-dir", type=Path, default=OUT_DIR)
    args = parser.parse_args()
    listed, counts = build(pd.read_csv(SOURCE), pd.read_csv(SA2_POINTS, dtype={"sa2_code_2021": str}),
                           pd.read_csv(SA2_SCOPE, dtype={"sa2_code": str}).sa2_code)
    listed.to_csv(args.out_dir / "food_outlets_sa2.csv", index=False)
    counts.to_csv(args.out_dir / "food_access_sa2.csv", index=False)
    print(f"Wrote {len(listed)} listed outlets and {len(counts)} count rows")


if __name__ == "__main__":
    main()
