"""KinderPrint API services for approved neighbourhood evidence and geography."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Query

app = FastAPI(title="KinderPrint API", version="0.1.0")

BOUNDARY_DATA_PATH_ENV = "KINDERPRINT_BOUNDARY_DATA_PATH"
PROFILE_DATA_PATH_ENV = "KINDERPRINT_PROFILE_DATA_PATH"
PRIORITY_DATA_PATH_ENV = "KINDERPRINT_PRIORITY_DATA_PATH"
DEFAULT_BOUNDARY_VERSION = "Not supplied"
AREA_LEVEL_NOTICE = {
    "code": "area_level_information",
    "message": "This is aggregate area-level information and is not an assessment of an individual child.",
}
INDICATOR_STATUSES = {"available", "missing", "incompatible", "unavailable", "limited"}
PRIORITY_DOMAINS = {"Child Development", "Social", "Environment"}
HUMAN_DECISION_NOTICE = {
    "code": "human_decision",
    "message": "The system does not make the final investigation or resource-allocation decision; people do.",
}


def envelope(status: str, data: Any, *, metadata: dict[str, Any] | None = None,
             limitations: list[dict[str, Any]] | None = None,
             notices: list[dict[str, str]] | None = None) -> dict[str, Any]:
    """Return the shared Iteration 1 response envelope."""
    return {"status": status, "data": data, "metadata": metadata or {},
            "limitations": limitations or [], "notices": notices or []}


def limitation(code: str, message: str, *affected_fields: str) -> dict[str, Any]:
    return {"code": code, "message": message, "affected_fields": list(affected_fields)}


def boundary_data_path() -> Path | None:
    value = os.getenv(BOUNDARY_DATA_PATH_ENV)
    return Path(value).expanduser() if value else None


def profile_data_path() -> Path | None:
    value = os.getenv(PROFILE_DATA_PATH_ENV)
    return Path(value).expanduser() if value else None


def priority_data_path() -> Path | None:
    value = os.getenv(PRIORITY_DATA_PATH_ENV)
    return Path(value).expanduser() if value else None


def load_json_source(path: Path | None, env_name: str, resource_name: str) -> tuple[dict[str, Any] | None, list[dict[str, Any]]]:
    """Load an approved JSON source, reporting configuration errors in-band."""
    if path is None:
        return None, [limitation(
            f"{resource_name}_dataset_not_configured",
            f"No {resource_name} dataset is configured. Set {env_name} to an approved JSON file.",
            resource_name)]
    if not path.is_file():
        return None, [limitation(
            f"{resource_name}_dataset_unavailable",
            f"The configured {resource_name} dataset could not be found.", resource_name)]
    try:
        source = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None, [limitation(
            f"{resource_name}_dataset_unreadable",
            f"The configured {resource_name} dataset could not be read as valid JSON.", resource_name)]
    if not isinstance(source, dict):
        return None, [limitation(
            f"{resource_name}_dataset_invalid",
            f"The configured {resource_name} dataset must contain a JSON object.", resource_name)]
    return source, []


def valid_indicator(indicator: Any, profile_unit: str) -> bool:
    """Accept only source-supplied indicators with explicit provenance and status."""
    if not isinstance(indicator, dict) or indicator.get("status") not in INDICATOR_STATUSES:
        return False
    required_text = ("id", "name", "source", "geographic_unit", "reference_year")
    if not all(isinstance(indicator.get(field), (str, int)) and str(indicator[field]).strip()
               for field in required_text):
        return False
    if indicator["status"] != "available" and indicator.get("value") is not None:
        return False
    return indicator["status"] != "available" or indicator["geographic_unit"] == profile_unit


def valid_profile(profile: Any) -> bool:
    if not isinstance(profile, dict):
        return False
    area, domains = profile.get("neighbourhood"), profile.get("domains")
    if not isinstance(area, dict) or not isinstance(domains, list):
        return False
    if not all(isinstance(area.get(field), str) and area[field].strip()
               for field in ("id", "name", "geographic_unit")):
        return False
    for domain in domains:
        if not isinstance(domain, dict) or not isinstance(domain.get("id"), str) or not isinstance(domain.get("name"), str):
            return False
        indicators = domain.get("indicators")
        if not isinstance(indicators, list) or not all(valid_indicator(item, area["geographic_unit"]) for item in indicators):
            return False
    return True


def load_profiles() -> tuple[list[dict[str, Any]] | None, list[dict[str, Any]]]:
    """Load profiles exactly as prepared by the approved data pipeline."""
    source, limitations = load_json_source(profile_data_path(), PROFILE_DATA_PATH_ENV, "profile")
    if source is None:
        return None, limitations
    profiles = source.get("profiles")
    if not isinstance(profiles, list) or not all(valid_profile(profile) for profile in profiles):
        return None, [limitation(
            "profile_dataset_invalid",
            "The profile dataset must contain a profiles list with neighbourhood, domain, indicator, status, and provenance fields.",
            "profiles")]
    identifiers = [profile["neighbourhood"]["id"] for profile in profiles]
    if len(identifiers) != len(set(identifiers)):
        return None, [limitation("profile_dataset_invalid", "The profile dataset contains duplicate neighbourhood identifiers.", "profiles")]
    return profiles, []


def profile_status(profile: dict[str, Any]) -> str:
    statuses = {indicator["status"] for domain in profile["domains"] for indicator in domain["indicators"]}
    for status in ("available", "limited", "incompatible", "missing", "unavailable"):
        if status in statuses:
            return status
    return "unavailable"


def profile_limitations(profile: dict[str, Any]) -> list[dict[str, Any]]:
    """Surface every unavailable input rather than filling, omitting, or estimating it."""
    limitations = list(profile.get("limitations", []))
    for domain in profile["domains"]:
        for indicator in domain["indicators"]:
            if indicator["status"] != "available":
                limitations.append(limitation(
                    f"indicator_{indicator['status']}",
                    f"{indicator['name']} is {indicator['status']} and no value has been created.",
                    indicator["id"]))
    return limitations


def profile_metadata(profile: dict[str, Any]) -> dict[str, Any]:
    indicators = [indicator for domain in profile["domains"] for indicator in domain["indicators"]]
    source_metadata = profile.get("metadata", {})
    return {
        "sources": sorted({str(indicator["source"]) for indicator in indicators}),
        "reference_years": sorted({str(indicator["reference_year"]) for indicator in indicators}),
        "geographic_unit": profile["neighbourhood"]["geographic_unit"],
        "data_quality": source_metadata.get("data_quality", "Provided by the approved profile dataset"),
    }


def valid_priority_metadata(metadata: Any) -> bool:
    return isinstance(metadata, dict) and all(
        isinstance(metadata.get(field), (str, int)) and str(metadata[field]).strip()
        for field in ("source", "reference_year", "geographic_unit", "data_quality")
    )


def valid_priority_limitation(item: Any) -> bool:
    return isinstance(item, dict) and isinstance(item.get("code"), str) and isinstance(item.get("message"), str)


def valid_priority_result(result: Any) -> bool:
    """Validate that the precomputed result contains a band, never a score."""
    if not isinstance(result, dict) or result.get("status") not in INDICATOR_STATUSES:
        return False
    area = result.get("neighbourhood")
    if not isinstance(area, dict) or not all(isinstance(area.get(field), str) and area[field].strip()
                                             for field in ("id", "name")):
        return False
    domains = result.get("contributing_domains")
    if not isinstance(domains, list) or not all(domain in PRIORITY_DOMAINS for domain in domains):
        return False
    if result["status"] == "available":
        return (
            result.get("label") == "Priority for Investigation"
            and isinstance(result.get("priority_band"), str)
            and bool(result["priority_band"].strip())
            and set(domains) == PRIORITY_DOMAINS
        )
    return (
        result.get("label") is None
        and result.get("priority_band") is None
        and isinstance(result.get("limitations"), list)
        and bool(result["limitations"])
        and all(valid_priority_limitation(item) for item in result["limitations"])
    )


def load_priority_results() -> tuple[list[dict[str, Any]] | None, dict[str, Any] | None, list[dict[str, Any]]]:
    """Load only an explicitly approved, precomputed Data Science output."""
    source, limitations = load_json_source(priority_data_path(), PRIORITY_DATA_PATH_ENV, "priority")
    if source is None:
        return None, None, limitations
    results, metadata = source.get("results"), source.get("metadata")
    if source.get("approved") is not True or not isinstance(results, list) or not valid_priority_metadata(metadata):
        return None, None, [limitation(
            "priority_dataset_invalid",
            "The priority dataset must be explicitly approved and contain results with complete provenance metadata.",
            "priority")]
    if not all(valid_priority_result(result) for result in results):
        return None, None, [limitation(
            "priority_dataset_invalid",
            "The priority dataset contains an invalid result, an unsupported label, or a numeric priority value.",
            "results")]
    identifiers = [result["neighbourhood"]["id"] for result in results]
    if len(identifiers) != len(set(identifiers)):
        return None, None, [limitation("priority_dataset_invalid", "The priority dataset contains duplicate neighbourhood identifiers.", "results")]
    return results, metadata, []


def priority_data(result: dict[str, Any]) -> dict[str, Any]:
    """Whitelist the public fields so internal source scores can never leak."""
    return {
        "label": result["label"],
        "neighbourhood": result["neighbourhood"],
        "priority_band": result["priority_band"],
        "contributing_domains": result["contributing_domains"],
    }


def valid_boundary_feature(feature: Any) -> bool:
    """Require the identity and polygon geometry supplied by the source."""
    if not isinstance(feature, dict) or feature.get("type") != "Feature":
        return False
    properties, geometry = feature.get("properties"), feature.get("geometry")
    return (
        isinstance(properties, dict)
        and all(isinstance(properties.get(field), str) and properties[field].strip()
                for field in ("id", "name", "geographic_unit"))
        and isinstance(geometry, dict)
        and geometry.get("type") in {"Polygon", "MultiPolygon"}
        and isinstance(geometry.get("coordinates"), list)
        and bool(geometry["coordinates"])
    )


def load_boundary_features() -> tuple[list[dict[str, Any]] | None, list[dict[str, Any]]]:
    """Load a GeoJSON FeatureCollection without repairing or transforming it."""
    path = boundary_data_path()
    if path is None:
        return None, [limitation(
            "boundary_dataset_not_configured",
            f"No boundary dataset is configured. Set {BOUNDARY_DATA_PATH_ENV} to an approved GeoJSON FeatureCollection.",
            "geometry")]
    if not path.is_file():
        return None, [limitation("boundary_dataset_unavailable",
                                 "The configured boundary dataset could not be found.", "geometry")]
    try:
        source = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None, [limitation("boundary_dataset_unreadable",
                                 "The configured boundary dataset could not be read as valid GeoJSON.", "geometry")]
    if source.get("type") != "FeatureCollection" or not isinstance(source.get("features"), list):
        return None, [limitation("boundary_dataset_invalid",
                                 "The configured boundary dataset is not a GeoJSON FeatureCollection.", "geometry")]
    features = source["features"]
    if not all(valid_boundary_feature(feature) for feature in features):
        return None, [limitation(
            "boundary_dataset_invalid",
            "The boundary dataset contains a feature without a supported neighbourhood identity, geographic unit, or polygon geometry.",
            "geometry")]
    return features, []


def feature_metadata(feature: dict[str, Any]) -> dict[str, Any]:
    properties = feature["properties"]
    return {
        "source": properties.get("source", "Approved boundary dataset"),
        "geographic_unit": properties["geographic_unit"],
        "boundary_version": properties.get("boundary_version", DEFAULT_BOUNDARY_VERSION),
        "data_quality": properties.get("data_quality", "Source geometry supplied without transformation"),
    }


def neighbourhood(feature: dict[str, Any]) -> dict[str, str]:
    properties = feature["properties"]
    return {key: properties[key] for key in ("id", "name", "geographic_unit")}


def parse_bbox(bbox: str) -> tuple[float, float, float, float] | None:
    """Parse west,south,east,north in WGS 84 longitude/latitude order."""
    try:
        west, south, east, north = (float(value.strip()) for value in bbox.split(","))
    except ValueError:
        return None
    if not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
        return None
    return west, south, east, north


def polygon_rings(feature: dict[str, Any]) -> list[list[list[float]]]:
    geometry = feature["geometry"]
    if geometry["type"] == "Polygon":
        return geometry["coordinates"]
    return [ring for polygon in geometry["coordinates"] for ring in polygon]


def point_in_bbox(point: tuple[float, float], bbox: tuple[float, float, float, float]) -> bool:
    west, south, east, north = bbox
    return west <= point[0] <= east and south <= point[1] <= north


def segments_intersect(first: tuple[float, float], second: tuple[float, float],
                       third: tuple[float, float], fourth: tuple[float, float]) -> bool:
    def orientation(start: tuple[float, float], end: tuple[float, float], point: tuple[float, float]) -> float:
        return (end[0] - start[0]) * (point[1] - start[1]) - (end[1] - start[1]) * (point[0] - start[0])

    first_side = orientation(first, second, third)
    second_side = orientation(first, second, fourth)
    third_side = orientation(third, fourth, first)
    fourth_side = orientation(third, fourth, second)
    return first_side * second_side <= 0 and third_side * fourth_side <= 0


def point_in_ring(point: tuple[float, float], ring: list[list[float]]) -> bool:
    inside = False
    for current, following in zip(ring, ring[1:] + ring[:1]):
        current_x, current_y = current[0], current[1]
        following_x, following_y = following[0], following[1]
        if (current_y > point[1]) != (following_y > point[1]):
            crossing_x = (following_x - current_x) * (point[1] - current_y) / (following_y - current_y) + current_x
            if point[0] < crossing_x:
                inside = not inside
    return inside


def intersects_bbox(feature: dict[str, Any], bbox: tuple[float, float, float, float]) -> bool:
    """Check boundary geometry against the map rectangle, not only its extent."""
    rings = polygon_rings(feature)
    points = [(float(point[0]), float(point[1])) for ring in rings for point in ring]
    if any(point_in_bbox(point, bbox) for point in points):
        return True
    west, south, east, north = bbox
    rectangle = [(west, south), (east, south), (east, north), (west, north)]
    for ring in rings:
        vertices = [(float(point[0]), float(point[1])) for point in ring]
        for start, end in zip(vertices, vertices[1:] + vertices[:1]):
            for rectangle_start, rectangle_end in zip(rectangle, rectangle[1:] + rectangle[:1]):
                if segments_intersect(start, end, rectangle_start, rectangle_end):
                    return True
    # A map view fully contained by a polygon has no boundary points or edges
    # inside it. A corner inside an exterior ring still means it intersects.
    return any(point_in_ring(corner, ring) for ring in rings for corner in rectangle)


@app.get("/")
def root() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/priority")
def priority_shortlist() -> dict[str, Any]:
    """Return only approved Priority for Investigation results, never a ranking score."""
    results, metadata, limitations = load_priority_results()
    if results is None:
        return envelope("unavailable", [], limitations=limitations, notices=[HUMAN_DECISION_NOTICE])
    shortlist = [priority_data(result) for result in results if result["status"] == "available"]
    return envelope("available", shortlist, metadata=metadata, notices=[HUMAN_DECISION_NOTICE])


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
    visible = [feature for feature in features if intersects_bbox(feature, parsed_bbox)]
    return envelope("available", {"type": "FeatureCollection", "features": visible}, metadata={
        "bbox": bbox, "result_count": len(visible),
        "geographic_units": sorted({feature["properties"]["geographic_unit"] for feature in visible}),
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
        "label": None,
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
