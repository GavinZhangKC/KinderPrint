import json
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
PROC = ROOT / "data/processed"
OUT = ROOT / "outputs/iteration_2"


def data():
    return pd.read_csv(PROC / "acecqa_gnaf_geocoding.csv",
                       dtype={"assigned_sa2": str}).fillna("")


def test_gnaf_qa_retains_every_acecqa_service_once():
    matches = data()
    assert len(matches) == 5016
    assert matches.service_approval_number.is_unique
    assert set(matches.match_status) == {"EXACT", "HIGH_CONFIDENCE", "REVIEW", "UNMATCHED"}


def test_only_defensible_gnaf_matches_receive_coordinates():
    matches = data()
    accepted = matches.match_status.isin(["EXACT", "HIGH_CONFIDENCE"])
    assert matches.loc[accepted, "matched_gnaf_identifier"].ne("").all()
    assert pd.to_numeric(matches.loc[accepted, "longitude"]).between(140.9, 150.1).all()
    assert pd.to_numeric(matches.loc[accepted, "latitude"]).between(-39.3, -33.9).all()
    assert matches.loc[~accepted, "longitude"].eq("").all()
    assert matches.loc[~accepted, "latitude"].eq("").all()
    assert matches.loc[matches.match_status.eq("EXACT"), "candidate_count"].eq(1).all()


def test_spatial_inclusion_requires_accepted_match_and_sa2():
    matches = data()
    included = matches.included_in_spatial_analysis.astype(str).str.lower().eq("true")
    assert matches.loc[included, "match_status"].isin(["EXACT", "HIGH_CONFIDENCE"]).all()
    assert matches.loc[included, "assigned_sa2"].str.match(r"^2\d{8}$").all()
    assert matches.loc[included, "assigned_kinderprint_locality"].ne("").all()
    assert not included[~matches.assigned_sa2.ne("")].any()


def test_gnaf_report_reconciles_exclusions():
    report = json.loads((OUT / "acecqa_gnaf_geocoding_qa.json").read_text())
    assert report["total_acecqa_services"] == 5016
    assert report["successfully_matched"] == report["exact_matches"] + report["high_confidence_matches"]
    assert report["records_included_in_spatial_analysis"] + report["records_excluded"] == 5016
    assert report["records_included_in_spatial_analysis"] == report["sa2_assignment_success_greater_melbourne"]
