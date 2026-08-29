import json

from data_loader import BOUNDARY_DATA_PATH_ENV
from geography import (
    intersects_bbox,
    parse_bbox,
    segments_intersect,
    valid_boundary_feature,
    valid_position,
)


OUTER = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]
HOLE = [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]]


def feature(identifier: str = "n", geometry_type: str = "Polygon") -> dict:
    coordinates = [OUTER, HOLE]
    if geometry_type == "MultiPolygon":
        coordinates = [coordinates]
    return {
        "type": "Feature",
        "properties": {"id": identifier, "name": identifier.upper(), "geographic_unit": "TBC"},
        "geometry": {"type": geometry_type, "coordinates": coordinates},
    }


def test_position_validation() -> None:
    assert valid_position([144.9, -37.8])
    assert not valid_position([181, 0])
    assert not valid_position([0, 91])
    assert not valid_position([0, 0, "invalid"])


def test_polygon_and_multipolygon_validation() -> None:
    assert valid_boundary_feature(feature())
    assert valid_boundary_feature(feature(geometry_type="MultiPolygon"))
    invalid = feature()
    invalid["geometry"]["coordinates"] = [OUTER[:-1]]
    assert not valid_boundary_feature(invalid)


def test_collinear_disjoint_segments_do_not_intersect() -> None:
    assert segments_intersect((0, 0), (1, 0), (1, 0), (2, 0))
    assert not segments_intersect((0, 0), (1, 0), (2, 0), (3, 0))


def test_bbox_inside_polygon_intersects() -> None:
    assert intersects_bbox(feature(), (1, 1, 2, 2))


def test_bbox_inside_polygon_hole_does_not_intersect() -> None:
    assert not intersects_bbox(feature(), (4.5, 4.5, 5.5, 5.5))


def test_invalid_and_antimeridian_bbox_are_rejected() -> None:
    assert parse_bbox("invalid") is None
    assert parse_bbox("170,-10,-170,10") is None


def test_boundary_endpoint_returns_source_geometry(client, monkeypatch, write_json) -> None:
    collection = {"type": "FeatureCollection", "features": [feature()]}
    path = write_json("boundaries.json", json.dumps(collection))
    monkeypatch.setenv(BOUNDARY_DATA_PATH_ENV, str(path))
    body = client.get("/api/neighbourhoods/n/boundary").json()
    assert body["status"] == "available"
    assert body["data"]["geometry"] == feature()["geometry"]


def test_duplicate_boundary_ids_are_unavailable(client, monkeypatch, write_json) -> None:
    collection = {"type": "FeatureCollection", "features": [feature(), feature()]}
    path = write_json("boundaries.json", json.dumps(collection))
    monkeypatch.setenv(BOUNDARY_DATA_PATH_ENV, str(path))
    body = client.get("/api/neighbourhoods/n/boundary").json()
    assert body["status"] == "unavailable"
    assert "duplicate" in body["limitations"][0]["message"].lower()


def test_visible_boundaries_rejects_bad_bbox(client) -> None:
    body = client.get("/api/neighbourhoods/boundaries", params={"bbox": "bad"}).json()
    assert body["status"] == "unavailable"
    assert body["limitations"][0]["code"] == "invalid_bbox"
