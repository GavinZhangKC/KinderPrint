"""Month-by-month pattern of notified influenza and salmonella in Victorian children.

Inputs (data/reference/iteration3/)
------
nndss_influenza_vic_monthly.csv, nndss_salmonella_vic_monthly.csv
    Victorian notifications counted by month and five-year age group from the
    record-level NNDSS public datasets (Australian Centre for Disease Control,
    published 15 July 2025, data current to May 2025). Influenza months come from
    the week-ending date; salmonella from the week-ending date as published.

Method
------
Reference years 2016-2019 and 2022-2024 (whole years; 2020-2021 are excluded
because COVID-19 restrictions suppressed normal seasonal spread). For children
aged 0-14 and for all ages, the output gives the average notifications in each
calendar month and each month's share of the year. It describes past seasons
across Victoria; it is not a forecast and not an SA2 figure. Notifications
reflect testing as well as illness.

Output
------
data/processed/seasonal_illness_vic.csv
"""

from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
REF = ROOT / "data" / "reference" / "iteration3"
OUTPUT = ROOT / "data" / "processed" / "seasonal_illness_vic.csv"
REFERENCE_YEARS = (2016, 2017, 2018, 2019, 2022, 2023, 2024)
CHILD_GROUPS = ("00-04", "05-09", "10-14")
DISEASES = {
    "influenza": ("nndss_influenza_vic_monthly.csv", "Influenza (laboratory confirmed)"),
    "salmonella": ("nndss_salmonella_vic_monthly.csv", "Salmonellosis"),
}


def summarise(frame: pd.DataFrame, disease: str, label: str) -> pd.DataFrame:
    frame = frame.copy()
    frame["year"] = frame.year_month.str[:4].astype(int)
    frame["month"] = frame.year_month.str[5:7].astype(int)
    frame = frame[frame.year.isin(REFERENCE_YEARS)]
    missing = set(REFERENCE_YEARS) - set(frame.year)
    if missing:
        raise ValueError(f"{disease}: reference years missing {sorted(missing)}")
    rows = []
    for band, subset in (("0-14 years", frame[frame.age_group.isin(CHILD_GROUPS)]), ("All ages", frame)):
        monthly = subset.groupby("month").notifications.sum().reindex(range(1, 13), fill_value=0)
        average = monthly / len(REFERENCE_YEARS)
        share = monthly / monthly.sum() * 100
        for month in range(1, 13):
            rows.append({"disease": disease, "disease_label": label, "age_band": band, "month": month,
                         "average_notifications": round(float(average[month]), 1),
                         "share_of_year_pct": round(float(share[month]), 1)})
    return pd.DataFrame(rows)


def build(frames: dict[str, pd.DataFrame]) -> pd.DataFrame:
    out = pd.concat([summarise(frames[key], key, DISEASES[key][1]) for key in DISEASES], ignore_index=True)
    out["reference_years"] = "2016-2019, 2022-2024"
    out["geography"] = "Victoria"
    out["source_id"] = "nndss_public_datasets_2025"
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()
    result = build({key: pd.read_csv(REF / file) for key, (file, _label) in DISEASES.items()})
    result.to_csv(args.output, index=False)
    print(f"Wrote {len(result)} rows to {args.output}")


if __name__ == "__main__":
    main()
