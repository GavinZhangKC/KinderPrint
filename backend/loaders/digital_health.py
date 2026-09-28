"""Load validated VCAMS context and Healthdirect facility presence."""

from __future__ import annotations

import csv
from functools import lru_cache
import math
from pathlib import Path
from typing import Any

from core.data_loader import (
    ABS_CHILD_HEALTH_DATA_PATH_ENV,
    BUSHFIRE_CONTEXT_DATA_PATH_ENV,
    DEPARTMENT_AREA_BRIDGE_DATA_PATH_ENV,
    HEALTH_FACILITY_DATA_PATH_ENV,
    PHIDU_CHILD_HEALTH_DATA_PATH_ENV,
    PHIDU_PHA_SA2_BRIDGE_DATA_PATH_ENV,
    VCAMS_AREA_DATA_PATH_ENV,
    TRANSPORT_CONTEXT_DATA_PATH_ENV,
    VCAMS_LGA_DATA_PATH_ENV,
    abs_child_health_data_path,
    bushfire_context_data_path,
    department_area_bridge_data_path,
    health_facility_data_path,
    phidu_child_health_data_path,
    phidu_pha_sa2_bridge_data_path,
    transport_context_data_path,
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
DEPARTMENT_BRIDGE_FIELDS = {
    "sa2_code_2021", "sa2_name_2021", "lga_code_2023", "lga_name_2023",
    "department_area", "allocation_method", "source_id",
}
BUSHFIRE_FIELDS = {"sa2_code", "sa2_name", "area_sqkm", "bushfire_prone_sqkm", "bushfire_prone_pct"}
TRANSPORT_FIELDS = {
    "sa2_code", "sa2_name", "area_sqkm", "declared_road_length_km",
    "declared_road_traffic_intensity", "public_transport_stop_count",
}
REQUIRED_FIELDS = {
    "vcams_area_context": AREA_FIELDS,
    "vcams_lga_context": LGA_FIELDS,
    "health_facilities": FACILITY_FIELDS,
    "abs_child_health": ABS_CHILD_HEALTH_FIELDS,
    "phidu_child_health": PHIDU_CHILD_HEALTH_FIELDS,
    "phidu_pha_sa2_bridge": PHIDU_BRIDGE_FIELDS,
    "department_area_bridge": DEPARTMENT_BRIDGE_FIELDS,
    "bushfire_context": BUSHFIRE_FIELDS,
    "transport_context": TRANSPORT_FIELDS,
}
UNIQUE_FIELDS = {
    "vcams_area_context": ("reference_year", "area_name", "indicator_id"),
    "vcams_lga_context": ("reference_period", "lga_code", "indicator_id"),
    "health_facilities": ("facility_id",),
    "abs_child_health": ("sa2_code_2021", "reference_year", "indicator"),
    "phidu_child_health": ("pha_code_2021", "reference_period", "indicator_id"),
    "phidu_pha_sa2_bridge": ("sa2_code_2021",),
    "department_area_bridge": ("sa2_code_2021",),
    "bushfire_context": ("sa2_code",),
    "transport_context": ("sa2_code",),
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


def _department_bridge_row(row: dict[str, str]) -> dict[str, Any]:
    _required_text(row, "sa2_code_2021", "sa2_name_2021", "lga_name_2023", "department_area")
    if not row["sa2_code_2021"].isdigit() or len(row["sa2_code_2021"]) != 9:
        raise ValueError
    return dict(row)


def _sa2_numeric_row(*fields: str):
    def parse(row: dict[str, str]) -> dict[str, Any]:
        _required_text(row, "sa2_code", "sa2_name")
        if not row["sa2_code"].isdigit() or len(row["sa2_code"]) != 9:
            raise ValueError
        return {**row, **{field: _number(row[field]) for field in fields}}
    return parse


ROW_PARSERS = {
    "vcams_area_context": _area_row,
    "vcams_lga_context": _lga_row,
    "health_facilities": _facility_row,
    "abs_child_health": _abs_child_health_row,
    "phidu_child_health": _phidu_child_health_row,
    "phidu_pha_sa2_bridge": _phidu_bridge_row,
    "department_area_bridge": _department_bridge_row,
    "bushfire_context": _sa2_numeric_row("area_sqkm", "bushfire_prone_sqkm", "bushfire_prone_pct"),
    "transport_context": _sa2_numeric_row(
        "area_sqkm", "declared_road_length_km", "declared_road_traffic_intensity",
        "public_transport_stop_count",
    ),
}


@lru_cache(maxsize=16)
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


def load_department_area_bridge() -> tuple[tuple[dict[str, Any], ...] | None, list[dict[str, Any]]]:
    return _source(department_area_bridge_data_path(), DEPARTMENT_AREA_BRIDGE_DATA_PATH_ENV,
                   "department_area_bridge")


def load_bushfire_context() -> tuple[tuple[dict[str, Any], ...] | None, list[dict[str, Any]]]:
    return _source(bushfire_context_data_path(), BUSHFIRE_CONTEXT_DATA_PATH_ENV, "bushfire_context")


def load_transport_context() -> tuple[tuple[dict[str, Any], ...] | None, list[dict[str, Any]]]:
    return _source(transport_context_data_path(), TRANSPORT_CONTEXT_DATA_PATH_ENV, "transport_context")


NUTRITION_VCAMS_INDICATORS = (
    "minimum_recommended_vegetables",
    "minimum_recommended_fruit",
    "recommended_daily_physical_activity",
    "electronic_media_over_two_hours",
    "household_food_insecurity",
)
PREVENTION_VCAMS_INDICATORS = ("tobacco_smoke_exposure_at_home",)
WEIGHT_INDICATORS = ("child_overweight_not_obese", "child_obese")


def _vcams_area_comparison(
    rows: tuple[dict[str, Any], ...],
    area_name: str,
    indicator_ids: tuple[str, ...],
) -> list[dict[str, Any]]:
    """Latest survey year for the area compared with every Department area in that year.

    VCAMS publishes these estimates for 17 Department areas. The comparison uses
    those published estimates only; no statewide value is derived from them.
    """
    result = []
    for indicator_id in indicator_ids:
        area_rows = [row for row in rows if row["indicator_id"] == indicator_id and row["area_name"] == area_name]
        if not area_rows:
            continue
        latest = max(area_rows, key=lambda row: row["reference_year"])
        year = latest["reference_year"]
        peers = sorted(
            (row["percent"] for row in rows if row["indicator_id"] == indicator_id
             and row["reference_year"] == year and row["percent"] is not None),
        )
        rank = None if latest["percent"] is None else 1 + sum(1 for value in peers if value > latest["percent"])
        middle = len(peers) // 2
        median = None if not peers else (
            peers[middle] if len(peers) % 2 else (peers[middle - 1] + peers[middle]) / 2
        )
        result.append({
            "indicator_id": indicator_id,
            "indicator_label": latest["indicator_label"],
            "age_group": latest["age_group"],
            "reference_year": year,
            "area": {"percent": latest["percent"], "rse_percent": latest["rse_percent"],
                     "quality_flag": latest["quality_flag"]},
            "department_areas": None if not peers else {
                "count": len(peers), "lowest": peers[0], "median": median, "highest": peers[-1],
            },
            "area_rank_highest_first": rank,
        })
    return result


def _locality(sa2_code: str) -> tuple[dict[str, Any] | None, dict[str, Any] | None, list[dict[str, Any]]]:
    department, limitations = load_department_area_bridge()
    bridge_rows, bridge_limits = load_phidu_bridge()
    limitations = [*limitations, *bridge_limits]
    if department is None or bridge_rows is None:
        return None, None, limitations
    area = next((row for row in department if row["sa2_code_2021"] == sa2_code), None)
    pha = next((row for row in bridge_rows if row["sa2_code_2021"] == sa2_code), None)
    return area, pha, limitations


def nutrition_context(sa2_code: str) -> tuple[dict[str, Any] | None, list[dict[str, Any]]]:
    """Department-area VCAMS healthy-eating and activity context plus PHA weight estimates.

    Every value keeps its native geography. The Victorian weight reference is derived
    by pooling PHA counts and the population implied by each published rate.
    """
    area, pha, limitations = _locality(sa2_code)
    vcams, vcams_limits = load_vcams_area_context()
    phidu, phidu_limits = load_phidu_child_health()
    limitations = [*limitations, *vcams_limits, *phidu_limits]
    if vcams is None or phidu is None or (area is None and pha is None and limitations):
        return None, limitations
    weight = []
    for indicator_id in WEIGHT_INDICATORS:
        statewide = [row for row in phidu if row["indicator_id"] == indicator_id]
        local = next((row for row in statewide if pha and row["pha_code_2021"] == pha["pha_code_2021"]), None)
        if local is None:
            continue
        usable = [row for row in statewide if row["count_or_numerator"] and row["rate_or_percent"]]
        implied = sum(row["count_or_numerator"] / (row["rate_or_percent"] / 100) for row in usable)
        weight.append({
            "indicator_id": indicator_id,
            "reference_period": local["reference_period"],
            "methodology_class": local["methodology_class"],
            "pha": {
                "percent": local["rate_or_percent"],
                "lower_95_ci": local["lower_95_ci"],
                "upper_95_ci": local["upper_95_ci"],
                "count": local["count_or_numerator"],
            },
            "victoria": None if not implied else {
                "percent": sum(row["count_or_numerator"] for row in usable) / implied * 100,
                "pha_count": len(usable),
            },
        })
    return {
        "locality": None if area is None and pha is None else {
            "sa2_code": sa2_code,
            "sa2_name": (area or pha)["sa2_name_2021"],
            "lga_name": area["lga_name_2023"] if area else None,
            "department_area": area["department_area"] if area else None,
            "pha_name": pha["pha_name_2021"] if pha else None,
        },
        "vcams": [] if area is None else _vcams_area_comparison(vcams, area["department_area"], NUTRITION_VCAMS_INDICATORS),
        "weight": weight,
    }, limitations


def prevention_context(sa2_code: str) -> tuple[dict[str, Any] | None, list[dict[str, Any]]]:
    """SA2 bushfire designation, public transport and road context plus area smoke exposure."""
    area, _pha, limitations = _locality(sa2_code)
    bushfire, bushfire_limits = load_bushfire_context()
    transport, transport_limits = load_transport_context()
    vcams, vcams_limits = load_vcams_area_context()
    limitations = [*limitations, *bushfire_limits, *transport_limits, *vcams_limits]
    if bushfire is None or transport is None or vcams is None:
        return None, limitations
    fire = next((row for row in bushfire if row["sa2_code"] == sa2_code), None)
    move = next((row for row in transport if row["sa2_code"] == sa2_code), None)
    intensities = sorted(row["declared_road_traffic_intensity"] for row in transport
                         if row["declared_road_traffic_intensity"] is not None)
    traffic_percentile = None
    if move and move["declared_road_traffic_intensity"] is not None and intensities:
        value = move["declared_road_traffic_intensity"]
        traffic_percentile = sum(1 for other in intensities if other <= value) / len(intensities) * 100
    return {
        "locality": {
            "sa2_code": sa2_code,
            "sa2_name": (fire or move or area or {}).get("sa2_name") or (area or {}).get("sa2_name_2021"),
            "department_area": area["department_area"] if area else None,
        },
        "bushfire": None if fire is None else {
            "bushfire_prone_pct": fire["bushfire_prone_pct"],
            "area_sqkm": fire["area_sqkm"],
        },
        "transport": None if move is None else {
            "public_transport_stop_count": move["public_transport_stop_count"],
            "declared_road_length_km": move["declared_road_length_km"],
            "declared_road_traffic_intensity": move["declared_road_traffic_intensity"],
            "traffic_intensity_percentile": traffic_percentile,
            "sa2_compared": len(intensities),
        },
        "vcams": [] if area is None else _vcams_area_comparison(vcams, area["department_area"], PREVENTION_VCAMS_INDICATORS),
    }, limitations
