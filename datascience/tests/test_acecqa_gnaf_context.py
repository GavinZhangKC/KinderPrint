import json
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
PROC = ROOT / "data/processed"
OUT = ROOT / "outputs/iteration_2"


def context():
    return pd.read_csv(PROC / "acecqa_gnaf_context_community.csv", dtype=str).fillna("")


def test_gnaf_context_covers_each_reporting_locality_once():
    data = context()
    communities = pd.read_csv(PROC / "communities.csv", dtype=str)
    assert len(data) == len(communities) == 346
    assert data.community_id.is_unique
    assert set(data.community_id) == set(communities.community_id)
    assert data.neighbourhood_id.ne("").all()


def test_gnaf_context_contains_no_address_or_coordinate_fields():
    columns = {column.casefold() for column in context().columns}
    forbidden = {"address", "longitude", "latitude", "postcode", "gnaf_identifier"}
    assert not any(any(term in column for term in forbidden) for column in columns)


def test_gnaf_context_counts_reconcile_with_validation_report():
    data = context()
    report = json.loads((OUT / "acecqa_gnaf_context_validation.json").read_text())
    active = pd.to_numeric(data.active_education_care_services)
    exact = pd.to_numeric(data.exact_match_services)
    high = pd.to_numeric(data.high_confidence_match_services)
    assert report["address_fields_in_output"] is False
    assert report["product_status"] == "VALIDATED_AGGREGATE_CONTEXT"
    assert active.sum() == report["active_services_aggregated"]
    assert exact.sum() + high.sum() == active.sum()
    assert (active > 0).sum() == report["localities_with_active_services"]


def test_zero_service_localities_are_zero_not_missing():
    data = context()
    counts = [
        "active_education_care_services", "exact_match_services",
        "high_confidence_match_services", "services_with_approved_places",
        "total_approved_places", "long_day_care_services", "kindergarten_services",
        "services_with_current_rating",
    ]
    numeric = data[counts].apply(pd.to_numeric)
    assert numeric.notna().all().all()
    assert numeric.ge(0).all().all()
    assert data.context_status.eq("AGGREGATE_SERVICE_CONTEXT").all()
