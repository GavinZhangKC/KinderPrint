"""Load validated VCAMS context and Healthdirect facility presence."""

from __future__ import annotations

import csv
from functools import lru_cache
import math
from pathlib import Path
from typing import Any

from core.data_loader import (
    ABS_CHILD_HEALTH_DATA_PATH_ENV,
    HEALTH_FACILITY_DATA_PATH_ENV,
    PHIDU_CHILD_HEALTH_DATA_PATH_ENV,
    PHIDU_PHA_SA2_BRIDGE_DATA_PATH_ENV,
    VCAMS_AREA_DATA_PATH_ENV,
    VCAMS_LGA_DATA_PATH_ENV,
    abs_child_health_data_path,
    health_facility_data_path,
    phidu_child_health_data_path,
    phidu_pha_sa2_bridge_data_path,
    vcams_area_data_path,
    vcams_lga_data_path,
)
from core.responses import limitation


AREA_FIELDS = {
    "reference_year", "area_name", "geography", "indicator_id", "indicator_label",
    "age_group", "percent", "rse_percent", "quality_flag", "source_id",
    "geography_warning",
}
LGA_FIELDS = {
    "reference_period", "lga_code", "lga_name", "geography", "indicator_id",
    "numerator", "denominator", "percent", "publication_status", "source_id",
    "geography_warning",
}
FACILITY_FIELDS = {
    "facility_id", "facility_name", "facility_category", "official_service_type",
    "operational_status", "address", "longitude", "latitude", "sa2_code",
    "source_date", "source_id",
}
ABS_CHILD_HEALTH_FIELDS = {
    "sa2_code_2021", "sa2_name_2021", "sa3_code_2021", "sa3_name_2021",
    "reference_year", "age_group", "indicator", "count", "population_denominator",
    "percent", "geography", "quality_flag", "source_id",
}
PHIDU_CHILD_HEALTH_FIELDS = {
    "pha_code_2021", "pha_name_2021", "indicator_id", "reference_period",
    "methodology_class", "count_or_numerator", "denominator", "rate_or_percent",
    "lower_95_ci", "upper_95_ci", "standardised_ratio", "rrmse",
    "publication_status", "source_id", "geography_warning",
}
PHIDU_BRIDGE_FIELDS = {"sa2_code_2021", "sa2_name_2021", "pha_code_2021", "pha_name_2021"}
REQUIRED_FIELDS = {
    "vcams_area_context": AREA_FIELDS,
    "vcams_lga_context": LGA_FIELDS,
    "health_facilities": FACILITY_FIELDS,
    "abs_child_health": ABS_CHILD_HEALTH_FIELDS,
    "phidu_child_health": PHIDU_CHILD_HEALTH_FIELDS,
    "phidu_pha_sa2_bridge": PHIDU_BRIDGE_FIELDS,
}
UNIQUE_FIELDS = {
    "vcams_area_context": ("reference_year", "area_name", "indicator_id"),
    "vcams_lga_context": ("reference_period", "lga_code", "indicator_id"),
    "health_facilities": ("facility_id",),
    "abs_child_health": ("sa2_code_2021", "reference_year", "indicator"),
    "phidu_child_health": ("pha_code_2021", "reference_period", "indicator_id"),
    "phidu_pha_sa2_bridge": ("sa2_code_2021",),
}


def _number(value: str | None) -> float | None:
    if value is None:
        raise ValueError
    if value == "":
        return None
    number = float(value)
    if not math.isfinite(number) or number < 0:
        raise ValueError
    return number


def _coordinate(value: str) -> float:
    number = float(value)
    if not math.isfinite(number):
        raise ValueError
    return number


def _integer(value: str | None) -> int:
    if value is None:
        raise ValueError
    number = int(value)
    if number < 0:
        raise ValueError
    return number


def _required_text(row: dict[str, str], *fields: str) -> None:
    if any(not isinstance(row.get(field), str) or not row[field].strip() for field in fields):
        raise ValueError


def _area_row(row: dict[str, str]) -> dict[str, Any]:
    _required_text(
        row, "area_name", "geography", "indicator_id", "indicator_label",
        "age_group", "quality_flag", "source_id", "geography_warning",
    )
    year = int(row["reference_year"])
    if year < 1900 or year > 2100:
        raise ValueError
    return {
        **row,
        "reference_year": year,
        "percent": _number(row["percent"]),
        "rse_percent": _number(row["rse_percent"]),
    }


def _lga_row(row: dict[str, str]) -> dict[str, Any]:
    _required_text(
        row, "reference_period", "lga_code", "lga_name", "geography",
        "indicator_id", "publication_status", "source_id", "geography_warning",
    )
    return {
        **row,
        "numerator": _number(row["numerator"]),
        "denominator": _number(row["denominator"]),
        "percent": _number(row["percent"]),
    }


def _facility_row(row: dict[str, str]) -> dict[str, Any]:
    _required_text(
        row, "facility_id", "facility_name", "facility_category",
        "official_service_type", "operational_status", "address", "sa2_code",
        "source_date", "source_id",
    )
    if not row["sa2_code"].isdigit() or len(row["sa2_code"]) != 9:
        raise ValueError
    longitude = _coordinate(row["longitude"])
    latitude = _coordinate(row["latitude"])
    if not -180 <= longitude <= 180 or not -90 <= latitude <= 90:
        raise ValueError
    return {**row, "longitude": longitude, "latitude": latitude}


def _abs_child_health_row(row: dict[str, str]) -> dict[str, Any]:
    _required_text(
        row, "sa2_code_2021", "sa2_name_2021", "sa3_code_2021", "sa3_name_2021",
        "age_group", "indicator", "geography", "quality_flag", "source_id",
    )
    if not row["sa2_code_2021"].isdigit() or len(row["sa2_code_2021"]) != 9:
        raise ValueError
    year = _integer(row["reference_year"])
    count = _integer(row["count"])
    denominator = _integer(row["population_denominator"])
    if year < 1900 or year > 2100 or count > denominator:
        raise ValueError
    return {
        **row,
        "reference_year": year,
        "count": count,
        "population_denominator": denominator,
        "percent": _number(row["percent"]),
    }


def _phidu_child_health_row(row: dict[str, str]) -> dict[str, Any]:
    _required_text(row, "pha_code_2021", "pha_name_2021", "indicator_id",
                   "reference_period", "methodology_class", "publication_status",
                   "source_id", "geography_warning")
    return {**row, **{field: _number(row[field]) for field in (
        "count_or_numerator", "denominator", "rate_or_percent", "lower_95_ci",
        "upper_95_ci", "standardised_ratio", "rrmse",
    )}}


def _phidu_bridge_row(row: dict[str, str]) -> dict[str, Any]:
    _required_text(row, "sa2_code_2021", "sa2_name_2021", "pha_code_2021", "pha_name_2021")
    if not row["sa2_code_2021"].isdigit() or len(row["sa2_code_2021"]) != 9:
        raise ValueError
    return dict(row)


ROW_PARSERS = {
    "vcams_area_context": _area_row,
    "vcams_lga_context": _lga_row,
    "health_facilities": _facility_row,
    "abs_child_health": _abs_child_health_row,
    "phidu_child_health": _phidu_child_health_row,
    "phidu_pha_sa2_bridge": _phidu_bridge_row,
}


@lru_cache(maxsize=8)
def _read(path: Path, resource: str) -> tuple[dict[str, Any], ...]:
    """Read, validate and parse a static digital-health dataset once per process."""
    with path.open(encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        required = REQUIRED_FIELDS[resource]
        if not reader.fieldnames or not required.issubset(reader.fieldnames):
            raise ValueError
        parser = ROW_PARSERS[resource]
        rows = []
        keys: set[tuple[Any, ...]] = set()
        for raw in reader:
            row = parser(raw)
            key = tuple(row[field] for field in UNIQUE_FIELDS[resource])
            if key in keys:
                raise ValueError
            keys.add(key)
            rows.append(row)
        return tuple(rows)


def _source(
    path: Path | None,
    env: str,
    resource: str,
) -> tuple[tuple[dict[str, Any], ...] | None, list[dict[str, Any]]]:
    if path is None:
        return None, [limitation(
            f"{resource}_not_configured", f"Set {env} to the validated CSV.", resource,
        )]
    if not path.is_file():
        return None, [limitation(
            f"{resource}_unavailable", "The configured dataset could not be found.", resource,
        )]
    try:
        return _read(path, resource), []
    except (OSError, UnicodeError, csv.Error, KeyError, TypeError, ValueError):
        return None, [limitation(
            f"{resource}_invalid",
            "The configured dataset failed schema or value validation.",
            resource,
        )]


def load_vcams_area_context() -> tuple[tuple[dict[str, Any], ...] | None, list[dict[str, Any]]]:
    return _source(vcams_area_data_path(), VCAMS_AREA_DATA_PATH_ENV, "vcams_area_context")


def load_vcams_lga_context() -> tuple[tuple[dict[str, Any], ...] | None, list[dict[str, Any]]]:
    return _source(vcams_lga_data_path(), VCAMS_LGA_DATA_PATH_ENV, "vcams_lga_context")


def load_health_facilities() -> tuple[tuple[dict[str, Any], ...] | None, list[dict[str, Any]]]:
    return _source(
        health_facility_data_path(), HEALTH_FACILITY_DATA_PATH_ENV, "health_facilities",
    )


def load_abs_child_health() -> tuple[tuple[dict[str, Any], ...] | None, list[dict[str, Any]]]:
    return _source(
        abs_child_health_data_path(), ABS_CHILD_HEALTH_DATA_PATH_ENV, "abs_child_health",
    )


def load_phidu_child_health() -> tuple[tuple[dict[str, Any], ...] | None, list[dict[str, Any]]]:
    return _source(phidu_child_health_data_path(), PHIDU_CHILD_HEALTH_DATA_PATH_ENV,
                   "phidu_child_health")


def load_phidu_bridge() -> tuple[tuple[dict[str, Any], ...] | None, list[dict[str, Any]]]:
    return _source(phidu_pha_sa2_bridge_data_path(), PHIDU_PHA_SA2_BRIDGE_DATA_PATH_ENV,
                   "phidu_pha_sa2_bridge")


def vcams_area_context(
    area_name: str,
    year: int | None,
) -> tuple[list[dict[str, Any]] | None, list[dict[str, Any]]]:
    rows, limitations = load_vcams_area_context()
    if rows is None:
        return None, limitations
    selected = [
        dict(row) for row in rows
        if row["area_name"] == area_name
        and (year is None or row["reference_year"] == year)
    ]
    return selected, limitations


def vcams_lga_context(
    lga_name: str,
) -> tuple[list[dict[str, Any]] | None, list[dict[str, Any]]]:
    rows, limitations = load_vcams_lga_context()
    if rows is None:
        return None, limitations
    names = {part.strip().casefold() for part in lga_name.split("|")}
    selected = [dict(row) for row in rows if row["lga_name"].casefold() in names]
    return selected, limitations


def health_facilities(
    sa2_code: str,
) -> tuple[list[dict[str, Any]] | None, list[dict[str, Any]]]:
    rows, limitations = load_health_facilities()
    if rows is None:
        return None, limitations
    return [{
        "facility_id": row["facility_id"],
        "name": row["facility_name"],
        "category": row["facility_category"],
        "service_type": row["official_service_type"],
        "address": row["address"],
        "longitude": row["longitude"],
        "latitude": row["latitude"],
        "source_date": row["source_date"],
    } for row in rows
        if row["sa2_code"] == sa2_code and row["operational_status"] == "active"], limitations


def child_health_conditions(
    sa2_code: str,
    year: int | None,
) -> tuple[list[dict[str, Any]] | None, list[dict[str, Any]]]:
    rows, limitations = load_abs_child_health()
    if rows is None:
        return None, limitations
    return [
        dict(row) for row in rows
        if row["sa2_code_2021"] == sa2_code
        and (year is None or row["reference_year"] == year)
    ], limitations


def child_health_context(sa2_code: str) -> tuple[dict[str, Any] | None, list[dict[str, Any]]]:
    """Return exact SA2 observations and separate containing-PHA context."""
    exact, limitations = child_health_conditions(sa2_code, None)
    phidu, phidu_limits = load_phidu_child_health()
    bridge_rows, bridge_limits = load_phidu_bridge()
    limitations = [*limitations, *phidu_limits, *bridge_limits]
    if exact is None or phidu is None or bridge_rows is None:
        return None, limitations
    bridge = next((row for row in bridge_rows if row["sa2_code_2021"] == sa2_code), None)
    regional = [dict(row) for row in phidu if bridge and row["pha_code_2021"] == bridge["pha_code_2021"]]
    locality = None if not exact and not bridge else {
        "sa2_code": sa2_code,
        "sa2_name": exact[0]["sa2_name_2021"] if exact else bridge["sa2_name_2021"],
        "pha_code": bridge["pha_code_2021"] if bridge else None,
        "pha_name": bridge["pha_name_2021"] if bridge else None,
    }
    return {"locality": locality, "sa2_indicators": exact, "pha_context": regional}, limitations


IMMUNISATION_INDICATORS = (
    ("immunised_age_1", "12 months"),
    ("immunised_age_2", "24 months"),
    ("immunised_age_5", "60 months"),
)
NATIONAL_ASPIRATIONAL_COVERAGE = 95.0


def _pooled_rate(rows: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Pool published numerators and denominators; never average percentages."""
    usable = [
        row for row in rows
        if row["count_or_numerator"] is not None and row["denominator"]
    ]
    if not usable:
        return None
    numerator = sum(row["count_or_numerator"] for row in usable)
    denominator = sum(row["denominator"] for row in usable)
    return {
        "numerator": numerator,
        "denominator": denominator,
        "percent": numerator / denominator * 100,
        "pha_count": len(usable),
    }


def immunisation_context(sa2_code: str) -> tuple[dict[str, Any] | None, list[dict[str, Any]]]:
    """Return containing-PHA childhood immunisation coverage with a pooled Victorian reference.

    The Victorian reference pools every published PHA numerator and denominator in the
    PHIDU extract, so it is a derived total rather than an average of PHA percentages.
    The PHA value describes the containing Population Health Area and is never
    assigned to the SA2 as an SA2 estimate.
    """
    phidu, limitations = load_phidu_child_health()
    bridge_rows, bridge_limits = load_phidu_bridge()
    limitations = [*limitations, *bridge_limits]
    if phidu is None or bridge_rows is None:
        return None, limitations
    bridge = next((row for row in bridge_rows if row["sa2_code_2021"] == sa2_code), None)
    if bridge is None:
        return {"locality": None, "indicators": []}, limitations
    indicators = []
    for indicator_id, age_label in IMMUNISATION_INDICATORS:
        statewide = [row for row in phidu if row["indicator_id"] == indicator_id]
        local = next((row for row in statewide if row["pha_code_2021"] == bridge["pha_code_2021"]), None)
        if local is None:
            continue
        ranked = sorted(
            (row["rate_or_percent"] for row in statewide if row["rate_or_percent"] is not None),
        )
        value = local["rate_or_percent"]
        percentile = None
        if value is not None and ranked:
            percentile = sum(1 for other in ranked if other <= value) / len(ranked) * 100
        indicators.append({
            "indicator_id": indicator_id,
            "age": age_label,
            "reference_period": local["reference_period"],
            "pha": {
                "percent": value,
                "numerator": local["count_or_numerator"],
                "denominator": local["denominator"],
                "publication_status": local["publication_status"],
            },
            "victoria": _pooled_rate(statewide),
            "pha_percentile_in_victoria": percentile,
            "national_aspirational_target": NATIONAL_ASPIRATIONAL_COVERAGE,
            "gap_to_target": None if value is None else max(0.0, NATIONAL_ASPIRATIONAL_COVERAGE - value),
        })
    return {
        "locality": {
            "sa2_code": sa2_code,
            "sa2_name": bridge["sa2_name_2021"],
            "pha_code": bridge["pha_code_2021"],
            "pha_name": bridge["pha_name_2021"],
        },
        "indicators": indicators,
    }, limitations
