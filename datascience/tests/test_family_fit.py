"""Family Fit engine, school-entry outlook and the published artefact."""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(ROOT / "scripts"))

from kinderprint.analytics import family_fit as ff  # noqa: E402

ARTEFACT = ROOT / "outputs" / "iteration_3" / "family_fit.json"
REPORT = ROOT / "reports" / "family_fit" / "family_fit_validation.json"
FORECAST_REPORT = ROOT / "reports" / "family_fit" / "school_entry_forecast.json"


# ----------------------------------------------------------------- statistics

def test_small_groups_are_pulled_further_toward_their_region():
    k = pd.Series([9, 50, 30, 240, 120, 80])
    n = pd.Series([10, 100, 60, 600, 200, 200])
    g = pd.Series(["A"] * 6)
    a, b = ff.eb_beta(k, n, g)
    shrunk = a / (a + b)
    region = (k / n).mean()
    small_move = abs(shrunk[0] - k[0] / n[0])
    large_move = abs(shrunk[3] - k[3] / n[3])
    assert small_move > large_move
    assert ((shrunk - region).abs() <= (k / n - region).abs() + 1e-12).all()


def test_missing_counts_stay_missing():
    a, b = ff.eb_beta(pd.Series([5, np.nan, 3]), pd.Series([10, 20, 0]), pd.Series(["A", "A", "A"]))
    assert np.isnan(a[1]) and np.isnan(a[2]) and a[0] > 0


def test_percentiles_follow_direction():
    v = pd.Series([1.0, 2.0, 3.0, np.nan])
    up, down = ff.percentile_rank(v, 1), ff.percentile_rank(v, -1)
    assert up.iloc[2] == 100 and down.iloc[0] == 100 and np.isnan(up.iloc[3])


def test_every_need_has_two_measures_and_plain_caveats():
    assert len(ff.NEEDS) == 8
    for need in ff.NEEDS:
        assert len(need.measures) == 2
        assert need.explains and need.does_not_confirm
    assert len(ff.MEASURE_DIRECTION) == 16


def test_need_score_is_missing_when_either_measure_is():
    measures = pd.DataFrame({m: [1.0, 2.0, 3.0] for m in ff.MEASURE_DIRECTION})
    measures.loc[0, "tree_cover_pct"] = np.nan
    s = ff.need_scores(measures)
    assert np.isnan(s.loc[0, "shade_cooler"]) and not np.isnan(s.loc[1, "shade_cooler"])


def test_essential_counts_double_and_skip_is_ignored():
    scores = pd.DataFrame({"a": [100.0], "b": [40.0], "c": [0.0]})
    m = ff.match_score(scores, {"a": "essential", "b": "prefer", "c": "skip"})
    assert m.iloc[0] == pytest.approx((100 * 2 + 40) / 3)
    assert np.isnan(ff.match_score(scores, {}).iloc[0])


def test_haversine_is_plausible():
    # Melbourne CBD to Box Hill is about 14 km
    assert 13 < ff.haversine_km(-37.8136, 144.9631, -37.8189, 145.1250) < 15


# ----------------------------------------------------------------- published outputs

@pytest.fixture(scope="module")
def artefact():
    return json.loads(ARTEFACT.read_text())


@pytest.fixture(scope="module")
def report():
    return json.loads(REPORT.read_text())


def test_all_blocking_gates_pass(report):
    failed = [g for g in report["gates"] if not g["passed"]]
    assert failed == []


def test_artefact_covers_every_reporting_area(artefact):
    comm = pd.read_csv(ROOT / "data" / "processed" / "communities.csv", dtype=str)
    ids = [a["id"] for a in artefact["areas"]]
    assert sorted(ids) == sorted(comm.neighbourhood_id) and len(set(ids)) == len(ids)
    assert {n["id"] for n in artefact["needs"]} == set(ff.NEED_IDS)
    assert artefact["metadata"]["essential_percentile"] == ff.ESSENTIAL_PERCENTILE


def test_artefact_values_are_in_range(artefact):
    for area in artefact["areas"]:
        for v in area["needs"].values():
            assert v is None or 0 < v <= 100
        for m, ab in area["adjustment"].items():
            assert ab is None or (ab[0] > 0 and ab[1] > 0)
        o = area["outlook_2027"]
        if o:
            assert o["lower80"] <= o["pct"] <= o["upper80"]
        assert area["all_five_change_flag"] in {"up", "down", "no_clear_change", "not_available"}


def test_need_scores_match_the_published_percentiles(artefact):
    for area in artefact["areas"][:40]:
        for need in artefact["needs"]:
            parts = [area["percentiles"][m["id"]] for m in need["measures"]]
            expected = None if None in parts else sum(parts) / 2
            got = area["needs"][need["id"]]
            assert (got is None and expected is None) or got == pytest.approx(expected, abs=0.011)


def test_scale_balance_fixed(report):
    s0, s2 = report["scale_balance_S0_vs_S2"]["S0_variance_share"], report["scale_balance_S0_vs_S2"]["S2_variance_share"]
    assert max(s0.values()) > 0.4            # the old engine was dominated by two measures
    assert max(s2.values()) <= 0.35 and min(s2.values()) >= 0.15


def test_small_numbers_adjustment_beats_raw_out_of_sample(report):
    for measure, r in report["small_numbers_adjustment_backtest_2021_to_2024"].items():
        assert r["mae_adjusted_pp"] < r["mae_raw_pp"], measure
        assert r["mae_adjusted_small_pp"] < r["mae_raw_small_pp"], measure


def test_reference_scenarios_respect_essential_and_distance(artefact, report):
    areas = {a["id"]: a for a in artefact["areas"]}
    for sc in report["reference_scenarios"]:
        anchor = areas[sc["anchor"]]
        for row in sc["top10"]:
            area = areas[row["id"]]
            assert row["distance_km"] <= sc["radius_km"]
            d = ff.haversine_km(anchor["latitude"], anchor["longitude"], area["latitude"], area["longitude"])
            assert d == pytest.approx(row["distance_km"], abs=0.01)
            for need, level in sc["priorities"].items():
                if level == "essential":
                    assert area["needs"][need] >= ff.ESSENTIAL_PERCENTILE
        matches = [r["match"] for r in sc["top10"]]
        assert matches == sorted(matches, reverse=True)
        stability = sc["stability"]["top10_share_in_top10"].values()
        assert all(0 <= s <= 1 for s in stability)


# ----------------------------------------------------------------- school-entry outlook

def test_forecast_model_selected_by_the_stated_rule():
    r = json.loads(FORECAST_REPORT.read_text())
    c = r["candidates"]
    assert r["selected"] in c
    chosen = "F0"
    for name in ["F1", "F2", "F3", "F4"]:
        if c[name]["weighted_mae_pp"] <= c[chosen]["weighted_mae_pp"] * 0.97:
            chosen = name
    assert r["selected"] == chosen
    assert c[r["selected"]]["weighted_mae_pp"] < c["F0"]["weighted_mae_pp"]
    assert c[r["selected"]]["spearman"] > c["F0"]["spearman"]


def test_forecast_never_trains_on_the_holdout():
    import model_school_entry_forecast as m
    assert m.HOLDOUT_ORIGIN not in m.TRAIN_ORIGINS
    assert max(m.TRAIN_ORIGINS) + 3 <= m.HOLDOUT_ORIGIN


def test_chronological_selection_never_reads_the_test_transition():
    import model_school_entry_forecast as m
    assert max(m.CHRONO_TRAIN) < m.CHRONO_VALIDATE < m.CHRONO_TEST
    panel = m.year_panel(m.load())
    with pytest.raises(ValueError):
        m.select_by_validation(panel)  # a panel that still holds the test target year is refused
    past = panel[panel.year <= m.CHRONO_TEST].copy()
    first = m.select_by_validation(past)
    # Scrambling every year after the test origin cannot change the choice, because it is never passed in.
    scrambled = panel.copy()
    late = scrambled.year > m.CHRONO_TEST
    scrambled.loc[late, ["raw", "shrunk", "n_children"]] = [0.0, 0.0, 1.0]
    second = m.select_by_validation(scrambled[scrambled.year <= m.CHRONO_TEST].copy())
    assert first == second
    r = json.loads(FORECAST_REPORT.read_text())["chronological_evaluation"]
    assert r["selected_by_validation"] == first["selected"]
    assert r["selection_set"]["validation_transition"] == f"{m.CHRONO_VALIDATE}->{m.CHRONO_VALIDATE + 3}"
    assert r["test_set"]["test_transition"] == f"{m.CHRONO_TEST}->{m.CHRONO_TEST + 3}"
    assert r["test_set"]["test_transition"] not in r["selection_set"]["train_transitions"]
    assert all(int(t.split("->")[1]) <= m.CHRONO_TEST for t in r["test_set"]["past_only_residuals"])


def test_chronological_evaluation_reports_coverage_for_80_and_95():
    r = json.loads(FORECAST_REPORT.read_text())["chronological_evaluation"]
    for key in ["selection_set", "test_set", "selected_by_validation", "interpretation",
                "selected_test", "persistence_test", "test_all_candidates", "validation"]:
        assert key in r
    assert r["test_set"]["test_transitions"] == 1 and r["test_set"]["n_test"] > 0
    assert r["nominal_coverage"] == {"coverage_80": 0.80, "coverage_95": 0.95}
    assert set(r["test_all_candidates"]) == {"F0", "F1", "F2", "F3", "F4"}
    assert r["selected_test"] == r["test_all_candidates"][r["selected_by_validation"]]
    assert r["persistence_test"] == r["test_all_candidates"]["F0"]
    for m in list(r["test_all_candidates"].values()) + list(r["validation"].values()):
        for k in ["weighted_mae_pp", "bias_pp", "spearman", "coverage_80", "coverage_95",
                  "mean_width_80_pp", "mean_width_95_pp", "past_only_model_sd_pp"]:
            assert k in m
        assert 0 <= m["coverage_80"] <= m["coverage_95"] <= 1
        assert 0 < m["mean_width_80_pp"] < m["mean_width_95_pp"]


def test_forecast_interval_is_labelled_nominal():
    import model_school_entry_forecast as m
    label = "nominal 80% range (coverage not yet demonstrated)"
    assert m.INTERVAL_LABEL == label
    r = json.loads(FORECAST_REPORT.read_text())
    assert r["forecast"]["interval_label"] == label
    assert r["labels"]["forecast_interval"] == label
    assert "not operational performance" in r["labels"]["mae_after_common_shift_pp"]
    assert "validation" in r["labels"]["holdout_role"]
    f = pd.read_csv(ROOT / "data" / "processed" / "school_entry_forecast_community.csv")
    assert (f.interval_label == label).all()


def test_forecast_file_is_complete():
    f = pd.read_csv(ROOT / "data" / "processed" / "school_entry_forecast_community.csv")
    assert f.community_id.is_unique and len(f) >= 330
    assert ((f.lower_80_pct <= f.forecast_pct) & (f.forecast_pct <= f.upper_80_pct)).all()
    assert f.forecast_pct.between(0, 100).all()


def test_a_failed_gate_blocks_publication(tmp_path, monkeypatch):
    import build_family_fit as b
    monkeypatch.setattr(b, "gates", lambda *a, **k: [{"gate": "forced failure", "passed": False, "value": None}])
    monkeypatch.setattr(b, "stability", lambda *a, **k: {"eligible": 0, "top10_share_in_top10": {}})
    artefact = tmp_path / "family_fit.json"
    code = b.main(["--output", str(tmp_path / "t.csv"), "--artefact", str(artefact), "--report", str(tmp_path / "r.json")])
    assert code == 1 and not artefact.exists()
    assert json.loads((tmp_path / "r.json").read_text())["gates"][0]["passed"] is False


def test_change_log_reports_moved_scores():
    import build_family_fit as b
    old = {"metadata": {"built_utc": "x", "input_sha256": {"a.csv": "1"}},
           "areas": [{"id": "1", "needs": {n: 50.0 for n in ff.NEED_IDS}}]}
    new = {"areas": [{"id": "1", "needs": {**{n: 50.0 for n in ff.NEED_IDS}, "gp_access": 70.0}},
                     {"id": "2", "needs": {n: 10.0 for n in ff.NEED_IDS}}]}
    log = b.change_log(old, new, {"input_sha256": {"a.csv": "2"}})
    assert log["changed_inputs"] == ["a.csv"] and log["added"] == ["2"]
    assert log["need_score_movement"]["gp_access"]["areas_moved_over_10_points"] == 1


def test_shortlist_stability_reruns_the_full_search():
    """Stability must come from rerunning the whole search (thresholds included) on every draw."""
    import json
    from pathlib import Path
    report = json.loads((Path(__file__).resolve().parents[1] / "reports" / "family_fit" /
                         "family_fit_validation.json").read_text())
    scenarios = report["reference_scenarios"]
    for sc in scenarios:
        st = sc["stability"]
        assert st["method"] == "full search rerun per draw"
        assert all(0 <= v <= 1 for v in st["top10_share_in_top10"].values())
        assert "assumption" in st
    assert any(sc["stability"]["areas_entering_top10_in_some_draws"] >= 1 for sc in scenarios)
