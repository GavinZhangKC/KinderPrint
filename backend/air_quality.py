"""Validated station-level access to published EPA historical observations."""

import csv
import math
from typing import Any

from data_loader import EPA_STATION_YEAR_DATA_PATH_ENV, epa_station_year_data_path
from responses import limitation

REQUIRED_FIELDS = {
    "year", "station_id", "station_name", "pollutant", "unit", "method_code",
    "validation_status", "observed_days", "valid_hours", "first_observed_date",
    "last_observed_date", "annual_mean_of_hourly_values", "negative_hours_retained",
    "monitoring_status", "sa2_exposure_status",
}
POLLUTANTS = {"PM2.5", "PM10", "NO2", "O3"}


def load_station_year_observations() -> tuple[list[dict[str, Any]] | None, list[dict[str, Any]]]:
    path = epa_station_year_data_path()
    if path is None:
        return None, [limitation("air_quality_dataset_not_configured",
            f"Set {EPA_STATION_YEAR_DATA_PATH_ENV} to the validated EPA station-year CSV.",
            "air_quality")]
    if not path.is_file():
        return None, [limitation("air_quality_dataset_unavailable",
            "The configured EPA station-year dataset could not be found.", "air_quality")]
    try:
        with path.open(encoding="utf-8-sig", newline="") as source:
            reader = csv.DictReader(source)
            if not reader.fieldnames or not REQUIRED_FIELDS.issubset(reader.fieldnames):
                raise ValueError
            rows = []
            keys: set[tuple[int, str, str, str, str]] = set()
            for raw in reader:
                year = int(raw["year"])
                observed_days = int(raw["observed_days"])
                valid_hours = int(raw["valid_hours"])
                negative_hours = int(raw["negative_hours_retained"])
                annual_mean = float(raw["annual_mean_of_hourly_values"])
                key = (year, raw["station_id"], raw["pollutant"], raw["unit"], raw["method_code"])
                if (key in keys or raw["pollutant"] not in POLLUTANTS
                        or not raw["station_id"].strip() or not raw["station_name"].strip()
                        or not raw["unit"].strip() or not math.isfinite(annual_mean)
                        or observed_days < 0 or valid_hours < 0 or negative_hours < 0
                        or raw["monitoring_status"] != "STATION_OBSERVATION_CONTEXT_ONLY"
                        or raw["sa2_exposure_status"] != "NOT_DERIVED"):
                    raise ValueError
                keys.add(key)
                rows.append({
                    "year": year, "station_id": raw["station_id"],
                    "station_name": raw["station_name"], "pollutant": raw["pollutant"],
                    "unit": raw["unit"], "method_code": raw["method_code"],
                    "validation_status": raw["validation_status"],
                    "observed_days": observed_days, "valid_hours": valid_hours,
                    "first_observed_date": raw["first_observed_date"],
                    "last_observed_date": raw["last_observed_date"],
                    "annual_mean_of_hourly_values": annual_mean,
                    "negative_hours_retained": negative_hours,
                    "monitoring_status": "station_context_only",
                    "sa2_exposure_status": "not_derived",
                })
    except (OSError, UnicodeError, csv.Error, TypeError, ValueError):
        return None, [limitation("air_quality_dataset_invalid",
            "The configured EPA station-year dataset failed schema or value validation.",
            "air_quality")]
    return rows, []
