"""Build transparent traffic-intensity and public-transport availability measures."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import geopandas as gpd
import pandas as pd


def _higher_score(values: pd.Series) -> pd.Series:
    numeric = pd.to_numeric(values, errors="coerce")
    score = numeric.rank(method="average", pct=True) * 100
    return score.where(numeric.notna()).round(2)


def _lower_score(values: pd.Series) -> pd.Series:
    numeric = pd.to_numeric(values, errors="coerce")
    score = 100 - numeric.rank(method="average", pct=True) * 100
    return score.where(numeric.notna()).round(2)


def integrate_transport(
    traffic_path: Path,
    stops_path: Path,
    boundaries_path: Path,
    bridge: pd.DataFrame,
    localities: pd.DataFrame,
) -> tuple[pd.DataFrame, pd.DataFrame, dict]:
    boundaries = gpd.read_file(boundaries_path).to_crs("EPSG:3577")
    code_column = "id" if "id" in boundaries else "SA2_CODE_2021"
    name_column = "name" if "name" in boundaries else "SA2_NAME_2021"
    boundary = boundaries[[code_column, name_column, "geometry"]].rename(
        columns={code_column: "sa2_code", name_column: "sa2_name"}
    )
    boundary["sa2_code"] = boundary.sa2_code.astype(str)
    boundary["area_sqkm"] = boundary.geometry.area / 1_000_000

    traffic = gpd.read_file(traffic_path).to_crs("EPSG:3577")
    traffic = traffic.loc[
        traffic["Average Annual Daily Traffic Volume"].notna()
        & traffic.geometry.notna()
        & ~traffic.geometry.is_empty
    ].copy()
    clipped = gpd.overlay(
        traffic[["Road Segment ID", "Average Annual Daily Traffic Volume", "geometry"]],
        boundary[["sa2_code", "sa2_name", "geometry"]],
        how="intersection",
        keep_geom_type=True,
    )
    clipped["clipped_length_km"] = clipped.geometry.length / 1000
    clipped["aadt_road_km"] = (
        clipped["Average Annual Daily Traffic Volume"] * clipped.clipped_length_km
    )
    traffic_sa2 = clipped.groupby(["sa2_code", "sa2_name"], as_index=False).agg(
        declared_road_length_km=("clipped_length_km", "sum"),
        aadt_road_km=("aadt_road_km", "sum"),
        traffic_segment_count=("Road Segment ID", "nunique"),
    )
    traffic_sa2 = boundary.drop(columns="geometry").merge(
        traffic_sa2, on=["sa2_code", "sa2_name"], how="left"
    )
    for column in ("declared_road_length_km", "aadt_road_km", "traffic_segment_count"):
        traffic_sa2[column] = traffic_sa2[column].fillna(0)
    traffic_sa2["declared_road_traffic_intensity"] = (
        traffic_sa2.aadt_road_km / traffic_sa2.area_sqkm
    )

    stops = gpd.read_file(stops_path).to_crs("EPSG:3577")
    stop_join = gpd.sjoin(stops, boundary[["sa2_code", "sa2_name", "geometry"]], predicate="within")
    stops_sa2 = stop_join.groupby(["sa2_code", "sa2_name"], as_index=False).agg(
        public_transport_stop_count=("STOP_ID", "nunique")
    )
    sa2 = traffic_sa2.merge(stops_sa2, on=["sa2_code", "sa2_name"], how="left")
    sa2["public_transport_stop_count"] = sa2.public_transport_stop_count.fillna(0).astype(int)

    bridge = bridge.copy()
    bridge["sa2_code_2021"] = bridge.sa2_code_2021.astype(str)
    component = bridge.merge(sa2, left_on="sa2_code_2021", right_on="sa2_code", how="left")
    aggregate = component.groupby("community_id", as_index=False).agg(
        area_sqkm=("area_sqkm", "sum"),
        declared_road_length_km=("declared_road_length_km", "sum"),
        aadt_road_km=("aadt_road_km", "sum"),
        traffic_segment_count=("traffic_segment_count", "sum"),
        public_transport_stop_count=("public_transport_stop_count", "sum"),
    )
    output = localities[["community_id", "neighbourhood_id", "community_name", "population"]].merge(
        aggregate, on="community_id", how="left"
    )
    output["declared_road_traffic_intensity"] = output.aadt_road_km / output.area_sqkm
    population = pd.to_numeric(output.population, errors="coerce").where(lambda values: values > 0)
    output["public_transport_stops_per_10000"] = output.public_transport_stop_count / population * 10_000
    output["lower_declared_road_traffic_score"] = _lower_score(
        output.declared_road_traffic_intensity
    )
    output["public_transport_availability_score"] = _higher_score(
        output.public_transport_stops_per_10000
    ).where(output.public_transport_stop_count > 0, 0)
    output["source_id"] = "dot_aadt_2019_and_ptv_stops_2026"
    qa = {
        "source_id": "dot_aadt_2019_and_ptv_stops_2026",
        "traffic_segments_received": len(traffic),
        "traffic_clipped_parts": len(clipped),
        "public_transport_stops_received": len(stops),
        "public_transport_stops_in_greater_melbourne": int(stop_join.STOP_ID.nunique()),
        "reporting_localities": len(output),
        "missing_traffic_scores": int(output.lower_declared_road_traffic_score.isna().sum()),
        "missing_transport_scores": int(output.public_transport_availability_score.isna().sum()),
        "limitation": (
            "The traffic measure covers roads present in the 2019 AADT source and combines AADT "
            "with clipped road length per square kilometre. It is a declared-road traffic-intensity "
            "proxy, not noise, air pollution, child exposure or current traffic. Public-transport "
            "stop counts do not measure frequency, reliability, accessibility or travel time."
        ),
    }
    return sa2, output, qa


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--traffic", type=Path, required=True)
    parser.add_argument("--stops", type=Path, required=True)
    parser.add_argument("--boundaries", type=Path, required=True)
    parser.add_argument("--bridge", type=Path, required=True)
    parser.add_argument("--localities", type=Path, required=True)
    parser.add_argument("--sa2-output", type=Path, required=True)
    parser.add_argument("--community-output", type=Path, required=True)
    parser.add_argument("--qa", type=Path, required=True)
    args = parser.parse_args()
    sa2, community, qa = integrate_transport(
        args.traffic, args.stops, args.boundaries,
        pd.read_csv(args.bridge), pd.read_csv(args.localities),
    )
    for path in (args.sa2_output, args.community_output, args.qa):
        path.parent.mkdir(parents=True, exist_ok=True)
    sa2.drop(columns="geometry", errors="ignore").to_csv(args.sa2_output, index=False)
    community.to_csv(args.community_output, index=False)
    args.qa.write_text(json.dumps(qa, indent=2) + "\n")


if __name__ == "__main__":
    main()
