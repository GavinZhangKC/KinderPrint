"""Extract selected PHIDU child-health indicators without disaggregating PHA values."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data/raw"
PROC = ROOT / "data/processed"
OUT = ROOT / "outputs/iteration_2"
SUPPRESSION = {"#", "^", "n.p."}

INDICATORS = [
    ("child_asthma", "Census_condition_type_children", 2, "2021", "observed_self_reported"),
    ("child_mental_health_condition", "Census_condition_type_children", 7, "2021", "observed_self_reported"),
    ("child_other_long_term_condition", "Census_condition_type_children", 12, "2021", "observed_self_reported"),
    ("child_one_or_more_long_term_conditions", "Census_health_condition_child", 12, "2021", "observed_self_reported"),
    ("child_overweight_not_obese", "Estimates_risk_factors_children", 38, "2022", "modelled_estimate"),
    ("child_obese", "Estimates_risk_factors_children", 47, "2022", "modelled_estimate"),
    ("immunised_age_1", "Child_youth_health", 2, "2023", "administrative"),
    ("immunised_age_2", "Child_youth_health", 6, "2023", "administrative"),
    ("immunised_age_5", "Child_youth_health", 10, "2023", "administrative"),
    ("infant_mortality", "Child_youth_health", 22, "2019-2023", "observed_pooled"),
    ("low_birthweight", "Mothers_babies", 2, "2019-2021", "observed_pooled"),
    ("smoking_during_pregnancy", "Mothers_babies", 6, "2019-2021", "observed_pooled"),
]


def latest() -> Path:
    matches = sorted(RAW.rglob("phidu_data_pha_health_status_aust.xlsx"))
    if not matches:
        raise FileNotFoundError("PHIDU workbook not found; import it first")
    return matches[-1]


def checksum(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def numeric(value):
    return pd.to_numeric(value, errors="coerce")


def status(values: list[object]) -> str:
    tokens = {str(value).strip() for value in values if pd.notna(value)}
    if tokens & SUPPRESSION:
        return "SUPPRESSED"
    if ".." in tokens:
        return "NOT_APPLICABLE"
    if "n.a." in tokens or not tokens:
        return "MISSING"
    return "PUBLISHED"


def pha_bridge(path: Path) -> pd.DataFrame:
    raw = pd.read_excel(path, sheet_name="PHAs", header=None)
    rows = []
    for _, row in raw.iterrows():
        codes, names, pha_code, pha_name = row.iloc[:4]
        if pd.isna(codes) or pd.isna(pha_code):
            continue
        sa2_codes = [part.strip() for part in str(codes).split(",")]
        sa2_names = [part.strip() for part in str(names).split(",")] if pd.notna(names) else []
        if not sa2_codes or not all(code.isdigit() and len(code) == 9 and code.startswith("2")
                                    for code in sa2_codes):
            continue
        for position, code in enumerate(sa2_codes):
            rows.append({
                "sa2_code_2021": code,
                "sa2_name_2021": sa2_names[position] if position < len(sa2_names) else "",
                "pha_code_2021": str(int(pha_code)),
                "pha_name_2021": str(pha_name).strip(),
            })
    bridge = pd.DataFrame(rows)
    if len(bridge) != 522 or bridge.sa2_code_2021.duplicated().any():
        raise ValueError("Expected a one-to-one allocation of 522 Victorian SA2s to PHAs")
    return bridge.sort_values("sa2_code_2021")


def extract(path: Path, bridge: pd.DataFrame) -> pd.DataFrame:
    pha_names = (bridge[["pha_code_2021", "pha_name_2021"]].drop_duplicates()
                 .set_index("pha_code_2021").pha_name_2021.to_dict())
    sheets = {sheet: pd.read_excel(path, sheet_name=sheet, header=None)
              for sheet in {item[1] for item in INDICATORS}}
    records = []
    for indicator, sheet, start, period, methodology in INDICATORS:
        frame = sheets[sheet]
        for _, row in frame.iterrows():
            try:
                code = str(int(row.iloc[0]))
            except (TypeError, ValueError):
                continue
            if code not in pha_names or str(row.iloc[1]).strip() != pha_names[code]:
                continue
            width = {"observed_self_reported": 4, "modelled_estimate": 8,
                     "administrative": 3, "observed_pooled": 3}[methodology]
            values = row.iloc[start:start + width].tolist()
            records.append({
                "pha_code_2021": code,
                "pha_name_2021": str(row.iloc[1]).strip(),
                "indicator_id": indicator,
                "reference_period": period,
                "methodology_class": methodology,
                "count_or_numerator": numeric(values[0]),
                "denominator": numeric(values[1]) if methodology in {"administrative", "observed_pooled"} else pd.NA,
                "rate_or_percent": numeric(values[2] if methodology in {"administrative", "observed_pooled"} else values[1]),
                "lower_95_ci": numeric(values[2]) if methodology == "modelled_estimate" else pd.NA,
                "upper_95_ci": numeric(values[3]) if methodology == "modelled_estimate" else pd.NA,
                "standardised_ratio": numeric(values[4] if methodology == "modelled_estimate" else values[2])
                if methodology in {"modelled_estimate", "observed_self_reported"} else pd.NA,
                "rrmse": numeric(values[7]) if methodology == "modelled_estimate" else pd.NA,
                "publication_status": status(values),
                "source_id": "phidu_pha_child_health_2026",
                "geography_warning": "PHA value; must not be assigned to component SA2s as an SA2 estimate",
            })
    result = pd.DataFrame(records)
    expected = len(bridge.pha_code_2021.unique()) * len(INDICATORS)
    if len(result) != expected or result.duplicated(["pha_code_2021", "indicator_id"]).any():
        raise ValueError(f"Expected {expected} unique PHA-indicator rows, got {len(result)}")
    return result.sort_values(["pha_code_2021", "indicator_id"])


def main() -> None:
    path = latest()
    bridge = pha_bridge(path)
    indicators = extract(path, bridge)
    PROC.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    bridge.to_csv(PROC / "phidu_pha_sa2_bridge.csv", index=False)
    indicators.to_csv(PROC / "phidu_child_health_pha.csv", index=False)
    report = {
        "source_id": "phidu_pha_child_health_2026",
        "sha256": checksum(path),
        "victorian_sa2s_in_bridge": len(bridge),
        "victorian_phas": int(bridge.pha_code_2021.nunique()),
        "selected_indicators": len(INDICATORS),
        "indicator_rows": len(indicators),
        "publication_status": indicators.publication_status.value_counts().to_dict(),
        "licence": "CC BY-NC-SA 3.0 Australia",
        "product_status": "VALIDATED_RESEARCH_CONTEXT_ONLY",
        "geographic_rule": "Analyse at PHA or aggregate SA2 covariates to PHA; never disaggregate PHA outcomes to SA2.",
    }
    (OUT / "phidu_child_health_validation.json").write_text(json.dumps(report, indent=2) + "\n")
    print(report)


if __name__ == "__main__":
    main()
