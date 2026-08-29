"""KinderPrint API. BE-2 loads only approved source boundary GeoJSON."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Query

app = FastAPI(title="KinderPrint API", version="0.1.0")

BOUNDARY_DATA_PATH_ENV = "KINDERPRINT_BOUNDARY_DATA_PATH"
DEFAULT_BOUNDARY_VERSION = "Not supplied"


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
