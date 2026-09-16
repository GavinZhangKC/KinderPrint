"""Standardise EPA Victoria validated hourly air monitoring workbooks.

The resulting annual summaries remain monitoring-station observations. They are
not interpolated, assigned to the nearest SA2, or represented as locality-wide
exposure estimates.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd


POLLUTANTS = {"PM2.5", "PM10", "NO2", "O3"}
ALIASES = {"BPM2.5": "PM2.5", "SBPM25": "PM2.5", "PM2.5": "PM2.5"}
CANONICAL_UNITS = {"PM2.5": "ug/m3", "PM10": "ug/m3", "NO2": "ppb", "O3": "ppb"}


def canonical_pollutant(value: object) -> str:
    text = str(value).strip().upper()
    return ALIASES.get(text, text)


def _normalise_station(value: object) -> str:
    return " ".join(str(value).strip().lower().split())


def _read_long(path: Path, sheet: str, year: int) -> pd.DataFrame:
    frame = pd.read_excel(path, sheet_name=sheet)
    if year <= 2020:
        output = pd.DataFrame({
            "station_id": frame["sample_point_id"].astype("string"),
            "station_name": frame["sp_name"],
            "latitude": frame["latitude"],
            "longitude": frame["longitude"],
            "observed_at": frame["sample_datetime"],
            "pollutant_raw": frame["param_short_name"],
            "method": frame["param_id"],
            "value": frame["value"],
            "unit": frame["param_std_unit_of_measure"],
            "validation_flag": "validated_workbook",
        })
    else:
        station_id = frame.get("sample_point_id", frame["location_id"])
        output = pd.DataFrame({
            "station_id": station_id.astype("string"),
            "station_name": frame["location_name"],
            "latitude": frame["latitude"],
            "longitude": frame["longitude"],
            "observed_at": frame["datetime_AEST"],
            "pollutant_raw": frame["parameter_name"],
            "method": frame["parameter_method_name"],
            "value": frame["value"],
            "unit": frame["unit_of_measure"],
            "validation_flag": frame["validation_flag"],
        })
        output = output.loc[output.validation_flag.astype(str).str.upper().eq("Y")]
    return output


def _read_wide_2021(path: Path) -> pd.DataFrame:
    records: list[pd.DataFrame] = []
    excluded = {"Data Info Panel", "Metadata"}
    for sheet in pd.ExcelFile(path).sheet_names:
        if sheet in excluded:
            continue
        frame = pd.read_excel(path, sheet_name=sheet)
        pollutant_columns = [column for column in frame if canonical_pollutant(column) in POLLUTANTS]
        if not pollutant_columns:
            continue
        station_id = frame["location_id"].astype("string")
        station_name = frame["location_name"]
        for column in pollutant_columns:
            records.append(pd.DataFrame({
                "station_id": station_id,
                "station_name": station_name,
                "latitude": np.nan,
                "longitude": np.nan,
                "observed_at": frame["datetime_AEST"],
                "pollutant_raw": column,
                "method": column,
                "value": frame[column],
                "unit": CANONICAL_UNITS[canonical_pollutant(column)],
                "validation_flag": "validated_workbook",
            }))
    return pd.concat(records, ignore_index=True)


def read_workbook(path: Path) -> pd.DataFrame:
    year = int(path.name[:4])
    sheets = pd.ExcelFile(path).sheet_names
    if year <= 2020:
        output = _read_long(path, str(year), year)
    elif year == 2021:
        output = _read_wide_2021(path)
    else:
        output = _read_long(path, "AllData", year)
    output["year"] = year
    output["pollutant"] = output.pollutant_raw.map(canonical_pollutant)
    output = output.loc[output.pollutant.isin(POLLUTANTS)].copy()
    output["value"] = pd.to_numeric(output.value, errors="coerce")
    output["observed_at"] = pd.to_datetime(output.observed_at, errors="coerce")
    output["station_key"] = output.station_name.map(_normalise_station)
    return output


def process_directory(input_dir: Path) -> tuple[pd.DataFrame, pd.DataFrame, dict]:
    paths = sorted(input_dir.glob("20??_*.xlsx"))
    if not paths:
        raise FileNotFoundError(f"No annual EPA workbooks found in {input_dir}")
    hourly = pd.concat([read_workbook(path) for path in paths], ignore_index=True)

    coordinate_lookup = (
        hourly.dropna(subset=["latitude", "longitude"])
        .groupby("station_key", as_index=False)
        .agg(latitude=("latitude", "median"), longitude=("longitude", "median"))
    )
    hourly = hourly.drop(columns=["latitude", "longitude"]).merge(
        coordinate_lookup, on="station_key", how="left"
    )
    valid = hourly.dropna(subset=["value", "observed_at"]).copy()
    group = ["year", "station_key", "station_name", "pollutant", "method", "unit"]
    summary = valid.groupby(group, dropna=False).agg(
        station_id=("station_id", "first"),
        latitude=("latitude", "first"),
        longitude=("longitude", "first"),
        observation_count=("value", "size"),
        mean=("value", "mean"),
        median=("value", "median"),
        p95=("value", lambda values: values.quantile(0.95)),
        maximum=("value", "max"),
        first_observation=("observed_at", "min"),
        last_observation=("observed_at", "max"),
    ).reset_index()
    expected = summary.year.map(lambda year: 8784 if int(year) % 4 == 0 else 8760)
    summary["observation_completeness_pct"] = (100 * summary.observation_count / expected).clip(upper=100)
    summary["geographic_interpretation"] = "monitoring_station_only"
    summary = summary.sort_values(["year", "station_name", "pollutant", "method"])

    registry = hourly.groupby("station_key", as_index=False).agg(
        station_name=("station_name", "first"),
        latitude=("latitude", "first"),
        longitude=("longitude", "first"),
        first_year=("year", "min"),
        last_year=("year", "max"),
    ).sort_values("station_name")
    qa = {
        "source_id": "epa_victoria_validated_hourly_air_2018_2025",
        "workbook_count": len(paths),
        "years": sorted(int(year) for year in hourly.year.unique()),
        "pollutants": sorted(hourly.pollutant.unique()),
        "station_count": int(hourly.station_key.nunique()),
        "input_pollutant_rows": len(hourly),
        "valid_numeric_observations": len(valid),
        "missing_or_invalid_values": int(hourly.value.isna().sum()),
        "negative_valid_values_retained": int((valid.value < 0).sum()),
        "annual_summary_rows": len(summary),
        "stations_without_coordinates": int(registry.latitude.isna().sum()),
        "suitability_status": "station_context_only",
        "limitation": (
            "Monitor readings describe conditions at monitoring stations. They are not assigned to "
            "nearest SA2s, interpolated, or treated as locality-wide exposure estimates. Negative "
            "validated readings are retained rather than silently truncated."
        ),
    }
    return summary, registry, qa


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--stations", type=Path, required=True)
    parser.add_argument("--qa", type=Path, required=True)
    args = parser.parse_args()
    summary, stations, qa = process_directory(args.input_dir)
    for path in (args.output, args.stations, args.qa):
        path.parent.mkdir(parents=True, exist_ok=True)
    summary.to_csv(args.output, index=False)
    stations.to_csv(args.stations, index=False)
    args.qa.write_text(json.dumps(qa, indent=2) + "\n")


if __name__ == "__main__":
    main()
