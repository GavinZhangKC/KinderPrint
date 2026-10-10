"""GeoJSON source validation and boundary query helpers."""

from __future__ import annotations

from copy import deepcopy
import json
import math
from pathlib import Path
from typing import Any

from core.data_loader import BOUNDARY_DATA_PATH_ENV, boundary_data_path
from core.responses import limitation
from core.sources import dataset_cache, read_json, source_exists

DEFAULT_BOUNDARY_VERSION = "Not supplied"


def valid_position(position: Any) -> bool:
    if not isinstance(position, list) or len(position) < 2:
        return False
    if not all(isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)
               for value in position):
        return False
    longitude, latitude = position[0], position[1]
    return -180 <= longitude <= 180 and -90 <= latitude <= 90


def valid_linear_ring(ring: Any) -> bool:
    return (
        isinstance(ring, list)
        and len(ring) >= 4
        and all(valid_position(position) for position in ring)
        and ring[0][:2] == ring[-1][:2]
    )


def valid_polygon_coordinates(coordinates: Any) -> bool:
    return isinstance(coordinates, list) and bool(coordinates) and all(valid_linear_ring(ring) for ring in coordinates)


def valid_boundary_feature(feature: Any) -> bool:
    """Require the identity and polygon geometry supplied by the source."""
    if not isinstance(feature, dict) or feature.get("type") != "Feature":
        return False
    properties, geometry = feature.get("properties"), feature.get("geometry")
    if not (isinstance(properties, dict)
            and all(isinstance(properties.get(field), str) and properties[field].strip()
                    for field in ("id", "name", "geographic_unit"))
            and isinstance(geometry, dict)):
        return False
    coordinates = geometry.get("coordinates")
    if geometry.get("type") == "Polygon":
        return valid_polygon_coordinates(coordinates)
    if geometry.get("type") == "MultiPolygon":
        return isinstance(coordinates, list) and bool(coordinates) and all(
            valid_polygon_coordinates(polygon) for polygon in coordinates)
    return False


class BoundaryDatasetError(Exception):
    """Carry an existing public boundary limitation out of the cached loader."""

    def __init__(self, code: str, message: str, *affected_fields: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.affected_fields = affected_fields


@dataset_cache(maxsize=1)
def _load_validated_boundary_features(path: Path) -> tuple[dict[str, Any], ...]:
    """Read, parse and validate one static boundary file per warm process."""
    if not source_exists(path, BOUNDARY_DATA_PATH_ENV):
        raise BoundaryDatasetError(
            "boundary_dataset_unavailable",
            "The configured boundary dataset could not be found.",
            "geometry",
        )
    try:
        source = read_json(path, BOUNDARY_DATA_PATH_ENV)
    except (OSError, json.JSONDecodeError):
        raise BoundaryDatasetError(
            "boundary_dataset_unreadable",
            "The configured boundary dataset could not be read as valid GeoJSON.",
            "geometry",
        ) from None
    if (not isinstance(source, dict) or source.get("type") != "FeatureCollection"
            or not isinstance(source.get("features"), list)):
        raise BoundaryDatasetError(
            "boundary_dataset_invalid",
            "The configured boundary dataset is not a GeoJSON FeatureCollection.",
            "geometry",
        )
    features = source["features"]
    if not all(valid_boundary_feature(feature) for feature in features):
        raise BoundaryDatasetError(
            "boundary_dataset_invalid",
            "The boundary dataset contains a feature without a supported neighbourhood identity, geographic unit, or polygon geometry.",
            "geometry",
        )
    identifiers = [feature["properties"]["id"] for feature in features]
    if len(identifiers) != len(set(identifiers)):
        raise BoundaryDatasetError(
            "boundary_dataset_invalid",
            "The boundary dataset contains duplicate neighbourhood identifiers.",
            "features",
        )
    return tuple(features)


def load_boundary_features() -> tuple[tuple[dict[str, Any], ...] | None, list[dict[str, Any]]]:
    """Reuse an unchanged, validated GeoJSON source without transforming it."""
    path = boundary_data_path()
    if path is None:
        return None, [limitation(
            "boundary_dataset_not_configured",
            f"No boundary dataset is configured. Set {BOUNDARY_DATA_PATH_ENV} to an approved GeoJSON FeatureCollection.",
            "geometry")]
    try:
        return _load_validated_boundary_features(path), []
    except BoundaryDatasetError as error:
        return None, [limitation(error.code, error.message, *error.affected_fields)]


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


def public_boundary_feature(feature: dict[str, Any]) -> dict[str, Any]:
    """Expose only contract-approved identity fields and source geometry."""
    return {
        "type": "Feature",
        "properties": neighbourhood(feature),
        "geometry": public_boundary_geometry(feature),
    }


def public_boundary_geometry(feature: dict[str, Any]) -> dict[str, Any]:
    """Copy geometry before placing it in a response so cached data stays private."""
    return deepcopy(feature["geometry"])


def parse_bbox(bbox: str) -> tuple[float, float, float, float] | None:
    """Parse west,south,east,north in WGS 84 longitude/latitude order."""
    try:
        west, south, east, north = (float(value.strip()) for value in bbox.split(","))
    except ValueError:
        return None
    if not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
        return None
    return west, south, east, north


def feature_polygons(feature: dict[str, Any]) -> list[list[list[list[float]]]]:
    geometry = feature["geometry"]
    if geometry["type"] == "Polygon":
        return [geometry["coordinates"]]
    return geometry["coordinates"]


def point_in_bbox(point: tuple[float, float], bbox: tuple[float, float, float, float]) -> bool:
    west, south, east, north = bbox
    return west <= point[0] <= east and south <= point[1] <= north


def segments_intersect(first: tuple[float, float], second: tuple[float, float],
                       third: tuple[float, float], fourth: tuple[float, float]) -> bool:
    def orientation(start: tuple[float, float], end: tuple[float, float], point: tuple[float, float]) -> float:
        return (end[0] - start[0]) * (point[1] - start[1]) - (end[1] - start[1]) * (point[0] - start[0])

    def on_segment(start: tuple[float, float], end: tuple[float, float], point: tuple[float, float]) -> bool:
        return (min(start[0], end[0]) <= point[0] <= max(start[0], end[0])
                and min(start[1], end[1]) <= point[1] <= max(start[1], end[1]))

    first_side = orientation(first, second, third)
    second_side = orientation(first, second, fourth)
    third_side = orientation(third, fourth, first)
    fourth_side = orientation(third, fourth, second)
    if ((first_side > 0 > second_side or first_side < 0 < second_side)
            and (third_side > 0 > fourth_side or third_side < 0 < fourth_side)):
        return True
    return (
        (first_side == 0 and on_segment(first, second, third))
        or (second_side == 0 and on_segment(first, second, fourth))
        or (third_side == 0 and on_segment(third, fourth, first))
        or (fourth_side == 0 and on_segment(third, fourth, second))
    )


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


def point_on_ring(point: tuple[float, float], ring: list[list[float]]) -> bool:
    vertices = [(float(position[0]), float(position[1])) for position in ring]
    return any(segments_intersect(start, end, point, point) for start, end in zip(vertices, vertices[1:]))


def point_in_polygon(point: tuple[float, float], polygon: list[list[list[float]]]) -> bool:
    if any(point_on_ring(point, ring) for ring in polygon):
        return True
    return point_in_ring(point, polygon[0]) and not any(point_in_ring(point, hole) for hole in polygon[1:])


def intersects_bbox(feature: dict[str, Any], bbox: tuple[float, float, float, float]) -> bool:
    """Check boundary geometry against the map rectangle, not only its extent."""
    west, south, east, north = bbox
    rectangle = [(west, south), (east, south), (east, north), (west, north)]
    rectangle_edges = list(zip(rectangle, rectangle[1:] + rectangle[:1]))
    for polygon in feature_polygons(feature):
        if any(point_in_bbox((float(point[0]), float(point[1])), bbox)
               for ring in polygon for point in ring):
            return True
        for ring in polygon:
            vertices = [(float(point[0]), float(point[1])) for point in ring]
            if any(segments_intersect(start, end, rectangle_start, rectangle_end)
                   for start, end in zip(vertices, vertices[1:])
                   for rectangle_start, rectangle_end in rectangle_edges):
                return True
        if any(point_in_polygon(corner, polygon) for corner in rectangle):
            return True
    return False
