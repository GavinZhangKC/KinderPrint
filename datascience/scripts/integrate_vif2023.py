"""Validate VIF2023 and publish clearly labelled SA2 child-population projections."""
from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data/raw"
PROC = ROOT / "data/processed"
OUT = ROOT / "outputs/iteration_2"
YEARS = (2021, 2026, 2031, 2036)


def latest() -> Path:
    matches = sorted(RAW.rglob("vif2023_sa2_pop_age_sex_to_2036_release_2.xlsx"))
    if not matches:
        raise FileNotFoundError("VIF2023 workbook not found; acquire/import it first")
    return matches[-1]


def load_sheet(path: Path, sheet: str) -> pd.DataFrame:
    data = pd.read_excel(path, sheet_name=sheet, header=[8, 9])
    data.columns = [str(second).strip().replace("\n", " ") if str(first).startswith("Unnamed")
                    else f"{int(first)}|{str(second).strip().replace(chr(10), ' ')}"
                    for first, second in data.columns]
    data = data[data["Region Type"].eq("SA2")].copy()
    data["SA2 code"] = data["SA2  code"].astype("Int64").astype(str)
    if len(data) != 522 or data["SA2 code"].duplicated().any():
        raise ValueError("Expected 522 unique Victorian SA2 records")
    return data


def main() -> None:
    path = latest()
    persons = load_sheet(path, "ERP_by_Age_Persons")
    males = load_sheet(path, "ERP_by_Age_Males")
    females = load_sheet(path, "ERP_by_Age_Females")
    records = []
    for year in YEARS:
        prefixes = {sex: (frame, f"{year}|{sex}") for sex, frame in
                    (("Persons", persons), ("Males", males), ("Females", females))}
        for sex, (frame, prefix) in prefixes.items():
            age_0_4 = pd.to_numeric(frame[f"{prefix}  0-4"])
            age_5_9 = pd.to_numeric(frame[f"{prefix}  5-9"])
            total_columns = [column for column in frame if column.startswith(f"{year}|{sex}  ")]
            totals = frame[total_columns].apply(pd.to_numeric).sum(axis=1)
            for code, name, first, second, total in zip(
                    frame["SA2 code"], frame["Region"], age_0_4, age_5_9, totals):
                records.append({
                    "sa2_code_2021": code,
                    "sa2_name_2021": name,
                    "projection_year": year,
                    "sex": sex.lower(),
                    "population_age_0_4_projected": round(float(first), 6),
                    "population_age_5_9_projected": round(float(second), 6),
                    "population_age_0_9_projected": round(float(first + second), 6),
                    "population_all_ages_projected": round(float(total), 6),
                    "source_id": "vif2023_sa2_age_projections",
                    "value_status": "PROJECTED",
                })
    result = pd.DataFrame(records)
    numeric = result.filter(like="population_")
    if numeric.isna().any().any() or numeric.lt(0).any().any():
        raise ValueError("VIF output contains missing or negative population values")

    keyed = result.set_index(["sa2_code_2021", "projection_year", "sex"])
    people = keyed.xs("persons", level="sex").filter(like="population_")
    component_sum = (keyed.xs("males", level="sex").filter(like="population_")
                     + keyed.xs("females", level="sex").filter(like="population_"))
    if not ((people.to_numpy() - component_sum.to_numpy()).__abs__() < 0.00001).all():
        raise ValueError("Persons values do not equal male plus female values")

    PROC.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    result.to_csv(PROC / "vif_child_population_projections_sa2.csv", index=False)
    report = {
        "source_id": "vif2023_sa2_age_projections",
        "sa2_records": 522,
        "years": list(YEARS),
        "sex_categories": ["persons", "males", "females"],
        "output_rows": len(result),
        "missing_population_values": 0,
        "negative_population_values": 0,
        "persons_equals_males_plus_females": True,
        "interpretation": "Projection, not observation or prediction.",
        "age_warning": "Exact ages 0-5 cannot be derived from five-year bands without estimation.",
    }
    (OUT / "vif2023_validation.json").write_text(json.dumps(report, indent=2) + "\n")
    print(report)


if __name__ == "__main__":
    main()
