"""SA2-level practitioner context: priority model V2 result plus E2SFCA access.

Joins the community-level expected-vs-observed result
(expected_vulnerability_community.csv) to every SA2 in that community. Adds GP
and early-childhood access for the SA2 itself (access_e2sfca_sa2.csv). The
serving API reads this single validated file.

The internal z-score is not carried over. The API contract publishes bands, never
a numeric priority value (ADR-004). Observed and expected percentages are data,
shown with the expected range so a reader can see why a band was given.

Output: data/processed/practitioner_context_sa2.csv
"""
from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
PROC = ROOT / "data" / "processed"
OUTPUT = PROC / "practitioner_context_sa2.csv"


def build(v2: pd.DataFrame, bridge: pd.DataFrame, access: pd.DataFrame, scope: pd.DataFrame) -> pd.DataFrame:
    wide = access.pivot_table(index="sa2_code", columns="service",
                              values=["access_5km", "access_percentile", "nearest_km"], aggfunc="first")
    wide.columns = [f"{service}_{metric}" for metric, service in wide.columns]
    wide = wide.reset_index()
    frame = scope.merge(bridge.rename(columns={"sa2_code_2021": "sa2_code"})[["sa2_code", "community_id"]],
                        on="sa2_code", how="left")
    keep = ["community_id", "community_name", "n_children", "observed_pct", "expected_pct",
            "expected_range_lo_pct", "expected_range_hi_pct", "band_v2", "higher_band_bootstrap_share",
            "expectation_drivers", "model_version"]
    frame = frame.merge(v2[keep], on="community_id", how="left").merge(wide, on="sa2_code", how="left")
    frame = frame.rename(columns={"band_v2": "priority_band", "higher_band_bootstrap_share": "band_stability"})
    frame["n_children"] = frame.n_children.astype("Int64")
    frame["source_id"] = "aedc_sa2_2009_2024;seifa_2021_sa2;census_2021_gcp_sa2;ga_healthdirect_facilities_2025;acecqa_services_2026"
    columns = ["sa2_code", "sa2_name", "community_id", "community_name", "n_children", "observed_pct", "expected_pct",
               "expected_range_lo_pct", "expected_range_hi_pct", "priority_band", "band_stability",
               "expectation_drivers", "gp_access_5km", "gp_access_percentile", "gp_nearest_km",
               "ecec_access_5km", "ecec_access_percentile", "ecec_nearest_km", "model_version", "source_id"]
    return frame[columns].sort_values("sa2_code").reset_index(drop=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()
    out = build(
        pd.read_csv(PROC / "expected_vulnerability_community.csv", dtype={"community_id": str}),
        pd.read_csv(PROC / "community_sa2.csv", dtype={"community_id": str, "sa2_code_2021": str}),
        pd.read_csv(PROC / "access_e2sfca_sa2.csv", dtype={"sa2_code": str}),
        pd.read_csv(PROC / "healthdirect_facility_counts_sa2.csv", dtype={"sa2_code": str})[["sa2_code", "sa2_name"]],
    )
    out.to_csv(args.output, index=False)
    print(f"Wrote {len(out)} SA2 rows ({out.priority_band.notna().sum()} with a V2 band) to {args.output}")


if __name__ == "__main__":
    main()
