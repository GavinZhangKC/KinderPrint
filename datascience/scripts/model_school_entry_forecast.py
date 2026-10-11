"""School-entry outlook: forecast the next AEDC cycle (2027) for every community.

Question
--------
For children who will start school in the area at the next census (2027), what
share is likely to be on track in all five AEDC domains? The answer is an
area-level outlook shown beside each area in "Where to live". It never predicts
anything about an individual child.

Design decisions (stated before results were examined)
------------------------------------------------------
1. Rolling-origin evaluation. Each model learns from three-year transitions
   (2012->2015, 2015->2018, 2018->2021) and is scored on a transition it never saw
   (2021->2024). The final model is refitted on all four transitions to forecast 2027.
2. Candidates, simplest first:
   F0 persistence     the last published share
   F1 shrunk level    the last share pulled toward its region (empirical-Bayes beta-binomial)
   F2 shrunk + trend  F1 plus the Greater Melbourne change over the previous cycle, damped by half
   F3 ridge           weighted ridge predicting the area's position relative to Greater Melbourne
                      from its shrunk relative level now and three years earlier, its region's
                      relative level and change, log children assessed and IRSD; alpha by
                      SA4-grouped CV. The Melbourne level is carried forward unchanged.
   F4 boosting        gradient boosting on the same relative formulation (monotone in the level)
3. Selection rule. Lowest child-weighted MAE on the 2024 holdout. A more complex model is
   chosen only if it beats the simpler one by at least 3%; otherwise the simpler is kept.
   Because 2021->2024 is used for this choice, it is a validation set, not an untouched test.
4. Intervals. Predictive variance = model variance (from training residuals, net of binomial
   noise) + binomial variance for the expected cohort. The 2027 interval also adds a cycle-shock
   term estimated after 2024 was seen, so its coverage is nominal and not yet demonstrated.
6. Chronological evaluation (added after review). The candidate and the ridge alpha are chosen
   with transitions before 2021 only (train 2012->2015 and 2015->2018, validate on 2018->2021;
   alpha by grouped CV inside training). The chosen candidate is refitted on the three earlier
   transitions and scored once on 2021->2024. Interval SDs come only from out-of-time residuals
   available at the 2021 origin (2015->2018 predicted from 2012->2015; 2018->2021 predicted from
   2012->2015 and 2015->2018).
5. Ranking metrics are reported too, because the app compares areas by percentile:
   Spearman correlation and precision/recall for "top quarter of areas" in 2024.

Outputs
-------
data/processed/school_entry_forecast_community.csv
reports/family_fit/school_entry_forecast.json
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import norm, spearmanr
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.linear_model import Ridge
from sklearn.model_selection import GroupKFold
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from kinderprint.analytics.family_fit import eb_beta  # noqa: E402

PROC = ROOT / "data" / "processed"
REPORT = ROOT / "reports" / "family_fit" / "school_entry_forecast.json"
OUTPUT = PROC / "school_entry_forecast_community.csv"
DOMAIN = "On track on all five domains"
YEARS = [2009, 2012, 2015, 2018, 2021, 2024]
TRAIN_ORIGINS = [2012, 2015, 2018]
HOLDOUT_ORIGIN = 2021
FORECAST_ORIGIN, FORECAST_YEAR = 2024, 2027
FEATURES = ["rel_shrunk", "rel_shrunk_prev", "rel_sa4", "sa4_change", "log_n", "irsd"]
COMPLEXITY_MARGIN = 0.03
CANDIDATES = ["F0", "F1", "F2", "F3", "F4"]
# Chronological evaluation: every choice uses transitions that end on or before the test origin.
CHRONO_TRAIN = [2012, 2015]
CHRONO_VALIDATE = 2018
CHRONO_TEST = 2021
INTERVAL_LABEL = "nominal 80% range (coverage not yet demonstrated)"
SOURCE_ID = "aedc_sa2_2009_2024;seifa_2021_sa2"


def load() -> pd.DataFrame:
    comm = pd.read_csv(PROC / "communities.csv", dtype={"neighbourhood_id": str})
    cd = pd.read_csv(PROC / "child_development.csv")
    cd = cd[cd.domain == DOMAIN].pivot_table(index=["community_id", "reference_year"], columns="indicator",
                                              values="value").reset_index()
    socio = pd.read_csv(PROC / "socioeconomic_wide.csv")[["community_id", "irsd_score"]]
    frame = cd.merge(comm[["community_id", "neighbourhood_id", "community_name", "sa4_name"]], on="community_id")
    return frame.merge(socio, on="community_id", how="left").rename(columns={"irsd_score": "irsd"})


def year_panel(frame: pd.DataFrame) -> pd.DataFrame:
    """Shrunk share per community and year, plus regional level and change."""
    out = []
    for year in YEARS:
        y = frame[frame.reference_year == year].set_index("community_id").copy()
        a, b = eb_beta(y.on_track_n, y.n_children, y.sa4_name)
        y["shrunk"] = 100 * a / (a + b)
        y["raw"] = 100 * y.on_track_n / y.n_children
        weighted = y.dropna(subset=["raw", "n_children"])
        sa4 = weighted.groupby("sa4_name").apply(lambda g: np.average(g.raw, weights=g.n_children), include_groups=False)
        y["sa4_level"] = y.sa4_name.map(sa4)
        y["melb_level"] = np.average(weighted.raw, weights=weighted.n_children)
        y["year"] = year
        out.append(y.reset_index())
    panel = pd.concat(out)
    prev = panel[["community_id", "year", "shrunk", "sa4_level", "melb_level"]].copy()
    prev["year"] += 3
    panel = panel.merge(prev.rename(columns={"shrunk": "shrunk_prev", "sa4_level": "sa4_prev", "melb_level": "melb_prev"}),
                        on=["community_id", "year"], how="left")
    panel["sa4_change"] = panel.sa4_level - panel.sa4_prev
    panel["melb_change"] = panel.melb_level - panel.melb_prev
    panel["rel_shrunk"] = panel.shrunk - panel.melb_level
    panel["rel_shrunk_prev"] = panel.shrunk_prev - panel.melb_prev
    panel["rel_sa4"] = panel.sa4_level - panel.melb_level
    panel["log_n"] = np.log(panel.n_children.where(panel.n_children > 0))
    return panel


def transitions(panel: pd.DataFrame, origins: list[int]) -> pd.DataFrame:
    target = panel[["community_id", "year", "raw", "n_children"]].rename(
        columns={"raw": "target", "n_children": "target_n"})
    target["year"] -= 3
    t = panel[panel.year.isin(origins)].merge(target, on=["community_id", "year"], how="left")
    t["target_rel"] = t.target - t.melb_level
    return t


def wmetrics(y, pred, w) -> dict:
    err = pred - y
    return {"weighted_mae_pp": round(float(np.average(np.abs(err), weights=w)), 3),
            "mae_pp": round(float(np.mean(np.abs(err))), 3),
            "rmse_pp": round(float(np.sqrt(np.mean(err ** 2))), 3),
            "bias_pp": round(float(np.average(err, weights=w)), 3),
            "within_5pp": round(float(np.mean(np.abs(err) <= 5)), 4),
            "within_10pp": round(float(np.mean(np.abs(err) <= 10)), 4)}


def ridge_alpha(train: pd.DataFrame) -> float:
    best, score = 1.0, np.inf
    folds = GroupKFold(n_splits=5)
    for alpha in [1, 10, 100, 300, 1000, 3000, 10000, 30000, 100000]:
        errs = []
        for tr, te in folds.split(train, groups=train.sa4_name):
            m = make_pipeline(StandardScaler(), Ridge(alpha=alpha))
            m.fit(train.iloc[tr][FEATURES], train.iloc[tr].target_rel, ridge__sample_weight=train.iloc[tr].target_n)
            errs.append(np.average(np.abs(m.predict(train.iloc[te][FEATURES]) - train.iloc[te].target_rel),
                                   weights=train.iloc[te].target_n))
        if np.mean(errs) < score:
            best, score = alpha, float(np.mean(errs))
    return best


def fit_predict(name: str, train: pd.DataFrame, test: pd.DataFrame, alpha: float | None = None):
    if name == "F0":
        return test.raw.to_numpy(), None
    if name == "F1":
        return test.shrunk.to_numpy(), None
    if name == "F2":
        return (test.shrunk + 0.5 * test.melb_change.fillna(0)).to_numpy(), None
    if name == "F3":
        alpha = alpha if alpha is not None else ridge_alpha(train)
        m = make_pipeline(StandardScaler(), Ridge(alpha=alpha))
        m.fit(train[FEATURES], train.target_rel, ridge__sample_weight=train.target_n)
        return test.melb_level.to_numpy() + m.predict(test[FEATURES]), {"alpha": alpha, "model": m}
    if name == "F4":
        m = HistGradientBoostingRegressor(max_depth=3, learning_rate=0.05, max_iter=300, min_samples_leaf=20,
                                          monotonic_cst=[1, 0, 0, 0, 0, 0], random_state=20261009)
        m.fit(train[FEATURES], train.target_rel, sample_weight=train.target_n)
        return test.melb_level.to_numpy() + m.predict(test[FEATURES]), {"model": m}
    raise ValueError(name)


def model_sd(train: pd.DataFrame, pred: np.ndarray) -> float:
    """Between-area SD of errors beyond binomial noise, from the training transitions."""
    resid = train.target - pred
    binom = (train.target * (100 - train.target) / train.target_n).mean()
    return float(np.sqrt(max(np.average(resid ** 2, weights=train.target_n) - binom, 1.0)))


def cycle_shock_sd(panel: pd.DataFrame, origins: list[int]) -> float:
    """SD of the Greater Melbourne change between consecutive cycles, from the given origins only.

    Every area moves with a common cycle-to-cycle shift (the whole cohort, the collection year)
    that no area-level feature can anticipate, so it is added to each area's predictive variance.
    """
    changes = panel[panel.year.isin([o + 3 for o in origins])].groupby("year").melb_change.first().dropna()
    return float(np.sqrt(np.mean(changes ** 2))) if len(changes) else 0.0


def select(maes: dict) -> str:
    """Walk from the simplest candidate; replace only if at least COMPLEXITY_MARGIN better."""
    chosen = CANDIDATES[0]
    for name in CANDIDATES[1:]:
        if maes[name] <= maes[chosen] * (1 - COMPLEXITY_MARGIN):
            chosen = name
    return chosen


def out_of_time(panel: pd.DataFrame, name: str, origins: list[int]) -> pd.DataFrame:
    """Out-of-time residual rows: each transition after the first is predicted by a model trained
    only on the transitions before it (alpha tuned inside that training set)."""
    rows = []
    for i in range(1, len(origins)):
        tr = _ready(transitions(panel, origins[:i]))
        te = _ready(transitions(panel, [origins[i]]))
        pred, _ = fit_predict(name, tr, te)
        rows.append(te.assign(pred=pred))
    return pd.concat(rows)


def _ready(t: pd.DataFrame) -> pd.DataFrame:
    return t.dropna(subset=FEATURES + ["raw", "target"])


def scored(y, pred, w, n, sd) -> dict:
    """Accuracy, ranking and nominal-interval checks for one set of predictions."""
    m = {k: v for k, v in wmetrics(y, pred, w).items() if k in ("weighted_mae_pp", "bias_pp", "rmse_pp")}
    m["spearman"] = round(float(spearmanr(pred, y).statistic), 4)
    se = interval(pred, sd, n)
    for level in (80, 95):
        z = norm.ppf(0.5 + level / 200)
        m[f"coverage_{level}"] = round(float(np.mean(np.abs(y - pred) <= z * se)), 4)
        m[f"mean_width_{level}_pp"] = round(float(np.mean(2 * z * se)), 3)
    m["past_only_model_sd_pp"] = round(sd, 3)
    return m


def select_by_validation(panel: pd.DataFrame) -> dict:
    """Choose the candidate using only transitions that end on or before CHRONO_TEST.

    The panel passed in must not contain any year after the test origin; this is enforced so the
    test transition cannot be read by mistake.
    """
    if panel.year.max() > CHRONO_TEST:
        raise ValueError("selection must not see years after the test origin")
    train = _ready(transitions(panel, CHRONO_TRAIN))
    val = _ready(transitions(panel, [CHRONO_VALIDATE]))
    y, w, n = val.target.to_numpy(), val.target_n.to_numpy(), val.target_n.to_numpy()
    out = {}
    for name in CANDIDATES:
        pred, extra = fit_predict(name, train, val)
        past = out_of_time(panel, name, CHRONO_TRAIN)  # 2012->2015 trains, 2015->2018 is residual
        sd = model_sd(past, past.pred.to_numpy())
        out[name] = scored(y, pred, w, n, sd)
        if extra and "alpha" in extra:
            out[name]["alpha"] = extra["alpha"]
    chosen = select({k: v["weighted_mae_pp"] for k, v in out.items()})
    return {"validation": out, "selected": chosen, "n_train": int(len(train)), "n_validate": int(len(val))}


def chronological_evaluation(panel: pd.DataFrame) -> dict:
    """Nested, strictly chronological evaluation. The test transition is read once, after selection."""
    sel = select_by_validation(panel[panel.year <= CHRONO_TEST].copy())
    chosen = sel["selected"]
    past_panel = panel[panel.year <= CHRONO_TEST]
    origins = CHRONO_TRAIN + [CHRONO_VALIDATE]
    train = _ready(transitions(past_panel, origins))
    test = _ready(transitions(panel, [CHRONO_TEST]))
    y, w, n = test.target.to_numpy(), test.target_n.to_numpy(), test.target_n.to_numpy()
    test_scores = {}
    for name in CANDIDATES:
        pred, extra = fit_predict(name, train, test)
        past = out_of_time(past_panel, name, origins)
        sd = model_sd(past, past.pred.to_numpy())
        test_scores[name] = scored(y, pred, w, n, sd)
        if extra and "alpha" in extra:
            test_scores[name]["alpha"] = extra["alpha"]
    s, p = test_scores[chosen], test_scores["F0"]
    skill = 1 - s["weighted_mae_pp"] / p["weighted_mae_pp"]
    fmt = lambda t: f"{t}->{t + 3}"  # noqa: E731
    beats = s["weighted_mae_pp"] < p["weighted_mae_pp"]
    interp = (
        f"Selected {chosen} using 2018->2021 only. On the untouched 2021->2024 transition ({len(test)} areas) "
        f"its child-weighted MAE is {s['weighted_mae_pp']:.2f} pp against {p['weighted_mae_pp']:.2f} pp for persistence "
        f"({'better' if beats else 'not better'}, skill {skill:+.1%}), Spearman {s['spearman']:.2f} vs {p['spearman']:.2f}, "
        f"bias {s['bias_pp']:+.2f} pp (positive means forecasts were too high on average). With past-only residuals "
        f"the nominal 80% and 95% intervals covered {s['coverage_80']:.1%} and {s['coverage_95']:.1%} of areas"
        f"{' (below nominal)' if s['coverage_80'] < 0.8 or s['coverage_95'] < 0.95 else ''}. "
        "This is one test transition; it cannot show that "
        "coverage or skill will hold in 2027, so the 2027 outlook is exploratory and its interval is nominal."
    )
    return {
        "design": "Candidate and ridge alpha chosen on transitions ending on or before the test origin; "
                  "chosen candidate refitted on all earlier transitions and scored once on the test transition. "
                  "Interval SD from out-of-time residuals available at the test origin only (net of binomial noise), "
                  "plus binomial variance for the observed test cohort. No cycle-shock term is added.",
        "selection_set": {"train_transitions": [fmt(o) for o in CHRONO_TRAIN],
                          "validation_transition": fmt(CHRONO_VALIDATE),
                          "n_train": sel["n_train"], "n_validate": sel["n_validate"],
                          "past_only_residuals": [fmt(o) for o in CHRONO_TRAIN[1:]],
                          "rule": "lowest child-weighted MAE on the validation transition; a more complex "
                                  "candidate must beat the simpler by >= 3%"},
        "validation": sel["validation"],
        "selected_by_validation": chosen,
        "test_set": {"train_transitions": [fmt(o) for o in origins], "test_transition": fmt(CHRONO_TEST),
                     "n_train": int(len(train)), "n_test": int(len(test)), "test_transitions": 1,
                     "past_only_residuals": [fmt(o) for o in origins[1:]],
                     "strength": f"weak: one test transition ({len(test)} areas sharing one common cycle shift); "
                                 "area errors are not independent, so coverage and skill have wide uncertainty"},
        "test_all_candidates": test_scores,
        "test_all_candidates_note": "reported for reference only; the test result is the selected candidate",
        "selected_test": s,
        "persistence_test": p,
        "skill_vs_persistence_test": round(float(skill), 4),
        "nominal_coverage": {"coverage_80": 0.80, "coverage_95": 0.95},
        "information_note": "IRSD 2021 is used as a feature for every origin, including 2012, 2015 and 2018, "
                            "so earlier transitions use information not available at their origin.",
        "interpretation": interp,
    }


def interval(pred, sd_model, n, sd_shock=0.0):
    p = np.clip(pred, 1, 99)
    sd = np.sqrt(sd_model ** 2 + sd_shock ** 2 + p * (100 - p) / n)
    return sd


def run() -> tuple[pd.DataFrame, dict]:
    panel = year_panel(load())
    feature_ok = lambda t: t.dropna(subset=FEATURES + ["raw"])  # noqa: E731
    train = feature_ok(transitions(panel, TRAIN_ORIGINS)).dropna(subset=["target"])
    hold = feature_ok(transitions(panel, [HOLDOUT_ORIGIN])).dropna(subset=["target"])
    results, preds = {}, {}
    alpha = ridge_alpha(train)
    shock = cycle_shock_sd(panel, TRAIN_ORIGINS)
    for name in ["F0", "F1", "F2", "F3", "F4"]:
        pred, extra = fit_predict(name, train, hold, alpha if name == "F3" else None)
        train_pred, _ = fit_predict(name, train, train, alpha if name == "F3" else None)
        sd = model_sd(train, train_pred)
        se = interval(pred, sd, hold.target_n.to_numpy(), shock)
        y, w = hold.target.to_numpy(), hold.target_n.to_numpy()
        m = wmetrics(y, pred, w)
        m["coverage_80"] = round(float(np.mean(np.abs(y - pred) <= norm.ppf(0.9) * se)), 4)
        m["coverage_95"] = round(float(np.mean(np.abs(y - pred) <= norm.ppf(0.975) * se)), 4)
        shift = float(np.average(pred - y, weights=w))
        m["mae_after_common_shift_pp"] = round(float(np.average(np.abs(pred - shift - y), weights=w)), 3)
        m["spearman"] = round(float(spearmanr(pred, y).statistic), 4)
        top_true = y >= np.quantile(y, 0.75)
        top_pred = pred >= np.quantile(pred, 0.75)
        tp = int((top_true & top_pred).sum())
        m["top_quarter_precision"] = round(tp / top_pred.sum(), 4)
        m["top_quarter_recall"] = round(tp / top_true.sum(), 4)
        m["model_sd_pp"] = round(sd, 3)
        if name == "F3":
            m["alpha"] = alpha
        results[name], preds[name] = m, pred
    # selection: walk from simplest; replace only if >= 3% better
    chosen = select({k: v["weighted_mae_pp"] for k, v in results.items()})
    # bias-corrected variant reported for transparency (not used for selection)
    skill = 1 - results[chosen]["weighted_mae_pp"] / results["F0"]["weighted_mae_pp"]

    # refit on all transitions, forecast 2027 from 2024
    full = feature_ok(transitions(panel, TRAIN_ORIGINS + [HOLDOUT_ORIGIN])).dropna(subset=["target"])
    origin = feature_ok(panel[panel.year == FORECAST_ORIGIN].copy())
    final_alpha = ridge_alpha(full) if chosen == "F3" else None
    fpred, _ = fit_predict(chosen, full, origin, final_alpha)
    full_pred, _ = fit_predict(chosen, full, full, final_alpha)
    sd = model_sd(full, full_pred)
    full_shock = cycle_shock_sd(panel, TRAIN_ORIGINS + [HOLDOUT_ORIGIN])
    se = interval(fpred, sd, origin.n_children.to_numpy(), full_shock)
    out = pd.DataFrame({
        "community_id": origin.community_id.to_numpy(),
        "neighbourhood_id": origin.neighbourhood_id.to_numpy(),
        "community_name": origin.community_name.to_numpy(),
        "observed_2024_pct": origin.raw.round(2).to_numpy(),
        "children_assessed_2024": origin.n_children.astype(int).to_numpy(),
        "forecast_year": FORECAST_YEAR,
        "forecast_pct": np.clip(fpred, 0, 100).round(2),
        "lower_80_pct": np.clip(fpred - norm.ppf(0.9) * se, 0, 100).round(2),
        "upper_80_pct": np.clip(fpred + norm.ppf(0.9) * se, 0, 100).round(2),
        "model": chosen,
        "interval_label": INTERVAL_LABEL,
        "source_id": SOURCE_ID,
    }).sort_values("community_id")
    level_shift = float(panel[panel.year == 2024].melb_change.iloc[0])
    chrono = chronological_evaluation(panel)
    report = {
        "question": "Share of children on track in all five AEDC domains at the next census (2027), by community",
        "unit": "AEDC community (one or more SA2s), Greater Melbourne",
        "training_transitions": [f"{o}->{o + 3}" for o in TRAIN_ORIGINS],
        "holdout_transition": f"{HOLDOUT_ORIGIN}->{HOLDOUT_ORIGIN + 3}",
        "n_train": int(len(train)), "n_holdout": int(len(hold)),
        "selection_rule": "lowest child-weighted MAE on the holdout; a more complex model must beat the simpler by >= 3%",
        "candidates": results,
        "selected": chosen,
        "skill_vs_persistence": round(float(skill), 4),
        "labels": {
            "holdout_role": "validation: 2021->2024 was used to choose among the candidates, so the "
                            "candidate metrics above are not an untouched test; see chronological_evaluation",
            "candidate_intervals": "SD from in-sample training residuals plus a cycle-shock term; "
                                   "coverage_80 and coverage_95 are observed on the validation transition",
            "mae_after_common_shift_pp": "diagnostic only: assumes the 2021->2024 Melbourne-wide shift was known "
                                         "in advance; not operational performance",
            "forecast_interval": INTERVAL_LABEL,
            "outlook_status": "exploratory",
        },
        "chronological_evaluation": chrono,
        "melbourne_level_shift_2021_2024_pp": round(level_shift, 3),
        "forecast": {"origin": FORECAST_ORIGIN, "year": FORECAST_YEAR, "communities": int(len(out)),
                     "refit_transitions": [f"{o}->{o + 3}" for o in TRAIN_ORIGINS + [HOLDOUT_ORIGIN]],
                     "model_sd_pp": round(sd, 3), "cycle_shock_sd_pp": round(full_shock, 3), "ridge_alpha": final_alpha,
                     "interval": "lower_80_pct to upper_80_pct", "interval_label": INTERVAL_LABEL,
                     "interval_note": "cycle-shock SD estimated after 2024 was seen; 2027 coverage is unvalidated"},
        "holdout_cycle_shock_sd_pp": round(shock, 3),
        "limitations": [
            "AEDC is a census every three years; four transitions is a short history.",
            f"Greater Melbourne {'fell' if level_shift < 0 else 'rose'} by {abs(level_shift):.1f} percentage points between 2021 and 2024 "
            "(after pandemic-affected cohorts); no model trained on earlier cycles anticipated a shift of that size, so holdout errors carry a common bias.",
            "IRSD is from 2021 and is used for every origin year, so the 2012, 2015 and 2018 transitions use "
            "information that was not available at their origin.",
            "The candidate table uses 2021->2024 both to choose the model and to score it; the untouched-test "
            "result is chronological_evaluation, which has a single test transition.",
            f"The 2027 interval is a {INTERVAL_LABEL}.",
            "Forecasts describe areas, never individual children.",
        ],
    }
    return out, report


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--output", type=Path, default=OUTPUT)
    parser.add_argument("--report", type=Path, default=REPORT)
    args = parser.parse_args(argv)
    out, report = run()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    out.to_csv(args.output, index=False)
    if args.output == OUTPUT or args.report != REPORT:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({k: report[k] for k in ["selected", "skill_vs_persistence"]}))
    print("chronological", json.dumps({k: report["chronological_evaluation"][k] for k in
                                       ["selected_by_validation", "selected_test", "persistence_test"]}))
    for k, v in report["candidates"].items():
        print(k, v)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
