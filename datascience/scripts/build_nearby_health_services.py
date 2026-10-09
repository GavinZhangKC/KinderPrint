"""Nearest Healthdirect facility of each official service type to every SA2.

Inputs
------
data/processed/healthdirect_facilities.csv
    Active National Health Services Directory facilities (Geoscience Australia
    extract dated 7 March 2025) with their official service type.
data/reference/sa2_lga_2023_vic.csv
    ABS ASGS Edition 3 SA2 label points.
data/processed/healthdirect_facility_counts_sa2.csv
    The Greater Melbourne SA2s served by the application.

Method
------
Straight-line distance from the SA2's ABS label point to every active facility.
For each official service type the output gives the nearest facility and the
number of facilities within 5 km. The label point is a reference point for the
area, not a family's address, and straight-line distance is not travel time.

Output
------
data/processed/nearby_health_services_sa2.csv
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
FACILITIES = ROOT / "data" / "processed" / "healthdirect_facilities.csv"
SA2_POINTS = ROOT / "data" / "reference" / "sa2_lga_2023_vic.csv"
SA2_SCOPE = ROOT / "data" / "processed" / "healthdirect_facility_counts_sa2.csv"
OUTPUT = ROOT / "data" / "processed" / "nearby_health_services_sa2.csv"
RADIUS_KM = 5.0


def distances_km(lat: float, lon: float, lats: np.ndarray, lons: np.ndarray) -> np.ndarray:
    p1, p2 = np.radians(lat), np.radians(lats)
    dp, dl = p2 - p1, np.radians(lons - lon)
    a = np.sin(dp / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dl / 2) ** 2
    return 2 * 6371.0088 * np.arcsin(np.sqrt(a))


def build(facilities: pd.DataFrame, points: pd.DataFrame, scope: pd.Series) -> pd.DataFrame:
    facilities = facilities[facilities.operational_status == "active"].reset_index(drop=True)
    wanted = set(scope.astype(str).str.zfill(9))
    points = points.copy()
    points["sa2_code_2021"] = points.sa2_code_2021.astype(str).str.zfill(9)
    points = points[points.sa2_code_2021.isin(wanted)]
    if set(points.sa2_code_2021) != wanted:
        raise ValueError("Every SA2 in scope needs a label point")
    lats, lons = facilities.latitude.to_numpy(float), facilities.longitude.to_numpy(float)
    rows = []
    for sa2 in points.itertuples():
        d = distances_km(sa2.label_point_latitude, sa2.label_point_longitude, lats, lons)
        for service_type, idx in facilities.groupby("official_service_type").groups.items():
            idx = np.asarray(list(idx))
            nearest = idx[np.argmin(d[idx])]
            f = facilities.loc[nearest]
            rows.append({
                "sa2_code": sa2.sa2_code_2021,
                "sa2_name": sa2.sa2_name_2021,
                "service_type": service_type,
                "facility_category": f.facility_category,
                "nearest_facility_id": f.facility_id,
                "nearest_name": f.facility_name,
                "nearest_address": f.address,
                "nearest_longitude": f.longitude,
                "nearest_latitude": f.latitude,
                "nearest_distance_km": round(float(d[nearest]), 1),
                "count_within_5km": int((d[idx] <= RADIUS_KM).sum()),
                "source_date": f.source_date,
                "source_id": "ga_healthdirect_facilities_2025;abs_sa2_lga_label_point_2023",
            })
    return pd.DataFrame(rows).sort_values(["sa2_code", "nearest_distance_km", "service_type"]).reset_index(drop=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()
    result = build(
        pd.read_csv(FACILITIES, dtype={"sa2_code": str, "facility_id": str}),
        pd.read_csv(SA2_POINTS, dtype={"sa2_code_2021": str}),
        pd.read_csv(SA2_SCOPE, dtype={"sa2_code": str}).sa2_code,
    )
    result.to_csv(args.output, index=False)
    print(f"Wrote {len(result)} rows for {result.sa2_code.nunique()} SA2s to {args.output}")


if __name__ == "__main__":
    main()
