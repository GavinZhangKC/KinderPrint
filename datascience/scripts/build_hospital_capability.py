"""Victorian hospital capability and timeliness from AIHW MyHospitals.

Inputs (data/reference/iteration3/, extracted from the public MyHospitals Data API
https://myhospitalsapi.aihw.gov.au on 29 September 2026, CC BY 4.0)
------
myhospitals_vic_hospitals.csv
    Every hospital reporting unit mapped to Victoria: code, name, private flag,
    closed flag, coordinates and Local Hospital Network.
myhospitals_vic_data_items.csv
    For each open hospital, the latest value of each selected reported measure,
    preferring a full-year reporting period.
myhospitals_reported_measures.csv
    Names and units of those reported measures.

Output
------
data/processed/hospital_capability_vic.csv
    One row per open Victorian hospital: specialised service units (2024-25),
    emergency department timeliness and elective surgery median waits. ED and
    surgery measures older than the 2023-24 financial year are dropped rather
    than presented as current. Nothing is scored or ranked.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
REF = ROOT / "data" / "reference" / "iteration3"
OUTPUT = ROOT / "data" / "processed" / "hospital_capability_vic.csv"
CURRENT_FROM = "2024-06-30"  # reporting periods ending on or after this date

ED_MEASURES = {
    "MYH-RM0035": "ed_on_time_resuscitation_pct",
    "MYH-RM0036": "ed_on_time_emergency_pct",
    "MYH-RM0037": "ed_on_time_urgent_pct",
    "MYH-RM0038": "ed_on_time_semi_urgent_pct",
    "MYH-RM0039": "ed_on_time_non_urgent_pct",
    "MYH-RM0015": "ed_departed_within_4h_pct",
    "MYH-RM0300": "ed_median_minutes",
    "MYH-RM0302": "ed_90th_percentile_minutes",
    "MYH-RM0040": "surgery_median_days_urgent",
    "MYH-RM0041": "surgery_median_days_semi_urgent",
    "MYH-RM0042": "surgery_median_days_non_urgent",
}
UNIT_MEASURE = "MYH0039"


def _period(frame: pd.DataFrame) -> pd.Series:
    span = frame.groupby("code").agg(start=("start", "min"), end=("end", "max"))
    return (span.start + " to " + span.end) if len(span) else pd.Series(dtype=str)


def build(hospitals: pd.DataFrame, items: pd.DataFrame, measures: pd.DataFrame) -> pd.DataFrame:
    # The hospital listing also carries network and peer-group units; keep hospitals only.
    hospitals = hospitals[(hospitals.closed == 0) & hospitals.code.str.fullmatch(r"H\d{4}")].copy()
    items = items.merge(measures[["reported_measure_code", "measure_code", "reported_measure_name"]],
                        on="reported_measure_code", how="left")
    if items.measure_code.isna().any():
        raise ValueError("Data item without a reported-measure definition")
    current = items[items.end >= CURRENT_FROM]

    units = current[(current.measure_code == UNIT_MEASURE) & (current.value >= 1)]
    unit_lists = units.groupby("code").reported_measure_name.apply(lambda s: "; ".join(sorted(s)))
    unit_period = units.groupby("code").end.max()

    timely = current[current.reported_measure_code.isin(ED_MEASURES)]
    wide = timely.pivot_table(index="code", columns="reported_measure_code", values="value", aggfunc="first")
    wide = wide.rename(columns=ED_MEASURES)
    ed_period = _period(timely[timely.reported_measure_code.str.match(r"MYH-RM00(15|3[5-9])|MYH-RM030[02]")])
    surgery_period = _period(timely[timely.reported_measure_code.isin(["MYH-RM0040", "MYH-RM0041", "MYH-RM0042"])])

    out = hospitals.rename(columns={"code": "hospital_code", "name": "hospital_name"}).set_index("hospital_code")
    out["specialised_units"] = unit_lists
    out["specialised_units_period_end"] = unit_period
    out = out.join(wide)
    out["ed_period"] = ed_period
    out["surgery_period"] = surgery_period
    for column in ED_MEASURES.values():
        if column not in out:
            out[column] = pd.NA
    out["has_emergency_department_data"] = out["ed_median_minutes"].notna()
    out["has_paediatric_service"] = out.specialised_units.fillna("").str.contains("Paediatric service")
    out["has_neonatal_intensive_care"] = out.specialised_units.fillna("").str.contains("Neonatal intensive care")
    out["has_obstetric_service"] = out.specialised_units.fillna("").str.contains("Obstetric services")
    out["source_id"] = "aihw_myhospitals_api_2026"
    out = out.reset_index()
    columns = ["hospital_code", "hospital_name", "private", "latitude", "longitude", "lhn",
               "specialised_units", "specialised_units_period_end", "has_paediatric_service",
               "has_neonatal_intensive_care", "has_obstetric_service", "has_emergency_department_data",
               *ED_MEASURES.values(), "ed_period", "surgery_period", "source_id"]
    return out[columns].sort_values("hospital_code").reset_index(drop=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()
    result = build(
        pd.read_csv(REF / "myhospitals_vic_hospitals.csv"),
        pd.read_csv(REF / "myhospitals_vic_data_items.csv"),
        pd.read_csv(REF / "myhospitals_reported_measures.csv"),
    )
    result.to_csv(args.output, index=False)
    print(f"Wrote {len(result)} hospitals, {int(result.has_emergency_department_data.sum())} with current ED data, to {args.output}")


if __name__ == "__main__":
    main()
