"""Link ACECQA services to authoritative Vicmap points and aggregate to SA2."""
from __future__ import annotations

import json
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data/raw"
REF = ROOT / "data/reference"
PROC = ROOT / "data/processed"
OUT = ROOT / "outputs/iteration_2"
ALBERS = "EPSG:3577"


def latest(filename: str) -> Path:
    paths = sorted(RAW.rglob(filename))
    if not paths:
        raise FileNotFoundError(filename)
    return paths[-1]


def main() -> None:
    acecqa = pd.read_csv(latest("education_services_vic.csv"), dtype=str).fillna("")
    vicmap = gpd.read_file(latest("child_health_active_living_foi.geojson"))
    vicmap = vicmap[(vicmap.feature_subtype.eq("child care")) & vicmap.state.eq("VIC")].copy()
    if acecqa.ServiceApprovalNumber.duplicated().any() or vicmap.auth_org_id.dropna().duplicated().any():
        raise ValueError("Authority-ID linkage is not one-to-one")

    joined = vicmap.merge(
        acecqa,
        left_on="auth_org_id",
        right_on="ServiceApprovalNumber",
        how="inner",
        validate="one_to_one",
    )
    boundaries = gpd.read_file(REF / "sa2_melbourne.geojson").to_crs(ALBERS)
    joined = joined.to_crs(ALBERS)
    joined = gpd.sjoin(joined, boundaries[["SA2_CODE_2021", "geometry"]], predicate="within", how="inner")
    joined["is_temporarily_closed"] = joined["Temporarily Closed"].eq("Yes")
    joined["approved_places"] = pd.to_numeric(joined.NumberOfApprovedPlaces, errors="coerce")
    joined["has_current_rating"] = joined.OverallRating.ne("")
    joined["is_long_day_care"] = joined["Long Day Care"].eq("Yes")
    joined["is_kindergarten"] = (
        joined["Preschool/Kindergarten - Part of a School"].eq("Yes")
        | joined["Preschool/Kindergarten - Stand alone"].eq("Yes")
    )
    geographic = joined.to_crs("EPSG:4326")
    service_columns = [
        "ServiceApprovalNumber", "ServiceName", "ServiceType", "SA2_CODE_2021",
        "approved_places", "OverallRating", "RatingsIssued", "is_temporarily_closed",
        "is_long_day_care", "is_kindergarten",
    ]
    services = pd.DataFrame(geographic[service_columns])
    services["longitude"] = geographic.geometry.x
    services["latitude"] = geographic.geometry.y
    services["spatial_match_method"] = "EXACT_AUTHORITY_ID"
    services["acecqa_source_id"] = "acecqa_services_vic_daily"
    services["coordinate_source_id"] = "vicmap_foi_child_care"

    active = joined[~joined.is_temporarily_closed].copy()
    grouped = active.groupby("SA2_CODE_2021").agg(
        active_education_care_services=("ServiceApprovalNumber", "nunique"),
        services_with_approved_places=("approved_places", "count"),
        total_approved_places=("approved_places", "sum"),
        long_day_care_services=("is_long_day_care", "sum"),
        kindergarten_services=("is_kindergarten", "sum"),
        services_with_current_rating=("has_current_rating", "sum"),
    ).reset_index()
    grouped["rating_coverage_pct"] = 100 * grouped.services_with_current_rating / grouped.active_education_care_services
    active_union = active.geometry.union_all()
    result = boundaries[["SA2_CODE_2021"]].merge(grouped, on="SA2_CODE_2021", how="left")
    count_columns = ["active_education_care_services", "services_with_approved_places",
                     "total_approved_places", "long_day_care_services", "kindergarten_services",
                     "services_with_current_rating"]
    result[count_columns] = result[count_columns].fillna(0).astype(int)
    result["nearest_active_service_km"] = boundaries.geometry.representative_point().distance(active_union).to_numpy() / 1000
    result["rating_coverage_pct"] = result.rating_coverage_pct.where(result.active_education_care_services.gt(0))
    result["early_childhood_quality_flag"] = "EXACT_AUTHORITY_ID_CONTEXT"
    result["source_snapshot_date"] = "2026-09-13"

    bridge = pd.read_csv(PROC / "community_sa2.csv", dtype={"sa2_code_2021": str})
    combined = bridge.merge(result, left_on="sa2_code_2021", right_on="SA2_CODE_2021", how="left")
    records = []
    for community_id, group in combined.groupby("community_id"):
        service_count = int(group.active_education_care_services.sum())
        rated = int(group.services_with_current_rating.sum())
        records.append({
            "community_id": community_id,
            **{column: int(group[column].sum()) for column in count_columns},
            "rating_coverage_pct": 100 * rated / service_count if service_count else np.nan,
            "nearest_active_service_km": group.nearest_active_service_km.min(),
            "early_childhood_quality_flag": "EXACT_AUTHORITY_ID_CONTEXT",
        })

    PROC.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    services.to_csv(PROC / "early_childhood_services.csv", index=False, float_format="%.6f")
    result.to_csv(PROC / "early_childhood_context_sa2.csv", index=False, float_format="%.4f")
    pd.DataFrame(records).to_csv(PROC / "early_childhood_context_community.csv", index=False, float_format="%.4f")
    summary = {
        "acecqa_services": len(acecqa),
        "vicmap_victorian_child_care_points": len(vicmap),
        "exact_matches_statewide": int(vicmap.auth_org_id.isin(set(acecqa.ServiceApprovalNumber)).sum()),
        "exact_matches_greater_melbourne": len(joined),
        "unresolved_acecqa_statewide": len(acecqa) - int(vicmap.auth_org_id.isin(set(acecqa.ServiceApprovalNumber)).sum()),
        "temporarily_closed_in_greater_melbourne": int(joined.is_temporarily_closed.sum()),
        "spatial_match_method": "EXACT_AUTHORITY_ID",
    }
    (OUT / "acecqa_spatial_linkage.json").write_text(json.dumps(summary, indent=2) + "\n")
    print(summary)


if __name__ == "__main__":
    main()
