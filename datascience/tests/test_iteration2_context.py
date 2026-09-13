from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
PROC = ROOT / "data" / "processed"


def test_context_outputs_preserve_geographic_cardinality():
    traffic = pd.read_csv(PROC / "traffic_context_sa2.csv", dtype={"SA2_CODE_2021": str})
    npi = pd.read_csv(PROC / "npi_context_sa2.csv", dtype={"SA2_CODE_2021": str})
    communities = pd.read_csv(PROC / "community_context.csv")
    assert len(traffic) == len(npi) == 361
    assert traffic.SA2_CODE_2021.is_unique and npi.SA2_CODE_2021.is_unique
    assert len(communities) == 346 and communities.community_id.is_unique
    boundary_codes = set(pd.read_csv(ROOT / "data/reference/sa2_ed3_lookup.csv",
                                     dtype=str).SA2_CODE_2021)
    assert set(traffic.SA2_CODE_2021) <= boundary_codes
    assert set(npi.SA2_CODE_2021) <= boundary_codes


def test_traffic_context_is_bounded_and_never_called_exposure_or_risk():
    data = pd.read_csv(PROC / "traffic_context_sa2.csv")
    available = data[data.traffic_quality_flag == "CONTEXT_ONLY"]
    assert len(available) > 300
    assert available.declared_road_km.gt(0).all()
    assert available.length_weighted_aadt.between(0, 200_000).all()
    assert available.length_weighted_heavy_aadt.between(0, 50_000).all()
    assert available.high_traffic_road_share_pct.between(0, 100).all()
    assert available.actual_observation_road_share_pct.between(0, 100).all()
    assert not any("risk" in column or "exposure" in column for column in data.columns)


def test_npi_context_uses_latest_year_and_distances_not_risk_scores():
    data = pd.read_csv(PROC / "npi_context_sa2.csv")
    assert set(data.npi_reference_year) == {"2024/2025"}
    assert data.npi_facilities.ge(0).all()
    assert data.npi_respiratory_reporting_facilities.ge(0).all()
    assert data.nearest_npi_facility_km.ge(0).all()
    assert data.nearest_npi_respiratory_reporting_facility_km.ge(0).all()
    assert (data.npi_respiratory_reporting_facilities <= data.npi_facilities).all()
    assert not any("risk" in column for column in data.columns)


def test_community_rollup_does_not_turn_missing_traffic_into_zero():
    data = pd.read_csv(PROC / "community_context.csv")
    missing = data[data.declared_road_km.isna()]
    assert missing.length_weighted_aadt.isna().all()
    assert set(data.context_quality_flag) == {"CONTEXT_ONLY"}
