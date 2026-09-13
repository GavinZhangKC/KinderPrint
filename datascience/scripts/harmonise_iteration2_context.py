"""Harmonise validated traffic and NPI context to Edition-3 SA2/AEDC areas.

Outputs are contextual environmental measures, not individual exposure or risk.
All metric definitions are deliberately transparent and carry a quality flag.
"""
from __future__ import annotations

from collections import defaultdict
from pathlib import Path

import geopandas as gpd
import numpy as np
import openpyxl
import pandas as pd
from shapely.geometry import Point

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
REF = ROOT / "data" / "reference"
PROC = ROOT / "data" / "processed"
ALBERS = "EPSG:3577"
LATEST_NPI_YEAR = "2024/2025"
HIGH_TRAFFIC_AADT = 10_000


def latest(filename: str) -> Path:
    matches = sorted(RAW.rglob(filename))
    if not matches:
        raise FileNotFoundError(f"{filename} is unavailable; run acquire_iteration2.py")
    return matches[-1]


def boundaries() -> gpd.GeoDataFrame:
    areas = gpd.read_file(REF / "sa2_melbourne.geojson")
    assert areas.crs and areas.crs.to_epsg() == 4326
    assert areas["SA2_CODE_2021"].astype(str).is_unique
    assert areas.geometry.is_valid.all() and not areas.geometry.is_empty.any()
    return areas.to_crs(ALBERS)


def traffic_by_sa2(areas: gpd.GeoDataFrame) -> pd.DataFrame:
    roads = gpd.read_file(latest("yearly_aadt_volume_2019.geojson"))
    roads = roads.to_crs(ALBERS)
    roads["_geometry_wkb"] = roads.geometry.to_wkb()
    key = ["Road Segment ID", "Travel Direction", "_geometry_wkb"]
    roads = roads.drop_duplicates(key).drop(columns="_geometry_wkb")
    roads = gpd.clip(roads, areas)
    intersections = gpd.overlay(
        roads,
        areas[["SA2_CODE_2021", "geometry"]],
        how="intersection",
        keep_geom_type=True,
    )
    intersections["segment_length_km"] = intersections.geometry.length / 1000
    intersections = intersections[intersections.segment_length_km > 0].copy()
    intersections["traffic_length"] = (
        intersections["Average Annual Daily Traffic Volume"] * intersections.segment_length_km
    )
    intersections["heavy_length"] = (
        intersections["Average Annual Daily Heavy Vehicle Volume"] * intersections.segment_length_km
    )
    intersections["high_traffic_length_km"] = np.where(
        intersections["Average Annual Daily Traffic Volume"] >= HIGH_TRAFFIC_AADT,
        intersections.segment_length_km,
        0.0,
    )
    intersections["actual_length_km"] = np.where(
        intersections["Calculation Methodology"].eq("Actual"),
        intersections.segment_length_km,
        0.0,
    )
    grouped = intersections.groupby("SA2_CODE_2021", as_index=False).agg(
        declared_road_km=("segment_length_km", "sum"),
        traffic_length=("traffic_length", "sum"),
        heavy_length=("heavy_length", "sum"),
        high_traffic_road_km=("high_traffic_length_km", "sum"),
        actual_length_km=("actual_length_km", "sum"),
        traffic_source_parts=("Road Segment ID", "size"),
        traffic_unique_segments=("Road Segment ID", "nunique"),
    )
    grouped["length_weighted_aadt"] = grouped.traffic_length / grouped.declared_road_km
    grouped["length_weighted_heavy_aadt"] = grouped.heavy_length / grouped.declared_road_km
    grouped["high_traffic_road_share_pct"] = 100 * grouped.high_traffic_road_km / grouped.declared_road_km
    grouped["actual_observation_road_share_pct"] = 100 * grouped.actual_length_km / grouped.declared_road_km
    keep = ["SA2_CODE_2021", "declared_road_km", "length_weighted_aadt",
            "length_weighted_heavy_aadt", "high_traffic_road_km",
            "high_traffic_road_share_pct", "actual_observation_road_share_pct",
            "traffic_source_parts", "traffic_unique_segments"]
    result = areas[["SA2_CODE_2021"]].merge(grouped[keep], how="left", on="SA2_CODE_2021")
    result["traffic_quality_flag"] = np.where(result.declared_road_km.notna(), "CONTEXT_ONLY", "NO_DECLARED_ROAD_DATA")
    result["traffic_source_id"] = "dtp_historical_aadt_2019"
    return result


def _is_respiratory_pollutant(name: str) -> bool:
    text = name.casefold()
    terms = ("particulate matter", "oxides of nitrogen", "nitrogen dioxide", "sulfur dioxide",
             "sulphur dioxide", "carbon monoxide", "volatile organic compounds")
    return any(term in text for term in terms)


def npi_facilities() -> gpd.GeoDataFrame:
    workbook = openpyxl.load_workbook(latest("npi_emissions.xlsx"), read_only=True, data_only=True)
    rows = workbook["Emissions"].iter_rows(values_only=True)
    fields = next(rows)
    index = {field: position for position, field in enumerate(fields)}
    facilities: dict[str, dict] = {}
    respiratory = defaultdict(bool)
    for row in rows:
        if row[index["state"]] != "VIC" or str(row[index["report_year"]]) != LATEST_NPI_YEAR:
            continue
        facility_id = str(row[index["facility_id"]])
        latitude, longitude = row[index["latitude"]], row[index["longitude"]]
        if latitude is None or longitude is None:
            continue
        facilities[facility_id] = {
            "facility_id": facility_id,
            "facility_name": row[index["facility_name"]],
            "latitude": float(latitude),
            "longitude": float(longitude),
        }
        respiratory[facility_id] |= _is_respiratory_pollutant(str(row[index["substance_name"]]))
    frame = pd.DataFrame(facilities.values())
    frame["reports_respiratory_pollutant"] = frame.facility_id.map(respiratory)
    return gpd.GeoDataFrame(
        frame,
        geometry=[Point(xy) for xy in zip(frame.longitude, frame.latitude)],
        crs="EPSG:4326",
    ).to_crs(ALBERS)


def npi_by_sa2(areas: gpd.GeoDataFrame) -> pd.DataFrame:
    facilities = npi_facilities()
    joined = gpd.sjoin(facilities, areas[["SA2_CODE_2021", "geometry"]], predicate="within", how="inner")
    counts = joined.groupby("SA2_CODE_2021").agg(
        npi_facilities=("facility_id", "nunique"),
        npi_respiratory_reporting_facilities=("reports_respiratory_pollutant", "sum"),
    ).reset_index()
    centres = areas.geometry.representative_point()
    facility_union = facilities.geometry.union_all()
    respiratory_union = facilities.loc[facilities.reports_respiratory_pollutant, "geometry"].union_all()
    result = areas[["SA2_CODE_2021"]].merge(counts, on="SA2_CODE_2021", how="left")
    result[["npi_facilities", "npi_respiratory_reporting_facilities"]] = result[
        ["npi_facilities", "npi_respiratory_reporting_facilities"]].fillna(0).astype(int)
    result["nearest_npi_facility_km"] = centres.distance(facility_union).to_numpy() / 1000
    result["nearest_npi_respiratory_reporting_facility_km"] = centres.distance(respiratory_union).to_numpy() / 1000
    result["npi_quality_flag"] = "CONTEXT_ONLY"
    result["npi_source_id"] = "npi_emissions_all_years"
    result["npi_reference_year"] = LATEST_NPI_YEAR
    return result


def community_context(traffic: pd.DataFrame, npi: pd.DataFrame) -> pd.DataFrame:
    bridge = pd.read_csv(REF / "../processed/community_sa2.csv", dtype={"sa2_code_2021": str})
    data = bridge.merge(traffic, left_on="sa2_code_2021", right_on="SA2_CODE_2021", how="left")
    data = data.merge(npi, on="SA2_CODE_2021", how="left")
    records = []
    for community_id, group in data.groupby("community_id"):
        road_km = group.declared_road_km.sum(min_count=1)
        weights = group.declared_road_km.fillna(0)
        def road_weighted(column: str):
            valid = group[column].notna() & weights.gt(0)
            return float(np.average(group.loc[valid, column], weights=weights[valid])) if valid.any() else np.nan
        records.append({
            "community_id": community_id,
            "declared_road_km": road_km,
            "length_weighted_aadt": road_weighted("length_weighted_aadt"),
            "length_weighted_heavy_aadt": road_weighted("length_weighted_heavy_aadt"),
            "high_traffic_road_km": group.high_traffic_road_km.sum(min_count=1),
            "high_traffic_road_share_pct": road_weighted("high_traffic_road_share_pct"),
            "actual_observation_road_share_pct": road_weighted("actual_observation_road_share_pct"),
            "npi_facilities": int(group.npi_facilities.sum()),
            "npi_respiratory_reporting_facilities": int(group.npi_respiratory_reporting_facilities.sum()),
            "nearest_npi_facility_km": group.nearest_npi_facility_km.min(),
            "nearest_npi_respiratory_reporting_facility_km": group.nearest_npi_respiratory_reporting_facility_km.min(),
            "context_quality_flag": "CONTEXT_ONLY",
        })
    return pd.DataFrame(records)


def main() -> None:
    PROC.mkdir(parents=True, exist_ok=True)
    areas = boundaries()
    traffic = traffic_by_sa2(areas)
    npi = npi_by_sa2(areas)
    communities = community_context(traffic, npi)
    traffic.to_csv(PROC / "traffic_context_sa2.csv", index=False, float_format="%.4f")
    npi.to_csv(PROC / "npi_context_sa2.csv", index=False, float_format="%.4f")
    communities.to_csv(PROC / "community_context.csv", index=False, float_format="%.4f")
    print(f"Wrote {len(traffic)} SA2 and {len(communities)} AEDC-community context rows")


if __name__ == "__main__":
    main()
