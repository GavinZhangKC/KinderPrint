"VKinder FastAPI application and versioned service routes."""

from __future__ import annotations

import logging
import time
from typing import Any

from fastapi import FastAPI, Query, Request
from fastapi import Path as FastAPIPath
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from mangum import Mangum

from core.data_loader import boundary_data_path
from core.data_readiness import runtime_data_readiness
from core.dataset_status import dataset_statuses
from core.responses import (
    AREA_LEVEL_NOTICE, ASSOCIATION_NOTICE, COMPARABLE_NOTICE, COMPARISON_AREA_NOTICE,
    HUMAN_DECISION_NOTICE, INDUSTRIAL_EMISSIONS_CONTEXT_NOTICE,
    INVESTIGATION_LEADS_NOTICE, MANUAL_COMPARISON_NOTICE, STATION_CONTEXT_NOTICE,
    TRAFFIC_CONTEXT_NOTICE,
    envelope, limitation,
)
from geography import (
    feature_metadata,
    intersects_bbox,
    load_boundary_features,
    neighbourhood,
    parse_bbox,
    public_boundary_feature,
    public_boundary_geometry,
)
from loaders.air_quality import load_station_year_observations, station_catalog
from loaders.community_context import (
    INDUSTRIAL_EVIDENCE,
    INDUSTRIAL_METRIC_DEFINITIONS,
    TRAFFIC_EVIDENCE,
    TRAFFIC_METRIC_DEFINITIONS,
    load_community_context,
    load_community_identities,
)
from loaders.early_childhood import load_early_childhood_context
from loaders.geocoding_quality import load_geocoding_quality
from loaders.population import load_population_projections
from loaders.family_fit import (
    RADII_KM as FAMILY_FIT_RADII,
    area_detail as family_fit_area_detail,
    load_family_fit,
    load_shapes as load_family_fit_shapes,
    needs_and_rules as family_fit_rules,
    parse_priorities as parse_family_fit_priorities,
    places as family_fit_places,
    search as family_fit_search,
)
from loaders.care_context import compare_care, nutrition_report, practitioner_context, seasonal_illness
from loaders.digital_health import (
    child_health_context,
    immunisation_context,
    load_bushfire_context,
    load_transport_context,
    nutrition_context,
    prevention_context,
    seasonal_air,
    nearby_services,
    vaccination_places,
    child_health_conditions,
    health_facilities,
    vcams_area_context,
    vcams_lga_context,
)
from validation import (
    aggregate_status, environmental_difference_data, environmental_difference_for_pair,
    explanation_data,
    load_comparison_data, load_explanations, load_pattern_insights,
    load_prevention_opportunities,
    load_priority_results, load_profiles, load_suitability_rankings,
    map_indicator_data, match_data, multi_profile_comparison_data,
    multi_profile_comparison_limitations,
    outcome_comparison_data, outcome_comparison_for_pair, pattern_insight_data,
    prevention_opportunity_data,
    priority_data, profile_boundary_limitations, profile_collection_metadata,
    profile_comparison_data, profile_comparison_limitations, profile_limitations,
    profile_metadata, profile_status,
)

app = FastAPI(title="KinderPrint API", version="0.3.0")
app.add_middleware(GZipMiddleware, minimum_size=1000)
logger = logging.getLogger("kinderprint.api")


def _context_metrics(values: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {
        identifier: {
            "value": value,
            "status": "available" if value is not None else "missing",
        }
        for identifier, value in values.items()
    }


def _context_status(metrics: dict[str, dict[str, Any]]) -> str:
    return "available" if all(
        metric["status"] == "available" for metric in metrics.values()) else "limited"


@app.middleware("http")
async def log_request(request: Request, call_next: Any) -> Any:
    """Log request outcomes without logging query values, data, or secrets."""
    started_at = time.perf_counter()
    response = await call_next(request)
    duration_ms = round((time.perf_counter() - started_at) * 1000, 2)
    logger.info("request_complete method=%s path=%s status=%s duration_ms=%s",
                request.method, request.url.path, response.status_code, duration_ms)
    return response


@app.exception_handler(RequestValidationError)
async def request_validation_error(_: Request, __: RequestValidationError) -> JSONResponse:
    """Keep invalid request errors in the standard public response envelope."""
    return JSONResponse(
        status_code=422,
        content=envelope("unavailable", None, limitations=[limitation(
            "invalid_request", "One or more request parameters are invalid.")]),
    )


@app.get("/")
def root() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/health")
def health() -> dict[str, str]:
    """Confirm that the FastAPI application is running."""
    return {"status": "available"}


@app.get("/api/health/data")
def data_health() -> dict[str, Any]:
    """Validate configured runtime datasets and their locality-boundary alignment."""
    checks = runtime_data_readiness()
    ready_count = sum(check["readiness"] == "ready" for check in checks)
    return envelope("available" if ready_count == len(checks) else "limited",
                    {"checks": checks}, metadata={
                        "check_count": len(checks), "ready_count": ready_count,
                    })


@app.get("/api/datasets/status")
def datasets_status() -> dict[str, Any]:
    """Return configuration readiness and interpretation boundaries for data products."""
    datasets = dataset_statuses()
    configured_count = sum(bool(dataset["configured"]) for dataset in datasets)
    return envelope("available", {"datasets": datasets}, metadata={
        "dataset_count": len(datasets),
        "configured_count": configured_count,
        "contract_version": "0.3",
    })


@app.get("/api/population-projections")
def population_projections(
    sa2_code: str | None = Query(None, min_length=9, max_length=9, pattern=r"^\d{9}$"),
    year: int | None = Query(None, ge=2021, le=2036),
    sex: str = Query("persons", pattern=r"^(persons|males|females)$"),
    offset: int = Query(0, ge=0),
    limit: int = Query(500, ge=1, le=1000),
) -> dict[str, Any]:
    """Return published VIF projections at their native ASGS Edition 3 SA2 geography."""
    rows, limitations = load_population_projections()
    if rows is None:
        return envelope("unavailable", {"projections": []}, limitations=limitations,
                        notices=[AREA_LEVEL_NOTICE])
    selected = [row for row in rows
                if row["sex"] == sex
                and (sa2_code is None or row["sa2_code"] == sa2_code)
                and (year is None or row["projection_year"] == year)]
    total_result_count = len(selected)
    selected = selected[offset:offset + limit]
    status = "available" if selected else "missing"
    if not selected:
        limitations = [limitation(
            "page_out_of_range" if total_result_count else "population_projection_not_found",
            "The requested page is beyond the available results." if total_result_count else
            "No VIF projection matches the requested SA2, year and sex.",
            "offset" if total_result_count else "sa2_code",
            *("year", "sex") if not total_result_count else (),
        )]
    return envelope(status, {"projections": selected}, metadata={
        "source": "Victoria in Future 2023 Release 2",
        "geographic_unit": "ASGS Edition 3 SA2",
        "value_type": "projection",
        "result_count": len(selected),
        "total_result_count": total_result_count,
        "offset": offset,
        "limit": limit,
        "available_years": sorted({row["projection_year"] for row in rows}),
    }, limitations=limitations, notices=[AREA_LEVEL_NOTICE])


@app.get("/api/digital-health/vcams-area")
def digital_health_vcams_area(
    area_name: str = Query(..., min_length=2, max_length=100),
    year: int | None = Query(None, ge=2000, le=2030),
) -> dict[str, Any]:
    """Return VCAMS survey context at its published Victorian Department area."""
    rows, limitations = vcams_area_context(area_name, year)
    if rows is None:
        return envelope("unavailable", {"indicators": []}, limitations=limitations,
                        notices=[AREA_LEVEL_NOTICE])
    if not rows:
        limitations = [*limitations, limitation(
            "vcams_area_context_not_found",
            "No VCAMS area indicators match the requested area and reference year.",
            "area_name", "year",
        )]
    return envelope("available" if rows else "missing", {"indicators": rows}, metadata={
        "source": "Victorian Child and Adolescent Monitoring System",
        "geographic_unit": "Victorian Department area", "area_name": area_name,
        "reference_year": year,
        "result_count": len(rows),
        "interpretation": "Broad-area context only; not an SA2 estimate.",
    }, limitations=limitations, notices=[AREA_LEVEL_NOTICE])


@app.get("/api/digital-health/vcams-lga")
def digital_health_vcams_lga(
    lga_name: str = Query(..., min_length=2, max_length=150),
) -> dict[str, Any]:
    """Return VCAMS administrative indicators without disaggregating LGA values."""
    rows, limitations = vcams_lga_context(lga_name)
    if rows is None:
        return envelope("unavailable", {"indicators": []}, limitations=limitations,
                        notices=[AREA_LEVEL_NOTICE])
    if not rows:
        limitations = [*limitations, limitation(
            "vcams_lga_context_not_found",
            "No VCAMS LGA indicators match the requested local government area.",
            "lga_name",
        )]
    return envelope("available" if rows else "missing", {"indicators": rows}, metadata={
        "source": "Victorian Child and Adolescent Monitoring System",
        "geographic_unit": "Victorian Local Government Area",
        "requested_lga_name": lga_name,
        "reference_periods": sorted({row["reference_period"] for row in rows}),
        "result_count": len(rows),
        "interpretation": "LGA context only; not an SA2 estimate.",
    }, limitations=limitations, notices=[AREA_LEVEL_NOTICE])


@app.get("/api/digital-health/facilities")
def digital_health_facilities(
    sa2_code: str = Query(..., min_length=9, max_length=9, pattern=r"^\d{9}$"),
) -> dict[str, Any]:
    """Return active directory listings located inside the requested SA2."""
    rows, limitations = health_facilities(sa2_code)
    if rows is None:
        return envelope("unavailable", {"facilities": []}, limitations=limitations,
                        notices=[AREA_LEVEL_NOTICE])
    if not rows:
        limitations = [*limitations, limitation(
            "health_facilities_not_found",
            "No active Healthdirect facility records match the requested SA2.",
            "sa2_code",
        )]
    return envelope("available" if rows else "missing", {"facilities": rows}, metadata={
        "source": "Geoscience Australia using National Health Services Directory",
        "geographic_unit": "facility point within SA2",
        "sa2_code": sa2_code,
        "source_dates": sorted({row["source_date"] for row in rows}),
        "result_count": len(rows),
        "interpretation": "Listed presence only; not capacity, availability, fees or quality.",
    }, limitations=limitations, notices=[AREA_LEVEL_NOTICE])


@app.get("/api/digital-health/child-conditions")
def digital_health_child_conditions(
    sa2_code: str = Query(..., min_length=9, max_length=9, pattern=r"^\d{9}$"),
    year: int | None = Query(None, ge=2000, le=2030),
) -> dict[str, Any]:
    """Return published ABS child long-term-condition context for an SA2."""
    rows, limitations = child_health_conditions(sa2_code, year)
    if rows is None:
        return envelope("unavailable", {"indicators": []}, limitations=limitations,
                        notices=[AREA_LEVEL_NOTICE])
    if not rows:
        limitations = [*limitations, limitation(
            "abs_child_health_not_found",
            "No ABS child health indicators match the requested SA2 and reference year.",
            "sa2_code", "year",
        )]
    return envelope("available" if rows else "missing", {"indicators": rows}, metadata={
        "source": "Australian Bureau of Statistics Census 2021 G19",
        "geographic_unit": "SA2 (ASGS Edition 3, 2021)",
        "sa2_code": sa2_code,
        "reference_year": year,
        "result_count": len(rows),
        "interpretation": "Published area-level long-term-condition context; not a diagnosis.",
    }, limitations=limitations, notices=[AREA_LEVEL_NOTICE])


@app.get("/api/digital-health/child-health-context")
def digital_health_child_health_context(
    sa2_code: str = Query(..., min_length=9, max_length=9, pattern=r"^\d{9}$"),
) -> dict[str, Any]:
    """Return exact SA2 conditions and separately labelled containing-PHA context."""
    data, limitations = child_health_context(sa2_code)
    empty = {"locality": None, "sa2_indicators": [], "pha_context": []}
    if data is None:
        return envelope("unavailable", empty, limitations=limitations, notices=[AREA_LEVEL_NOTICE])
    has_data = bool(data["sa2_indicators"] or data["pha_context"])
    return envelope("available" if has_data else "missing", data, metadata={
        "source": "ABS Census 2021 G19 and PHIDU Child Health Atlas 2026",
        "sa2_interpretation": "Observed Census responses for children aged 0–14 in the selected SA2.",
        "pha_interpretation": "Published context for the containing Population Health Area; not an SA2 estimate.",
    }, limitations=limitations, notices=[AREA_LEVEL_NOTICE])


@app.get("/api/digital-health/immunisation")
def digital_health_immunisation(
    sa2_code: str = Query(..., min_length=9, max_length=9, pattern=r"^\d{9}$"),
) -> dict[str, Any]:
    """Return containing-PHA childhood immunisation coverage and a pooled Victorian reference."""
    data, limitations = immunisation_context(sa2_code)
    empty = {"locality": None, "indicators": []}
    if data is None:
        return envelope("unavailable", empty, limitations=limitations, notices=[AREA_LEVEL_NOTICE])
    if not data["indicators"]:
        limitations = [*limitations, limitation(
            "immunisation_context_not_found",
            "No published PHIDU immunisation coverage matches the SA2's Population Health Area.",
            "sa2_code",
        )]
    return envelope("available" if data["indicators"] else "missing", data, metadata={
        "source": "PHIDU Child and Youth Social Health Atlas 2026 (Australian Immunisation Register data)",
        "geographic_unit": "Population Health Area containing the SA2",
        "victoria_method": "Sum of published PHA numerators divided by sum of denominators.",
        "target_source": "National aspirational coverage target of 95%.",
        "interpretation": "Area coverage for the containing PHA; not an SA2 estimate or a child's status.",
    }, limitations=limitations, notices=[AREA_LEVEL_NOTICE])


@app.get("/api/digital-health/nutrition")
def digital_health_nutrition(
    sa2_code: str = Query(..., min_length=9, max_length=9, pattern=r"^\d{9}$"),
) -> dict[str, Any]:
    """Return VCAMS healthy-eating context for the SA2's Department area and PHA weight estimates."""
    data, limitations = nutrition_context(sa2_code)
    empty = {"locality": None, "vcams": [], "weight": []}
    if data is None:
        return envelope("unavailable", empty, limitations=limitations, notices=[AREA_LEVEL_NOTICE])
    has_data = bool(data["vcams"] or data["weight"])
    return envelope("available" if has_data else "missing", data, metadata={
        "vcams_source": "Victorian Child and Adolescent Monitoring System, Victorian Child Health and Wellbeing Survey",
        "vcams_geographic_unit": "Victorian Department area containing the SA2 (via LGA 2023 label-point allocation)",
        "weight_source": "PHIDU Child and Youth Social Health Atlas 2026 modelled estimates",
        "weight_geographic_unit": "Population Health Area containing the SA2",
        "victoria_weight_method": "Pooled PHA counts divided by the population implied by each published rate.",
        "interpretation": "Broad-area survey and modelled context; not SA2 estimates and not a child's status.",
    }, limitations=limitations, notices=[AREA_LEVEL_NOTICE])


@app.get("/api/digital-health/prevention-context")
def digital_health_prevention_context(
    sa2_code: str = Query(..., min_length=9, max_length=9, pattern=r"^\d{9}$"),
) -> dict[str, Any]:
    """Return SA2 bushfire, transport and road context with Department-area smoke exposure."""
    data, limitations = prevention_context(sa2_code)
    if data is None:
        return envelope("unavailable", {"locality": None, "bushfire": None, "transport": None, "vcams": []},
                        limitations=limitations, notices=[AREA_LEVEL_NOTICE])
    has_data = bool(data["bushfire"] or data["transport"] or data["vcams"])
    return envelope("available" if has_data else "missing", data, metadata={
        "bushfire_source": "Designated Bushfire Prone Area, Victorian Department of Transport and Planning",
        "transport_source": "Public transport stops (current at September 2026) and historical AADT 2019",
        "geographic_unit": "SA2 (ASGS Edition 3, 2021); smoke exposure at Victorian Department area",
        "interpretation": "Place context for preparation; not a property risk rating, exposure dose or forecast.",
    }, limitations=limitations, notices=[AREA_LEVEL_NOTICE])


@app.get("/api/digital-health/seasonal-air")
def digital_health_seasonal_air(
    sa2_code: str = Query(..., min_length=9, max_length=9, pattern=r"^\d{9}$"),
) -> dict[str, Any]:
    """Return the month-by-month PM2.5 record at the nearest EPA monitor to the SA2."""
    data, limitations = seasonal_air(sa2_code)
    if data is None:
        return envelope("unavailable", {"station": None, "months": []},
                        limitations=limitations, notices=[STATION_CONTEXT_NOTICE])
    return envelope("available" if data["months"] else "missing", data, metadata={
        "source": "EPA Victoria AirWatch hourly observations 2018-2025",
        "geographic_unit": "nearest EPA monitoring station to the SA2 label point",
        "standard": "24-hour PM2.5 standard of 25 ug/m3, National Environment Protection (Ambient Air Quality) Measure",
        "interpretation": "Record of past seasons at a monitor; not exposure inside the SA2 and not a forecast.",
    }, limitations=limitations, notices=[STATION_CONTEXT_NOTICE])


@app.get("/api/digital-health/vaccination-places")
def digital_health_vaccination_places(
    sa2_code: str = Query(..., min_length=9, max_length=9, pattern=r"^\d{9}$"),
) -> dict[str, Any]:
    """Return nearby GPs, pharmacies and child health services, and the local council's immunisation service."""
    data, limitations = vaccination_places(sa2_code)
    if data is None:
        return envelope("unavailable", {"origin": None, "places": [], "council": None}, limitations=limitations)
    found = bool(data["places"]) or data["council"] is not None
    return envelope("available" if found else "missing", data, metadata={
        "source": "National Health Services Directory via Geoscience Australia, extract dated 7 March 2025; council immunisation pages listed by the Melbourne Vaccine Education Centre, retrieved 8 October 2026",
        "geographic_unit": "straight-line distance from the SA2 label point; council allocated by the SA2's 2023 LGA",
        "interpretation": "Listed presence and distance only; not travel time, opening hours, appointment availability or confirmation that a place gives a particular vaccine.",
    }, limitations=limitations)


@app.get("/api/digital-health/nearby-services")
def digital_health_nearby_services(
    sa2_code: str = Query(..., min_length=9, max_length=9, pattern=r"^\d{9}$"),
) -> dict[str, Any]:
    """Return the nearest listed facility of each official Healthdirect service type."""
    rows, limitations = nearby_services(sa2_code)
    if rows is None:
        return envelope("unavailable", {"services": []}, limitations=limitations)
    return envelope("available" if rows else "missing", {"services": rows}, metadata={
        "source": "National Health Services Directory via Geoscience Australia, extract dated 7 March 2025",
        "geographic_unit": "straight-line distance from the SA2 label point",
        "interpretation": "Listed presence and distance only; not travel time, opening hours, availability or quality.",
    }, limitations=limitations)


@app.get("/api/digital-health/compare-care")
def digital_health_compare_care(
    sa2_code: str = Query(..., min_length=9, max_length=9, pattern=r"^\d{9}$"),
) -> dict[str, Any]:
    """Nearby hospitals and Urgent Care Clinics side by side, with area Medicare cost context."""
    data, limitations = compare_care(sa2_code)
    if data is None:
        return envelope("unavailable", {"hospitals": [], "urgent_care_clinics": [], "area_cost": None},
                        limitations=limitations)
    has_data = bool(data["hospitals"] or data["urgent_care_clinics"])
    return envelope("available" if has_data else "missing", data, metadata={
        "hospital_source": "AIHW MyHospitals Data API, 2024-25 (specialised service units, ED and elective surgery)",
        "clinic_source": "Better Health Channel Urgent Care Clinics map, captured 29 September 2026",
        "cost_source": "AIHW Medicare-subsidised care across local areas, 2024-25, by SA3",
        "geographic_unit": "straight-line distance from the SA2 label point; cost is the SA3 average",
        "interpretation": "Side-by-side facts for planning a visit. Not a ranking, travel time, live wait, "
                          "fee quote or recommendation. In an emergency call 000.",
    }, limitations=limitations)


@app.get("/api/digital-health/seasonal-illness")
def digital_health_seasonal_illness() -> dict[str, Any]:
    """Month-by-month share of Victorian influenza and salmonella notifications."""
    data, limitations = seasonal_illness()
    if data is None:
        return envelope("unavailable", {"diseases": []}, limitations=limitations)
    return envelope("available" if data["diseases"] else "missing", data, metadata={
        "source": "NNDSS public datasets (Australian Centre for Disease Control), data current to May 2025",
        "geographic_unit": "Victoria",
        "interpretation": "Average of past seasons (2016-2019, 2022-2024); notifications reflect testing as well "
                          "as illness. Not a forecast and not a local figure.",
    }, limitations=limitations)


@app.get("/api/digital-health/nutrition-report")
def digital_health_nutrition_report(
    sa2_code: str = Query(..., min_length=9, max_length=9, pattern=r"^\d{9}$"),
) -> dict[str, Any]:
    """Children's nutrient targets, foods richest in them and fresh-food outlets near the SA2."""
    data, limitations = nutrition_report(sa2_code)
    if data is None:
        return envelope("unavailable", {"targets": [], "foods": [], "outlets": None, "access": None},
                        limitations=limitations)
    return envelope("available", data, metadata={
        "targets_source": "Nutrient Reference Values for Australia and New Zealand (NHMRC)",
        "foods_source": "FSANZ Australian Food Composition Database Release 3, per 100 g",
        "outlets_source": "OpenStreetMap contributors (ODbL), Overpass API 29 September 2026",
        "geographic_unit": "straight-line distance from the SA2 label point",
        "interpretation": "General guidance for healthy children. Not a diet plan; ask a GP or dietitian about "
                          "allergies, special diets or growth concerns. Outlet list may be incomplete; no prices.",
    }, limitations=limitations)


@app.get("/api/digital-health/practitioner-context")
def digital_health_practitioner_context(
    sa2_code: str = Query(..., min_length=9, max_length=9, pattern=r"^\d{9}$"),
) -> dict[str, Any]:
    """Expected vs observed developmental vulnerability (band) and GP / ECEC spatial access for an SA2."""
    data, limitations = practitioner_context(sa2_code)
    if data is None:
        return envelope("unavailable", {"sa2_code": sa2_code, "development": None, "access": None},
                        limitations=limitations)
    return envelope("available" if data.get("development") or data.get("access") else "missing", data, metadata={
        "development_source": "AEDC 2024 (children assessed in their first year of school), ABS Census 2021, SEIFA 2021",
        "model": "Priority model V2: weighted ridge regression on 10 population characteristics; expectations are "
                 "out-of-fold (leave-one-SA4-out); bands from an overdispersed funnel (Higher z >= 1.28)",
        "access_source": "Enhanced two-step floating catchment (Gaussian, 5 km) on healthdirect GP practices and "
                         "ACECQA approved places; demand from VIF2023 2026 projections",
        "geographic_unit": "AEDC reporting area (one or more SA2s) for development; SA2 for access",
        "interpretation": "An area-level shortlist for investigation by practitioners. Not a diagnosis, not a "
                          "prediction for any child, and not a judgement of services. Access uses straight-line "
                          "distance, not travel time or vacancies.",
    }, limitations=limitations)


@app.get("/api/air-quality/stations")
def station_air_quality(
    station_id: str | None = Query(None, min_length=1, max_length=50),
    year: int | None = Query(None, ge=2018, le=2025),
    pollutant: str | None = Query(None, pattern=r"^(PM2\.5|PM10|NO2|O3)$"),
    offset: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=500),
) -> dict[str, Any]:
    """Return station-year summaries without deriving area-level exposure."""
    rows, limitations = load_station_year_observations()
    if rows is None:
        return envelope("unavailable", {"observations": []}, limitations=limitations,
                        notices=[STATION_CONTEXT_NOTICE])
    selected = [row for row in rows
                if (station_id is None or row["station_id"] == station_id)
                and (year is None or row["year"] == year)
                and (pollutant is None or row["pollutant"] == pollutant)]
    total_result_count = len(selected)
    selected = selected[offset:offset + limit]
    status = "available" if selected else "missing"
    if not selected:
        limitations = [limitation(
            "page_out_of_range" if total_result_count else "station_observation_not_found",
            "The requested page is beyond the available results." if total_result_count else
            "No station observation matches the requested filters.",
            "offset" if total_result_count else "station_id",
            *("year", "pollutant") if not total_result_count else (),
        )]
    return envelope(status, {"observations": selected}, metadata={
        "source": "EPA Victoria historical hourly monitoring releases",
        "geographic_unit": "monitoring_station",
        "aggregation": "annual mean of published hourly observations",
        "result_count": len(selected),
        "total_result_count": total_result_count,
        "offset": offset,
        "limit": limit,
        "sa2_exposure_status": "not_derived",
    }, limitations=limitations, notices=[STATION_CONTEXT_NOTICE])


@app.get("/api/air-quality/station-catalog")
def air_quality_station_catalog() -> dict[str, Any]:
    """List valid station-level filter dimensions without locality interpretation."""
    rows, limitations = load_station_year_observations()
    if rows is None:
        return envelope("unavailable", {"stations": []}, limitations=limitations,
                        notices=[STATION_CONTEXT_NOTICE])
    stations = station_catalog(rows)
    return envelope("available", {"stations": stations}, metadata={
        "source": "EPA Victoria historical hourly monitoring releases",
        "geographic_unit": "monitoring_station",
        "station_identifier_count": len(stations),
        "station_name_count": len({station["station_name"] for station in stations}),
        "sa2_exposure_status": "not_derived",
    }, notices=[STATION_CONTEXT_NOTICE])


@app.get("/api/data-quality/acecqa-geocoding")
def acecqa_geocoding_quality() -> dict[str, Any]:
    """Return aggregate match QA while withholding service-level address records."""
    report, limitations = load_geocoding_quality()
    if report is None:
        return envelope("unavailable", None, limitations=limitations)
    return envelope("available", report, metadata={
        "source": "ACECQA service register matched to official Open G-NAF",
        "geographic_assignment": "ASGS Edition 3 SA2 point-in-polygon",
        "accepted_match_statuses": ["EXACT", "HIGH_CONFIDENCE"],
        "address_fields_exposed": False,
    })


@app.get("/api/priority")
def priority_shortlist() -> dict[str, Any]:
    """Return only approved Priority for Investigation results, never a ranking score."""
    results, metadata, limitations = load_priority_results()
    if results is None:
        return envelope("unavailable", [], limitations=limitations, notices=[HUMAN_DECISION_NOTICE])
    shortlist = [priority_data(result) for result in results if result["status"] == "available"]
    withheld = [result for result in results if result["status"] != "available"]
    withheld_limitations = [
        {
            **item,
            "affected_fields": list(dict.fromkeys([
                *item.get("affected_fields", []),
                result["neighbourhood"]["id"],
            ])),
        }
        for result in withheld
        for item in result["limitations"]
    ]
    if withheld:
        status = "limited" if shortlist else "unavailable"
    elif shortlist:
        status = "available"
    else:
        status = "unavailable"
        withheld_limitations = [limitation(
            "priority_results_unavailable",
            "The approved priority dataset contains no available results.",
            "priority")]
    return envelope(status, shortlist, metadata=metadata,
                    limitations=withheld_limitations, notices=[HUMAN_DECISION_NOTICE])


@app.get("/api/neighbourhoods/search")
def search_neighbourhoods(q: str = Query("", max_length=100),
                          geographic_unit: str | None = Query(None, max_length=50)) -> dict[str, Any]:
    """Search supported source boundaries by neighbourhood name or identifier."""
    features, limitations = load_boundary_features()
    if features is None:
        return envelope("unavailable", [], limitations=limitations)
    query = q.casefold().strip()
    unit = geographic_unit.casefold().strip() if geographic_unit else None
    results = [neighbourhood(feature) for feature in features
               if (not query or query in feature["properties"]["name"].casefold()
                   or query in feature["properties"]["id"].casefold())
               and (not unit or feature["properties"]["geographic_unit"].casefold() == unit)]
    return envelope("available", results,
                    metadata={"result_count": len(results), "source": "Approved boundary dataset"})


@app.get("/api/neighbourhoods/boundaries")
def visible_boundaries(bbox: str = Query(..., description="west,south,east,north in WGS 84")) -> dict[str, Any]:
    """Return source boundaries intersecting the current map view."""
    parsed_bbox = parse_bbox(bbox)
    empty_collection = {"type": "FeatureCollection", "features": []}
    if parsed_bbox is None:
        return envelope("unavailable", empty_collection, limitations=[limitation(
            "invalid_bbox", "bbox must be west,south,east,north in valid WGS 84 longitude/latitude order.", "bbox")])
    features, limitations = load_boundary_features()
    if features is None:
        return envelope("unavailable", empty_collection, limitations=limitations)
    visible_sources = [feature for feature in features if intersects_bbox(feature, parsed_bbox)]
    visible = [public_boundary_feature(feature) for feature in visible_sources]
    return envelope("available", {"type": "FeatureCollection", "features": visible}, metadata={
        "bbox": bbox, "result_count": len(visible),
        "geographic_units": sorted({feature["properties"]["geographic_unit"] for feature in visible_sources}),
        "data_quality": "Source geometry supplied without transformation",
    })


@app.get("/api/neighbourhoods/{neighbourhood_id}/profile")
def neighbourhood_profile(neighbourhood_id: str) -> dict[str, Any]:
    """Return one approved aggregate-area profile without deriving new values."""
    profiles, limitations = load_profiles()
    empty = {
        "neighbourhood": {"id": neighbourhood_id, "name": None, "geographic_unit": None},
        "domains": [],
    }
    if profiles is None:
        return envelope("unavailable", empty, limitations=limitations, notices=[AREA_LEVEL_NOTICE])
    profile = next((item for item in profiles if item["neighbourhood"]["id"] == neighbourhood_id), None)
    if profile is None:
        return envelope("missing", empty, limitations=[limitation(
            "unsupported_neighbourhood", "No supported neighbourhood profile exists for this identifier.",
            "neighbourhood_id", "profile")], notices=[AREA_LEVEL_NOTICE])
    return envelope(profile_status(profile), {
        "neighbourhood": profile["neighbourhood"],
        "domains": profile["domains"],
    }, metadata=profile_metadata(profile), limitations=profile_limitations(profile), notices=[AREA_LEVEL_NOTICE])


@app.get("/api/neighbourhoods/{neighbourhood_id}/child-development")
def neighbourhood_child_development(neighbourhood_id: str) -> dict[str, Any]:
    """Return only approved aggregate child-development indicators from the profile."""
    profiles, limitations = load_profiles()
    empty = {
        "neighbourhood": {"id": neighbourhood_id, "name": None, "geographic_unit": None},
        "indicators": [],
    }
    if profiles is None:
        return envelope("unavailable", empty, limitations=limitations,
                        notices=[AREA_LEVEL_NOTICE])
    profile = next((item for item in profiles
                    if item["neighbourhood"]["id"] == neighbourhood_id), None)
    if profile is None:
        return envelope("missing", empty, limitations=[limitation(
            "unsupported_neighbourhood",
            "No supported child-development profile exists for this identifier.",
            "neighbourhood_id", "child_development",
        )], notices=[AREA_LEVEL_NOTICE])
    domain = next((item for item in profile["domains"]
                   if item["id"] == "child-development"), None)
    if domain is None:
        return envelope("unavailable", {
            "neighbourhood": profile["neighbourhood"], "indicators": [],
        }, limitations=[limitation(
            "child_development_domain_unavailable",
            "The approved profile does not contain a child-development domain.",
            "child_development",
        )], notices=[AREA_LEVEL_NOTICE])
    indicators = domain["indicators"]
    status = aggregate_status([indicator["status"] for indicator in indicators])
    domain_limitations = [limitation(
        f"indicator_{indicator['status']}",
        f"{indicator['name']} is {indicator['status']} and no value has been created.",
        indicator["id"],
    ) for indicator in indicators if indicator["status"] != "available"]
    return envelope(status, {
        "neighbourhood": profile["neighbourhood"], "indicators": indicators,
    }, metadata={
        "sources": sorted({str(indicator["source"]) for indicator in indicators}),
        "reference_years": sorted({str(indicator["reference_year"]) for indicator in indicators}),
        "geographic_unit": profile["neighbourhood"]["geographic_unit"],
        "primary_outcome_dataset": "AEDC",
        "result_count": len(indicators),
    }, limitations=domain_limitations, notices=[AREA_LEVEL_NOTICE])


@app.get("/api/neighbourhoods/{neighbourhood_id}/early-childhood-services")
def neighbourhood_early_childhood_services(neighbourhood_id: str) -> dict[str, Any]:
    """Return address-free service context from accepted G-NAF matches."""
    rows, limitations = load_early_childhood_context()
    if rows is None:
        return envelope("unavailable", None, limitations=limitations,
                        notices=[AREA_LEVEL_NOTICE])
    result = next((row for row in rows if row["neighbourhood_id"] == neighbourhood_id), None)
    if result is None:
        return envelope("missing", None, limitations=[limitation(
            "early_childhood_context_not_found",
            "No aggregate early-childhood service context exists for this neighbourhood.",
            "neighbourhood_id",
        )], notices=[AREA_LEVEL_NOTICE])
    return envelope("available", result, metadata={
        "source": "ACECQA service register and Open G-NAF August 2026 GDA2020",
        "geographic_unit": "VKinder reporting locality",
        "match_policy": "EXACT or HIGH_CONFIDENCE within reporting scope",
        "address_fields_exposed": False,
        "interpretation": "Service availability context; not service quality or child outcome.",
    }, notices=[AREA_LEVEL_NOTICE])


@app.get("/api/neighbourhoods/{neighbourhood_id}/traffic-context")
def neighbourhood_traffic_context(neighbourhood_id: str) -> dict[str, Any]:
    """Return precomputed declared-road context without deriving exposure."""
    index, limitations = load_community_context()
    notices = [AREA_LEVEL_NOTICE, TRAFFIC_CONTEXT_NOTICE]
    if index is None:
        return envelope("unavailable", None, limitations=limitations, notices=notices)
    result = index.get(neighbourhood_id)
    if result is None:
        return envelope("missing", None, limitations=[limitation(
            "traffic_context_not_found",
            "No traffic context exists for this neighbourhood.",
            "neighbourhood_id",
        )], notices=notices)
    metrics = _context_metrics(result["traffic"])
    missing_fields = [identifier for identifier, metric in metrics.items()
                      if metric["status"] == "missing"]
    return envelope(
        "limited" if missing_fields else "available",
        {"neighbourhood": result["neighbourhood"], "metrics": metrics},
        metadata={
            **TRAFFIC_EVIDENCE,
            "metric_definitions": TRAFFIC_METRIC_DEFINITIONS,
        },
        limitations=[limitation(
            "traffic_context_missing",
            "The source contains no intersecting declared-road data; no replacement value was created.",
            *missing_fields,
        )] if missing_fields else [],
        notices=notices,
    )


@app.get("/api/neighbourhoods/{neighbourhood_id}/industrial-emissions-context")
def neighbourhood_industrial_emissions_context(neighbourhood_id: str) -> dict[str, Any]:
    """Return precomputed NPI facility context without deriving exposure or risk."""
    index, limitations = load_community_context()
    notices = [AREA_LEVEL_NOTICE, INDUSTRIAL_EMISSIONS_CONTEXT_NOTICE]
    if index is None:
        return envelope("unavailable", None, limitations=limitations, notices=notices)
    result = index.get(neighbourhood_id)
    if result is None:
        return envelope("missing", None, limitations=[limitation(
            "industrial_emissions_context_not_found",
            "No industrial-emissions context exists for this neighbourhood.",
            "neighbourhood_id",
        )], notices=notices)
    metrics = _context_metrics(result["industrial_emissions"])
    missing_fields = [identifier for identifier, metric in metrics.items()
                      if metric["status"] == "missing"]
    return envelope(
        "limited" if missing_fields else "available",
        {"neighbourhood": result["neighbourhood"], "metrics": metrics},
        metadata={
            **INDUSTRIAL_EVIDENCE,
            "metric_definitions": INDUSTRIAL_METRIC_DEFINITIONS,
        },
        limitations=[limitation(
            "industrial_emissions_context_missing",
            "One or more NPI context values are unavailable; no replacement value was created.",
            *missing_fields,
        )] if missing_fields else [],
        notices=notices,
    )


def _overview_section(response: dict[str, Any]) -> dict[str, Any]:
    """Keep each existing endpoint result self-describing inside an overview."""
    return {
        key: response[key]
        for key in ("status", "data", "metadata", "limitations")
    }


def _population_overview_section(neighbourhood_id: str) -> dict[str, Any]:
    """Return native-SA2 projections only when the locality is exactly one SA2."""
    identity_index, identity_limitations = load_community_identities()
    if identity_index is None:
        return _overview_section(envelope(
            "unavailable", {"projections": []},
            limitations=[limitation(
                "population_locality_identity_unavailable",
                "The reporting-locality identity needed to select native SA2 projections is unavailable.",
                "population_projections", "neighbourhood_id",
            ), *identity_limitations],
        ))
    identity = identity_index.get(neighbourhood_id)
    if identity is None:
        return _overview_section(envelope(
            "missing", {"projections": []}, limitations=[limitation(
                "population_locality_identity_not_found",
                "No reporting-locality identity exists for this neighbourhood.",
                "population_projections", "neighbourhood_id",
            )],
        ))
    if identity["is_merged"]:
        return _overview_section(envelope(
            "incompatible", {"projections": []}, metadata={
                "source": "Victoria in Future 2023 Release 2",
                "geographic_unit": "ASGS Edition 3 SA2",
                "reporting_locality_component_sa2_count": identity["component_sa2_count"],
            }, limitations=[limitation(
                "population_projection_incompatible_geography",
                "This reporting locality contains multiple SA2s; a single-SA2 projection was not used as a replacement for the combined locality.",
                "population_projections", "geographic_unit",
            )],
        ))

    rows, limitations = load_population_projections()
    if rows is None:
        return _overview_section(envelope(
            "unavailable", {"projections": []}, limitations=limitations))
    selected = sorted(
        (row for row in rows
         if row["sa2_code"] == neighbourhood_id and row["sex"] == "persons"),
        key=lambda row: row["projection_year"],
    )
    if not selected:
        return _overview_section(envelope(
            "missing", {"projections": []}, limitations=[limitation(
                "population_projection_not_found",
                "No persons projection exists for this locality at its native SA2 geography.",
                "population_projections", "neighbourhood_id",
            )],
        ))
    return _overview_section(envelope(
        "available", {"projections": selected}, metadata={
            "source": "Victoria in Future 2023 Release 2",
            "geographic_unit": "ASGS Edition 3 SA2",
            "value_type": "projection",
            "sex": "persons",
            "available_years": [row["projection_year"] for row in selected],
            "result_count": len(selected),
        },
    ))


@app.get("/api/neighbourhoods/{neighbourhood_id}/overview")
def neighbourhood_overview(neighbourhood_id: str) -> dict[str, Any]:
    """Aggregate existing locality evidence without deriving new values."""
    profile_response = neighbourhood_profile(neighbourhood_id)
    early_childhood_response = neighbourhood_early_childhood_services(neighbourhood_id)
    traffic_response = neighbourhood_traffic_context(neighbourhood_id)
    industrial_response = neighbourhood_industrial_emissions_context(neighbourhood_id)
    sections = {
        "profile": _overview_section(profile_response),
        "early_childhood": _overview_section(early_childhood_response),
        "traffic": _overview_section(traffic_response),
        "industrial_emissions": _overview_section(industrial_response),
        "population_outlook": _population_overview_section(neighbourhood_id),
    }
    statuses = [section["status"] for section in sections.values()]
    neighbourhood = profile_response.get("data", {}).get("neighbourhood")
    if not neighbourhood or neighbourhood.get("name") is None:
        context_data = traffic_response.get("data") or industrial_response.get("data")
        if context_data:
            neighbourhood = context_data.get("neighbourhood")
    if not neighbourhood:
        neighbourhood = {
            "id": neighbourhood_id, "name": None, "geographic_unit": None,
        }
    incomplete_sections = [
        name for name, section in sections.items()
        if section["status"] != "available"
    ]
    return envelope(
        aggregate_status(statuses),
        {"neighbourhood": neighbourhood, "sections": sections},
        metadata={
            "section_count": len(sections),
            "available_section_count": len(sections) - len(incomplete_sections),
            "geographic_unit": neighbourhood.get("geographic_unit"),
        },
        limitations=[limitation(
            "overview_sections_incomplete",
            "One or more overview sections are not fully available; no replacement values were created.",
            *incomplete_sections,
        )] if incomplete_sections else [],
        notices=[
            AREA_LEVEL_NOTICE,
            TRAFFIC_CONTEXT_NOTICE,
            INDUSTRIAL_EMISSIONS_CONTEXT_NOTICE,
        ],
    )


@app.get("/api/map/context")
def map_context() -> dict[str, Any]:
    """Return lightweight traffic and industrial context for all map localities."""
    index, limitations = load_community_context()
    notices = [
        AREA_LEVEL_NOTICE,
        TRAFFIC_CONTEXT_NOTICE,
        INDUSTRIAL_EMISSIONS_CONTEXT_NOTICE,
    ]
    if index is None:
        return envelope(
            "unavailable", {"neighbourhoods": []},
            limitations=limitations, notices=notices)

    neighbourhoods = []
    incomplete_neighbourhood_ids = []
    for result in index.values():
        traffic = _context_metrics(result["traffic"])
        industrial = _context_metrics(result["industrial_emissions"])
        traffic_status = _context_status(traffic)
        industrial_status = _context_status(industrial)
        if traffic_status != "available" or industrial_status != "available":
            incomplete_neighbourhood_ids.append(result["neighbourhood"]["id"])
        neighbourhoods.append({
            **result["neighbourhood"],
            "traffic": {"status": traffic_status, "metrics": traffic},
            "industrial_emissions": {
                "status": industrial_status,
                "metrics": industrial,
            },
        })

    return envelope(
        "limited" if incomplete_neighbourhood_ids else "available",
        {"neighbourhoods": neighbourhoods},
        metadata={
            "result_count": len(neighbourhoods),
            "join_key": "id",
            "geometry_included": False,
            "traffic": {
                **TRAFFIC_EVIDENCE,
                "metric_definitions": TRAFFIC_METRIC_DEFINITIONS,
            },
            "industrial_emissions": {
                **INDUSTRIAL_EVIDENCE,
                "metric_definitions": INDUSTRIAL_METRIC_DEFINITIONS,
            },
        },
        limitations=[limitation(
            "map_context_incomplete",
            "One or more map localities contain unavailable context values; no replacements were created.",
            *incomplete_neighbourhood_ids,
        )] if incomplete_neighbourhood_ids else [],
        notices=notices,
    )


@app.get("/api/neighbourhoods/indicators")
def neighbourhood_indicators() -> dict[str, Any]:
    """Return lightweight approved indicator values for all supported map areas."""
    profiles, limitations = load_profiles()
    empty = {"neighbourhoods": []}
    if profiles is None:
        return envelope(
            "unavailable", empty, limitations=limitations, notices=[AREA_LEVEL_NOTICE])
    if not profiles:
        return envelope("unavailable", empty, limitations=[limitation(
            "profile_inputs_unavailable",
            "The approved profile dataset contains no neighbourhood indicators.",
            "indicators")], notices=[AREA_LEVEL_NOTICE])

    collection_limitations = [
        {
            **item,
            "affected_fields": list(dict.fromkeys([
                *item.get("affected_fields", []),
                profile["neighbourhood"]["id"],
            ])),
        }
        for profile in profiles
        for item in profile_limitations(profile)
    ]
    bushfire_rows, bushfire_limitations = load_bushfire_context()
    transport_rows, transport_limitations = load_transport_context()
    bushfire_by_sa2 = {row["sa2_code"]: row for row in bushfire_rows or ()}
    transport_by_sa2 = {row["sa2_code"]: row for row in transport_rows or ()}
    neighbourhood_rows = [map_indicator_data(profile) for profile in profiles]
    for neighbourhood_row in neighbourhood_rows:
        neighbourhood_id = neighbourhood_row["id"]
        bushfire_value = bushfire_by_sa2.get(neighbourhood_id, {}).get("bushfire_prone_pct")
        traffic_value = transport_by_sa2.get(neighbourhood_id, {}).get("declared_road_traffic_intensity")
        neighbourhood_row["indicators"]["env_bushfire_prone_share_pct"] = {
            "value": bushfire_value,
            "status": "available" if bushfire_value is not None else "unavailable",
        }
        neighbourhood_row["indicators"]["env_declared_road_traffic_intensity"] = {
            "value": traffic_value,
            "status": "available" if traffic_value is not None else "unavailable",
        }
    collection_limitations.extend([*bushfire_limitations, *transport_limitations])
    if boundary_data_path() is not None:
        features, boundary_limitations = load_boundary_features()
        if features is None:
            collection_limitations.extend(boundary_limitations)
        else:
            collection_limitations.extend(profile_boundary_limitations(profiles, features))
    status = aggregate_status([profile_status(profile) for profile in profiles])
    if collection_limitations and status == "available":
        status = "limited"
    return envelope(
        status,
        {"neighbourhoods": neighbourhood_rows},
        metadata=profile_collection_metadata(profiles),
        limitations=collection_limitations,
        notices=[AREA_LEVEL_NOTICE],
    )


@app.get("/api/neighbourhoods/{neighbourhood_id}/priority")
def neighbourhood_priority(neighbourhood_id: str) -> dict[str, Any]:
    """Return the approved relative priority band or withhold an unsupported result."""
    results, metadata, limitations = load_priority_results()
    empty = {
        "label": "Priority for Investigation",
        "neighbourhood": {"id": neighbourhood_id, "name": None},
        "priority_band": None,
        "contributing_domains": [],
    }
    if results is None:
        return envelope("unavailable", empty, limitations=limitations, notices=[HUMAN_DECISION_NOTICE])
    result = next((item for item in results if item["neighbourhood"]["id"] == neighbourhood_id), None)
    if result is None:
        return envelope("missing", empty, metadata=metadata, limitations=[limitation(
            "unsupported_neighbourhood", "No approved priority result exists for this identifier.",
            "neighbourhood_id", "priority")], notices=[HUMAN_DECISION_NOTICE])
    return envelope(result["status"], priority_data(result), metadata=metadata,
                    limitations=result.get("limitations", []), notices=[HUMAN_DECISION_NOTICE])


@app.get("/api/neighbourhoods/{neighbourhood_id}/explanation")
def neighbourhood_explanation(neighbourhood_id: str) -> dict[str, Any]:
    """Return the approved explanation and its investigation leads without causal claims."""
    explanations, metadata, limitations = load_explanations()
    notices = [ASSOCIATION_NOTICE, INVESTIGATION_LEADS_NOTICE]
    empty = {
        "neighbourhood": {"id": neighbourhood_id, "name": None},
        "factor_domains": [],
        "highlighted_factor_ids": [],
        "incomplete_inputs": [],
    }
    if explanations is None:
        return envelope("unavailable", empty, limitations=limitations, notices=notices)
    explanation = next((item for item in explanations if item["neighbourhood"]["id"] == neighbourhood_id), None)
    if explanation is None:
        return envelope("missing", empty, metadata=metadata, limitations=[limitation(
            "unsupported_neighbourhood", "No approved priority explanation exists for this identifier.",
            "neighbourhood_id", "explanation")], notices=notices)
    return envelope(explanation["status"], explanation_data(explanation), metadata=metadata,
                    limitations=explanation.get("limitations", []), notices=notices)


@app.get("/api/neighbourhoods/{neighbourhood_id}/match")
def neighbourhood_match(neighbourhood_id: str) -> dict[str, Any]:
    """Return one approved comparable neighbourhood or explicitly withhold a match."""
    comparison_data, metadata, limitations = load_comparison_data()
    notices = [COMPARABLE_NOTICE, COMPARISON_AREA_NOTICE]
    empty = {
        "source_neighbourhood": {"id": neighbourhood_id, "name": None, "geographic_unit": None},
        "matched_neighbourhood": None,
        "similarity_basis": [],
        "match_strength": None,
    }
    if comparison_data is None:
        return envelope("unavailable", empty, limitations=limitations, notices=notices)
    match = next((item for item in comparison_data["matches"] if item["source_neighbourhood"]["id"] == neighbourhood_id), None)
    if match is None:
        return envelope("no_match", empty, metadata=metadata, limitations=[limitation(
            "no_approved_match", "No approved comparable neighbourhood is available for this identifier.",
            "neighbourhood_id", "match")], notices=notices)
    return envelope(match["status"], match_data(match), metadata=metadata,
                    limitations=match.get("limitations", []), notices=notices)


@app.get("/api/compare")
def manual_compare(
    neighbourhood_id_a: str | None = Query(None, min_length=1, max_length=100),
    neighbourhood_id_b: str | None = Query(None, min_length=1, max_length=100),
    neighbourhood_ids: list[str] | None = Query(None),
) -> dict[str, Any]:
    """Compare profile indicators for two to four supported neighbourhoods."""
    notices = [COMPARISON_AREA_NOTICE, MANUAL_COMPARISON_NOTICE]
    supplied_legacy = neighbourhood_id_a is not None or neighbourhood_id_b is not None
    supplied_multi = neighbourhood_ids is not None
    parsed_ids = [
        identifier.strip()
        for value in (neighbourhood_ids or [])
        for identifier in value.split(",")
        if identifier.strip()
    ]
    legacy_mode = supplied_legacy and not supplied_multi

    if supplied_legacy and supplied_multi:
        return envelope("unavailable", None, limitations=[limitation(
            "conflicting_comparison_parameters",
            "Use either neighbourhood_id_a and neighbourhood_id_b or neighbourhood_ids, not both.",
            "neighbourhood_id_a", "neighbourhood_id_b", "neighbourhood_ids",
        )], notices=notices)
    if not supplied_legacy and not supplied_multi:
        return JSONResponse(status_code=422, content=envelope(
            "unavailable", None, limitations=[limitation(
                "invalid_request",
                "One or more request parameters are invalid.",
            )], notices=notices))
    if legacy_mode and (neighbourhood_id_a is None or neighbourhood_id_b is None):
        return JSONResponse(status_code=422, content=envelope(
            "unavailable", None, limitations=[limitation(
                "incomplete_comparison_parameters",
                "Both neighbourhood_id_a and neighbourhood_id_b are required.",
                "neighbourhood_id_a", "neighbourhood_id_b",
            )], notices=notices))
    selected_ids = (
        [neighbourhood_id_a, neighbourhood_id_b]
        if legacy_mode else parsed_ids
    )
    if not legacy_mode and not 2 <= len(selected_ids) <= 4:
        return envelope("unavailable", None, limitations=[limitation(
            "invalid_comparison_count",
            "Select between two and four neighbourhoods for a comparison.",
            "neighbourhood_ids",
        )], notices=notices)
    if not legacy_mode and len(selected_ids) != len(set(selected_ids)):
        return envelope("no_match", None, limitations=[limitation(
            "duplicate_neighbourhood_selected",
            "Each selected neighbourhood must be different.",
            "neighbourhood_ids",
        )], notices=notices)

    empty = {
        "source_neighbourhood": {
            "id": neighbourhood_id_a, "name": None, "geographic_unit": None,
        },
        "comparison_neighbourhood": {
            "id": neighbourhood_id_b, "name": None, "geographic_unit": None,
        },
        "side_by_side": [], "similarity_basis": [], "match_strength": None,
    } if legacy_mode else {
        "neighbourhoods": [
            {"id": identifier, "name": None, "geographic_unit": None}
            for identifier in selected_ids
        ],
        "side_by_side": [], "similarity_basis": [], "match_strength": None,
    }
    profiles, limitations = load_profiles()
    if profiles is None:
        return envelope("unavailable", empty, limitations=limitations, notices=notices)
    profile_index = {
        profile["neighbourhood"]["id"]: profile for profile in profiles
    }
    selected_profiles = [profile_index.get(identifier) for identifier in selected_ids]
    if any(profile is None for profile in selected_profiles):
        missing_parameters = [
            ("neighbourhood_id_a", "neighbourhood_id_b")[index]
            if legacy_mode else identifier
            for index, (identifier, profile) in enumerate(zip(selected_ids, selected_profiles))
            if profile is None
        ]
        return envelope("missing", empty, limitations=[limitation(
            "unsupported_neighbourhood",
            "One or more neighbourhood identifiers do not have a supported profile.",
            *missing_parameters,
        )], notices=notices)
    selected_profiles = [profile for profile in selected_profiles if profile is not None]
    if legacy_mode and neighbourhood_id_a == neighbourhood_id_b:
        return envelope("no_match", empty, limitations=[limitation(
            "same_neighbourhood_selected",
            "Choose two different neighbourhoods for a comparison.",
            "neighbourhood_id_a", "neighbourhood_id_b",
        )], notices=notices)
    geographic_units = {
        profile["neighbourhood"]["geographic_unit"] for profile in selected_profiles
    }
    if len(geographic_units) != 1:
        return envelope("incompatible", empty, limitations=[limitation(
            "incompatible_geographic_unit",
            "The selected neighbourhood profiles use incompatible geographic units.",
            *("neighbourhood_id_a", "neighbourhood_id_b", "geographic_unit")
            if legacy_mode else ("neighbourhood_ids", "geographic_unit"),
        )], notices=notices)

    if legacy_mode:
        data = profile_comparison_data(selected_profiles[0], selected_profiles[1])
        comparison_limitations = profile_comparison_limitations(
            selected_profiles[0], selected_profiles[1])
        statuses = [
            field[status_key]
            for field in data["side_by_side"]
            for status_key in ("source_status", "comparison_status")
        ]
    else:
        data = multi_profile_comparison_data(selected_profiles)
        comparison_limitations = multi_profile_comparison_limitations(selected_profiles)
        statuses = [
            value["status"]
            for field in data["side_by_side"]
            for value in field["values"]
        ]
    return envelope(
        aggregate_status(statuses), data,
        metadata=profile_collection_metadata(selected_profiles),
        limitations=comparison_limitations,
        notices=notices,
    )


@app.get("/api/outcome-comparison")
def outcome_comparison(
    neighbourhood_id_a: str = Query(..., min_length=1, max_length=100),
    neighbourhood_id_b: str = Query(..., min_length=1, max_length=100),
) -> dict[str, Any]:
    """Return an approved E5 outcome comparison without calculating differences."""
    notices = [COMPARISON_AREA_NOTICE, ASSOCIATION_NOTICE]
    empty = {
        "neighbourhood_a": {
            "id": neighbourhood_id_a, "name": None, "geographic_unit": None,
        },
        "neighbourhood_b": {
            "id": neighbourhood_id_b, "name": None, "geographic_unit": None,
        },
        "outcome_indicators": [],
    }
    profiles, profile_load_limitations = load_profiles()
    if profiles is None:
        return envelope(
            "unavailable", empty, limitations=profile_load_limitations, notices=notices)

    profile_a = next((profile for profile in profiles
                      if profile["neighbourhood"]["id"] == neighbourhood_id_a), None)
    profile_b = next((profile for profile in profiles
                      if profile["neighbourhood"]["id"] == neighbourhood_id_b), None)
    if profile_a is None or profile_b is None:
        missing_parameters = [
            parameter
            for profile, parameter in (
                (profile_a, "neighbourhood_id_a"),
                (profile_b, "neighbourhood_id_b"),
            )
            if profile is None
        ]
        return envelope("missing", empty, limitations=[limitation(
            "unsupported_neighbourhood",
            "One or both neighbourhood identifiers do not have a supported profile.",
            *missing_parameters,
        )], notices=notices)
    if neighbourhood_id_a == neighbourhood_id_b:
        return envelope("incompatible", empty, limitations=[limitation(
            "same_neighbourhood_selected",
            "Choose two different neighbourhoods for an outcome comparison.",
            "neighbourhood_id_a", "neighbourhood_id_b",
        )], notices=notices)
    if (profile_a["neighbourhood"]["geographic_unit"]
            != profile_b["neighbourhood"]["geographic_unit"]):
        return envelope("incompatible", empty, limitations=[limitation(
            "incompatible_geographic_unit",
            "The selected neighbourhood profiles use incompatible geographic units.",
            "neighbourhood_id_a", "neighbourhood_id_b", "geographic_unit",
        )], notices=notices)

    empty["neighbourhood_a"] = profile_a["neighbourhood"]
    empty["neighbourhood_b"] = profile_b["neighbourhood"]
    comparison, metadata, data_limitations = outcome_comparison_for_pair(
        neighbourhood_id_a, neighbourhood_id_b)
    if data_limitations:
        return envelope(
            "unavailable", empty, limitations=data_limitations, notices=notices)
    if comparison is None:
        return envelope("unavailable", empty, metadata=metadata, limitations=[limitation(
            "outcome_comparison_unavailable",
            "No approved outcome-comparison result is available for the selected ordered pair.",
            "neighbourhood_id_a", "neighbourhood_id_b",
        )], notices=notices)
    if (comparison["neighbourhood_a"]["geographic_unit"]
            != profile_a["neighbourhood"]["geographic_unit"]
            or comparison["neighbourhood_b"]["geographic_unit"]
            != profile_b["neighbourhood"]["geographic_unit"]):
        return envelope("incompatible", empty, metadata=metadata, limitations=[limitation(
            "incompatible_geographic_unit",
            "The approved outcome result and selected profiles use incompatible geographic units.",
            "geographic_unit",
        )], notices=notices)
    return envelope(
        comparison["status"], outcome_comparison_data(comparison), metadata=metadata,
        limitations=comparison.get("limitations", []), notices=notices)


@app.get("/api/environmental-difference")
def environmental_difference(
    neighbourhood_id_a: str = Query(..., min_length=1, max_length=100),
    neighbourhood_id_b: str = Query(..., min_length=1, max_length=100),
) -> dict[str, Any]:
    """Return approved E6 environmental differences without calculating them."""
    notices = [COMPARISON_AREA_NOTICE, ASSOCIATION_NOTICE]
    empty = {
        "neighbourhood_a": {
            "id": neighbourhood_id_a, "name": None, "geographic_unit": None,
        },
        "neighbourhood_b": {
            "id": neighbourhood_id_b, "name": None, "geographic_unit": None,
        },
        "environmental_indicators": [],
        "approved_standout_indicator_ids": [],
    }
    profiles, profile_load_limitations = load_profiles()
    if profiles is None:
        return envelope(
            "unavailable", empty, limitations=profile_load_limitations, notices=notices)

    profile_a = next((profile for profile in profiles
                      if profile["neighbourhood"]["id"] == neighbourhood_id_a), None)
    profile_b = next((profile for profile in profiles
                      if profile["neighbourhood"]["id"] == neighbourhood_id_b), None)
    if profile_a is None or profile_b is None:
        missing_parameters = [
            parameter
            for profile, parameter in (
                (profile_a, "neighbourhood_id_a"),
                (profile_b, "neighbourhood_id_b"),
            )
            if profile is None
        ]
        return envelope("missing", empty, limitations=[limitation(
            "unsupported_neighbourhood",
            "One or both neighbourhood identifiers do not have a supported profile.",
            *missing_parameters,
        )], notices=notices)
    if neighbourhood_id_a == neighbourhood_id_b:
        return envelope("incompatible", empty, limitations=[limitation(
            "same_neighbourhood_selected",
            "Choose two different neighbourhoods for an environmental comparison.",
            "neighbourhood_id_a", "neighbourhood_id_b",
        )], notices=notices)
    if (profile_a["neighbourhood"]["geographic_unit"]
            != profile_b["neighbourhood"]["geographic_unit"]):
        return envelope("incompatible", empty, limitations=[limitation(
            "incompatible_geographic_unit",
            "The selected neighbourhood profiles use incompatible geographic units.",
            "neighbourhood_id_a", "neighbourhood_id_b", "geographic_unit",
        )], notices=notices)

    empty["neighbourhood_a"] = profile_a["neighbourhood"]
    empty["neighbourhood_b"] = profile_b["neighbourhood"]
    result, metadata, data_limitations = environmental_difference_for_pair(
        neighbourhood_id_a, neighbourhood_id_b)
    if data_limitations:
        return envelope(
            "unavailable", empty, limitations=data_limitations, notices=notices)
    if result is None:
        return envelope("unavailable", empty, metadata=metadata, limitations=[limitation(
            "environmental_difference_unavailable",
            "No approved environmental-difference result is available for the selected ordered pair.",
            "neighbourhood_id_a", "neighbourhood_id_b",
        )], notices=notices)
    if (result["neighbourhood_a"]["geographic_unit"]
            != profile_a["neighbourhood"]["geographic_unit"]
            or result["neighbourhood_b"]["geographic_unit"]
            != profile_b["neighbourhood"]["geographic_unit"]):
        return envelope("incompatible", empty, metadata=metadata, limitations=[limitation(
            "incompatible_geographic_unit",
            "The approved environmental result and selected profiles use incompatible geographic units.",
            "geographic_unit",
        )], notices=notices)
    return envelope(
        result["status"], environmental_difference_data(result), metadata=metadata,
        limitations=result.get("limitations", []), notices=notices)


@app.get("/api/pattern-insight")
def pattern_insight(
    neighbourhood_id_a: str = Query(..., min_length=1, max_length=100),
    neighbourhood_id_b: str = Query(..., min_length=1, max_length=100),
) -> dict[str, Any]:
    """Return approved E7 pattern insights without detecting or explaining them."""
    notices = [ASSOCIATION_NOTICE, INVESTIGATION_LEADS_NOTICE]
    empty = {
        "neighbourhood_a": {
            "id": neighbourhood_id_a, "name": None, "geographic_unit": None,
        },
        "neighbourhood_b": {
            "id": neighbourhood_id_b, "name": None, "geographic_unit": None,
        },
        "patterns": [],
        "supporting_outcome_indicators": [],
        "supporting_environmental_indicators": [],
    }
    profiles, profile_load_limitations = load_profiles()
    if profiles is None:
        return envelope(
            "unavailable", empty, limitations=profile_load_limitations, notices=notices)

    profile_a = next((profile for profile in profiles
                      if profile["neighbourhood"]["id"] == neighbourhood_id_a), None)
    profile_b = next((profile for profile in profiles
                      if profile["neighbourhood"]["id"] == neighbourhood_id_b), None)
    if profile_a is None or profile_b is None:
        missing_parameters = [
            parameter
            for profile, parameter in (
                (profile_a, "neighbourhood_id_a"),
                (profile_b, "neighbourhood_id_b"),
            )
            if profile is None
        ]
        return envelope("missing", empty, limitations=[limitation(
            "unsupported_neighbourhood",
            "One or both neighbourhood identifiers do not have a supported profile.",
            *missing_parameters,
        )], notices=notices)
    if neighbourhood_id_a == neighbourhood_id_b:
        return envelope("incompatible", empty, limitations=[limitation(
            "same_neighbourhood_selected",
            "Choose two different neighbourhoods for a pattern insight.",
            "neighbourhood_id_a", "neighbourhood_id_b",
        )], notices=notices)
    if (profile_a["neighbourhood"]["geographic_unit"]
            != profile_b["neighbourhood"]["geographic_unit"]):
        return envelope("incompatible", empty, limitations=[limitation(
            "incompatible_geographic_unit",
            "The selected neighbourhood profiles use incompatible geographic units.",
            "neighbourhood_id_a", "neighbourhood_id_b", "geographic_unit",
        )], notices=notices)

    empty["neighbourhood_a"] = profile_a["neighbourhood"]
    empty["neighbourhood_b"] = profile_b["neighbourhood"]
    insights, metadata, data_limitations = load_pattern_insights()
    if insights is None:
        return envelope(
            "unavailable", empty, limitations=data_limitations, notices=notices)
    insight = next((item for item in insights
                    if item["neighbourhood_a"]["id"] == neighbourhood_id_a
                    and item["neighbourhood_b"]["id"] == neighbourhood_id_b), None)
    if insight is None:
        return envelope("unavailable", empty, metadata=metadata, limitations=[limitation(
            "pattern_insight_unavailable",
            "No approved pattern insight is available for the selected ordered pair.",
            "neighbourhood_id_a", "neighbourhood_id_b",
        )], notices=notices)
    if (insight["neighbourhood_a"]["geographic_unit"]
            != profile_a["neighbourhood"]["geographic_unit"]
            or insight["neighbourhood_b"]["geographic_unit"]
            != profile_b["neighbourhood"]["geographic_unit"]):
        return envelope("incompatible", empty, metadata=metadata, limitations=[limitation(
            "incompatible_geographic_unit",
            "The approved pattern insight and selected profiles use incompatible geographic units.",
            "geographic_unit",
        )], notices=notices)
    return envelope(
        insight["status"], pattern_insight_data(insight), metadata=metadata,
        limitations=insight.get("limitations", []), notices=notices)


@app.get("/api/prevention-opportunity")
def prevention_opportunity(
    neighbourhood_id_a: str = Query(..., min_length=1, max_length=100),
    neighbourhood_id_b: str = Query(..., min_length=1, max_length=100),
) -> dict[str, Any]:
    """Return approved E8 opportunities without deciding or recommending them."""
    notices = [ASSOCIATION_NOTICE, INVESTIGATION_LEADS_NOTICE, HUMAN_DECISION_NOTICE]
    empty = {
        "neighbourhood_a": {
            "id": neighbourhood_id_a, "name": None, "geographic_unit": None,
        },
        "neighbourhood_b": {
            "id": neighbourhood_id_b, "name": None, "geographic_unit": None,
        },
        "opportunities": [],
        "supporting_outcome_indicators": [],
        "supporting_environmental_indicators": [],
        "related_patterns": [],
    }
    profiles, profile_load_limitations = load_profiles()
    if profiles is None:
        return envelope(
            "unavailable", empty, limitations=profile_load_limitations, notices=notices)

    profile_a = next((profile for profile in profiles
                      if profile["neighbourhood"]["id"] == neighbourhood_id_a), None)
    profile_b = next((profile for profile in profiles
                      if profile["neighbourhood"]["id"] == neighbourhood_id_b), None)
    if profile_a is None or profile_b is None:
        missing_parameters = [
            parameter
            for profile, parameter in (
                (profile_a, "neighbourhood_id_a"),
                (profile_b, "neighbourhood_id_b"),
            )
            if profile is None
        ]
        return envelope("missing", empty, limitations=[limitation(
            "unsupported_neighbourhood",
            "One or both neighbourhood identifiers do not have a supported profile.",
            *missing_parameters,
        )], notices=notices)
    if neighbourhood_id_a == neighbourhood_id_b:
        return envelope("incompatible", empty, limitations=[limitation(
            "same_neighbourhood_selected",
            "Choose two different neighbourhoods for a prevention opportunity.",
            "neighbourhood_id_a", "neighbourhood_id_b",
        )], notices=notices)
    if (profile_a["neighbourhood"]["geographic_unit"]
            != profile_b["neighbourhood"]["geographic_unit"]):
        return envelope("incompatible", empty, limitations=[limitation(
            "incompatible_geographic_unit",
            "The selected neighbourhood profiles use incompatible geographic units.",
            "neighbourhood_id_a", "neighbourhood_id_b", "geographic_unit",
        )], notices=notices)

    empty["neighbourhood_a"] = profile_a["neighbourhood"]
    empty["neighbourhood_b"] = profile_b["neighbourhood"]
    results, metadata, data_limitations = load_prevention_opportunities()
    if results is None:
        return envelope(
            "unavailable", empty, limitations=data_limitations, notices=notices)
    result = next((item for item in results
                   if item["neighbourhood_a"]["id"] == neighbourhood_id_a
                   and item["neighbourhood_b"]["id"] == neighbourhood_id_b), None)
    if result is None:
        return envelope("unavailable", empty, metadata=metadata, limitations=[limitation(
            "prevention_opportunity_unavailable",
            "No approved prevention opportunity is available for the selected ordered pair.",
            "neighbourhood_id_a", "neighbourhood_id_b",
        )], notices=notices)
    if (result["neighbourhood_a"]["geographic_unit"]
            != profile_a["neighbourhood"]["geographic_unit"]
            or result["neighbourhood_b"]["geographic_unit"]
            != profile_b["neighbourhood"]["geographic_unit"]):
        return envelope("incompatible", empty, metadata=metadata, limitations=[limitation(
            "incompatible_geographic_unit",
            "The approved prevention result and selected profiles use incompatible geographic units.",
            "geographic_unit",
        )], notices=notices)
    return envelope(
        result["status"], prevention_opportunity_data(result), metadata=metadata,
        limitations=result.get("limitations", []), notices=notices)


@app.get("/api/neighbourhoods/{neighbourhood_id}/boundary")
def neighbourhood_boundary(neighbourhood_id: str) -> dict[str, Any]:
    """Return one source-supported neighbourhood boundary by confirmed identifier."""
    features, limitations = load_boundary_features()
    empty = {"neighbourhood": {"id": neighbourhood_id, "name": None, "geographic_unit": None}, "geometry": None}
    if features is None:
        return envelope("unavailable", empty, limitations=limitations)
    feature = next((item for item in features if item["properties"]["id"] == neighbourhood_id), None)
    if feature is None:
        return envelope("missing", empty, limitations=[limitation(
            "unsupported_neighbourhood", "No supported neighbourhood boundary exists for this identifier.",
            "neighbourhood_id", "geometry")])
    return envelope("available", {"neighbourhood": neighbourhood(feature),
                                  "geometry": public_boundary_geometry(feature)},
                    metadata=feature_metadata(feature))


@app.get("/api/localities/suitable")
def locality_suitability(
    criteria: str = Query("development_on_track,tree_canopy", description="comma-separated evidence factors"),
    limit: int = Query(10, ge=1, le=20),
) -> dict[str, Any]:
    """Return a locality ranking already calculated by the Data Science pipeline."""
    rankings, metadata, limitations = load_suitability_rankings()
    if rankings is None:
        return envelope("unavailable", {"localities": [], "criteria": [], "limit": limit}, limitations=limitations)

    valid_criteria = {
        "development_on_track",
        "lower_developmental_vulnerability",
        "physical_health_on_track",
        "social_competence_on_track",
        "emotional_maturity_on_track",
        "language_cognitive_on_track",
        "communication_knowledge_on_track",
        "tree_canopy",
        "public_open_space",
        "lower_urban_heat",
        "socioeconomic_resources",
        "general_practice_access",
        "hospital_access",
        "pharmacy_access",
        "lower_industrial_emission_source_presence",
        "lower_declared_road_traffic",
        "public_transport_availability",
        "lower_bushfire_prone_share",
        "approved_early_childhood_places",
        "long_day_care_availability",
        "kindergarten_availability",
        "primary_school_campus_availability",
        "child_development",
        "green_space",
        "low_disadvantage",
        "low_heat",
        "service_access",
        "future_demand",
        "environment_quality",
    }
    selected_criteria = [
        item.strip()
        for item in criteria.split(",")
        if item.strip()
    ]
    invalid_criteria = [
        item for item in selected_criteria if item not in valid_criteria
    ]
    selected_criteria = list(dict.fromkeys(selected_criteria))
    if invalid_criteria:
        return envelope(
            "unavailable",
            {"localities": [], "criteria": selected_criteria, "limit": limit,
             "withheld_count": 0},
            limitations=[limitation(
                "unsupported_suitability_criteria",
                "One or more suitability criteria are unsupported.",
                "criteria",
            )],
        )
    if not selected_criteria:
        return envelope(
            "unavailable",
            {"localities": [], "criteria": [], "limit": limit,
             "withheld_count": 0},
            limitations=[limitation(
                "suitability_criteria_required",
                "Select at least one suitability criterion.",
                "criteria",
            )],
        )

    available = []
    withheld_count = 0
    for locality in rankings:
        values = [locality["scores"].get(item) for item in selected_criteria]
        if any(value is None for value in values):
            withheld_count += 1
            continue
        available.append({
            "id": locality["id"],
            "name": locality["name"],
            "geographic_unit": locality["geographic_unit"],
            "score": round(sum(values) / len(values), 2),
            "status": "available",
            "criteria": selected_criteria,
            "measures": {
                item: locality.get("measures", {}).get(item) for item in selected_criteria
            },
            "criterion_scores": {
                item: locality["scores"].get(item) for item in selected_criteria
            },
            "limitations": [],
        })
    ranked = sorted(available, key=lambda item: item["score"], reverse=True)[:limit]
    response_limitations = []
    if withheld_count:
        response_limitations.append(limitation(
            "suitability_results_withheld",
            f"{withheld_count} localities were excluded because selected inputs were unavailable.",
            "localities",
        ))
    response_status = "limited" if withheld_count else "available"
    if not ranked:
        response_status = "unavailable"
    return envelope(
        response_status,
        {"localities": ranked, "criteria": selected_criteria, "limit": limit,
         "withheld_count": withheld_count},
        metadata={**(metadata or {}), "result_count": len(ranked)},
        limitations=response_limitations,
        notices=[AREA_LEVEL_NOTICE],
    )


FAMILY_FIT_NOTICE = {
    "code": "family_fit_comparative_index",
    "message": "The match score is a comparative index across Greater Melbourne areas, not a probability or a rating of any home, school or service. It does not confirm childcare vacancies or GP appointments.",
}
FAMILY_FIT_SOURCE = ("AEDC 2015 and 2024; Cooling and Greening Melbourne 2018; VPA open space; DTP traffic 2019; "
                     "PTV stops 2026; NPI 2024-25; Victorian school locations 2025; ACECQA 2026; "
                     "National Health Services Directory 2025; VIF2023; ABS ASGS Edition 3")
FAMILY_FIT_AREA_PATTERN = r"^\d{9}(_\d{9})*$"


@app.get("/api/family-fit/setup")
def family_fit_setup() -> dict[str, Any]:
    """Needs, scoring rules and the list of areas a family can search near."""
    rules, limitations = family_fit_rules()
    if rules is None:
        return envelope("unavailable", {"needs": [], "places": []}, limitations=limitations)
    places, _ = family_fit_places()
    return envelope("available", {**rules, "places": places}, metadata={"source": FAMILY_FIT_SOURCE},
                    notices=[FAMILY_FIT_NOTICE, AREA_LEVEL_NOTICE])


@app.get("/api/family-fit/search")
def family_fit_search_endpoint(
    anchor: str = Query(..., max_length=80, pattern=FAMILY_FIT_AREA_PATTERN),
    radius_km: int = Query(15),
    priorities: str = Query("", max_length=400),
    limit: int = Query(10, ge=1, le=30),
) -> dict[str, Any]:
    """Rank Greater Melbourne areas for a family's priorities near one area."""
    source, limitations = load_family_fit()
    if source is None:
        return envelope("unavailable", {"results": []}, limitations=limitations)
    if radius_km not in FAMILY_FIT_RADII:
        return JSONResponse(status_code=422, content=envelope("unavailable", None, limitations=[limitation(
            "invalid_radius", f"radius_km must be one of {list(FAMILY_FIT_RADII)}.", "radius_km")]))
    try:
        chosen = parse_family_fit_priorities(priorities, {n["id"] for n in source["needs"]})
    except ValueError:
        return JSONResponse(status_code=422, content=envelope("unavailable", None, limitations=[limitation(
            "invalid_priorities", "Priorities must be need:prefer or need:essential, each need once.", "priorities")]))
    data, limitations = family_fit_search(anchor, radius_km, chosen, limit)
    if data is None:
        return envelope("unavailable", {"results": []}, limitations=limitations)
    if data.get("error") == "unknown_anchor":
        return JSONResponse(status_code=404, content=envelope("unavailable", None, limitations=[limitation(
            "unknown_area", "We could not find that suburb. Choose another one from the list.", "anchor")]))
    status = "available" if data["results"] else "missing"
    if chosen and data["counts"]["data_unavailable"]:
        limitations = limitations + [limitation(
            "family_fit_data_unavailable",
            f"{data['counts']['data_unavailable']} area(s) within the distance lack data for a chosen priority and are left out.",
            "results")]
    return envelope(status, data, metadata={
        "source": FAMILY_FIT_SOURCE, "model_version": source["metadata"]["model_version"],
        "built_utc": source["metadata"]["built_utc"],
        "geographic_unit": "AEDC reporting area; straight-line distance between area reference points",
        "interpretation": "Comparative index. Essential means at or above the Greater Melbourne median for that priority.",
    }, limitations=limitations, notices=[FAMILY_FIT_NOTICE, AREA_LEVEL_NOTICE])


@app.get("/api/family-fit/areas/{area_id}")
def family_fit_area(area_id: str = FastAPIPath(..., max_length=80, pattern=FAMILY_FIT_AREA_PATTERN)) -> dict[str, Any]:
    """Every priority and measure for one area, with what each does not confirm."""
    data, limitations = family_fit_area_detail(area_id)
    if data is None:
        return envelope("unavailable", None, limitations=limitations)
    if data.get("error") == "unknown_area":
        return JSONResponse(status_code=404, content=envelope("unavailable", None, limitations=[limitation(
            "unknown_area", "We could not find that area. It may have been removed in a data update.", "area_id")]))
    return envelope("available", data, metadata={"source": FAMILY_FIT_SOURCE},
                    notices=[FAMILY_FIT_NOTICE, AREA_LEVEL_NOTICE])


@app.get("/api/family-fit/shapes")
def family_fit_shapes() -> dict[str, Any]:
    """Simplified area outlines for the overview map."""
    data, limitations = load_family_fit_shapes()
    if data is None:
        return envelope("unavailable", {"areas": {}}, limitations=limitations)
    return envelope("available", {"areas": data}, metadata={
        "source": "ABS ASGS Edition 3 SA2 boundaries dissolved to AEDC reporting areas; simplified for display"})


handler = Mangum(app, lifespan="off")
