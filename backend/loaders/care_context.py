"""Load validated care-comparison, seasonal-illness and nutrition datasets.

Every value is served as published or as derived by the documented data-science
builders. Nothing here scores, ranks or recommends a service.
"""

from __future__ import annotations

import csv
import math
from pathlib import Path
from typing import Any

from core.data_loader import CARE_CONTEXT_ENV, care_context_path
from core.responses import limitation
from core.sources import dataset_cache, read_csv_rows, source_exists

HOSPITAL_NUMBERS = (
    "latitude", "longitude", "ed_on_time_resuscitation_pct", "ed_on_time_emergency_pct",
    "ed_on_time_urgent_pct", "ed_on_time_semi_urgent_pct", "ed_on_time_non_urgent_pct",
    "ed_departed_within_4h_pct", "ed_median_minutes", "ed_90th_percentile_minutes",
    "surgery_median_days_urgent", "surgery_median_days_semi_urgent", "surgery_median_days_non_urgent",
)
COST_NUMBERS = (
    "population", "patients", "services", "services_per_100", "percent_people", "provider_fees",
    "benefits_paid", "patient_contribution_per_service", "benefit_share_of_fees_pct",
)

FUTURE_NUMBERS = ("children_0_4", "children_5_9", "children_10_14", "children_0_14", "population_all_ages", "ecec_places_per_100_0_4", "gp_practices_per_10000", "primary_campuses", "primary_campuses_per_1000_5_9", "children_0_4_change_from_2026_pct", "ecec_places_to_keep_2026_access", "ecec_access_percentile")

SPECS: dict[str, dict[str, Any]] = {
    "hospital_capability": {
        "required": {"hospital_code", "hospital_name", "private", "specialised_units", "has_paediatric_service",
                     "has_neonatal_intensive_care", "has_obstetric_service", "has_emergency_department_data",
                     "ed_period", "surgery_period", *HOSPITAL_NUMBERS},
        "key": ("hospital_code",), "numbers": HOSPITAL_NUMBERS,
        "booleans": ("has_paediatric_service", "has_neonatal_intensive_care", "has_obstetric_service",
                     "has_emergency_department_data"),
        "integers": ("private",),
        "integer_bounds": {"private": (0, 1)},
    },
    "care_compare": {
        "required": {"sa2_code", "sa2_name", "kind", "facility_id", "distance_km"},
        "key": ("sa2_code", "kind", "facility_id"), "numbers": ("distance_km",),
    },
    "urgent_care_clinics": {
        "required": {"facility_id", "name", "address", "suburb_postcode", "phone", "listing_url",
                     "latitude", "longitude", "cost"},
        "key": ("facility_id",), "numbers": ("latitude", "longitude"),
    },
    "primary_care_cost": {
        "required": {"geography", "sa3_code", "sa3_name", "service", "demographic", "reference_period", *COST_NUMBERS},
        "key": ("sa3_code", "service", "demographic"), "numbers": COST_NUMBERS,
    },
    "seasonal_illness": {
        "required": {"disease", "disease_label", "age_band", "month", "average_notifications",
                     "share_of_year_pct", "reference_years"},
        "key": ("disease", "age_band", "month"), "numbers": ("average_notifications", "share_of_year_pct"),
        "integers": ("month",),
        "integer_bounds": {"month": (1, 12)},
    },
    "food_outlets": {
        "required": {"sa2_code", "osm_id", "name", "outlet_type", "organic", "address", "opening_hours",
                     "latitude", "longitude", "distance_km"},
        "key": ("sa2_code", "osm_id"), "numbers": ("latitude", "longitude", "distance_km"),
        "booleans": ("organic",),
    },
    "food_access": {
        "required": {"sa2_code", "outlet_type", "within_1km", "within_2km", "nearest_km"},
        "key": ("sa2_code", "outlet_type"), "numbers": ("nearest_km",), "integers": ("within_1km", "within_2km"),
    },
    "child_nutrient_foods": {
        "required": {"nutrient_id", "nutrient", "unit", "rank", "food_key", "food_name", "food_group",
                     "amount_per_100g"},
        "key": ("nutrient_id", "rank"), "numbers": ("amount_per_100g",), "integers": ("rank",),
        "integer_bounds": {"rank": (1, None)},
    },
    "practitioner_context": {
        "required": {"sa2_code", "sa2_name", "community_id", "community_name", "n_children", "observed_pct",
                     "expected_pct", "expected_range_lo_pct", "expected_range_hi_pct", "priority_band",
                     "band_stability", "expectation_drivers", "gp_access_5km", "gp_access_percentile",
                     "gp_nearest_km", "ecec_access_5km", "ecec_access_percentile", "ecec_nearest_km",
                     "model_version"},
        "key": ("sa2_code",),
        "numbers": ("n_children", "observed_pct", "expected_pct", "expected_range_lo_pct", "expected_range_hi_pct",
                    "band_stability", "gp_access_5km", "gp_access_percentile", "gp_nearest_km",
                    "ecec_access_5km", "ecec_access_percentile", "ecec_nearest_km"),
    },
    "play_spaces": {
        "required": {"sa2_code", "kind", "rank", "feature_id", "name", "park", "latitude", "longitude",
                     "distance_km", "direction"},
        "key": ("sa2_code", "kind", "rank"), "numbers": ("latitude", "longitude", "distance_km"),
        "integers": ("rank",), "integer_bounds": {"rank": (1, None)},
    },
    "play_access": {
        "required": {"sa2_code", "kind", "origin_latitude", "origin_longitude", "within_1km", "within_2km",
                     "nearest_km"},
        "key": ("sa2_code", "kind"), "numbers": ("origin_latitude", "origin_longitude", "nearest_km"),
        "integers": ("within_1km", "within_2km"),
    },
    "future_demand": {
        "required": {"sa2_code", "sa2_name", "projection_year", *FUTURE_NUMBERS},
        "key": ("sa2_code", "projection_year"), "numbers": FUTURE_NUMBERS, "integers": ("projection_year",),
        "integer_bounds": {"projection_year": (2021, 2036)},
    },
    "child_nutrient_targets": {
        "required": {"nutrient_id", "nutrient", "unit", "basis", "age_1_3", "age_4_8", "age_9_13_boys",
                     "age_9_13_girls", "why_it_matters", "source_url"},
        "key": ("nutrient_id",), "numbers": ("age_1_3", "age_4_8", "age_9_13_boys", "age_9_13_girls"),
    },
}


def _number(value: str) -> float | None:
    if value is None:
        raise ValueError
    if value.strip() == "":
        return None
    number = float(value)
    if not math.isfinite(number):
        raise ValueError
    return number


def _boolean(value: str) -> bool:
    lowered = value.strip().lower()
    if lowered in {"true", "1"}:
        return True
    if lowered in {"false", "0", ""}:
        return False
    raise ValueError


def _integer(value: str, minimum: int = 0, maximum: int | None = None) -> int:
    number = _number(value)
    if number is None or not number.is_integer() or number < minimum:
        raise ValueError
    if maximum is not None and number > maximum:
        raise ValueError
    return int(number)


@dataset_cache(maxsize=16)
def _read(path: Path, resource: str) -> tuple[dict[str, Any], ...]:
    spec = SPECS[resource]
    reader = read_csv_rows(path, CARE_CONTEXT_ENV[resource])
    if not reader.fieldnames or not spec["required"].issubset(reader.fieldnames):
        raise ValueError
    rows, keys = [], set()
    for raw in reader:
        row: dict[str, Any] = {field: raw[field] for field in spec["required"]}
        for field in spec.get("numbers", ()):
            row[field] = _number(raw[field])
        for field in spec.get("integers", ()):
            minimum, maximum = spec.get("integer_bounds", {}).get(field, (0, None))
            row[field] = _integer(raw[field], minimum, maximum)
        for field in spec.get("booleans", ()):
            row[field] = _boolean(raw[field])
        key = tuple(row[field] for field in spec["key"])
        if key in keys:
            raise ValueError
        keys.add(key)
        rows.append(row)
    return tuple(rows)


def load(resource: str) -> tuple[tuple[dict[str, Any], ...] | None, list[dict[str, Any]]]:
    path = care_context_path(resource)
    env = CARE_CONTEXT_ENV[resource]
    if path is None:
        return None, [limitation(f"{resource}_not_configured", f"Set {env} to the validated CSV.", resource)]
    if not source_exists(path, env):
        return None, [limitation(f"{resource}_unavailable", "The configured dataset could not be found.", resource)]
    try:
        return _read(path, resource), []
    except (OSError, UnicodeError, csv.Error, KeyError, TypeError, ValueError, OverflowError):
        return None, [limitation(f"{resource}_invalid", "The configured dataset failed schema or value validation.",
                                 resource)]


def _split_units(value: str) -> list[str]:
    return [item.strip() for item in (value or "").split(";") if item.strip()]


def compare_care(sa2_code: str) -> tuple[dict[str, Any] | None, list[dict[str, Any]]]:
    """Nearby hospitals and Urgent Care Clinics with capability, timeliness and area cost context."""
    compare, a = load("care_compare")
    hospitals, b = load("hospital_capability")
    clinics, c = load("urgent_care_clinics")
    cost, d = load("primary_care_cost")
    limitations = [*a, *b, *c, *d]
    if compare is None or hospitals is None or clinics is None:
        return None, limitations
    by_hospital = {row["hospital_code"]: row for row in hospitals}
    by_clinic = {row["facility_id"]: row for row in clinics}
    links = [row for row in compare if row["sa2_code"] == sa2_code]
    hospital_rows, clinic_rows = [], []
    for link in sorted(links, key=lambda row: row["distance_km"]):
        if link["kind"] == "hospital" and link["facility_id"] in by_hospital:
            h = by_hospital[link["facility_id"]]
            hospital_rows.append({
                "id": h["hospital_code"], "name": h["hospital_name"], "sector": "private" if h["private"] else "public",
                "distance_km": link["distance_km"], "latitude": h["latitude"], "longitude": h["longitude"],
                "specialised_units": _split_units(h["specialised_units"]),
                "has_paediatric_service": h["has_paediatric_service"],
                "has_neonatal_intensive_care": h["has_neonatal_intensive_care"],
                "has_obstetric_service": h["has_obstetric_service"],
                "emergency_department": None if not h["has_emergency_department_data"] else {
                    "on_time_pct": {
                        "resuscitation": h["ed_on_time_resuscitation_pct"], "emergency": h["ed_on_time_emergency_pct"],
                        "urgent": h["ed_on_time_urgent_pct"], "semi_urgent": h["ed_on_time_semi_urgent_pct"],
                        "non_urgent": h["ed_on_time_non_urgent_pct"],
                    },
                    "departed_within_4h_pct": h["ed_departed_within_4h_pct"],
                    "median_minutes": h["ed_median_minutes"],
                    "ninetieth_percentile_minutes": h["ed_90th_percentile_minutes"],
                    "period": h["ed_period"],
                },
                "elective_surgery_median_days": None if h["surgery_median_days_urgent"] is None
                and h["surgery_median_days_semi_urgent"] is None and h["surgery_median_days_non_urgent"] is None else {
                    "urgent": h["surgery_median_days_urgent"], "semi_urgent": h["surgery_median_days_semi_urgent"],
                    "non_urgent": h["surgery_median_days_non_urgent"], "period": h["surgery_period"],
                },
            })
        elif link["kind"] == "urgent_care_clinic" and link["facility_id"] in by_clinic:
            u = by_clinic[link["facility_id"]]
            clinic_rows.append({
                "id": u["facility_id"], "name": u["name"], "address": f"{u['address']}, {u['suburb_postcode']}",
                "phone": u["phone"], "listing_url": u["listing_url"], "cost": u["cost"],
                "distance_km": link["distance_km"], "latitude": u["latitude"], "longitude": u["longitude"],
            })
    sa3 = sa2_code[:5]
    area_cost = None
    if cost is not None:
        local = [row for row in cost if row["sa3_code"] == sa3]
        national = {(row["service"], row["demographic"]): row for row in cost if row["geography"] == "National"}
        if local:
            area_cost = {
                "sa3_code": sa3, "sa3_name": local[0]["sa3_name"], "reference_period": local[0]["reference_period"],
                "services": [{
                    "service": row["service"], "demographic": row["demographic"],
                    "patients": row["patients"], "services_per_100": row["services_per_100"],
                    "percent_people": row["percent_people"],
                    "patient_contribution_per_service": row["patient_contribution_per_service"],
                    "benefit_share_of_fees_pct": row["benefit_share_of_fees_pct"],
                    "national_patient_contribution_per_service":
                        national.get((row["service"], row["demographic"]), {}).get("patient_contribution_per_service"),
                    "national_services_per_100":
                        national.get((row["service"], row["demographic"]), {}).get("services_per_100"),
                } for row in sorted(local, key=lambda r: (r["service"], r["demographic"]))],
            }
    return {"hospitals": hospital_rows, "urgent_care_clinics": clinic_rows, "area_cost": area_cost}, limitations


def seasonal_illness() -> tuple[dict[str, Any] | None, list[dict[str, Any]]]:
    rows, limitations = load("seasonal_illness")
    if rows is None:
        return None, limitations
    diseases: dict[str, dict[str, Any]] = {}
    for row in sorted(rows, key=lambda r: (r["disease"], r["month"])):
        entry = diseases.setdefault(row["disease"], {"id": row["disease"], "label": row["disease_label"],
                                                     "reference_years": row["reference_years"], "months": {}})
        month = entry["months"].setdefault(row["month"], {"month": row["month"]})
        prefix = "children" if row["age_band"] == "0-14 years" else "all_ages"
        month[f"{prefix}_average"] = row["average_notifications"]
        month[f"{prefix}_share_pct"] = row["share_of_year_pct"]
    return {"diseases": [{**d, "months": [d["months"][m] for m in sorted(d["months"])]} for d in diseases.values()]}, limitations


def nutrition_report(sa2_code: str) -> tuple[dict[str, Any] | None, list[dict[str, Any]]]:
    targets, a = load("child_nutrient_targets")
    foods, b = load("child_nutrient_foods")
    outlets, c = load("food_outlets")
    access, d = load("food_access")
    limitations = [*a, *b, *c, *d]
    if targets is None or foods is None:
        return None, limitations
    return {
        "targets": [dict(row) for row in targets],
        "foods": [dict(row) for row in sorted(foods, key=lambda r: (r["nutrient_id"], r["rank"]))],
        "outlets": None if outlets is None else sorted(
            (dict(row) for row in outlets if row["sa2_code"] == sa2_code), key=lambda r: r["distance_km"]),
        "access": None if access is None else [dict(row) for row in access if row["sa2_code"] == sa2_code],
    }, limitations


PLAY_KINDS = ("Playground", "Swimming pool", "Picnic area", "Day visitor area")


def play_spaces(sa2_code: str) -> tuple[dict[str, Any] | None, list[dict[str, Any]]]:
    """Listed play places near an SA2 (Vicmap Features of Interest) and counts by distance."""
    spaces, a = load("play_spaces")
    access, b = load("play_access")
    limitations = [*a, *b]
    if spaces is None and access is None:
        return None, limitations
    order = {kind: index for index, kind in enumerate(PLAY_KINDS)}
    rows = [] if access is None else [row for row in access if row["sa2_code"] == sa2_code]
    origin = {"latitude": rows[0]["origin_latitude"], "longitude": rows[0]["origin_longitude"]} if rows else None
    return {
        "sa2_code": sa2_code,
        "origin": origin,
        "places": None if spaces is None else sorted(
            (dict(row) for row in spaces if row["sa2_code"] == sa2_code),
            key=lambda r: (order.get(r["kind"], 99), r["rank"])),
        "access": None if access is None else sorted(
            ({k: v for k, v in row.items() if not k.startswith("origin_")} for row in rows),
            key=lambda r: order.get(r["kind"], 99)),
    }, limitations


FUTURE_OVERVIEW = ("sa2_code", "sa2_name", "projection_year", "children_0_4", "children_0_14",
                   "children_0_4_change_from_2026_pct", "ecec_places_per_100_0_4", "ecec_places_to_keep_2026_access")


def future_area(sa2_code: str) -> tuple[list[dict[str, Any]] | None, list[dict[str, Any]]]:
    """Projected children and service pressure for one SA2, 2021-2036 (VIF2023; services held fixed)."""
    rows, limitations = load("future_demand")
    if rows is None:
        return None, limitations
    return sorted((dict(r) for r in rows if r["sa2_code"] == sa2_code), key=lambda r: r["projection_year"]), limitations


def future_overview() -> tuple[list[dict[str, Any]] | None, list[dict[str, Any]]]:
    """A compact row per SA2 and year, for the Greater Melbourne map."""
    rows, limitations = load("future_demand")
    if rows is None:
        return None, limitations
    return [{k: r[k] for k in FUTURE_OVERVIEW} for r in rows], limitations


PRIORITY_BANDS = {"Higher", "Moderate", "Lower"}


def practitioner_context(sa2_code: str) -> tuple[dict[str, Any] | None, list[dict[str, Any]]]:
    """Priority model V2 band with its evidence, and E2SFCA access, for one SA2.

    Only a band is published for priority (ADR-004); the internal z-score is not
    in the file. A row whose band is not one of the three labels is rejected.
    """
    rows, limitations = load("practitioner_context")
    if rows is None:
        return None, limitations
    row = next((r for r in rows if r["sa2_code"] == sa2_code), None)
    if row is None:
        return {"sa2_code": sa2_code, "development": None, "access": None}, limitations
    band = row["priority_band"].strip()
    development = None
    if band:
        if band not in PRIORITY_BANDS:
            return None, [limitation("practitioner_context_invalid", "Unsupported priority band label.",
                                     "practitioner_context")]
        development = {
            "community_id": row["community_id"], "community_name": row["community_name"],
            "children_assessed": None if row["n_children"] is None else int(row["n_children"]),
            "observed_vulnerable_pct": row["observed_pct"], "expected_vulnerable_pct": row["expected_pct"],
            "expected_range_pct": [row["expected_range_lo_pct"], row["expected_range_hi_pct"]],
            "priority_band": band, "band_stability": row["band_stability"],
            "expectation_drivers": [d.strip() for d in row["expectation_drivers"].split(";") if d.strip()],
            "model_version": row["model_version"],
        }
    access = {
        "general_practice": {"access_5km": row["gp_access_5km"], "percentile": row["gp_access_percentile"],
                             "nearest_km": row["gp_nearest_km"],
                             "unit": "practices per 10,000 residents (distance-weighted, 5 km)"},
        "early_childhood_education_and_care": {
            "access_5km": row["ecec_access_5km"], "percentile": row["ecec_access_percentile"],
            "nearest_km": row["ecec_nearest_km"],
            "unit": "approved places per 100 children aged 0-4 (distance-weighted, 5 km)"},
    }
    return {"sa2_code": sa2_code, "sa2_name": row["sa2_name"], "development": development, "access": access}, limitations
