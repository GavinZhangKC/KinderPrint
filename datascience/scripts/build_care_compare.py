"""Hospitals and Urgent Care Clinics within reach of each SA2, for side-by-side comparison.

Inputs
------
data/processed/hospital_capability_vic.csv
    Open Victorian hospitals with MyHospitals capability and timeliness.
data/reference/iteration3/urgent_care_clinics_vic.csv
    The Urgent Care Clinics listed by the Better Health Channel (Victorian
    Department of Health) map at betterhealth.vic.gov.au/urgent-care-clinics,
    captured 29 September 2026 with the coordinates published on that map.
data/reference/sa2_lga_2023_vic.csv
    ABS SA2 label points.
data/processed/healthdirect_facility_counts_sa2.csv
    The Greater Melbourne SA2s served by the application.

Method
------
Straight-line distance from the SA2 label point. Hospitals are kept when they
report current emergency department data or a paediatric, neonatal intensive
care or obstetric unit; the 10 nearest within 40 km are listed. The 5 nearest
Urgent Care Clinics within 40 km are listed. Distance is not travel time.

Output
------
data/processed/care_compare_sa2.csv
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
HOSPITALS = ROOT / "data" / "processed" / "hospital_capability_vic.csv"
UCC = ROOT / "data" / "reference" / "iteration3" / "urgent_care_clinics_vic.csv"
SA2_POINTS = ROOT / "data" / "reference" / "sa2_lga_2023_vic.csv"
SA2_SCOPE = ROOT / "data" / "processed" / "healthdirect_facility_counts_sa2.csv"
OUTPUT = ROOT / "data" / "processed" / "care_compare_sa2.csv"
RADIUS_KM = 40.0
MAX_HOSPITALS = 10
MAX_UCC = 5


def distances_km(lat: float, lon: float, lats: np.ndarray, lons: np.ndarray) -> np.ndarray:
    p1, p2 = np.radians(lat), np.radians(lats)
    a = np.sin((p2 - p1) / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(np.radians(lons - lon) / 2) ** 2
    return 2 * 6371.0088 * np.arcsin(np.sqrt(a))


def clinic_id(name: str) -> str:
    return "UCC-" + re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def build(hospitals: pd.DataFrame, clinics: pd.DataFrame, points: pd.DataFrame, scope: pd.Series) -> pd.DataFrame:
    relevant = hospitals[hospitals.has_emergency_department_data.astype(bool)
                         | hospitals.has_paediatric_service.astype(bool)
                         | hospitals.has_neonatal_intensive_care.astype(bool)
                         | hospitals.has_obstetric_service.astype(bool)].reset_index(drop=True)
    clinics = clinics.assign(facility_id=clinics.name.map(clinic_id)).reset_index(drop=True)
    if clinics.facility_id.duplicated().any():
        raise ValueError("Urgent Care Clinic names must be unique")
    wanted = set(scope.astype(str).str.zfill(9))
    points = points.assign(sa2_code_2021=points.sa2_code_2021.astype(str).str.zfill(9))
    points = points[points.sa2_code_2021.isin(wanted)]
    if set(points.sa2_code_2021) != wanted:
        raise ValueError("Every SA2 in scope needs a label point")
    rows = []
    for sa2 in points.itertuples():
        for kind, frame, id_col, limit in (("hospital", relevant, "hospital_code", MAX_HOSPITALS),
                                           ("urgent_care_clinic", clinics, "facility_id", MAX_UCC)):
            d = distances_km(sa2.label_point_latitude, sa2.label_point_longitude,
                             frame.latitude.to_numpy(float), frame.longitude.to_numpy(float))
            for index in np.argsort(d)[:limit]:
                if d[index] > RADIUS_KM:
                    break
                rows.append({"sa2_code": sa2.sa2_code_2021, "sa2_name": sa2.sa2_name_2021, "kind": kind,
                             "facility_id": frame.loc[index, id_col], "distance_km": round(float(d[index]), 1)})
    return pd.DataFrame(rows).sort_values(["sa2_code", "kind", "distance_km"]).reset_index(drop=True)


def clinics_table(clinics: pd.DataFrame) -> pd.DataFrame:
    out = clinics.assign(facility_id=clinics.name.map(clinic_id))
    out["cost"] = "Free; no Medicare card, appointment or referral needed"
    out["source_id"] = "betterhealth_urgent_care_clinics_2026"
    return out[["facility_id", "name", "address", "suburb_postcode", "phone", "listing_url", "latitude", "longitude", "cost", "source_id"]]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()
    clinics = pd.read_csv(UCC)
    result = build(pd.read_csv(HOSPITALS), clinics,
                   pd.read_csv(SA2_POINTS, dtype={"sa2_code_2021": str}),
                   pd.read_csv(SA2_SCOPE, dtype={"sa2_code": str}).sa2_code)
    result.to_csv(args.output, index=False)
    clinics_table(clinics).to_csv(args.output.parent / "urgent_care_clinics_vic.csv", index=False)
    print(f"Wrote {len(result)} rows for {result.sa2_code.nunique()} SA2s to {args.output}")


if __name__ == "__main__":
    main()
