"""Integrate selected Victorian Child and Adolescent Monitoring System data.

VCAMS publishes child-health indicators at several native geographies. This
module deliberately keeps Victorian Department areas and LGAs separate. It
never copies a broad-area or LGA observation onto a KinderPrint SA2.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from urllib.request import Request, urlopen

import pandas as pd


DEPARTMENT_AREAS = {
    "Barwon", "Bayside Peninsula", "Brimbank Melton", "Central Highlands",
    "Goulburn", "Hume Moreland", "Inner Eastern Melbourne", "Inner Gippsland",
    "Loddon Campaspe", "Mallee", "North Eastern Melbourne",
    "Outer Eastern Melbourne", "Outer Gippsland", "Ovens Murray",
    "Southern Melbourne", "Western Melbourne", "Wimmera South West",
}

AREA_INDICATORS = {
    "2_1a.xlsx": ("minimum_recommended_fruit", "4-12 years", "VCAMS indicator 2.1a"),
    "2_1b.xlsx": ("minimum_recommended_vegetables", "4-12 years", "VCAMS indicator 2.1b"),
    "2_5a.xlsx": ("special_healthcare_needs", "Under 13 years", "VCAMS indicator 2.5a"),
    "2_8a.xlsx": ("good_or_better_general_health", "0-12 years", "VCAMS indicator 2.8a"),
    "2_9a.xlsx": ("recommended_daily_physical_activity", "5-12 years", "VCAMS indicator 2.9a"),
    "2_10a.xlsx": ("electronic_media_over_two_hours", "5-12 years", "VCAMS indicator 2.10a"),
    "2_12.xlsx": ("tobacco_smoke_exposure_at_home", "Under 13 years", "VCAMS indicator 2.12"),
    "7_3.xlsx": ("household_food_insecurity", "Under 13 years", "VCAMS indicator 7.3"),
}

LGA_INDICATORS = {
    "2_6.xlsx": ("speech_or_language_concern_at_school_entry", "2.6", "Year"),
    "3_1.xlsx": ("emotional_or_behavioural_difficulty_at_school_entry", "3.1", "Year"),
    "1_6.xlsx": ("fully_breastfed", "3months", "Financial Year"),
    "1_7a.xlsx": ("maternal_child_health_home_consultation", "MCH services home visit", "Year"),
    "1_7c.xlsx": ("maternal_child_health_3_5_year_visit", "MCH services 3.5 years visit", "Year"),
}

SOURCE_URLS = {
    "2_1a.xlsx": "https://content.vic.gov.au/sites/default/files/2024-04/VCAMS_indicator_2_1a.xlsx",
    "2_1b.xlsx": "https://content.vic.gov.au/sites/default/files/2024-04/VCAMS_indicator_2_1b.xlsx",
    "2_5a.xlsx": "https://content.vic.gov.au/sites/default/files/2024-04/VCAMS_indicator_2_5a.xlsx",
    "2_6.xlsx": "https://content.vic.gov.au/sites/default/files/2024-04/VCAMS_indicator_2_6.xlsx",
    "2_8a.xlsx": "https://content.vic.gov.au/sites/default/files/2024-04/VCAMS_indicator_2_8a.xlsx",
    "2_9a.xlsx": "https://content.vic.gov.au/sites/default/files/2024-04/VCAMS_indicator_2_9a.xlsx",
    "2_10a.xlsx": "https://content.vic.gov.au/sites/default/files/2024-04/VCAMS_indicator_2_10a.xlsx",
    "2_12.xlsx": "https://content.vic.gov.au/sites/default/files/2024-04/VCAMS_indicator_2_12.xlsx",
    "3_1.xlsx": "https://content.vic.gov.au/sites/default/files/2024-04/VCAMS_indicator_3_1.xlsx",
    "1_6.xlsx": "https://content.vic.gov.au/sites/default/files/2024-04/VCAMS_Indicator_1_6.xlsx",
    "1_7a.xlsx": "https://content.vic.gov.au/sites/default/files/2024-04/VCAMS_indicator_1_7a.xlsx",
    "1_7c.xlsx": "https://content.vic.gov.au/sites/default/files/2024-04/VCAMS_indicator_1_7c.xlsx",
    "7_3.xlsx": "https://content.vic.gov.au/sites/default/files/2024-04/VCAMS_indicator_7_3_1.xlsx",
}


def quality_from_rse(rse: float | None) -> str:
    if pd.isna(rse):
        return "unavailable"
    if rse > 0.50:
        return "unreliable"
    if rse >= 0.25:
        return "use_with_caution"
    return "available"


def build_area(source_dir: Path) -> pd.DataFrame:
    rows: list[dict[str, object]] = []
    for filename, (indicator, age_group, label) in AREA_INDICATORS.items():
        frame = pd.read_excel(source_dir / filename)
        frame["Population group"] = frame["Population group"].astype(str).str.strip()
        frame = frame[frame["Population group"].isin(DEPARTMENT_AREAS)].copy()
        for record in frame.to_dict("records"):
            value = pd.to_numeric(record["Indicator calculation"], errors="coerce")
            rse = pd.to_numeric(record["RSE"], errors="coerce")
            rows.append({
                "reference_year": int(record["Year"]),
                "area_name": record["Population group"],
                "geography": "Victorian Department area",
                "indicator_id": indicator,
                "indicator_label": label,
                "age_group": age_group,
                "percent": round(value * 100, 2) if pd.notna(value) else pd.NA,
                "rse_percent": round(rse * 100, 2) if pd.notna(rse) else pd.NA,
                "quality_flag": quality_from_rse(rse),
                "source_id": "vcams_child_health_area_2024_release",
                "geography_warning": "Broad-area context only; must not be presented as an SA2 estimate.",
            })
    return pd.DataFrame(rows).sort_values(["area_name", "indicator_id", "reference_year"]).reset_index(drop=True)


def _publication_status(values: list[object]) -> str:
    tokens = {str(value).strip().upper() for value in values if pd.notna(value)}
    if "NDP" in tokens:
        return "suppressed"
    return "available" if any(pd.notna(pd.to_numeric(value, errors="coerce")) for value in values) else "unavailable"


def build_lga(source_dir: Path) -> pd.DataFrame:
    rows: list[dict[str, object]] = []
    for filename, (indicator, sheet, year_column) in LGA_INDICATORS.items():
        frame = pd.read_excel(source_dir / filename, sheet_name=sheet)
        value_column = "Indicator" if "Indicator" in frame.columns else (
            "Indicator_Calc" if "Indicator_Calc" in frame.columns else "Indicator calculation"
        )
        frame = frame[pd.to_numeric(frame["LGA_KEY"], errors="coerce").notna()].copy()
        for record in frame.to_dict("records"):
            values = [record.get("Numerator"), record.get("Denominator"), record.get(value_column)]
            value = pd.to_numeric(record.get(value_column), errors="coerce")
            rows.append({
                "reference_period": str(record[year_column]),
                "lga_code": str(int(float(record["LGA_KEY"]))),
                "lga_name": str(record["LGA_DESC"]).strip(),
                "geography": "Victorian Local Government Area",
                "indicator_id": indicator,
                "numerator": pd.to_numeric(record.get("Numerator"), errors="coerce"),
                "denominator": pd.to_numeric(record.get("Denominator"), errors="coerce"),
                "percent": round(value * 100, 2) if pd.notna(value) else pd.NA,
                "publication_status": _publication_status(values),
                "source_id": "vcams_child_health_lga_2024_release",
                "geography_warning": "LGA observation; must not be presented as an SA2 estimate.",
            })
    return pd.DataFrame(rows).sort_values(["lga_name", "indicator_id", "reference_period"]).reset_index(drop=True)


def checksum(path: Path) -> str:
    digest = hashlib.sha256()
    digest.update(path.read_bytes())
    return digest.hexdigest()


def acquire_missing(source_dir: Path) -> list[str]:
    """Download missing public workbooks from their recorded official URLs."""
    source_dir.mkdir(parents=True, exist_ok=True)
    downloaded: list[str] = []
    for filename, url in SOURCE_URLS.items():
        target = source_dir / filename
        if target.is_file():
            continue
        request = Request(url, headers={"User-Agent": "KinderPrint data pipeline/1.0"})
        with urlopen(request, timeout=60) as response:
            target.write_bytes(response.read())
        downloaded.append(filename)
    return downloaded


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source_dir", type=Path)
    parser.add_argument("--download-missing", action="store_true", help="Fetch absent files from official DataVic URLs")
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    downloaded = acquire_missing(args.source_dir) if args.download_missing else []
    missing = [name for name in SOURCE_URLS if not (args.source_dir / name).is_file()]
    if missing:
        raise FileNotFoundError(f"Missing VCAMS workbook(s): {', '.join(missing)}")

    area = build_area(args.source_dir)
    lga = build_lga(args.source_dir)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    area.to_csv(args.output_dir / "vcams_child_health_area.csv", index=False)
    lga.to_csv(args.output_dir / "vcams_child_health_lga.csv", index=False)

    latest_area = area[area.reference_year.eq(area.reference_year.max())]
    report = {
        "source_id": "vcams_child_health_2024_release",
        "area_rows": len(area),
        "lga_rows": len(lga),
        "area_indicators": area.indicator_id.nunique(),
        "lga_indicators": lga.indicator_id.nunique(),
        "department_areas": area.area_name.nunique(),
        "lgas": lga.lga_code.nunique(),
        "latest_area_year": int(area.reference_year.max()),
        "latest_area_quality": latest_area.quality_flag.value_counts().to_dict(),
        "geographic_rule": "Retain native area/LGA geography; never disaggregate to SA2.",
        "downloaded_this_run": downloaded,
        "files": {name: {"url": url, "sha256": checksum(args.source_dir / name)} for name, url in SOURCE_URLS.items()},
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
