"""Calculate designated bushfire-prone-area coverage for reporting localities."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import geopandas as gpd
import pandas as pd


def integrate_bushfire(
    source: Path, boundaries_path: Path, bridge: pd.DataFrame, localities: pd.DataFrame
) -> tuple[pd.DataFrame, pd.DataFrame, dict]:
    boundaries = gpd.read_file(boundaries_path).to_crs("EPSG:3577")
    code_column = "id" if "id" in boundaries else "SA2_CODE_2021"
    name_column = "name" if "name" in boundaries else "SA2_NAME_2021"
    boundaries = boundaries[[code_column, name_column, "geometry"]].rename(
        columns={code_column: "sa2_code", name_column: "sa2_name"}
    )
    boundaries.sa2_code = boundaries.sa2_code.astype(str)
    boundaries["area_sqkm"] = boundaries.geometry.area / 1_000_000
    bushfire = gpd.read_file(source).to_crs("EPSG:3577")
    bushfire_union = gpd.GeoDataFrame(geometry=[bushfire.geometry.union_all()], crs="EPSG:3577")
    intersection = gpd.overlay(boundaries, bushfire_union, how="intersection", keep_geom_type=True)
    covered = intersection.groupby("sa2_code").geometry.apply(
        lambda geometries: geometries.union_all().area / 1_000_000
    ).rename("bushfire_prone_sqkm")
    sa2 = boundaries.drop(columns="geometry").merge(covered, on="sa2_code", how="left")
    sa2["bushfire_prone_sqkm"] = sa2.bushfire_prone_sqkm.fillna(0)
    sa2["bushfire_prone_pct"] = (100 * sa2.bushfire_prone_sqkm / sa2.area_sqkm).clip(0, 100)
    sa2["lower_bushfire_prone_share_score"] = (100 - sa2.bushfire_prone_pct).round(2)

    bridge = bridge.copy()
    bridge.sa2_code_2021 = bridge.sa2_code_2021.astype(str)
    component = bridge.merge(sa2, left_on="sa2_code_2021", right_on="sa2_code", how="left")
    aggregate = component.groupby("community_id", as_index=False).agg(
        area_sqkm=("area_sqkm", "sum"), bushfire_prone_sqkm=("bushfire_prone_sqkm", "sum")
    )
    output = localities[["community_id", "neighbourhood_id", "community_name"]].merge(
        aggregate, on="community_id", how="left"
    )
    output["bushfire_prone_pct"] = (
        100 * output.bushfire_prone_sqkm / output.area_sqkm
    ).clip(0, 100).round(4)
    output["lower_bushfire_prone_share_score"] = (100 - output.bushfire_prone_pct).round(2)
    output["source_id"] = "victoria_bushfire_prone_area_2026"
    qa = {
        "source_id": "victoria_bushfire_prone_area_2026",
        "source_polygons": len(bushfire),
        "source_latest_gazettal_date": str(
            pd.to_datetime(bushfire.gazettal_date, format="mixed", dayfirst=True).max().date()
        ),
        "reporting_localities": len(output),
        "localities_with_designated_area": int((output.bushfire_prone_pct > 0).sum()),
        "missing_scores": int(output.lower_bushfire_prone_share_score.isna().sum()),
        "limitation": (
            "This measure is the share of land designated under Victorian bushfire-prone-area "
            "building requirements. It is not a property-level Bushfire Attack Level, forecast, "
            "probability of fire, evacuation assessment, flood measure or personal safety advice."
        ),
    }
    return sa2, output, qa


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--boundaries", type=Path, required=True)
    parser.add_argument("--bridge", type=Path, required=True)
    parser.add_argument("--localities", type=Path, required=True)
    parser.add_argument("--sa2-output", type=Path, required=True)
    parser.add_argument("--community-output", type=Path, required=True)
    parser.add_argument("--qa", type=Path, required=True)
    args = parser.parse_args()
    sa2, community, qa = integrate_bushfire(
        args.input, args.boundaries, pd.read_csv(args.bridge), pd.read_csv(args.localities)
    )
    for path in (args.sa2_output, args.community_output, args.qa):
        path.parent.mkdir(parents=True, exist_ok=True)
    sa2.to_csv(args.sa2_output, index=False)
    community.to_csv(args.community_output, index=False)
    args.qa.write_text(json.dumps(qa, indent=2) + "\n")


if __name__ == "__main__":
    main()
