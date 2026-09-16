"""Build auditable locality-level HealthDirect facility availability measures."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd


CATEGORIES = ("general_practice", "hospital", "pharmacy")


def build_service_measures(
    counts: pd.DataFrame,
    bridge: pd.DataFrame,
    localities: pd.DataFrame,
) -> tuple[pd.DataFrame, dict]:
    required_counts = {"sa2_code", *(f"{category}_count" for category in CATEGORIES)}
    if not required_counts.issubset(counts.columns):
        raise ValueError("HealthDirect counts are missing required category columns.")
    bridge = bridge.copy()
    counts = counts.copy()
    bridge["sa2_code_2021"] = bridge.sa2_code_2021.astype(str)
    counts["sa2_code"] = counts.sa2_code.astype(str)
    component = bridge.merge(counts, left_on="sa2_code_2021", right_on="sa2_code", how="left")
    count_columns = [f"{category}_count" for category in CATEGORIES]
    component[count_columns] = component[count_columns].fillna(0)
    aggregate = component.groupby("community_id", as_index=False)[count_columns].sum()
    output = localities[["community_id", "neighbourhood_id", "community_name", "population"]].merge(
        aggregate, on="community_id", how="left"
    )
    output[count_columns] = output[count_columns].fillna(0).astype(int)
    valid_population = pd.to_numeric(output.population, errors="coerce").where(lambda values: values > 0)
    for category in CATEGORIES:
        rate_column = f"{category}_per_10000"
        score_column = f"{category}_access_score"
        output[rate_column] = output[f"{category}_count"] / valid_population * 10_000
        percentile = output[rate_column].rank(method="average", pct=True) * 100
        output[score_column] = percentile.where(output[rate_column] > 0, 0)
        output[rate_column] = output[rate_column].round(4)
        output[score_column] = output[score_column].round(2)
    output["source_id"] = "ga_healthdirect_facilities_2025"
    output["interpretation"] = "listed_facilities_per_10000_residents"
    qa = {
        "source_id": "ga_healthdirect_facilities_2025",
        "reporting_localities": len(output),
        "localities_with_valid_population_denominator": int(valid_population.notna().sum()),
        "category_totals": {
            category: int(output[f"{category}_count"].sum()) for category in CATEGORIES
        },
        "score_method": "Greater Melbourne percentile rank of listed facilities per 10,000 residents",
        "missing_scores": {
            category: int(output[f"{category}_access_score"].isna().sum()) for category in CATEGORIES
        },
        "limitation": (
            "Rates use resident population as a transparent denominator. They do not measure facility "
            "capacity, child eligibility, opening hours, affordability, waiting time, cross-boundary "
            "travel access or quality. A zero means no listed facility is located inside the reporting "
            "locality, not that residents cannot reach a service elsewhere."
        ),
    }
    return output, qa


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--counts", type=Path, required=True)
    parser.add_argument("--bridge", type=Path, required=True)
    parser.add_argument("--localities", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--qa", type=Path, required=True)
    args = parser.parse_args()
    output, qa = build_service_measures(
        pd.read_csv(args.counts), pd.read_csv(args.bridge), pd.read_csv(args.localities)
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.qa.parent.mkdir(parents=True, exist_ok=True)
    output.to_csv(args.output, index=False)
    args.qa.write_text(json.dumps(qa, indent=2) + "\n")


if __name__ == "__main__":
    main()
