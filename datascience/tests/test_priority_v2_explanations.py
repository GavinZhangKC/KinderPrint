"""Priority V2: explanations reconstruct the published expectation, and the
band-stability measures are labelled for what they actually do."""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest
from sklearn.model_selection import GroupKFold

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import model_expected_vulnerability as v2  # noqa: E402

PROC = ROOT / "data" / "processed"
REPORT = ROOT / "reports" / "iteration3" / "model_expected_vulnerability.json"
CONTRIBUTIONS = ROOT / "reports" / "iteration3" / "model_expected_vulnerability_contributions.csv"
TOL = v2.RECONCILIATION_TOLERANCE_PP


@pytest.fixture(scope="module")
def report():
    return json.loads(REPORT.read_text())


@pytest.fixture(scope="module")
def published():
    return pd.read_csv(PROC / "expected_vulnerability_community.csv", dtype={"community_id": str})


@pytest.fixture(scope="module")
def parts():
    return pd.read_csv(CONTRIBUTIONS, dtype={"community_id": str})


def synthetic(n_per_group: int = 30, groups: int = 5, seed: int = 0) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    n = n_per_group * groups
    frame = pd.DataFrame(rng.normal(size=(n, len(v2.FEATURES))), columns=v2.FEATURES)
    frame[v2.GROUP] = np.repeat([f"sa4_{i}" for i in range(groups)], n_per_group)
    frame[v2.WEIGHT] = rng.integers(20, 300, n).astype(float)
    frame[v2.TARGET] = 20 + frame[v2.FEATURES].to_numpy() @ rng.normal(size=len(v2.FEATURES)) + rng.normal(0, 2, n)
    return frame


# ------------------------------------------------------- explanation fidelity
def test_contributions_add_up_to_the_explained_models_prediction():
    frame = synthetic()
    train, held = frame.iloc[:120], frame.iloc[120:]
    model = v2.fit_linear(v2.make_linear(v2.FEATURES, 3.0), train[v2.FEATURES].to_numpy(float),
                          train[v2.TARGET].to_numpy(float), train[v2.WEIGHT].to_numpy(float))
    values, base, _ = v2.contributions("M2", model, held, train)
    assert base + values.sum(axis=1).to_numpy() == pytest.approx(model.predict(held[v2.FEATURES].to_numpy(float)), abs=1e-9)


def test_out_of_fold_contributions_reconstruct_out_of_fold_expectations():
    frame = synthetic()
    pred, _, folds = v2.out_of_fold("M2", frame, GroupKFold(n_splits=5), keep_models=True)
    contrib, base, fold_sa4, _ = v2.out_of_fold_contributions("M2", frame, folds)
    check = v2.reconcile(pred, base, contrib)
    assert check["n_over_tolerance"] == 0 and check["max_abs_diff"] < 1e-9
    assert (fold_sa4 == frame[v2.GROUP].to_numpy()).all()  # each row explained by the fold that held it out


def test_every_published_community_is_reconstructed_within_tolerance(published, parts):
    merged = published[["community_id", "expected_pct"]].merge(parts, on="community_id", how="outer", validate="1:1")
    assert len(merged) == len(published) == len(parts)
    rebuilt = merged.reference_pct + merged.filter(like="contribution_").sum(axis=1)
    # parts are stored to 4 dp and expected_pct to 2 dp, so allow for display rounding
    assert (rebuilt - merged.expected_pct).abs().max() <= TOL
    assert (rebuilt - merged.expected_pct_unrounded).abs().max() <= TOL


def test_report_records_the_reconciliation(report):
    check = report["explanation_reconciliation"]
    assert check["tolerance"] == TOL
    assert check["n_over_tolerance"] == 0
    assert check["max_abs_diff"] <= TOL and check["mean_abs_diff"] <= TOL
    assert check["n_communities"] == report["n_communities"]
    assert "held-out fold model" in report["explanation_method"]


def test_live_refit_matches_published_contributions(published, parts):
    """Recompute the selected model's fold explanations and compare with the published file."""
    frame = v2.load()
    selected = json.loads(REPORT.read_text())["selected_model"]
    pred, _, folds = v2.out_of_fold(selected, frame, GroupKFold(n_splits=frame[v2.GROUP].nunique()), keep_models=True)
    contrib, base, _, _ = v2.out_of_fold_contributions(selected, frame, folds)
    gap = np.abs(pred - (base + contrib.to_numpy().sum(axis=1)))
    assert gap.max() <= TOL
    live = frame[["community_id"]].assign(expected=pred, reference=base).merge(parts, on="community_id")
    assert len(live) == len(published)
    assert (live.expected - live.expected_pct_unrounded).abs().max() < 1e-4
    assert (live.reference - live.reference_pct).abs().max() < 1e-3


# ------------------------------------------------------------ stability label
def test_stability_labels_are_explicit(report):
    assert report["higher_band_stability"]["label"] == v2.SPATIAL_STABILITY_LABEL
    iid = report["higher_band_stability_iid_refit"]
    assert iid["label"] == "IID refit stability (does not reproduce the spatial holdout)"
    assert iid["bootstraps"] > 0 and report["higher_band_stability"]["bootstraps"] > 0


def test_spatial_block_bootstrap_never_sees_the_held_out_sa4():
    """Changing outcomes inside one SA4 must not move that SA4's bootstrap expectations."""
    frame = synthetic()
    changed = frame.copy()
    target = changed[v2.GROUP] == "sa4_2"
    changed.loc[target, v2.TARGET] += 15
    a = v2.spatial_block_stability("M2", frame, {"alpha": 3.0}, 20, retune=False)
    b = v2.spatial_block_stability("M2", changed, {"alpha": 3.0}, 20, retune=False)
    mask = target.to_numpy()
    assert a["expected_p05"][mask] == pytest.approx(b["expected_p05"][mask], abs=1e-9)
    assert a["expected_p95"][mask] == pytest.approx(b["expected_p95"][mask], abs=1e-9)


def test_iid_refit_is_not_a_holdout():
    """The IID check predicts communities with models that saw them, as its label says."""
    frame = synthetic()
    features = frame[v2.FEATURES].to_numpy(float)
    model = v2.fit_final("M2", frame, {"alpha": 3.0})
    shifted = frame.assign(**{v2.TARGET: frame[v2.TARGET] + 15 * (frame[v2.GROUP] == "sa4_2")})
    moved = v2.fit_final("M2", shifted, {"alpha": 3.0})
    mask = (frame[v2.GROUP] == "sa4_2").to_numpy()
    assert np.abs(model.predict(features[mask]) - moved.predict(features[mask])).max() > 0.5


def test_served_band_stability_is_the_spatial_share(published):
    context = pd.read_csv(PROC / "practitioner_context_sa2.csv", dtype={"community_id": str})
    merged = context.dropna(subset=["band_stability"]).merge(
        published[["community_id", "higher_band_bootstrap_share"]], on="community_id")
    assert len(merged) > 0
    assert (merged.band_stability == merged.higher_band_bootstrap_share).all()
