"""Harmonise EPA Victoria validated hourly observations at monitoring-station level.

This deliberately does not interpolate or assign station readings to SA2 populations.
"""
from __future__ import annotations

import json
import hashlib
import re
from collections import defaultdict
from datetime import date, datetime
from pathlib import Path
from statistics import median

import pandas as pd
from openpyxl import load_workbook

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data/raw/epa_airwatch_hourly"
PROC = ROOT / "data/processed"
OUT = ROOT / "outputs/iteration_2"
POLLUTANTS = {"PM2.5", "PM10", "NO2", "O3"}
METHOD_TO_POLLUTANT = {"BPM2.5": "PM2.5", "SBPM25": "PM2.5", "PM2.5": "PM2.5",
                       "PM10": "PM10", "NO2": "NO2", "O3": "O3"}


def year_files() -> dict[int, Path]:
    files = {}
    for path in sorted(RAW.rglob("*_All_sites_air_quality_hourly_avg.xlsx")):
        files[int(path.name[:4])] = path
    if set(files) != set(range(2018, 2026)):
        raise ValueError(f"Expected EPA workbooks for 2018-2025, got {sorted(files)}")
    return files


def checksum(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def date_of(value) -> str | None:
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    text = str(value or "")
    return text[:10] if re.match(r"^\d{4}-\d{2}-\d{2}", text) else None


def add(days: dict, stations: dict, *, year: int, station_id: str, station_name: str,
        latitude, longitude, day, pollutant: str, value, unit: str, method: str,
        validation: str, timestamp) -> None:
    if pollutant not in POLLUTANTS or day is None:
        return
    try:
        number = float(value)
    except (TypeError, ValueError):
        return
    key = (year, str(station_id), station_name, day, pollutant, unit, method, validation)
    item = days[key]
    timestamp = str(timestamp)
    if timestamp in item["excluded_timestamps"]:
        item["conflicting_observations"] += 1
        return
    if timestamp in item["observations"]:
        if item["observations"][timestamp] == number:
            item["duplicate_observations"] += 1
        else:
            item["conflicting_observations"] += 1
            item["observations"].pop(timestamp)
            item["excluded_timestamps"].add(timestamp)
        return
    item["observations"][timestamp] = number
    try:
        lat, lon = float(latitude), float(longitude)
        if -39.3 <= lat <= -33.9 and 140.9 <= lon <= 150.1:
            stations[station_name].add((round(lat, 7), round(lon, 7)))
    except (TypeError, ValueError):
        pass


def long_sheet(path: Path, year: int, sheet_name: str, days: dict, stations: dict) -> int:
    workbook = load_workbook(path, read_only=True, data_only=True)
    sheet = workbook[sheet_name]
    records = sheet.iter_rows(values_only=True)
    header = next(records)
    ix = {str(name): position for position, name in enumerate(header)}
    modern = "parameter_name" in ix
    last_observation = None
    duplicates = 0
    for row in records:
        observation = tuple(row)
        if observation == last_observation:
            duplicates += 1
            continue
        last_observation = observation
        if modern:
            if "validation_flag" in ix and str(row[ix["validation_flag"]]).strip() != "Y":
                continue
            pollutant = METHOD_TO_POLLUTANT.get(str(row[ix["parameter_name"]]).strip())
            if "sample_point_id" in ix:
                station_id = str(row[ix["sample_point_id"]])
            else:
                station_id = (f"{row[ix['location_id']]}@{float(row[ix['latitude']]):.7f},"
                              f"{float(row[ix['longitude']]):.7f}")
            add(days, stations, year=year,
                station_id=station_id,
                station_name=str(row[ix["location_name"]]).strip(),
                latitude=row[ix["latitude"]], longitude=row[ix["longitude"]],
                day=date_of(row[ix["datetime_local"]]), pollutant=pollutant or "",
                value=row[ix["value"]], unit=str(row[ix["unit_of_measure"]]),
                method=str(row[ix["parameter_method_name"]]), validation="VALIDATION_FLAG_Y",
                timestamp=row[ix["datetime_AEST"]])
        else:
            pollutant = METHOD_TO_POLLUTANT.get(str(row[ix["param_short_name"]]).strip())
            add(days, stations, year=year, station_id=str(row[ix["sample_point_id"]]),
                station_name=str(row[ix["sp_name"]]).strip(), latitude=row[ix["latitude"]],
                longitude=row[ix["longitude"]], day=date_of(row[ix["sample_datetime"]]),
                pollutant=pollutant or "", value=row[ix["value"]],
                unit=str(row[ix["param_std_unit_of_measure"]]), method=str(row[ix["param_id"]]),
                validation="PUBLISHED_HOURLY_RELEASE_NO_ROW_FLAG", timestamp=row[ix["sample_datetime"]])
    return duplicates


def wide_2021(path: Path, days: dict, stations: dict) -> int:
    workbook = load_workbook(path, read_only=True, data_only=True)
    duplicates = 0
    for sheet in workbook.worksheets:
        if sheet.title in {"Data Info Panel", "Metadata"}:
            continue
        records = sheet.iter_rows(values_only=True)
        header = next(records)
        ix = {str(name): position for position, name in enumerate(header)}
        pollutant_columns = {position: METHOD_TO_POLLUTANT[str(name)] for position, name in enumerate(header)
                             if str(name) in METHOD_TO_POLLUTANT}
        last_row = None
        for row in records:
            if tuple(row) == last_row:
                duplicates += 1
                continue
            last_row = tuple(row)
            day = date_of(row[ix["datetime_local"]])
            station_name = str(row[ix["location_name"]]).strip()
            station_id = str(row[ix["location_id"]])
            coordinates = next(iter(stations.get(station_name, [])), (None, None))
            for position, pollutant in pollutant_columns.items():
                add(days, stations, year=2021, station_id=station_id, station_name=station_name,
                    latitude=coordinates[0], longitude=coordinates[1], day=day, pollutant=pollutant,
                    value=row[position], unit="ug/m3" if pollutant.startswith("PM") else "ppb",
                    method=str(header[position]), validation="WORKBOOK_MARKED_VALIDATED",
                    timestamp=row[ix["datetime_AEST"]])
    return duplicates


def main() -> None:
    files = year_files()
    days = defaultdict(lambda: {"observations": {}, "excluded_timestamps": set(),
                                "duplicate_observations": 0, "conflicting_observations": 0})
    stations = defaultdict(set)
    duplicate_source_rows = 0
    for year in [2018, 2019, 2020]:
        duplicate_source_rows += long_sheet(files[year], year, str(year), days, stations)
    for year in [2022, 2023, 2024, 2025]:
        duplicate_source_rows += long_sheet(files[year], year, "AllData", days, stations)
    duplicate_source_rows += wide_2021(files[2021], days, stations)

    records = []
    for key, values in days.items():
        year, station_id, station_name, day, pollutant, unit, method, validation = key
        coordinates = sorted(stations.get(station_name, []))
        latitude = median(point[0] for point in coordinates) if coordinates else None
        longitude = median(point[1] for point in coordinates) if coordinates else None
        observations = list(values["observations"].values())
        if not observations:
            continue
        records.append({
            "year": year, "station_id": station_id, "station_name": station_name,
            "latitude": latitude, "longitude": longitude, "date_local": day,
            "pollutant": pollutant, "unit": unit, "method_code": method,
            "validation_status": validation, "valid_hours": len(observations),
            "daily_mean": sum(observations) / len(observations),
            "daily_min": min(observations), "daily_max": max(observations),
            "negative_hours_retained": sum(value < 0 for value in observations),
            "conflicting_source_observations_excluded": values["conflicting_observations"],
            "source_id": "epa_vic_airwatch_hourly_2018_2025",
            "station_coordinate_variants": len(coordinates),
            "interpretation_scope": "MONITOR_OBSERVATION_ONLY_NOT_SA2_EXPOSURE",
        })
    daily = pd.DataFrame(records).sort_values(["year", "station_name", "pollutant", "date_local"])
    if daily.empty or set(daily.pollutant) != POLLUTANTS:
        raise ValueError("Expected all four priority pollutants")
    group = daily.groupby(
        ["year", "station_id", "station_name", "pollutant", "unit", "method_code", "validation_status"],
        dropna=False,
    )
    annual = group.agg(
        observed_days=("date_local", "nunique"), valid_hours=("valid_hours", "sum"),
        first_observed_date=("date_local", "min"), last_observed_date=("date_local", "max"),
        annual_mean_of_hourly_values=("daily_mean", lambda x: (x * daily.loc[x.index, "valid_hours"]).sum()
                                      / daily.loc[x.index, "valid_hours"].sum()),
        negative_hours_retained=("negative_hours_retained", "sum"),
    ).reset_index()
    annual["monitoring_status"] = "STATION_OBSERVATION_CONTEXT_ONLY"
    annual["sa2_exposure_status"] = "NOT_DERIVED"

    PROC.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    daily.to_csv(PROC / "epa_air_quality_station_daily.csv", index=False, float_format="%.6f")
    annual.to_csv(PROC / "epa_air_quality_station_year.csv", index=False, float_format="%.6f")
    report = {
        "source_id": "epa_vic_airwatch_hourly_2018_2025",
        "source_workbook_sha256": {str(year): checksum(path) for year, path in files.items()},
        "years": sorted(daily.year.unique().tolist()),
        "priority_pollutants": sorted(daily.pollutant.unique().tolist()),
        "station_names": int(daily.station_name.nunique()),
        "station_pollutant_year_rows": len(annual),
        "daily_station_pollutant_rows": len(daily),
        "valid_hourly_observations": int(daily.valid_hours.sum()),
        "negative_validated_or_published_hours_retained": int(daily.negative_hours_retained.sum()),
        "exact_duplicate_source_rows_removed": duplicate_source_rows + sum(
            item["duplicate_observations"] for item in days.values()),
        "conflicting_source_observations_excluded": sum(
            item["conflicting_observations"] for item in days.values()),
        "sa2_exposure_values_created": 0,
        "product_status": "VALIDATED_MONITOR_CONTEXT_ONLY_INSUFFICIENT_FOR_LOCALITY_EXPOSURE",
    }
    (OUT / "epa_airwatch_validation.json").write_text(json.dumps(report, indent=2) + "\n")
    print(report)


if __name__ == "__main__":
    main()
