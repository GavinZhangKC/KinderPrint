"""Plan a change (P2): build the served table, validate it and publish it.

Inputs (data/processed)
-----------------------
family_fit_community.csv     place features, small-number-adjusted AEDC results, 2027 outlook
socioeconomic_wide.csv       IRSD (used only to find similar areas; never scored)

Method (kinderprint.analytics.plan_change)
------------------------------------------
For an area and a planned change to one or two place features, two pools of
other areas are found: areas already near the planned level ("like the plan")
and areas near today's level ("like now"), each similar to this area on
disadvantage and children assessed. Plan-like areas are paired 1:1 with
now-like areas of similar disadvantage and size, and the mean paired gap in AEDC
results is reported with an 80% bootstrap interval. It is an association
across areas, never the effect of the change.

Validation (reports/plan_change/plan_change_validation.json)
------------------------------------------------------------
* P0 audit: the previous Simulation page fitted a straight-line model of AEDC on
  place features in the browser. Its tree-cover slope is compared with and
  without IRSD to show how much of it was disadvantage.
* Coverage and balance for every preset across all areas (blocking gates).
* Placebo: place features shuffled across areas; the share of "clear" results
  should fall to about the 20% expected by chance.
* Sensitivity: band, pool size and pair caliper varied; agreement on direction.
* Reference searches: three areas x all presets, pinned for the backend parity test.

Outputs
-------
outputs/iteration_3/plan_change.json   (served by /api/plan-change endpoints)
reports/plan_change/plan_change_validation.json

Exit status 1 if a blocking gate fails; nothing is written then.
"""
from __future__ import annotations

import argparse
import json
import random
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from kinderprint.analytics import plan_change as pc  # noqa: E402

PROC = ROOT / "data" / "processed"
ARTEFACT = ROOT / "outputs" / "iteration_3" / "plan_change.json"
REPORT = ROOT / "reports" / "plan_change" / "plan_change_validation.json"
REFERENCE_AREAS = ("Brunswick East", "Footscray", "Box Hill")
GATE_COVERAGE = 0.60     # share of area x preset with a result
GATE_BALANCE = 0.80      # share of results whose groups are balanced (|SMD| <= 0.25)
SCHEMA_VERSION = 1


def _v(x) -> float | None:
    return None if pd.isna(x) else round(float(x), 4)


def build_table() -> pd.DataFrame:
    ff = pd.read_csv(PROC / "family_fit_community.csv")
    irsd = pd.read_csv(PROC / "socioeconomic_wide.csv").set_index("community_id").irsd_score
    ff["irsd"] = ff.community_id.map(irsd)
    return ff


def areas_from(table: pd.DataFrame) -> list[pc.Area]:
    out = []
    for r in table.itertuples():
        out.append(pc.Area(
            id=r.community_id, name=r.community_name,
            levers={lever: _v(getattr(r, spec["column"])) for lever, spec in pc.LEVERS.items()},
            covariates={"irsd": _v(r.irsd), "children_assessed": _v(r.aedc_all_five_on_track_n)},
            outcomes={"all_five": _v(r.aedc_all_five_on_track_pct), "physical": _v(r.aedc_physical_on_track_pct)},
        ))
    return out


def p0_audit(table: pd.DataFrame) -> dict:
    """How much of the old straight-line tree-cover slope was disadvantage."""
    cols = ["tree_cover_pct", "urban_heat_degc", "open_space_pct", "road_traffic_intensity"]
    d = table.dropna(subset=cols + ["irsd", "aedc_all_five_on_track_pct"]).copy()
    z = (d[cols] - d[cols].mean()) / d[cols].std()
    y = d.aedc_all_five_on_track_pct.to_numpy()

    def slope(X: np.ndarray) -> np.ndarray:
        X = np.column_stack([np.ones(len(X)), X])
        return np.linalg.lstsq(X, y, rcond=None)[0][1:]
    without = slope(z.to_numpy())
    irsd_z = ((d.irsd - d.irsd.mean()) / d.irsd.std()).to_numpy()
    with_irsd = slope(np.column_stack([z.to_numpy(), irsd_z]))
    share = 1 - with_irsd[0] / without[0] if without[0] else None
    return {
        "model": "P0: ordinary least squares of AEDC all-five on four place features (previous Simulation page)",
        "tree_cover_slope_pp_per_sd_without_irsd": round(float(without[0]), 2),
        "tree_cover_slope_pp_per_sd_with_irsd": round(float(with_irsd[0]), 2),
        "share_of_tree_slope_explained_by_irsd": round(float(share), 3) if share is not None else None,
        "areas": int(len(d)),
        "finding": "Most of the straight-line tree-cover slope reflects disadvantage, which P0 did not account for.",
    }


def run_all(engine: pc.Engine, areas: list[pc.Area], **kwargs) -> dict:
    stats = {}
    for preset in pc.PRESETS:
        c = Counter()
        balanced = clear = 0
        for area in areas:
            r = engine.evaluate(area.id, preset["plan"], **kwargs)
            c[r["status"]] += 1
            if r["status"] == "ok":
                balanced += r["balanced"]
                clear += r["outcomes"]["all_five"]["direction"] != "unclear"
        ok = c["ok"]
        stats[preset["id"]] = {"statuses": dict(c), "coverage": round(ok / len(areas), 3),
                               "balanced_share": round(balanced / ok, 3) if ok else None,
                               "clear_share": round(clear / ok, 3) if ok else None}
    return stats


def directions(engine: pc.Engine, areas: list[pc.Area], **kwargs) -> dict:
    out = {}
    for preset in pc.PRESETS:
        for area in areas:
            r = engine.evaluate(area.id, preset["plan"], **kwargs)
            if r["status"] == "ok":
                out[(preset["id"], area.id)] = r["outcomes"]["all_five"]["direction"]
    return out


def placebo_clarity(areas: list[pc.Area], seed: int = 20261011) -> list[float]:
    """Clarity of every result when place features are shuffled across areas."""
    rng = random.Random(seed)
    shuffled = {lever: [a.levers[lever] for a in areas] for lever in pc.LEVER_IDS}
    for values in shuffled.values():
        rng.shuffle(values)
    fake = [pc.Area(a.id, a.name, {lever: shuffled[lever][i] for lever in pc.LEVER_IDS}, a.covariates, a.outcomes)
            for i, a in enumerate(areas)]
    engine = pc.Engine(fake)
    out = []
    for preset in pc.PRESETS:
        for area in fake:
            r = engine.evaluate(area.id, preset["plan"], inflate=1.0)
            if r["status"] == "ok":
                out.append(r["outcomes"]["all_five"]["clarity"])
    return out


def calibrate(clarity: list[float], target: float = 0.20) -> float:
    """Smallest widening (>= 1) that leaves at most `target` of shuffled results 'clear'."""
    ordered = sorted(clarity)
    cut = ordered[int(np.ceil((1 - target) * len(ordered))) - 1]
    return round(max(1.0, float(cut)) + 0.005, 3)


def reference(engine: pc.Engine, table: pd.DataFrame, inflate: float) -> list[dict]:
    refs = []
    for name in REFERENCE_AREAS:
        row = table[table.community_name == name]
        if row.empty:
            continue
        area_id = row.community_id.iloc[0]
        for preset in pc.PRESETS:
            refs.append({"area_id": area_id, "area_name": name, "preset": preset["id"],
                         "result": engine.evaluate(area_id, preset["plan"], inflate=inflate)})
    return refs


def artefact(table: pd.DataFrame, refs: list[dict], built: str, inflate: float) -> dict:
    rows = []
    for r in table.itertuples():
        rows.append({
            "id": r.community_id, "name": r.community_name, "neighbourhood_id": str(r.neighbourhood_id),
            "sa4": r.sa4_name,
            "levers": {lever: _v(getattr(r, spec["column"])) for lever, spec in pc.LEVERS.items()},
            "covariates": {"irsd": _v(r.irsd), "children_assessed": _v(r.aedc_all_five_on_track_n)},
            "outcomes": {"all_five": _v(r.aedc_all_five_on_track_pct), "physical": _v(r.aedc_physical_on_track_pct)},
            "outlook_2027": None if pd.isna(r.all_five_forecast_2027_pct) else {
                "all_five_pct": round(float(r.all_five_forecast_2027_pct), 1),
                "lower_80": round(float(r.all_five_forecast_2027_lower80), 1),
                "upper_80": round(float(r.all_five_forecast_2027_upper80), 1)},
        })
    return {
        "schema_version": SCHEMA_VERSION,
        "model": "P2 matched-pair analogues",
        "built_utc": built,
        "parameters": {"band": pc.BAND, "k": pc.K, "min_pairs": pc.MIN_GROUP, "caliper": pc.CALIPER,
                       "pair_caliper": pc.PAIR_CALIPER, "bootstrap": pc.BOOTSTRAP, "interval": list(pc.INTERVAL),
                       "smd_limit": pc.SMD_LIMIT, "max_levers": pc.MAX_LEVERS, "inflate": inflate},
        "levers": pc.LEVERS, "outcomes": pc.OUTCOMES, "presets": pc.PRESETS,
        "sources": {
            "place_features": "Cooling and Greening Melbourne 2018 (tree cover, urban heat); VPA open space 2018; DTP declared-road traffic 2019",
            "outcomes": "AEDC 2024, small-number adjusted (empirical Bayes)",
            "outlook_2027": "Vkinder school-entry forecast F3",
            "similarity": "ABS SEIFA 2021 IRSD; AEDC children assessed 2024",
        },
        "caveat": "Areas that already look like a plan are compared with similar areas that look like this one now. "
                  "This is an association across areas, not the effect of making the change. Area-level only.",
        "areas": rows,
        "reference": refs,
    }


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--dry-run", action="store_true", help="Validate without writing outputs.")
    args = parser.parse_args(argv)

    table = build_table()
    areas = areas_from(table)
    engine = pc.Engine(areas)
    built = datetime.now(timezone.utc).replace(microsecond=0).isoformat()

    shuffled = placebo_clarity(areas)
    inflate = calibrate(shuffled)
    placebo = {"results": len(shuffled), "clear_share_uncalibrated": round(sum(c > 1 for c in shuffled) / len(shuffled), 3),
               "inflate": inflate, "clear_share_calibrated": round(sum(c > inflate for c in shuffled) / len(shuffled), 3),
               "note": "Place features shuffled across areas, so any link with AEDC is broken. Intervals are widened "
                       "until at most 20% of shuffled results look clear, the rate an 80% interval should give by chance."}
    main_stats = run_all(engine, areas, inflate=inflate)
    total = len(areas) * len(pc.PRESETS)
    ok = sum(s["statuses"].get("ok", 0) for s in main_stats.values())
    balanced = sum((s["balanced_share"] or 0) * s["statuses"].get("ok", 0) for s in main_stats.values())
    clear = sum((s["clear_share"] or 0) * s["statuses"].get("ok", 0) for s in main_stats.values())
    coverage = ok / total
    balance = balanced / ok if ok else 0.0

    base_dirs = directions(engine, areas, inflate=inflate)
    sensitivity = {}
    for label, kw in {"band_7": {"band": 7.0}, "band_13": {"band": 13.0}, "k_8": {"k": 8}, "k_16": {"k": 16},
                      "pair_caliper_7": {"pair_caliper": 7.0}, "pair_caliper_13": {"pair_caliper": 13.0}}.items():
        alt = directions(engine, areas, inflate=inflate, **kw)
        shared = [key for key in base_dirs if key in alt]
        clear_base = [key for key in shared if base_dirs[key] != "unclear"]
        sensitivity[label] = {
            "shared_results": len(shared),
            "same_direction": round(sum(base_dirs[k] == alt[k] for k in shared) / len(shared), 3) if shared else None,
            "clear_results_not_reversed": round(sum(alt[k] in (base_dirs[k], "unclear") for k in clear_base) / len(clear_base), 3) if clear_base else None,
        }

    repeat = engine.evaluate(areas[0].id, pc.PRESETS[0]["plan"], inflate=inflate) == engine.evaluate(areas[0].id, pc.PRESETS[0]["plan"], inflate=inflate)
    refs = reference(engine, table, inflate)
    gates = {
        "coverage": {"value": round(coverage, 3), "threshold": GATE_COVERAGE, "pass": coverage >= GATE_COVERAGE},
        "balance": {"value": round(balance, 3), "threshold": GATE_BALANCE, "pass": balance >= GATE_BALANCE},
        "reproducible": {"pass": bool(repeat)},
        "reference_searches": {"value": len(refs), "pass": len(refs) == len(REFERENCE_AREAS) * len(pc.PRESETS)},
    }
    report = {
        "built_utc": built, "model": "P2 matched-pair analogues",
        "p0_audit": p0_audit(table),
        "presets": main_stats,
        "overall": {"results": ok, "searches": total, "coverage": round(coverage, 3),
                    "balanced_share": round(balance, 3), "clear_share": round(clear / ok, 3) if ok else None},
        "placebo": placebo,
        "sensitivity": sensitivity,
        "gates": gates,
    }
    print(json.dumps({k: report[k] for k in ("p0_audit", "overall", "placebo", "gates")}, indent=2))
    if not all(g["pass"] for g in gates.values()):
        print("Blocking gate failed; nothing written.", file=sys.stderr)
        return 1
    if args.dry_run:
        return 0
    ARTEFACT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    ARTEFACT.write_text(json.dumps(artefact(table, refs, built, inflate), ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    REPORT.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {ARTEFACT.relative_to(ROOT)} and {REPORT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
