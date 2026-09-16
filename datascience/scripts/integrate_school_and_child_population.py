"""Harmonise VIF child-population projections and Victorian school locations to SA2."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import geopandas as gpd
import pandas as pd


def load_vif(path: Path) -> pd.DataFrame:
    data = pd.read_excel(path, sheet_name="ERP_by_Age_Persons", header=[8, 9])
    output = data.iloc[:, [3, 5]].copy()
    output.columns = ["sa2_code", "sa2_name"]
    output["children_0_4_2026"] = pd.to_numeric(data[(2026, "Persons \n0-4")], errors="coerce")
    output["children_5_9_2026"] = pd.to_numeric(data[(2026, "Persons \n5-9")], errors="coerce")
    output = output[output.sa2_code.notna()].copy()
    output.sa2_code = output.sa2_code.astype(str).str.replace(r"\.0$", "", regex=True)
    return output


def integrate(
    schools_json: Path, vif_path: Path, boundaries_path: Path,
    bridge: pd.DataFrame, localities: pd.DataFrame,
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, dict]:
    vif = load_vif(vif_path)
    boundary = gpd.read_file(boundaries_path).to_crs("EPSG:7844")
    code = "id" if "id" in boundary else "SA2_CODE_2021"
    name = "name" if "name" in boundary else "SA2_NAME_2021"
    boundary = boundary[[code, name, "geometry"]].rename(columns={code: "sa2_code", name: "sa2_name"})
    boundary.sa2_code = boundary.sa2_code.astype(str)

    payload = json.loads(schools_json.read_text())
    schools = pd.DataFrame(payload["result"]["records"])
    schools = schools[schools.School_Status.eq("O")].copy()
    points = gpd.GeoDataFrame(
        schools,
        geometry=gpd.points_from_xy(pd.to_numeric(schools.X), pd.to_numeric(schools.Y)),
        crs="EPSG:7844",
    )
    joined = gpd.sjoin(points, boundary, predicate="within", how="inner")
    joined["offers_primary"] = joined.School_Type.isin(["Primary", "Pri/Sec"])
    joined["is_special"] = joined.School_Type.eq("Special")
    counts = joined.groupby(["sa2_code", "sa2_name"], as_index=False).agg(
        primary_school_campuses=("offers_primary", "sum"),
        special_school_campuses=("is_special", "sum"),
        all_school_campuses=("School_No", "nunique"),
    )
    sa2 = boundary.drop(columns="geometry").merge(
        vif.drop(columns="sa2_name"), on="sa2_code", how="left", validate="one_to_one"
    )
    sa2 = sa2.merge(counts, on=["sa2_code", "sa2_name"], how="left")
    count_columns = ["primary_school_campuses", "special_school_campuses", "all_school_campuses"]
    sa2[count_columns] = sa2[count_columns].fillna(0).astype(int)

    bridge = bridge.copy()
    bridge.sa2_code_2021 = bridge.sa2_code_2021.astype(str)
    component = bridge.merge(sa2, left_on="sa2_code_2021", right_on="sa2_code", how="left")
    aggregate = component.groupby("community_id", as_index=False).agg(
        children_0_4_2026=("children_0_4_2026", "sum"),
        children_5_9_2026=("children_5_9_2026", "sum"),
        primary_school_campuses=("primary_school_campuses", "sum"),
        special_school_campuses=("special_school_campuses", "sum"),
        all_school_campuses=("all_school_campuses", "sum"),
    )
    output = localities[["community_id", "neighbourhood_id", "community_name"]].merge(
        aggregate, on="community_id", how="left"
    )
    denominator = output.children_5_9_2026.where(output.children_5_9_2026 > 0)
    output["primary_school_campuses_per_1000_children_5_9"] = (
        output.primary_school_campuses / denominator * 1_000
    ).round(4)
    score = output.primary_school_campuses_per_1000_children_5_9.rank(method="average", pct=True) * 100
    output["primary_school_campus_availability_score"] = score.where(
        output.primary_school_campuses > 0, 0
    ).round(2)
    output["source_id"] = "victoria_school_locations_2025_vif2023"
    qa = {
        "school_records_received": int(payload["result"]["total"]),
        "open_schools": len(schools),
        "open_schools_in_greater_melbourne": int(joined.School_No.nunique()),
        "primary_or_combined_campuses_in_greater_melbourne": int(joined.offers_primary.sum()),
        "reporting_localities": len(output),
        "missing_child_population": int(output.children_5_9_2026.isna().sum()),
        "missing_scores": int(output.primary_school_campus_availability_score.isna().sum()),
        "score_method": "Greater Melbourne percentile of primary or combined campuses located in the locality per 1,000 VIF-projected children aged 5-9 in 2026",
        "limitations": "Campus presence does not measure enrolment capacity, school quality, eligibility, zone access, travel time, disability accessibility or family preference. Children aged 5-9 are a published five-year denominator, not the full compulsory-primary-school age range.",
    }
    return pd.DataFrame(joined.drop(columns="geometry")), sa2, output, qa


def main() -> None:
    parser = argparse.ArgumentParser()
    for name in ("schools", "vif", "boundaries", "bridge", "localities", "school_output", "sa2_output", "community_output", "qa"):
        parser.add_argument("--" + name.replace("_", "-"), dest=name, type=Path, required=True)
    args = parser.parse_args()
    schools, sa2, output, qa = integrate(
        args.schools, args.vif, args.boundaries, pd.read_csv(args.bridge), pd.read_csv(args.localities)
    )
    for path in (args.school_output, args.sa2_output, args.community_output, args.qa):
        path.parent.mkdir(parents=True, exist_ok=True)
    schools.to_csv(args.school_output, index=False)
    sa2.to_csv(args.sa2_output, index=False)
    output.to_csv(args.community_output, index=False)
    args.qa.write_text(json.dumps(qa, indent=2) + "\n")


if __name__ == "__main__":
    main()
