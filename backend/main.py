"""KinderPrint FastAPI application and versioned service routes."""

import logging
import time
from typing import Any

from fastapi import FastAPI, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from mangum import Mangum

from data_loader import boundary_data_path
from data_readiness import runtime_data_readiness
from dataset_status import dataset_statuses
from early_childhood import load_early_childhood_context
from air_quality import load_station_year_observations, station_catalog
from geography import (
    feature_metadata,
    intersects_bbox,
    load_boundary_features,
    neighbourhood,
    parse_bbox,
    public_boundary_feature,
    public_boundary_geometry,
)
from geocoding_quality import load_geocoding_quality
from population import load_population_projections
from responses import (
    AREA_LEVEL_NOTICE, ASSOCIATION_NOTICE, COMPARABLE_NOTICE, COMPARISON_AREA_NOTICE,
    HUMAN_DECISION_NOTICE, INVESTIGATION_LEADS_NOTICE, STATION_CONTEXT_NOTICE,
    envelope, limitation,
)
from validation import (
    aggregate_status, environmental_difference_data, explanation_data,
    load_comparison_data, load_environmental_differences, load_explanations,
    load_outcome_comparisons, load_pattern_insights, load_prevention_opportunities,
    load_priority_results, load_profiles, load_suitability_rankings,
    map_indicator_data, match_data,
    outcome_comparison_data, pattern_insight_data, prevention_opportunity_data,
    priority_data, profile_boundary_limitations, profile_collection_metadata,
    profile_comparison_data, profile_comparison_limitations, profile_limitations,
    profile_metadata, profile_status,
)

app = FastAPI(title="KinderPrint API", version="0.3.0")
app.add_middleware(GZipMiddleware, minimum_size=1000)
logger = logging.getLogger("kinderprint.api")


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
        "geographic_unit": "KinderPrint reporting locality",
        "match_policy": "EXACT or HIGH_CONFIDENCE within reporting scope",
        "address_fields_exposed": False,
        "interpretation": "Service availability context; not service quality or child outcome.",
    }, notices=[AREA_LEVEL_NOTICE])


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
        {"neighbourhoods": [map_indicator_data(profile) for profile in profiles]},
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
    neighbourhood_id_a: str = Query(..., min_length=1, max_length=100),
    neighbourhood_id_b: str = Query(..., min_length=1, max_length=100),
) -> dict[str, Any]:
    """Compare profile indicators for any two supported neighbourhoods."""
    notices = [COMPARABLE_NOTICE, COMPARISON_AREA_NOTICE]
    empty = {
        "source_neighbourhood": {"id": neighbourhood_id_a, "name": None, "geographic_unit": None},
        "comparison_neighbourhood": {"id": neighbourhood_id_b, "name": None, "geographic_unit": None},
        "side_by_side": [], "similarity_basis": [], "match_strength": None,
    }
    profiles, limitations = load_profiles()
    if profiles is None:
        return envelope("unavailable", empty, limitations=limitations, notices=notices)
    source_profile = next((profile for profile in profiles
                           if profile["neighbourhood"]["id"] == neighbourhood_id_a), None)
    comparison_profile = next((profile for profile in profiles
                               if profile["neighbourhood"]["id"] == neighbourhood_id_b), None)
    if source_profile is None or comparison_profile is None:
        missing_parameters = [
            parameter
            for profile, parameter in (
                (source_profile, "neighbourhood_id_a"),
                (comparison_profile, "neighbourhood_id_b"),
            )
            if profile is None
        ]
        return envelope("missing", empty, limitations=[limitation(
            "unsupported_neighbourhood",
            "One or both neighbourhood identifiers do not have a supported profile.",
            *missing_parameters,
        )], notices=notices)
    if neighbourhood_id_a == neighbourhood_id_b:
        return envelope("no_match", empty, limitations=[limitation(
            "same_neighbourhood_selected", "Choose two different neighbourhoods for a comparison.",
            "neighbourhood_id_a", "neighbourhood_id_b")], notices=notices)
    if (source_profile["neighbourhood"]["geographic_unit"]
            != comparison_profile["neighbourhood"]["geographic_unit"]):
        return envelope("incompatible", empty, limitations=[limitation(
            "incompatible_geographic_unit",
            "The selected neighbourhood profiles use incompatible geographic units.",
            "neighbourhood_id_a", "neighbourhood_id_b", "geographic_unit",
        )], notices=notices)

    data = profile_comparison_data(source_profile, comparison_profile)
    comparison_limitations = profile_comparison_limitations(source_profile, comparison_profile)
    statuses = [
        field[status_key]
        for field in data["side_by_side"]
        for status_key in ("source_status", "comparison_status")
    ]
    return envelope(
        aggregate_status(statuses), data,
        metadata=profile_collection_metadata([source_profile, comparison_profile]),
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
    comparisons, metadata, data_limitations = load_outcome_comparisons()
    if comparisons is None:
        return envelope(
            "unavailable", empty, limitations=data_limitations, notices=notices)
    comparison = next((item for item in comparisons
                       if item["neighbourhood_a"]["id"] == neighbourhood_id_a
                       and item["neighbourhood_b"]["id"] == neighbourhood_id_b), None)
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
    differences, metadata, data_limitations = load_environmental_differences()
    if differences is None:
        return envelope(
            "unavailable", empty, limitations=data_limitations, notices=notices)
    result = next((item for item in differences
                   if item["neighbourhood_a"]["id"] == neighbourhood_id_a
                   and item["neighbourhood_b"]["id"] == neighbourhood_id_b), None)
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
    criteria: str = Query("child_development,green_space,low_disadvantage", description="comma-separated priority factors"),
    limit: int = Query(10, ge=1, le=20),
) -> dict[str, Any]:
    """Return a locality ranking already calculated by the Data Science pipeline."""
    rankings, metadata, limitations = load_suitability_rankings()
    if rankings is None:
        return envelope("unavailable", {"localities": [], "criteria": [], "limit": limit}, limitations=limitations)

    valid_criteria = {
        "child_development",
        "green_space",
        "low_disadvantage",
        "low_heat",
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

    selected_set = set(selected_criteria)
    ranking = next((
        item for item in rankings if set(item["criteria"]) == selected_set
    ), None)
    if ranking is None:
        return envelope(
            "unavailable",
            {"localities": [], "criteria": selected_criteria, "limit": limit},
            limitations=[limitation(
                "suitability_result_unavailable",
                "No precomputed suitability result exists for the selected criteria.",
                "criteria",
            )],
        )

    available = [
        item for item in ranking["localities"] if item["status"] == "available"
    ]
    withheld_count = len(ranking["localities"]) - len(available)
    ranked = available[:limit]
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


handler = Mangum(app, lifespan="off")
