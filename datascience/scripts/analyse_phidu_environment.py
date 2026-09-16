"""Run pre-specified exploratory PHA-level environment/child-asthma tests."""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import spearmanr

ROOT = Path(__file__).resolve().parents[1]
PROC = ROOT / "data/processed"
INTERIM = ROOT / "data/interim"
REPORTS = ROOT / "reports"
SEED = 5120

HYPOTHESES = [
    ("H1", "length_weighted_aadt", 1, "Higher declared-road AADT is associated with higher child asthma prevalence."),
    ("H2", "high_traffic_road_share_pct", 1, "More high-traffic road share is associated with higher child asthma prevalence."),
    ("H3", "peranytree", -1, "More tree cover is associated with lower child asthma prevalence."),
    ("H4", "uhi18_m", 1, "Higher urban heat island intensity is associated with higher child asthma prevalence."),
    ("H5", "open_space_pct", -1, "More filtered existing public open space is associated with lower child asthma prevalence."),
    ("H6", "nearest_npi_respiratory_reporting_facility_km", -1,
     "Greater distance from a respiratory-pollutant-reporting NPI facility is associated with lower child asthma prevalence."),
    ("H7", "npi_respiratory_reporting_facilities", 1,
     "More respiratory-pollutant-reporting NPI facilities are associated with higher child asthma prevalence."),
]


def weighted_mean(group: pd.DataFrame, column: str) -> float:
    valid = group[column].notna() & group.child_population_0_14.gt(0)
    return float(np.average(group.loc[valid, column], weights=group.loc[valid, "child_population_0_14"])) if valid.any() else np.nan


def build_pha_table() -> pd.DataFrame:
    bridge = pd.read_csv(PROC / "phidu_pha_sa2_bridge.csv", dtype=str)
    environment = pd.read_csv(INTERIM / "environment_by_sa2.csv", dtype={"SA2_CODE_2021": str})
    traffic = pd.read_csv(PROC / "traffic_context_sa2.csv", dtype={"SA2_CODE_2021": str})
    npi = pd.read_csv(PROC / "npi_context_sa2.csv", dtype={"SA2_CODE_2021": str})
    vif = pd.read_csv(PROC / "vif_child_population_projections_sa2.csv", dtype={"sa2_code_2021": str})
    vif = vif[(vif.projection_year.eq(2021)) & vif.sex.eq("persons")][
        ["sa2_code_2021", "population_age_0_14_projected"]
    ].rename(columns={"population_age_0_14_projected": "child_population_0_14"})
    context = (bridge.merge(vif, on="sa2_code_2021", how="left", validate="one_to_one")
               .merge(environment, left_on="sa2_code_2021", right_on="SA2_CODE_2021", how="left")
               .merge(traffic.drop(columns="SA2_CODE_2021"), left_on="sa2_code_2021",
                      right_on=traffic.SA2_CODE_2021, how="left")
               .merge(npi.drop(columns="SA2_CODE_2021"), left_on="sa2_code_2021",
                      right_on=npi.SA2_CODE_2021, how="left"))
    required = ["peranytree", "uhi18_m", "open_space_pct", "length_weighted_aadt",
                "high_traffic_road_share_pct", "nearest_npi_respiratory_reporting_facility_km",
                "npi_respiratory_reporting_facilities", "child_population_0_14"]
    expected = bridge.groupby("pha_code_2021").size()
    complete = context.dropna(subset=required).groupby("pha_code_2021").size().eq(expected)
    eligible = set(complete[complete].index)
    rows = []
    for pha, group in context[context.pha_code_2021.isin(eligible)].groupby("pha_code_2021"):
        rows.append({
            "pha_code_2021": pha,
            "pha_name_2021": group.pha_name_2021.iloc[0],
            "component_sa2s": len(group),
            "child_population_0_14": group.child_population_0_14.sum(),
            **{column: weighted_mean(group, column) for column in required
               if column not in {"child_population_0_14", "npi_respiratory_reporting_facilities"}},
            "npi_respiratory_reporting_facilities": group.npi_respiratory_reporting_facilities.sum(),
            "geographic_coverage_status": "COMPLETE_COMPONENT_SA2_COVERAGE",
        })
    result = pd.DataFrame(rows)
    outcomes = pd.read_csv(PROC / "phidu_child_health_pha.csv", dtype={"pha_code_2021": str})
    asthma = outcomes[(outcomes.indicator_id.eq("child_asthma")) &
                      outcomes.publication_status.eq("PUBLISHED")][["pha_code_2021", "rate_or_percent"]]
    return result.merge(asthma, on="pha_code_2021", how="inner", validate="one_to_one").rename(
        columns={"rate_or_percent": "child_asthma_asr_per_100"})


def bh_adjust(p_values: list[float]) -> list[float]:
    order = np.argsort(p_values)
    adjusted = np.empty(len(p_values))
    running = 1.0
    for rank_index in range(len(order) - 1, -1, -1):
        original = order[rank_index]
        rank = rank_index + 1
        running = min(running, p_values[original] * len(p_values) / rank)
        adjusted[original] = running
    return adjusted.tolist()


def bootstrap_ci(x: np.ndarray, y: np.ndarray) -> tuple[float, float]:
    rng = np.random.default_rng(SEED)
    values = []
    for _ in range(2000):
        sample = rng.integers(0, len(x), len(x))
        rho = spearmanr(x[sample], y[sample]).statistic
        if np.isfinite(rho):
            values.append(rho)
    return tuple(np.quantile(values, [0.025, 0.975]))


def test_hypotheses(data: pd.DataFrame) -> pd.DataFrame:
    rows = []
    y = data.child_asthma_asr_per_100.to_numpy()
    for hypothesis, feature, expected_direction, statement in HYPOTHESES:
        valid = data[[feature, "child_asthma_asr_per_100"]].dropna()
        result = spearmanr(valid[feature], valid.child_asthma_asr_per_100)
        low, high = bootstrap_ci(valid[feature].to_numpy(), valid.child_asthma_asr_per_100.to_numpy())
        rows.append({"hypothesis_id": hypothesis, "statement": statement, "feature": feature,
                     "expected_direction": "positive" if expected_direction > 0 else "negative",
                     "n_phas": len(valid), "spearman_rho": result.statistic,
                     "rho_ci_95_low": low, "rho_ci_95_high": high,
                     "p_value_two_sided": result.pvalue})
    output = pd.DataFrame(rows)
    output["q_value_bh"] = bh_adjust(output.p_value_two_sided.tolist())
    direction_ok = np.sign(output.spearman_rho) == output.expected_direction.map({"positive": 1, "negative": -1})
    output["verdict"] = np.where((output.q_value_bh < 0.05) & direction_ok, "SUPPORTED_ASSOCIATION_AFTER_FDR",
                         np.where(output.q_value_bh < 0.05, "SIGNIFICANT_OPPOSITE_DIRECTION", "NOT_SUPPORTED_AFTER_FDR"))
    output["inference_scope"] = "UNADJUSTED_ECOLOGICAL_ASSOCIATION_NOT_CAUSAL"
    return output


def report(data: pd.DataFrame, tests: pd.DataFrame) -> str:
    lines = ["# Exploratory PHIDU environment-child asthma analysis", "",
             f"Analysable sample: {len(data)} PHAs with complete component-SA2 environmental coverage and published asthma values.", "",
             "These are unadjusted ecological Spearman associations. They do not estimate individual exposure, establish causality, or support user-facing risk interpretation. Seven pre-specified tests use Benjamini-Hochberg false-discovery-rate correction; confidence intervals are percentile bootstrap intervals (2,000 resamples, seed 5120).", "",
             "| ID | Feature | n | rho | 95% CI | raw p | BH q | Verdict |", "|---|---|---:|---:|---:|---:|---:|---|"]
    for row in tests.itertuples():
        lines.append(f"| {row.hypothesis_id} | `{row.feature}` | {row.n_phas} | {row.spearman_rho:.3f} | [{row.rho_ci_95_low:.3f}, {row.rho_ci_95_high:.3f}] | {row.p_value_two_sided:.4f} | {row.q_value_bh:.4f} | {row.verdict} |")
    lines += ["", "## Guardrails", "", "- PHIDU outcomes remain at PHA geography; no PHA outcome was assigned to an SA2.", "- Only PHAs with complete coverage of every component SA2 were analysed.", "- SA2 context measures were weighted by VIF2023 2021 population aged 0-14 where appropriate.", "- NPI emissions are proximity/reporting context, not ambient concentration.", "- EPA station data are not used because no defensible PHA exposure surface exists.", "- Socioeconomic and other confounding adjustment is not included in this exploratory screen; findings remain hypothesis-generating.", ""]
    return "\n".join(lines)


def main() -> None:
    data = build_pha_table()
    if len(data) < 30:
        raise ValueError("Insufficient complete PHAs for exploratory testing")
    tests = test_hypotheses(data)
    PROC.mkdir(parents=True, exist_ok=True)
    REPORTS.mkdir(parents=True, exist_ok=True)
    data.to_csv(PROC / "phidu_environment_pha.csv", index=False, float_format="%.6f")
    tests.to_csv(REPORTS / "phidu_environment_hypotheses.csv", index=False, float_format="%.6f")
    (REPORTS / "PHIDU_ENVIRONMENT_FINDINGS.md").write_text(report(data, tests))
    print(tests[["hypothesis_id", "n_phas", "spearman_rho", "q_value_bh", "verdict"]].to_string(index=False))


if __name__ == "__main__":
    main()
