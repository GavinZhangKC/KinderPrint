"""KinderPrint FastAPI application and Iteration 1 routes."""

import logging
import time
from typing import Any

from fastapi import FastAPI, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from geography import (
    feature_metadata,
    intersects_bbox,
    load_boundary_features,
    neighbourhood,
    parse_bbox,
    public_boundary_feature,
)
from responses import (
    AREA_LEVEL_NOTICE, ASSOCIATION_NOTICE, COMPARABLE_NOTICE, COMPARISON_AREA_NOTICE,
    HUMAN_DECISION_NOTICE, INVESTIGATION_LEADS_NOTICE, envelope, limitation,
)
from validation import (
    explanation_data, load_comparison_data, load_explanations, load_priority_results,
    load_profiles, manual_comparison_data, match_data, priority_data,
    profile_limitations, profile_metadata, profile_status,
)

app = FastAPI(title="KinderPrint API", version="0.1.0")
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
    """Return an approved side-by-side comparison in the selected order."""
    notices = [COMPARABLE_NOTICE, COMPARISON_AREA_NOTICE]
    if neighbourhood_id_a == neighbourhood_id_b:
        return envelope("no_match", {
            "source_neighbourhood": {"id": neighbourhood_id_a, "name": None, "geographic_unit": None},
            "comparison_neighbourhood": {"id": neighbourhood_id_b, "name": None, "geographic_unit": None},
            "side_by_side": [], "similarity_basis": [], "match_strength": None,
        }, limitations=[limitation(
            "same_neighbourhood_selected", "Choose two different neighbourhoods for a comparison.",
            "neighbourhood_id_a", "neighbourhood_id_b")], notices=notices)
    comparison_data, metadata, limitations = load_comparison_data()
    empty = {
        "source_neighbourhood": {"id": neighbourhood_id_a, "name": None, "geographic_unit": None},
        "comparison_neighbourhood": {"id": neighbourhood_id_b, "name": None, "geographic_unit": None},
        "side_by_side": [], "similarity_basis": [], "match_strength": None,
    }
    if comparison_data is None:
        return envelope("unavailable", empty, limitations=limitations, notices=notices)
    comparison = next((item for item in comparison_data["comparisons"]
                       if item["source_neighbourhood"]["id"] == neighbourhood_id_a
                       and item["comparison_neighbourhood"]["id"] == neighbourhood_id_b), None)
    reverse = False
    if comparison is None:
        comparison = next((item for item in comparison_data["comparisons"]
                           if item["source_neighbourhood"]["id"] == neighbourhood_id_b
                           and item["comparison_neighbourhood"]["id"] == neighbourhood_id_a), None)
        reverse = comparison is not None
    if comparison is None:
        return envelope("no_match", empty, metadata=metadata, limitations=[limitation(
            "no_approved_comparison", "No approved side-by-side comparison is available for these neighbourhoods.",
            "neighbourhood_id_a", "neighbourhood_id_b")], notices=notices)
    return envelope(comparison["status"], manual_comparison_data(comparison, reverse), metadata=metadata,
                    limitations=comparison.get("limitations", []), notices=notices)


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
    return envelope("available", {"neighbourhood": neighbourhood(feature), "geometry": feature["geometry"]},
                    metadata=feature_metadata(feature))
