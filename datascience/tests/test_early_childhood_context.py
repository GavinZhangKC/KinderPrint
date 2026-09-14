import json
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
PROC = ROOT / "data/processed"
OUT = ROOT / "outputs/iteration_2"


def test_service_layer_uses_only_exact_authority_id_matches():
    services = pd.read_csv(PROC / "early_childhood_services.csv", dtype={"SA2_CODE_2021": str})
    assert len(services) == 3570
    assert services.ServiceApprovalNumber.is_unique
    assert set(services.spatial_match_method) == {"EXACT_AUTHORITY_ID"}
    assert services.longitude.between(144.3, 146.0).all()
    assert services.latitude.between(-38.6, -37.1).all()


def test_early_childhood_outputs_preserve_geographic_cardinality():
    sa2 = pd.read_csv(PROC / "early_childhood_context_sa2.csv", dtype={"SA2_CODE_2021": str})
    communities = pd.read_csv(PROC / "early_childhood_context_community.csv")
    assert len(sa2) == 361 and sa2.SA2_CODE_2021.is_unique
    assert len(communities) == 346 and communities.community_id.is_unique
    assert set(sa2.early_childhood_quality_flag) == {"EXACT_AUTHORITY_ID_CONTEXT"}


def test_counts_capacity_and_distance_are_bounded_without_access_claims():
    data = pd.read_csv(PROC / "early_childhood_context_sa2.csv")
    assert data.active_education_care_services.ge(0).all()
    assert data.total_approved_places.ge(0).all()
    assert data.nearest_active_service_km.ge(0).all()
    assert data.rating_coverage_pct.dropna().between(0, 100).all()
    assert not any("vacancy" in column or "access_score" in column or "risk" in column
                   for column in data.columns)


def test_temporarily_closed_services_are_not_counted_as_active():
    services = pd.read_csv(PROC / "early_childhood_services.csv")
    sa2 = pd.read_csv(PROC / "early_childhood_context_sa2.csv")
    active = services[~services.is_temporarily_closed]
    assert int(sa2.active_education_care_services.sum()) == active.ServiceApprovalNumber.nunique()


def test_linkage_report_keeps_unresolved_services_visible():
    report = json.loads((OUT / "acecqa_spatial_linkage.json").read_text())
    assert report["exact_matches_statewide"] == 4827
    assert report["unresolved_acecqa_statewide"] == 189
    assert report["spatial_match_method"] == "EXACT_AUTHORITY_ID"
