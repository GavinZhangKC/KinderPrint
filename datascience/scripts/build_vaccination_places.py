"""Places to get childhood vaccines near every SA2, and the local council's immunisation service.

Inputs
------
data/processed/healthdirect_facilities.csv
    Active National Health Services Directory facilities (Geoscience Australia
    extract dated 7 March 2025) with their official service type.
data/reference/sa2_lga_2023_vic.csv
    ABS ASGS Edition 3 SA2 label points and their 2023 LGA.
data/reference/council_immunisation_vic.csv
    Each Victorian council's immunisation-session page and phone number, as listed by
    the Melbourne Vaccine Education Centre (MVEC) "Victorian council immunisation
    sessions" reference, retrieved 8 October 2026.
data/processed/healthdirect_facility_counts_sa2.csv
    The Greater Melbourne SA2s served by the application.

Method
------
For each SA2, straight-line distance from its ABS label point to every active facility
of the service types families use for childhood vaccines and advice: general practice,
pharmacy, and maternal and child health. The nearest facilities of each type within
MAX_KM are kept, up to PER_TYPE. Facilities in neighbouring
suburbs are included on purpose. The label point is a reference point for the area, not
a family's address, and straight-line distance is not travel time. Listing does not
confirm that a facility gives a particular vaccine or has appointments available.

Each SA2 is linked to its council's immunisation service through its 2023 LGA.

Outputs
-------
data/processed/vaccination_places_sa2.csv
data/processed/council_immunisation_sa2.csv
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
FACILITIES = ROOT / "data" / "processed" / "healthdirect_facilities.csv"
SA2_POINTS = ROOT / "data" / "reference" / "sa2_lga_2023_vic.csv"
COUNCILS = ROOT / "data" / "reference" / "council_immunisation_vic.csv"
SA2_SCOPE = ROOT / "data" / "processed" / "healthdirect_facility_counts_sa2.csv"
PLACES_OUTPUT = ROOT / "data" / "processed" / "vaccination_places_sa2.csv"
COUNCIL_OUTPUT = ROOT / "data" / "processed" / "council_immunisation_sa2.csv"

KINDS = {
    "General practice service": "general_practice",
    "Pharmacy service": "pharmacy",
    "Maternal, child and family health service": "maternal_child_health",
}
PER_TYPE = 6
MAX_KM = 10.0
SOURCE_ID = "ga_healthdirect_facilities_2025;abs_sa2_lga_label_point_2023"


def distances_km(lat: float, lon: float, lats: np.ndarray, lons: np.ndarray) -> np.ndarray:
    p1, p2 = np.radians(lat), np.radians(lats)
    dp, dl = p2 - p1, np.radians(lons - lon)
    a = np.sin(dp / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dl / 2) ** 2
    return 2 * 6371.0088 * np.arcsin(np.sqrt(a))


def _points_in_scope(points: pd.DataFrame, scope: pd.Series) -> pd.DataFrame:
    wanted = set(scope.astype(str).str.zfill(9))
    points = points.copy()
    points["sa2_code_2021"] = points.sa2_code_2021.astype(str).str.zfill(9)
    points = points[points.sa2_code_2021.isin(wanted)]
    if set(points.sa2_code_2021) != wanted:
        raise ValueError("Every SA2 in scope needs a label point")
    return points


def build_places(facilities: pd.DataFrame, points: pd.DataFrame, scope: pd.Series) -> pd.DataFrame:
    facilities = facilities[(facilities.operational_status == "active")
                            & facilities.official_service_type.isin(KINDS)].reset_index(drop=True)
    points = _points_in_scope(points, scope)
    lats, lons = facilities.latitude.to_numpy(float), facilities.longitude.to_numpy(float)
    groups = {kind: np.asarray(list(idx)) for kind, idx in facilities.groupby("official_service_type").groups.items()}
    rows = []
    for sa2 in points.itertuples():
        d = distances_km(sa2.label_point_latitude, sa2.label_point_longitude, lats, lons)
        for service_type, idx in groups.items():
            near = idx[d[idx] <= MAX_KM]
            near = near[np.lexsort((facilities.facility_id.to_numpy()[near], d[near]))][:PER_TYPE]
            for rank, i in enumerate(near, start=1):
                f = facilities.loc[i]
                rows.append({
                    "sa2_code": sa2.sa2_code_2021,
                    "sa2_name": sa2.sa2_name_2021,
                    "origin_longitude": sa2.label_point_longitude,
                    "origin_latitude": sa2.label_point_latitude,
                    "kind": KINDS[service_type],
                    "rank": rank,
                    "facility_id": f.facility_id,
                    "name": f.facility_name,
                    "address": f.address,
                    "suburb": f.suburb,
                    "longitude": f.longitude,
                    "latitude": f.latitude,
                    "distance_km": round(float(d[i]), 2),
                    "source_date": f.source_date,
                    "source_id": SOURCE_ID,
                })
    return pd.DataFrame(rows).sort_values(["sa2_code", "kind", "rank"]).reset_index(drop=True)


def build_councils(points: pd.DataFrame, councils: pd.DataFrame, scope: pd.Series) -> pd.DataFrame:
    points = _points_in_scope(points, scope)
    if councils.lga_name_2023.duplicated().any():
        raise ValueError("Each LGA needs exactly one council immunisation entry")
    merged = points.merge(councils, on="lga_name_2023", how="left", validate="many_to_one")
    missing = merged[merged.council_name.isna()]
    if len(missing):
        raise ValueError(f"No council immunisation entry for LGA(s): {sorted(missing.lga_name_2023.unique())}")
    return merged.rename(columns={"sa2_code_2021": "sa2_code", "sa2_name_2021": "sa2_name"})[[
        "sa2_code", "sa2_name", "lga_name_2023", "council_name", "immunisation_url", "phone", "retrieved", "source_id",
    ]].sort_values("sa2_code").reset_index(drop=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--places-output", type=Path, default=PLACES_OUTPUT)
    parser.add_argument("--council-output", type=Path, default=COUNCIL_OUTPUT)
    args = parser.parse_args()
    points = pd.read_csv(SA2_POINTS, dtype={"sa2_code_2021": str})
    scope = pd.read_csv(SA2_SCOPE, dtype={"sa2_code": str}).sa2_code
    places = build_places(pd.read_csv(FACILITIES, dtype={"sa2_code": str, "facility_id": str}), points, scope)
    councils = build_councils(points, pd.read_csv(COUNCILS), scope)
    places.to_csv(args.places_output, index=False)
    councils.to_csv(args.council_output, index=False)
    print(f"Wrote {len(places)} places for {places.sa2_code.nunique()} SA2s to {args.places_output}")
    print(f"Wrote {len(councils)} council links for {councils.lga_name_2023.nunique()} LGAs to {args.council_output}")


if __name__ == "__main__":
    main()
