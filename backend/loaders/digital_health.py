"""Load validated VCAMS context and Healthdirect facility presence."""
from __future__ import annotations

import csv
from functools import lru_cache
from pathlib import Path
from typing import Any

from core.data_loader import (
    HEALTH_FACILITY_DATA_PATH_ENV, VCAMS_AREA_DATA_PATH_ENV, VCAMS_LGA_DATA_PATH_ENV,
    health_facility_data_path, vcams_area_data_path, vcams_lga_data_path,
)
from core.responses import limitation


def _number(value: str) -> float | None:
    return float(value) if value not in {"", None} else None


@lru_cache(maxsize=4)
def _read(path: Path) -> tuple[dict[str, str], ...]:
    with path.open(encoding="utf-8-sig", newline="") as source:
        return tuple(csv.DictReader(source))


def _source(path: Path | None, env: str, resource: str) -> tuple[tuple[dict[str, str], ...] | None, list[dict[str, Any]]]:
    if path is None:
        return None, [limitation(f"{resource}_not_configured", f"Set {env} to the validated CSV.", resource)]
    try:
        return _read(path), []
    except (OSError, UnicodeError, csv.Error):
        return None, [limitation(f"{resource}_unavailable", "The validated dataset could not be loaded.", resource)]


def vcams_area_context(area_name: str, year: int | None) -> tuple[list[dict[str, Any]] | None, list[dict[str, Any]]]:
    rows, limits = _source(vcams_area_data_path(), VCAMS_AREA_DATA_PATH_ENV, "vcams_area_context")
    if rows is None:
        return None, limits
    selected = []
    for row in rows:
        if row.get("area_name") != area_name or (year is not None and int(row["reference_year"]) != year):
            continue
        selected.append({**row, "reference_year": int(row["reference_year"]),
                         "percent": _number(row["percent"]), "rse_percent": _number(row["rse_percent"])})
    return selected, limits


def vcams_lga_context(lga_name: str) -> tuple[list[dict[str, Any]] | None, list[dict[str, Any]]]:
    rows, limits = _source(vcams_lga_data_path(), VCAMS_LGA_DATA_PATH_ENV, "vcams_lga_context")
    if rows is None:
        return None, limits
    names = {part.strip().casefold() for part in lga_name.split("|")}
    selected = []
    for row in rows:
        if row.get("lga_name", "").casefold() not in names:
            continue
        selected.append({**row, "numerator": _number(row["numerator"]),
                         "denominator": _number(row["denominator"]), "percent": _number(row["percent"])})
    return selected, limits


def health_facilities(sa2_code: str) -> tuple[list[dict[str, Any]] | None, list[dict[str, Any]]]:
    rows, limits = _source(health_facility_data_path(), HEALTH_FACILITY_DATA_PATH_ENV, "health_facilities")
    if rows is None:
        return None, limits
    return [{
        "facility_id": row["facility_id"], "name": row["facility_name"],
        "category": row["facility_category"], "service_type": row["official_service_type"],
        "address": row["address"], "longitude": _number(row["longitude"]),
        "latitude": _number(row["latitude"]), "source_date": row["source_date"],
    } for row in rows if row.get("sa2_code") == sa2_code and row.get("operational_status") == "active"], limits
