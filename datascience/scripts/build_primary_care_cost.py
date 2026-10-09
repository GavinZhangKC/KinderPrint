"""Medicare-subsidised GP, specialist and allied health use and cost by Victorian SA3.

Input
-----
data/reference/iteration3/aihw_mbs_local_areas_vic_2024_25.csv
    Victorian SA3 and national rows extracted from the AIHW release
    "Medicare-subsidised GP, allied health and specialist health care across
    local areas: 2017-18 to 2024-25" (machine-readable CSV for 2024-25,
    aihw-phc-019, published 26 March 2026, CC BY 4.0). Thousands separators and
    currency symbols are as published.

Method
------
Average patient contribution per service = (total provider fees - total Medicare
benefits paid) / number of services. It is an area average across all services,
bulk-billed services included, so it is not the fee of any one practice.
Suppressed values (n.p.) stay empty.

Output
------
data/processed/primary_care_cost_sa3.csv
    One row per SA3 (plus the national row) x service x demographic group.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data" / "reference" / "iteration3" / "aihw_mbs_local_areas_vic_2024_25.csv"
OUTPUT = ROOT / "data" / "processed" / "primary_care_cost_sa3.csv"
MEASURES = {
    "Estimated resident population": "population",
    "No. patients": "patients",
    "No. services": "services",
    "Services per 100 people": "services_per_100",
    "Percentage of people who had the service (%)": "percent_people",
    "Total provider fees ($)": "provider_fees",
    "Total Medicare benefits paid ($)": "benefits_paid",
}


def to_number(value: object) -> float | None:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    text = str(value).replace("$", "").replace("%", "").replace(",", "").strip()
    if text in {"", "n.p.", "np", "-"}:
        return None
    return float(text)


def build(raw: pd.DataFrame) -> pd.DataFrame:
    raw = raw[raw.measure.isin(MEASURES)].copy()
    raw["number"] = raw.value.map(to_number)
    wide = raw.groupby(["unit", "code", "name", "service", "demographic", "measure"]).number.first() \
        .unstack("measure").rename(columns=MEASURES).reset_index()
    wide.columns.name = None
    for column in MEASURES.values():
        if column not in wide:
            wide[column] = pd.NA
    # Fees below benefits cannot happen for a real bill; the published national 0-24 GP
    # row (fees $838m, benefits $1,585m) is one such case, so no gap is derived from it.
    consistent = (wide.provider_fees > 0) & (wide.provider_fees >= wide.benefits_paid * 0.999)
    gap = (wide.provider_fees - wide.benefits_paid) / wide.services
    wide["patient_contribution_per_service"] = gap.where((wide.services > 0) & consistent).round(2)
    wide["benefit_share_of_fees_pct"] = (wide.benefits_paid / wide.provider_fees * 100).where(consistent).round(1)
    wide["reference_period"] = "2024-25"
    wide["source_id"] = "aihw_phc_019_mbs_local_areas_2024_25"
    wide = wide.rename(columns={"code": "sa3_code", "name": "sa3_name", "unit": "geography"})
    return wide[["geography", "sa3_code", "sa3_name", "service", "demographic", *MEASURES.values(),
                 "patient_contribution_per_service", "benefit_share_of_fees_pct", "reference_period", "source_id"]] \
        .sort_values(["geography", "sa3_code", "service", "demographic"]).reset_index(drop=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()
    result = build(pd.read_csv(SOURCE, dtype=str))
    result.to_csv(args.output, index=False)
    print(f"Wrote {len(result)} rows for {result[result.geography == 'SA3'].sa3_code.nunique()} SA3s to {args.output}")


if __name__ == "__main__":
    main()
