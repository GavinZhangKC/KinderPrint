"""Tests for the E2SFCA access model and the V2 expected-vulnerability model."""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import build_access_e2sfca as access  # noqa: E402
import model_expected_vulnerability as v2  # noqa: E402

PROC = ROOT / "data" / "processed"
REPORT = ROOT / "reports" / "iteration3" / "model_expected_vulnerability.json"


# -------------------------------------------------------------- E2SFCA
def test_gaussian_weight_is_one_at_origin_and_zero_at_catchment_edge():
    d = np.array([0.0, 2.5, 5.0, 7.0])
    w = access.gaussian_weight(d, 5.0)
    assert w[0] == pytest.approx(1.0)
    assert 0 < w[1] < 1
    assert w[2] == pytest.approx(0.0) and w[3] == 0.0


def test_e2sfca_conserves_supply():
    """sum_i P_i A_i equals total supply when every facility has demand in reach."""
    rng = np.random.default_rng(1)
    pop = rng.integers(100, 5000, 20).astype(float)
    supply = rng.integers(1, 10, 8).astype(float)
    distance = rng.uniform(0, 4, (20, 8))
    a = access.e2sfca(pop, supply, distance, 5.0)
    assert (pop * a).sum() == pytest.approx(supply.sum())


def test_e2sfca_rewards_nearby_supply_and_penalises_shared_supply():
    pop = np.array([1000.0, 1000.0, 1000.0])
    supply = np.array([1.0])
    near_far = np.array([[0.5], [4.0], [20.0]])
    a = access.e2sfca(pop, supply, near_far, 5.0)
    assert a[0] > a[1] > a[2] == 0
    crowded = access.e2sfca(np.array([1000.0, 50000.0]), supply, np.array([[1.0], [1.0]]), 5.0)
    alone = access.e2sfca(np.array([1000.0]), supply, np.array([[1.0]]), 5.0)
    assert crowded[0] < alone[0]


def test_weighted_gini_bounds():
    assert access.weighted_gini(np.ones(10), np.ones(10)) == pytest.approx(0.0, abs=1e-9)
    unequal = access.weighted_gini(np.r_[np.zeros(9), 1.0], np.ones(10))
    assert 0.85 < unequal <= 1.0


def test_access_output_covers_scope_without_negative_values():
    out = pd.read_csv(PROC / "access_e2sfca_sa2.csv", dtype={"sa2_code": str})
    scope = pd.read_csv(PROC / "healthdirect_facility_counts_sa2.csv", dtype={"sa2_code": str}).sa2_code
    for service in ("gp", "ecec"):
        rows = out[out.service == service]
        assert set(rows.sa2_code) == set(scope)
        assert (rows[["access_3km", "access_5km", "access_10km"]] >= 0).all().all()
    diagnostics = json.loads((ROOT / "reports" / "iteration3" / "access_e2sfca_diagnostics.json").read_text())
    assert diagnostics["gp"]["catchment_sensitivity_spearman"]["3km_vs_5km"] > 0.6


# ------------------------------------------------------------ V2 model
def test_funnel_z_has_unit_robust_spread_and_no_excess_for_pure_binomial():
    rng = np.random.default_rng(7)
    n = rng.integers(40, 400, 400).astype(float)
    expected = rng.uniform(10, 30, 400)
    observed = rng.binomial(n.astype(int), expected / 100) / n * 100
    z, tau2 = v2.funnel_z(observed, expected, n)
    assert tau2 < 5e-4
    over = observed + rng.normal(0, 6, 400)          # add between-area variation
    z2, tau2b = v2.funnel_z(over, expected, n)
    assert tau2b > tau2
    assert 1.4826 * np.median(np.abs(z2 - np.median(z2))) == pytest.approx(1.0, abs=0.01)


def test_bands_follow_pre_registered_thresholds():
    assert v2.band(np.array([1.28, 1.27, 0.5, 0.49])).tolist() == ["Higher", "Moderate", "Moderate", "Lower"]


def test_morans_i_detects_clustering():
    lat = np.repeat(np.linspace(-38, -37.5, 10), 10)
    lon = np.tile(np.linspace(144.8, 145.3, 10), 10)
    clustered = lon + lat  # smooth gradient
    noise = np.random.default_rng(3).normal(size=100)
    assert v2.morans_i(clustered, lat, lon, permutations=99)["morans_i"] > 0.5
    assert abs(v2.morans_i(noise, lat, lon, permutations=99)["morans_i"]) < 0.2


def test_bh_adjustment():
    q = v2.bh_adjust(np.array([0.01, 0.04, 0.03, 0.5]))
    assert q.tolist() == pytest.approx([0.04, 0.0533, 0.0533, 0.5], abs=1e-3)


# ----------------------------------------------------- published outputs
@pytest.fixture(scope="module")
def published():
    return pd.read_csv(PROC / "expected_vulnerability_community.csv", dtype={"community_id": str})


@pytest.fixture(scope="module")
def report():
    return json.loads(REPORT.read_text())


def test_every_analysable_community_has_an_out_of_fold_expectation(published):
    assert len(published) == 342
    assert published.expected_pct.notna().all()
    assert set(published.band_v2) <= {"Higher", "Moderate", "Lower"}


def test_higher_band_means_observed_above_expected_range(published):
    higher = published.band_v2 == "Higher"
    assert (published.loc[higher, "observed_pct"] >= published.loc[higher, "expected_range_hi_pct"] - 0.1).all()
    assert (published.loc[~higher, "observed_pct"] <= published.loc[~higher, "expected_range_hi_pct"] + 0.1).all()


def test_model_is_calibrated_and_not_a_disadvantage_map(report):
    selected = report["models"][report["selected_model"]]["spatial_cv_leave_one_sa4_out"]
    assert 0.9 <= selected["calibration_slope"] <= 1.1
    assert selected["r2"] > 0.4
    assert report["disadvantage_guard"]["passed"]


def test_selected_model_beats_v1_replica_out_of_sample(report):
    spatial = {m: report["models"][m]["spatial_cv_leave_one_sa4_out"]["mae_pp"] for m in ("M1", "M2", "M3")}
    assert spatial[report["selected_model"]] <= spatial["M1"]


def test_residual_bias_by_disadvantage_is_small(report):
    assert max(abs(v) for v in report["bias"]["by_irsd_quintile_mean_residual_pp"].values()) < 1.5


def test_higher_band_is_stable_under_bootstrap(report):
    stability = report["higher_band_stability"]
    assert stability["higher_flagged_in_at_least_70pct"] >= 0.75 * report["band_counts"]["Higher"]
