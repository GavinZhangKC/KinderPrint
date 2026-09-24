"""Build SA2 child long-term-condition context from ABS Census table G19.

The source reports self-identified long-term conditions by age and sex. This
integration uses the published persons aged 0--14 fields; it does not infer
diagnoses, split the age band, or disaggregate broader-area estimates.
"""

from __future__ import annotations

import argparse
import tempfile
import zipfile
from pathlib import Path

import pandas as pd


CONDITIONS = {
    "asthma": "P_Asthma_0_14",
    "cancer": "P_Cancer_0_14",
    "diabetes": "P_Diabetes_0_14",
    "heart_disease": "P_Heart_disease_0_14",
    "kidney_disease": "P_Kidney_disease_0_14",
    "lung_condition": "P_Lung_cond_0_14",
    "mental_health_condition": "P_Mental_health_cond_0_14",
    "other_long_term_condition": "P_Other_0_14",
    "no_long_term_condition": "P_None_0_14",
}


def _find_tables(source: Path, workdir: Path) -> tuple[Path, Path, Path]:
    if source.is_file() and source.suffix.lower() == ".zip":
        with zipfile.ZipFile(source) as archive:
            members = {
                Path(name).name: name
                for name in archive.namelist()
                if Path(name).name.startswith("2021Census_G19") and name.endswith("_VIC_SA2.csv")
            }
            for filename in members:
                with archive.open(members[filename]) as src, (workdir / filename).open("wb") as dst:
                    dst.write(src.read())
        source = workdir

    paths = tuple(source / f"2021Census_G19{part}_VIC_SA2.csv" for part in "ABC")
    missing = [str(path) for path in paths if not path.is_file()]
    if missing:
        raise FileNotFoundError(f"Missing ABS G19 table(s): {', '.join(missing)}")
    return paths


def build(source: Path, lookup_path: Path) -> pd.DataFrame:
    with tempfile.TemporaryDirectory(prefix="kinderprint_abs_g19_") as tmp:
        g19a, g19b, g19c = _find_tables(source, Path(tmp))
        a = pd.read_csv(g19a, dtype={"SA2_CODE_2021": str})
        b = pd.read_csv(g19b, dtype={"SA2_CODE_2021": str})
        c = pd.read_csv(g19c, dtype={"SA2_CODE_2021": str})

    fields_a = [field for field in CONDITIONS.values() if field in a.columns]
    fields_b = [field for field in CONDITIONS.values() if field in b.columns]
    health = a[["SA2_CODE_2021", *fields_a]].merge(
        b[["SA2_CODE_2021", *fields_b]], on="SA2_CODE_2021", validate="one_to_one"
    ).merge(
        c[["SA2_CODE_2021", "P_Tot_0_14"]], on="SA2_CODE_2021", validate="one_to_one"
    )

    lookup = pd.read_csv(
        lookup_path,
        dtype={"SA2_CODE_2021": str},
        usecols=["SA2_CODE_2021", "SA2_NAME_2021", "SA3_CODE_2021", "SA3_NAME_2021", "GCCSA_NAME_2021"],
    )
    health = health.merge(lookup, on="SA2_CODE_2021", how="left", validate="one_to_one")
    health = health[health["GCCSA_NAME_2021"].eq("Greater Melbourne")].copy()

    rows: list[dict[str, object]] = []
    for record in health.to_dict("records"):
        denominator = record["P_Tot_0_14"]
        for indicator, field in CONDITIONS.items():
            count = record[field]
            rows.append({
                "sa2_code_2021": record["SA2_CODE_2021"],
                "sa2_name_2021": record["SA2_NAME_2021"],
                "sa3_code_2021": record["SA3_CODE_2021"],
                "sa3_name_2021": record["SA3_NAME_2021"],
                "reference_year": 2021,
                "age_group": "0-14 years",
                "indicator": indicator,
                "count": int(count),
                "population_denominator": int(denominator),
                "percent": round(100 * count / denominator, 2) if denominator else None,
                "geography": "SA2 (ASGS Edition 3, 2021)",
                "quality_flag": "available" if denominator else "unavailable",
                "source_id": "census_2021_gcp_sa2_g19",
            })
    return pd.DataFrame(rows).sort_values(["sa2_name_2021", "indicator"]).reset_index(drop=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path, help="ABS SA2 DataPack zip or directory containing G19A/B/C")
    parser.add_argument("--lookup", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    output = build(args.source, args.lookup)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    output.to_csv(args.output, index=False)
    print(f"Wrote {len(output):,} rows for {output.sa2_code_2021.nunique():,} Greater Melbourne SA2s to {args.output}")


if __name__ == "__main__":
    main()
