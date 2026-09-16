"""Extract Victorian child and youth indicators from the PHIDU 2026 PHA workbook."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import pandas as pd


SHEETS = (
    "Child_youth_health",
    "Census_health_condition",
    "Census_condition_type",
    "NDIS_Autism_age",
    "ED_mental_disorders_age_sex",
    "ED_respiratory_age_sex",
    "ED_digestive_age",
    "ED_musculoskeletal_age",
    "ED_genitourinary_age_sex",
    "ED_injury_age_sex",
)
VIC_PHA = re.compile(r"^2\d{4}$")
SUPPRESSED = {"#", "..", "np", "n.p.", "*"}


def _text(value) -> str:
    return "" if pd.isna(value) else " ".join(str(value).split())


def _number(value) -> tuple[float | None, str]:
    text = _text(value)
    if not text:
        return None, "missing"
    if text.lower() in SUPPRESSED:
        return None, "suppressed"
    try:
        return float(text), "available"
    except ValueError:
        return None, "unparsed"


def clean_workbook(path: Path, boundaries: Path) -> tuple[pd.DataFrame, dict]:
    boundary_data = json.loads(boundaries.read_text())
    melbourne_sa2 = {str(feature["properties"]["id"]) for feature in boundary_data["features"]}
    pha_sheet = pd.read_excel(path, sheet_name="PHAs", header=None)
    melbourne_pha: set[str] = set()
    for _, row in pha_sheet.iterrows():
        pha_code = _text(row.iloc[2]) if len(row) > 2 else ""
        component_codes = set(re.findall(r"\d{9}", _text(row.iloc[0])))
        if VIC_PHA.match(pha_code) and component_codes & melbourne_sa2:
            melbourne_pha.add(pha_code)

    records: list[dict] = []
    for sheet in SHEETS:
        raw = pd.read_excel(path, sheet_name=sheet, header=None)
        codes = raw.iloc[:, 0].map(_text)
        rows = raw.loc[codes.isin(melbourne_pha)].copy()
        for col in range(2, raw.shape[1]):
            metric = _text(raw.iat[4, col])
            if not metric or metric.lower() in {"sig.", "significance"}:
                continue
            group_start = col
            while group_start > 2 and not _text(raw.iat[0, group_start]) and not _text(raw.iat[1, group_start]):
                group_start -= 1
            indicator = _text(raw.iat[1, group_start]) or _text(raw.iat[0, group_start])
            if not indicator:
                continue
            reference_period = _text(raw.iat[3, group_start])
            for idx, row in rows.iterrows():
                value, status = _number(row.iloc[col])
                records.append({
                    "pha_code": _text(row.iloc[0]),
                    "pha_name": _text(row.iloc[1]),
                    "indicator_group": indicator,
                    "measure": metric,
                    "value": value,
                    "status": status,
                    "reference_period": reference_period,
                    "source_sheet": sheet,
                    "source_id": "phidu_child_youth_pha_2026",
                    "geographic_unit": "Population Health Area",
                })
    output = pd.DataFrame(records)
    qa = {
        "source_id": "phidu_child_youth_pha_2026",
        "geographic_unit": "Population Health Area",
        "greater_melbourne_pha_count": int(output.pha_code.nunique()),
        "indicator_group_count": int(output.indicator_group.nunique()),
        "record_count": len(output),
        "available_values": int((output.status == "available").sum()),
        "suppressed_values": int((output.status == "suppressed").sum()),
        "missing_values": int((output.status == "missing").sum()),
        "unparsed_values": int((output.status == "unparsed").sum()),
        "suitability_status": "regional_context_only",
        "limitation": (
            "PHA values must not be copied to component SA2s or used to rank SA2 localities. "
            "Service use also reflects access, coding and care-seeking, not disease prevalence alone."
        ),
    }
    return output, qa


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--boundaries", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--qa", type=Path, required=True)
    args = parser.parse_args()
    output, qa = clean_workbook(args.input, args.boundaries)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.qa.parent.mkdir(parents=True, exist_ok=True)
    output.to_csv(args.output, index=False)
    args.qa.write_text(json.dumps(qa, indent=2) + "\n")


if __name__ == "__main__":
    main()
