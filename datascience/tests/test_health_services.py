import json
import sys
from pathlib import Path

import geopandas as gpd
from shapely.geometry import Point, Polygon

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from integrate_health_services import integrate_casey_mch


def test_casey_mch_points_are_assigned_without_inventing_coverage(tmp_path):
    services = gpd.GeoDataFrame({
        "name": ["Example MCH"], "streetno": ["1 Test St"],
        "suburbpc": ["Test 3000"], "phoneno": ["03 0000 0000"],
        "openinghrs": ["Mon"], "saturdaysession": ["No"],
    }, geometry=[Point(145.0, -37.8)], crs="EPSG:7844")
    boundaries = gpd.GeoDataFrame({"id": ["sa2"], "name": ["Example"]},
        geometry=[Polygon([(144.9, -37.9), (145.1, -37.9),
                           (145.1, -37.7), (144.9, -37.7)])], crs="EPSG:7844")
    service_path, boundary_path = tmp_path / "services.geojson", tmp_path / "sa2.geojson"
    services.to_file(service_path, driver="GeoJSON")
    boundaries.to_file(boundary_path, driver="GeoJSON")

    output, qa = integrate_casey_mch(service_path, boundary_path)

    assert output.loc[0, "sa2_code"] == "sa2"
    assert output.loc[0, "coverage_scope"] == "City of Casey only"
    assert qa["suitability_status"] == "limited"
    assert "cannot rank Greater Melbourne" in qa["limitation"]
