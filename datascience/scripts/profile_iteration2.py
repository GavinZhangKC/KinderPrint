"""Create EDA quality profiles for acquired Iteration-2 sources."""
from __future__ import annotations

import csv
import hashlib
import json
from collections import Counter
from pathlib import Path
from statistics import median

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
OUTPUT = ROOT / "outputs" / "iteration_2" / "source_profiles.json"


def checksum(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def csv_rows(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        return list(reader.fieldnames or []), list(reader)


def acecqa(path: Path) -> dict:
    fields, rows = csv_rows(path)
    ids = [row["ServiceApprovalNumber"].strip() for row in rows]
    places = [int(row["NumberOfApprovedPlaces"]) for row in rows
              if row["NumberOfApprovedPlaces"].strip().isdigit()]
    rating = [row["OverallRating"].strip() for row in rows]
    postcode = [row["Postcode"].strip() for row in rows]
    return {
        "source_id": "acecqa_services_vic_daily", "path": str(path.relative_to(ROOT)),
        "sha256": checksum(path), "rows": len(rows), "columns": len(fields),
        "duplicate_primary_keys": len(ids) - len(set(ids)),
        "missingness_pct": {
            "approved_places": round(100 * sum(not row["NumberOfApprovedPlaces"].strip()
                                                  for row in rows) / len(rows), 2),
            "overall_rating": round(100 * sum(not x for x in rating) / len(rows), 2),
            "postcode": round(100 * sum(not x for x in postcode) / len(rows), 2),
        },
        "approved_places": {"count": len(places), "min": min(places), "median": median(places),
                            "max": max(places)},
        "temporarily_closed": Counter(row["Temporarily Closed"].strip() or "missing" for row in rows),
        "overall_rating": Counter(x or "missing" for x in rating),
        "geographic_join": "No coordinates or SA2. Approved geocoding is required; postcode is not an SA2.",
        "decision": "withhold_from_product_pending_licence_and_geocoding"
    }


def schools(path: Path) -> dict:
    fields, rows = csv_rows(path)
    ids = [row["School_No"].strip() for row in rows]
    coordinate_ok = 0
    for row in rows:
        try:
            x, y = float(row["X"]), float(row["Y"])
            coordinate_ok += 140 <= x <= 150 and -40 <= y <= -34
        except (TypeError, ValueError):
            pass
    return {
        "source_id": "victoria_school_locations_2025", "path": str(path.relative_to(ROOT)),
        "sha256": checksum(path), "rows": len(rows), "columns": len(fields),
        "duplicate_primary_keys": len(ids) - len(set(ids)),
        "valid_victorian_coordinate_pct": round(100 * coordinate_ok / len(rows), 2),
        "school_status": Counter(row["School_Status"].strip() or "missing" for row in rows),
        "geographic_join": "Point-in-polygon to Edition 3 SA2 required.",
        "decision": "candidate_context_only_not_early_childhood"
    }


def traffic(path: Path) -> dict:
    document = json.loads(path.read_text())
    features = document.get("features", [])
    props = [feature.get("properties", {}) for feature in features]
    segment_direction = [(str(p.get("Road Segment ID")), p.get("Travel Direction")) for p in props]
    volumes = [p.get("Average Annual Daily Traffic Volume") for p in props
               if isinstance(p.get("Average Annual Daily Traffic Volume"), (int, float))]
    heavy = [p.get("Average Annual Daily Heavy Vehicle Volume") for p in props
             if isinstance(p.get("Average Annual Daily Heavy Vehicle Volume"), (int, float))]
    return {
        "source_id": "dtp_historical_aadt_2019", "path": str(path.relative_to(ROOT)),
        "sha256": checksum(path), "rows": len(features),
        "geometry_types": Counter((feature.get("geometry") or {}).get("type", "missing") for feature in features),
        "duplicate_segment_direction_keys": len(segment_direction) - len(set(segment_direction)),
        "missingness_pct": {
            "aadt": round(100 * (len(props) - len(volumes)) / len(props), 2),
            "heavy_vehicle_aadt": round(100 * (len(props) - len(heavy)) / len(props), 2),
        },
        "aadt": {"count": len(volumes), "min": min(volumes), "median": median(volumes), "max": max(volumes)},
        "methodology": Counter(str(p.get("Calculation Methodology") or "missing") for p in props),
        "calendar_years": sorted({p.get("Calendar Year") for p in props}),
        "geographic_join": "Clip/intersect lines with Edition 3 SA2; pre-register exposure metric and avoid double-counting directions.",
        "decision": "candidate_after_spatial_harmonisation"
    }


def npi(path: Path) -> dict:
    try:
        import openpyxl
    except ImportError as error:
        raise RuntimeError("openpyxl is required to profile the NPI workbook") from error
    workbook = openpyxl.load_workbook(path, read_only=True, data_only=True)
    sheet = workbook["Emissions"]
    rows = sheet.iter_rows(values_only=True)
    fields = next(rows)
    index = {field: position for position, field in enumerate(fields)}
    years, substances = Counter(), set()
    facilities, coordinate_rows = set(), 0
    vic_rows = missing_air = 0
    latest_facilities = set()
    latest_year = "2024/2025"
    for row in rows:
        if row[index["state"]] != "VIC":
            continue
        vic_rows += 1
        year = str(row[index["report_year"]])
        years[year] += 1
        facility = str(row[index["facility_id"]])
        facilities.add(facility)
        if year == latest_year:
            latest_facilities.add(facility)
        substances.add(str(row[index["substance_name"]]))
        coordinate_rows += (row[index["latitude"]] is not None and row[index["longitude"]] is not None)
        missing_air += row[index["air_total_emission_kg"]] is None
    return {
        "source_id": "npi_emissions_all_years", "path": str(path.relative_to(ROOT)),
        "sha256": checksum(path), "rows": vic_rows, "columns": len(fields),
        "national_rows": sheet.max_row - 1, "facilities_all_years": len(facilities),
        "latest_year": latest_year, "latest_year_rows": years[latest_year],
        "latest_year_facilities": len(latest_facilities), "substances": len(substances),
        "valid_coordinate_pct": round(100 * coordinate_rows / vic_rows, 2),
        "air_total_missing_pct": round(100 * missing_air / vic_rows, 2),
        "temporal_coverage": sorted(years),
        "geographic_join": "Point-in-polygon and distance/buffer to Edition 3 SA2; reported mass is not ambient exposure.",
        "decision": "candidate_after_pollutant_specific_validation"
    }


def find(name: str) -> Path:
    matches = sorted(RAW.rglob(name))
    if not matches:
        raise FileNotFoundError(f"{name} not found below {RAW}; run acquire_iteration2 first")
    return matches[-1]


def main() -> None:
    profiles = [
        traffic(find("yearly_aadt_volume_2019.geojson")),
        acecqa(find("education_services_vic.csv")),
        schools(find("school_locations_2025.csv")),
        npi(find("npi_emissions.xlsx")),
    ]
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps({"schema_version": "1.0", "profiles": profiles}, indent=2, default=dict) + "\n")
    print(OUTPUT)


if __name__ == "__main__":
    main()
