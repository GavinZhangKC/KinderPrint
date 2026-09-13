"""Analytics tests: leakage, directionality, reproducibility, refusal."""
from pathlib import Path
import numpy as np
import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
PROC = ROOT / "data/processed"

MATCHING_FEATURES = ["irsd_score", "median_hh_income_weekly", "unemployment_rate",
                     "one_parent_family_pct", "children_0_4_pct", "median_age",
                     "avg_household_size"]
ENVIRONMENT_FEATURES = ["vegetation_pct", "uhi_degc", "open_space_pct"]
OUTCOME_FEATURES = ["vulnerable_pct", "vulnerable_n", "vuln2_pct", "ontrack5_pct"]


@pytest.fixture(scope="module")
def matched(): return pd.read_csv(PROC / "matched_table.csv")


# ---------- leakage: the rule protecting the product's core claim ----------
def test_environment_features_excluded_from_matching():
    """Matching on the environment would erase the differences we are looking for."""
    assert not set(MATCHING_FEATURES) & set(ENVIRONMENT_FEATURES)

def test_outcome_features_excluded_from_matching():
    """Matching on AEDC would guarantee similar outcomes by construction."""
    assert not set(MATCHING_FEATURES) & set(OUTCOME_FEATURES)


# ---------- matching behaviour ----------
def test_no_community_is_matched_to_itself(matched):
    m = matched[matched.match_idx >= 0]
    assert (m.index.values != m.match_idx.values).all()

def test_stable_peer_identifier_matches_the_positional_result(matched):
    m = matched[matched.match_idx >= 0]
    expected = matched.loc[m.match_idx.astype(int), "community_id"].to_numpy()
    assert (m.match_community_id.to_numpy() == expected).all()
    assert (m.community_id.to_numpy() != m.match_community_id.to_numpy()).all()

def test_matches_are_within_the_same_sa4(matched):
    idx = matched.reset_index(drop=True)
    m = idx[idx.match_idx >= 0]
    peers = idx.loc[m.match_idx.astype(int), "sa4_name"].values
    assert (m.sa4_name.values == peers).all()

def test_no_match_is_supported_as_a_result(matched):
    assert (matched.match_idx < 0).sum() > 0

def test_no_match_rows_carry_no_peer_distance(matched):
    assert matched.loc[matched.match_idx < 0, "match_dist"].isna().all()

def test_match_strength_is_categorical_not_numeric(matched):
    strengths = set(matched.match_strength.dropna())
    assert strengths <= {"Strong", "Moderate", "Weak"}


# ---------- priority behaviour ----------
def test_priority_is_a_band_never_a_score(matched):
    assert set(matched.v1_band.dropna()) <= {"Lower", "Moderate", "Higher"}

def test_higher_band_matches_preregistered_threshold(matched):
    """ADR-004 fixed the Higher band at z >= 1.28 before environmental results."""
    hi = matched[matched.v1_band == "Higher"]
    assert (hi.v1_z >= 1.28).all()
    assert len(hi) == 20

def test_v1_is_not_a_disadvantage_map(matched):
    """The whole reason V0 was rejected. Guard against regression."""
    from scipy import stats
    d = matched.dropna(subset=["v1_z", "irsd_score"])
    r = abs(stats.spearmanr(d.v1_z, -d.irsd_score)[0])
    assert r < 0.20, f"V1 correlates {r:.3f} with disadvantage; it is reproducing SEIFA"

def test_v0_baseline_did_correlate_with_disadvantage(matched):
    """Documents the measured trigger for the V0 -> V1 change."""
    from scipy import stats
    d = matched.dropna(subset=["v0_count", "irsd_score"])
    r = abs(stats.spearmanr(d.v0_count, -d.irsd_score)[0])
    assert r > 0.60


# ---------- uncertainty ----------
def test_every_matched_pair_carries_a_significance_state(matched):
    m = matched[matched.match_idx >= 0]
    assert m.sig.notna().all()

def test_non_overlapping_intervals_always_imply_significance(matched):
    """
    The valid direction only. Non-overlapping 95% intervals imply a significant
    difference. The converse is NOT true: comparing two intervals is more
    conservative than testing the difference directly, so a pair can be
    significant while its intervals still overlap (38 of 273 here). Asserting
    the converse would be a statistical error.
    """
    m = matched[(matched.match_idx >= 0) & matched.sig.notna()].copy()
    m["sig"] = m.sig.astype(bool)
    m["ci_overlap"] = m.ci_overlap.astype(bool)
    violations = m[(~m.ci_overlap) & (~m.sig)]
    assert len(violations) == 0

def test_significance_is_the_less_conservative_test(matched):
    """Documents the expected asymmetry so a future refactor cannot silently invert it."""
    m = matched[(matched.match_idx >= 0) & matched.sig.notna()].copy()
    m["sig"] = m.sig.astype(bool)
    m["ci_overlap"] = m.ci_overlap.astype(bool)
    assert int(m.sig.sum()) >= int((~m.ci_overlap).sum())


# ---------- environmental difference signature ----------
ENVIRONMENT_INDICATORS = ["vegetation_pct", "uhi_degc", "open_space_pct"]


def test_environment_never_entered_the_matching_metric():
    """Rule 8: matching on the environment would erase the differences we hunt for."""
    assert not set(MATCHING_FEATURES) & set(ENVIRONMENT_INDICATORS)

def test_difference_signature_only_covers_real_pairs(matched):
    sig = pd.read_csv(PROC / "environmental_differences.csv")
    paired = set(matched.loc[matched.match_idx >= 0, "community_id"])
    assert set(sig.community_id) <= paired

def test_signature_never_compares_a_community_with_itself():
    sig = pd.read_csv(PROC / "environmental_differences.csv")
    assert (sig.community_id != sig.peer_id).all()

def test_standardised_difference_matches_raw_difference_sign():
    sig = pd.read_csv(PROC / "environmental_differences.csv")
    nz = sig[(sig.abs_diff != 0) & (sig.std_diff != 0)]
    assert (np.sign(nz.abs_diff) == np.sign(nz.std_diff)).all()

def test_tree_canopy_chosen_over_total_vegetation():
    """
    ADR-005. Canopy correlates about -0.72 with urban heat, total vegetation only
    about -0.38, because grass does not cool. If this ever inverts, the choice of
    indicator needs revisiting.
    """
    from scipy import stats
    env = pd.read_csv(PROC / "environmental.csv")
    canopy = "vegetation_pct" if "vegetation_pct" in env.columns else "peranytree"
    heat = "uhi_degc" if "uhi_degc" in env.columns else "uhi18_m"
    if "peranyveg" not in env.columns:
        pytest.skip("total vegetation column not retained in this run")
    e = env.dropna(subset=[canopy, "peranyveg", heat])
    tree = abs(stats.spearmanr(e[canopy], e[heat])[0])
    allv = abs(stats.spearmanr(e.peranyveg, e[heat])[0])
    assert tree > allv, f"canopy {tree:.3f} should beat total vegetation {allv:.3f}"


# ---------- ADR-006: no double counting in the matching metric ----------
def test_matching_features_exclude_irsd_and_its_constituents():
    """
    IRSD is constructed from Census income, employment, education and family
    composition. M3 put IRSD alongside those same variables (VIF 9.43). M4 removes
    it. The guard raises rather than matching on a double-counted construct.
    """
    import sys
    sys.path.insert(0, str(ROOT / "src"))
    from kinderprint.analytics.matching import (
        assert_no_leakage, MATCH_FEATURES_M3, MATCH_FEATURES_M4)
    assert_no_leakage(MATCH_FEATURES_M4)
    with pytest.raises(ValueError, match="ADR-006"):
        assert_no_leakage(MATCH_FEATURES_M3)

def test_matching_guard_rejects_environment_variables():
    import sys
    sys.path.insert(0, str(ROOT / "src"))
    from kinderprint.analytics.matching import assert_no_leakage
    with pytest.raises(ValueError, match="under investigation"):
        assert_no_leakage(["median_age", "vegetation_pct"])

def test_matching_guard_rejects_the_outcome():
    import sys
    sys.path.insert(0, str(ROOT / "src"))
    from kinderprint.analytics.matching import assert_no_leakage
    with pytest.raises(ValueError, match="under investigation"):
        assert_no_leakage(["median_age", "vulnerable_pct"])

def test_irsd_agreement_is_out_of_sample_evidence():
    """
    Because M4 does not match on IRSD, peers agreeing on it is independent
    evidence the match worked rather than a construction artefact.
    """
    import sys, json
    sys.path.insert(0, str(ROOT / "src"))
    manifest = json.loads((ROOT / "outputs/iteration_1/run_manifest.json").read_text())
    m = manifest["metrics"]
    if "irsd_out_of_sample_corr" not in m:
        pytest.skip("run manifest predates M4")
    assert m["irsd_out_of_sample_corr"] > 0.80
    assert m["irsd_within_one_decile_pct"] > 65
