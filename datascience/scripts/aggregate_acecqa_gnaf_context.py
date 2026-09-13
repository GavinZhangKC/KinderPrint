"""Aggregate accepted ACECQA/Open G-NAF matches to KinderPrint localities."""
from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data/raw"
PROC = ROOT / "data/processed"
OUT = ROOT / "outputs/iteration_2"


def newest(filename: str) -> Path:
    paths = sorted(RAW.rglob(filename))
    if not paths:
        raise FileNotFoundError(filename)
    return paths[-1]


def main() -> None:
    matches = pd.read_csv(
        PROC / "acecqa_gnaf_geocoding.csv",
        dtype={"service_approval_number": str, "assigned_sa2": str},
    ).fillna("")
    services = pd.read_csv(newest("education_services_vic.csv"), dtype=str).fillna("")
    communities = pd.read_csv(PROC / "communities.csv", dtype=str).fillna("")

    if (matches.service_approval_number.duplicated().any()
            or services.ServiceApprovalNumber.duplicated().any()
            or communities.community_id.duplicated().any()):
        raise ValueError("Expected unique service and locality identifiers")

    accepted = matches[matches.included_in_spatial_analysis.astype(str).str.lower().eq("true")].copy()
    if not accepted.match_status.isin(["EXACT", "HIGH_CONFIDENCE"]).all():
        raise ValueError("Only accepted deterministic matches may be aggregated")
    joined = accepted.merge(
        services,
        left_on="service_approval_number",
        right_on="ServiceApprovalNumber",
        how="left",
        validate="one_to_one",
        indicator=True,
    )
    if not joined._merge.eq("both").all():
        raise ValueError("Every included geocode must match one ACECQA service")

    joined["is_active"] = ~joined["Temporarily Closed"].eq("Yes")
    joined["approved_places"] = pd.to_numeric(joined.NumberOfApprovedPlaces, errors="coerce")
    joined["has_current_rating"] = joined.OverallRating.ne("")
    joined["is_long_day_care"] = joined["Long Day Care"].eq("Yes")
    joined["is_kindergarten"] = (
        joined["Preschool/Kindergarten - Part of a School"].eq("Yes")
        | joined["Preschool/Kindergarten - Stand alone"].eq("Yes")
    )
    active = joined[joined.is_active].copy()
    grouped = active.groupby("assigned_kinderprint_locality").agg(
        active_education_care_services=("service_approval_number", "nunique"),
        exact_match_services=("match_status", lambda values: int(values.eq("EXACT").sum())),
        high_confidence_match_services=("match_status", lambda values: int(values.eq("HIGH_CONFIDENCE").sum())),
        services_with_approved_places=("approved_places", "count"),
        total_approved_places=("approved_places", "sum"),
        long_day_care_services=("is_long_day_care", "sum"),
        kindergarten_services=("is_kindergarten", "sum"),
        services_with_current_rating=("has_current_rating", "sum"),
    ).reset_index().rename(columns={"assigned_kinderprint_locality": "community_id"})

    result = communities[["community_id", "neighbourhood_id", "community_name"]].merge(
        grouped, on="community_id", how="left", validate="one_to_one")
    count_columns = [
        "active_education_care_services", "exact_match_services",
        "high_confidence_match_services", "services_with_approved_places",
        "total_approved_places", "long_day_care_services", "kindergarten_services",
        "services_with_current_rating",
    ]
    result[count_columns] = result[count_columns].fillna(0).astype(int)
    result["rating_coverage_pct"] = (
        100 * result.services_with_current_rating / result.active_education_care_services
    ).where(result.active_education_care_services.gt(0))
    result["geocoding_source"] = "Open G-NAF August 2026 GDA2020"
    result["match_policy"] = "EXACT_OR_HIGH_CONFIDENCE_WITHIN_REPORTING_SCOPE"
    result["context_status"] = "AGGREGATE_SERVICE_CONTEXT"

    output_path = PROC / "acecqa_gnaf_context_community.csv"
    result.to_csv(output_path, index=False, float_format="%.4f")
    report = {
        "source_id": "acecqa_open_gnaf_community_context",
        "reporting_localities": len(result),
        "included_geocoded_services": len(joined),
        "temporarily_closed_excluded": int((~joined.is_active).sum()),
        "active_services_aggregated": int(result.active_education_care_services.sum()),
        "localities_with_active_services": int(result.active_education_care_services.gt(0).sum()),
        "exact_active_services": int(result.exact_match_services.sum()),
        "high_confidence_active_services": int(result.high_confidence_match_services.sum()),
        "address_fields_in_output": False,
        "product_status": "VALIDATED_AGGREGATE_CONTEXT",
    }
    (OUT / "acecqa_gnaf_context_validation.json").write_text(
        json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(report)


if __name__ == "__main__":
    main()
