"""Family Fit: the area table behind "Where to live", with validation gates.

Inputs (all data/processed unless noted)
----------------------------------------
communities.csv, community_sa2.csv          AEDC reporting areas and their SA2s
child_development.csv                       AEDC 2015 and 2024 counts (five measures)
environmental.csv                           tree cover, urban heat, open space (2018)
transport_suitability.csv                   main-road traffic intensity (2019), stops (2026)
npi_suitability.csv                         industrial sites reporting air emissions (2024-25)
school_child_population_suitability.csv     primary campuses per 1,000 children aged 5-9
acecqa_suitability.csv                      kindergarten services per 1,000 children under 5
access_e2sfca_sa2.csv                       GP and childcare access allowing for neighbours (E2SFCA)
school_entry_forecast_community.csv         2027 outlook (model_school_entry_forecast.py)
socioeconomic_wide.csv                      IRSD, for the fairness audit only (never scored)
data/reference/sa2_lga_2023_vic.csv         SA2 label points

Method
------
1. One row per AEDC reporting area. SA2-level inputs are combined with the
   area's SA2s: E2SFCA access weighted by each SA2's demand population, label
   points averaged.
2. AEDC on-track shares are adjusted for small numbers of children with an
   empirical-Bayes beta-binomial prior per SA4 (kinderprint.analytics.family_fit.eb_beta).
   The posterior alpha and beta are published so the confidence check can redraw them.
3. Every measure is turned into a direction-aligned Greater Melbourne percentile.
   Each of eight child-focused needs is the mean of its two measure percentiles.
4. Missing values stay missing. An area without a measure is left out of searches
   that use it and is shown as "data unavailable".

Outputs
-------
data/processed/family_fit_community.csv
outputs/iteration_3/family_fit.json                 (served by the /api/family-fit endpoints)
outputs/iteration_3/family_fit_shapes.json          (simplified outlines for the overview map)
reports/family_fit/family_fit_validation.json       (gates, audits and reference scenarios)
reports/family_fit/change_log.json                  (what changed since the last published artefact)

Exit status is 1 if any blocking gate fails; the artefact is then not written.
"""
from __future__ import annotations

import argparse
import hashlib
import itertools
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import norm, spearmanr

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from kinderprint.analytics.family_fit import (  # noqa: E402
    AEDC_MEASURES, ESSENTIAL_PERCENTILE, MEASURE_DIRECTION, NEEDS, NEED_IDS, TOP_N, WEIGHTS,
    eb_beta, haversine_km, match_score, need_scores, percentile_rank,
)

PROC = ROOT / "data" / "processed"
REF = ROOT / "data" / "reference"
OUTPUT = PROC / "family_fit_community.csv"
ARTEFACT = ROOT / "outputs" / "iteration_3" / "family_fit.json"
SHAPES = ROOT / "outputs" / "iteration_3" / "family_fit_shapes.json"
BOUNDARIES = ROOT / "outputs" / "iteration_1" / "boundaries.geojson"
SIMPLIFY_DEGREES = 0.0012          # about 100-130 m: enough for a Greater Melbourne overview map
REPORT = ROOT / "reports" / "family_fit" / "family_fit_validation.json"
SUITABILITY_S0 = ROOT / "outputs" / "iteration_2" / "suitability.json"
MODEL_VERSION = "S2.1"
SOURCE_ID = ("aedc_sa2_2009_2024;cooling_greening_2018;vpa_open_space;dot_aadt_2019;ptv_public_transport_stops_2026;"
             "npi_emissions_2024_2025;victoria_school_locations_2025;acecqa_services_2026;ga_healthdirect_facilities_2025;"
             "vif2023_child_population;abs_sa2_lga_label_point_2023")
AEDC_DOMAINS = {
    "aedc_all_five_on_track_pct": "On track on all five domains",
    "aedc_language_on_track_pct": "Language and cognitive skills",
    "aedc_social_on_track_pct": "Social competence",
    "aedc_emotional_on_track_pct": "Emotional maturity",
    "aedc_physical_on_track_pct": "Physical health and wellbeing",
}
MIN_NEED_COVERAGE = 0.90
REFERENCE_SCENARIOS = [
    {"name": "toddler near Box Hill", "anchor": "207031163", "radius_km": 15,
     "priorities": {"childcare_kinder": "essential", "gp_access": "essential", "shade_cooler": "prefer", "early_development": "prefer"}},
    {"name": "school starter near Footscray", "anchor": "213031348", "radius_km": 10,
     "priorities": {"early_development": "essential", "school_transport": "essential", "physical_outdoor": "prefer"}},
    {"name": "pre-teen near Dandenong", "anchor": "212041564", "radius_km": 25,
     "priorities": {"social_emotional": "essential", "physical_outdoor": "prefer", "fewer_pollution_sources": "prefer"}},
]


def aedc_counts(cd: pd.DataFrame, domain: str, year: int) -> pd.DataFrame:
    x = cd[(cd.reference_year == year) & (cd.domain == domain)]
    return x.pivot_table(index="community_id", columns="indicator", values="value")[["on_track_n", "n_children"]]


def build_table() -> pd.DataFrame:
    comm = pd.read_csv(PROC / "communities.csv", dtype={"neighbourhood_id": str, "aedc_area_code": str})
    bridge = pd.read_csv(PROC / "community_sa2.csv", dtype={"sa2_code_2021": str})
    points = pd.read_csv(REF / "sa2_lga_2023_vic.csv", dtype={"sa2_code_2021": str})
    t = comm[["community_id", "neighbourhood_id", "community_name", "sa3_name", "sa4_name", "n_component_sa2"]].copy()

    pts = bridge.merge(points, on="sa2_code_2021", how="left").groupby("community_id")[
        ["label_point_latitude", "label_point_longitude"]].mean()
    t = t.merge(pts.rename(columns={"label_point_latitude": "latitude", "label_point_longitude": "longitude"}),
                on="community_id", how="left")

    cd = pd.read_csv(PROC / "child_development.csv")
    for col, domain in AEDC_DOMAINS.items():
        c = aedc_counts(cd, domain, 2024)
        key = col.replace("_pct", "")
        t[f"{key}_k"] = t.community_id.map(c.on_track_n)
        t[f"{key}_n"] = t.community_id.map(c.n_children)
        a, b = eb_beta(t[f"{key}_k"], t[f"{key}_n"], t.sa4_name)
        t[f"{key}_alpha"], t[f"{key}_beta"] = a.round(4), b.round(4)
        t[col] = (100 * a / (a + b)).round(3)
        t[f"{key}_raw_pct"] = (100 * t[f"{key}_k"] / t[f"{key}_n"]).round(3)

    # 2015 -> 2024 change in "all five on track", raw shares, two-proportion test
    old = aedc_counts(cd, AEDC_DOMAINS["aedc_all_five_on_track_pct"], 2015)
    k0, n0 = t.community_id.map(old.on_track_n), t.community_id.map(old.n_children)
    p0, p1 = k0 / n0, t.aedc_all_five_on_track_k / t.aedc_all_five_on_track_n
    se = np.sqrt(p0 * (1 - p0) / n0 + p1 * (1 - p1) / t.aedc_all_five_on_track_n)
    t["all_five_change_2015_2024_pp"] = (100 * (p1 - p0)).round(2)
    z = (p1 - p0) / se
    t["all_five_change_flag"] = np.select([z.isna(), z >= norm.ppf(0.975), z <= -norm.ppf(0.975)],
                                          ["not_available", "up", "down"], "no_clear_change")

    env = pd.read_csv(PROC / "environmental.csv")
    env = env[env.env_quality_flag.isin(["VALUE", "REDUCED_COVERAGE"])]
    t = t.merge(env[["community_id", "vegetation_pct", "uhi_degc", "open_space_pct"]].rename(
        columns={"vegetation_pct": "tree_cover_pct", "uhi_degc": "urban_heat_degc"}), on="community_id", how="left")

    tr = pd.read_csv(PROC / "transport_suitability.csv")
    t = t.merge(tr[["community_id", "declared_road_traffic_intensity", "public_transport_stops_per_10000"]].rename(
        columns={"declared_road_traffic_intensity": "road_traffic_intensity",
                 "public_transport_stops_per_10000": "transport_stops_per_10000"}), on="community_id", how="left")
    npi = pd.read_csv(PROC / "npi_suitability.csv")
    t = t.merge(npi[["community_id", "npi_reporting_facility_count"]].rename(
        columns={"npi_reporting_facility_count": "industrial_sites_count"}), on="community_id", how="left")
    school = pd.read_csv(PROC / "school_child_population_suitability.csv")
    t = t.merge(school[["community_id", "primary_school_campuses_per_1000_children_5_9"]].rename(
        columns={"primary_school_campuses_per_1000_children_5_9": "primary_schools_per_1000_age5_9"}),
        on="community_id", how="left")
    ecec = pd.read_csv(PROC / "acecqa_suitability.csv", dtype={"neighbourhood_id": str})
    t = t.merge(ecec[["neighbourhood_id", "kindergarten_services_per_1000_children_0_4"]].rename(
        columns={"kindergarten_services_per_1000_children_0_4": "kindergartens_per_1000_under5"}),
        on="neighbourhood_id", how="left")

    acc = pd.read_csv(PROC / "access_e2sfca_sa2.csv", dtype={"sa2_code": str}).merge(
        bridge, left_on="sa2_code", right_on="sa2_code_2021")

    def weighted(service: str, column: str) -> pd.Series:
        x = acc[acc.service == service].dropna(subset=[column])
        return x.groupby("community_id").apply(
            lambda g: np.average(g[column], weights=g.demand_population.clip(lower=1)), include_groups=False)
    t["gp_access_5km"] = t.community_id.map(weighted("gp", "access_5km")).round(4)
    t["nearest_gp_km"] = t.community_id.map(weighted("gp", "nearest_km")).round(3)
    t["childcare_places_access_5km"] = t.community_id.map(weighted("ecec", "access_5km")).round(3)

    fc = pd.read_csv(PROC / "school_entry_forecast_community.csv")
    t = t.merge(fc[["community_id", "forecast_pct", "lower_80_pct", "upper_80_pct"]].rename(columns={
        "forecast_pct": "all_five_forecast_2027_pct", "lower_80_pct": "all_five_forecast_2027_lower80",
        "upper_80_pct": "all_five_forecast_2027_upper80"}), on="community_id", how="left")
    t["source_id"] = SOURCE_ID
    return t.sort_values("community_id").reset_index(drop=True)


# ----------------------------------------------------------------------------- scoring (reference)

def rank(table: pd.DataFrame, scores: pd.DataFrame, scenario: dict,
         essential: float = ESSENTIAL_PERCENTILE, weights: dict | None = None) -> pd.DataFrame:
    anchor = table.set_index("neighbourhood_id").loc[scenario["anchor"]]
    d = haversine_km(anchor.latitude, anchor.longitude, table.latitude.to_numpy(), table.longitude.to_numpy())
    pr = scenario["priorities"]
    fit = match_score(scores, pr, weights)
    ok = (d <= scenario["radius_km"]) & fit.notna()
    for need, level in pr.items():
        if level == "essential":
            ok &= scores[need] >= essential
    out = pd.DataFrame({"id": table.neighbourhood_id, "name": table.community_name, "distance_km": d,
                        "match": fit})[ok]
    return out.sort_values(["match", "id"], ascending=[False, True])


# ----------------------------------------------------------------------------- validation

def shrinkage_backtest(cd: pd.DataFrame, comm: pd.DataFrame) -> dict:
    out = {}
    for col, domain in AEDC_DOMAINS.items():
        a21, a24 = aedc_counts(cd, domain, 2021), aedc_counts(cd, domain, 2024)
        df = comm.set_index("community_id")[["sa4_name"]].join(a21).join(a24, rsuffix="_24").dropna()
        df = df[(df.n_children > 0) & (df.n_children_24 > 0)]
        a, b = eb_beta(df.on_track_n, df.n_children, df.sa4_name)
        raw, shr = df.on_track_n / df.n_children, a / (a + b)
        y = df.on_track_n_24 / df.n_children_24
        small = df.n_children < 60
        mae = lambda p, m=slice(None): float((p[m] - y[m]).abs().mean() * 100)  # noqa: E731
        out[col] = {"areas": int(len(df)), "mae_raw_pp": round(mae(raw), 3), "mae_adjusted_pp": round(mae(shr), 3),
                    "improvement": round(1 - mae(shr) / mae(raw), 4), "small_areas": int(small.sum()),
                    "mae_raw_small_pp": round(mae(raw, small), 3), "mae_adjusted_small_pp": round(mae(shr, small), 3)}
    return out


def variance_share(frame: pd.DataFrame) -> dict:
    total = frame.mean(axis=1)
    return {c: round(float(np.cov(frame[c], total)[0, 1] / frame.shape[1] / total.var()), 4) for c in frame}


def s0_vs_s2(table: pd.DataFrame) -> dict:
    s0 = json.load(open(SUITABILITY_S0))["localities"]
    crit = ["lower_urban_heat", "tree_canopy", "general_practice_access", "pharmacy_access"]
    f0 = pd.DataFrame({c: [r["scores"][c] for r in s0] for c in crit}, index=[r["id"] for r in s0]).dropna()
    f2 = pd.DataFrame({m: percentile_rank(table[m], MEASURE_DIRECTION[m]) for m in
                       ["urban_heat_degc", "tree_cover_pct", "gp_access_5km", "nearest_gp_km"]}).dropna()
    s0_score_range = {c: [round(float(min(r["scores"][c] for r in s0 if r["scores"][c] is not None)), 2),
                          round(float(max(r["scores"][c] for r in s0 if r["scores"][c] is not None)), 2)] for c in crit}
    zero_gp = [r["id"] for r in s0 if r["measures"]["general_practice_access"] == 0]
    t = table.set_index("neighbourhood_id")
    credited = t.loc[[i for i in zero_gp if i in t.index]]
    return {"search": "shade and cooler streets + healthcare",
            "S0_variance_share": variance_share(f0), "S0_score_range": s0_score_range,
            "S2_variance_share": variance_share(f2),
            "areas_with_no_gp_inside_border": len(zero_gp),
            "of_which_have_gp_access_nearby": int((credited.gp_access_5km > 0).sum()),
            "median_nearest_gp_km_for_those": round(float(credited.nearest_gp_km.median()), 2)}


def stability(table: pd.DataFrame, scenario: dict, draws: int = 300, seed: int = 20261009) -> dict:
    rng = np.random.default_rng(seed)
    base = rank(table, need_scores(table[list(MEASURE_DIRECTION)]), scenario)
    used = {m for need in scenario["priorities"] for m, _ in next(n for n in NEEDS if n.id == need).measures} & set(AEDC_MEASURES)
    eligible = set(base.id)
    hits = pd.Series(0, index=list(eligible), dtype=float)
    if used:
        for _ in range(draws):
            sim = table.copy()
            for m in used:
                key = m.replace("_pct", "")
                ok = sim[f"{key}_alpha"].notna()
                sim.loc[ok, m] = 100 * rng.beta(sim.loc[ok, f"{key}_alpha"], sim.loc[ok, f"{key}_beta"])
            r = rank(sim, need_scores(sim[list(MEASURE_DIRECTION)]), scenario)
            r = r[r.id.isin(eligible)].head(TOP_N)
            hits[r.id] += 1
        share = hits / draws
    else:
        share = pd.Series(1.0, index=base.id.head(TOP_N))
    top = base.head(TOP_N).id
    return {"eligible": len(eligible), "top10_share_in_top10": {i: round(float(share.get(i, 0)), 3) for i in top}}


def sensitivity(table: pd.DataFrame, scores: pd.DataFrame) -> dict:
    out = {}
    for sc in REFERENCE_SCENARIOS:
        base = set(rank(table, scores, sc).head(TOP_N).id)
        res = {}
        for label, essential, weight in [("essential_40", 40, 2), ("essential_60", 60, 2), ("weight_1.5", 50, 1.5), ("weight_3", 50, 3)]:
            alt = set(rank(table, scores, sc, essential, {**WEIGHTS, "essential": weight}).head(TOP_N).id)
            res[label] = round(len(base & alt) / max(len(base | alt), 1), 3)
        out[sc["name"]] = res
    return out


def fairness(table: pd.DataFrame, scores: pd.DataFrame) -> dict:
    irsd = pd.read_csv(PROC / "socioeconomic_wide.csv").set_index("community_id").irsd_score
    x = table.community_id.map(irsd)
    pair = []
    for a, b in itertools.combinations(NEED_IDS, 2):
        s = (scores[a] + scores[b]) / 2
        ok = s.notna() & x.notna()
        pair.append(spearmanr(s[ok], x[ok]).statistic)
    by_need = {}
    for n in NEED_IDS:
        ok = scores[n].notna() & x.notna()
        by_need[n] = round(float(spearmanr(scores[n][ok], x[ok]).statistic), 3)
    return {"spearman_with_irsd_two_need_searches": {"median": round(float(np.median(pair)), 3),
                                                     "min": round(float(min(pair)), 3), "max": round(float(max(pair)), 3)},
            "spearman_with_irsd_by_need": by_need,
            "note": "Higher IRSD means less disadvantage. IRSD is audited, never scored."}


def gates(table: pd.DataFrame, scores: pd.DataFrame, s02: dict) -> list[dict]:
    comm = pd.read_csv(PROC / "communities.csv")
    g = []
    def gate(name, passed, value):  # noqa: E306
        g.append({"gate": name, "passed": bool(passed), "value": value})
    gate("one row per reporting area", len(table) == len(comm) and table.neighbourhood_id.is_unique, len(table))
    gate("every area has a location", table[["latitude", "longitude"]].notna().all(axis=1).mean() == 1,
         round(float(table[["latitude", "longitude"]].notna().all(axis=1).mean()), 4))
    cov = {n: round(float(scores[n].notna().mean()), 4) for n in NEED_IDS}
    gate(f"every need scored for >= {MIN_NEED_COVERAGE:.0%} of areas", min(cov.values()) >= MIN_NEED_COVERAGE, cov)
    pct_ok = all(((scores[n].dropna() > 0) & (scores[n].dropna() <= 100)).all() for n in NEED_IDS)
    gate("need scores within (0, 100]", pct_ok, pct_ok)
    post_ok = all((table[f"{m.replace('_pct', '')}_alpha"].dropna() > 0).all() and
                  (table[f"{m.replace('_pct', '')}_beta"].dropna() > 0).all() for m in AEDC_MEASURES)
    gate("adjustment parameters positive", post_ok, post_ok)
    raw_ok = all(((table[m].dropna() >= 0) & (table[m].dropna() <= 100)).all() for m in AEDC_MEASURES)
    gate("AEDC shares within 0-100", raw_ok, raw_ok)
    nonneg = all((table[m].dropna() >= 0).all() for m in ["tree_cover_pct", "open_space_pct", "road_traffic_intensity",
                                                         "industrial_sites_count", "gp_access_5km", "nearest_gp_km",
                                                         "childcare_places_access_5km", "kindergartens_per_1000_under5",
                                                         "primary_schools_per_1000_age5_9", "transport_stops_per_10000"])
    gate("count and rate measures non-negative", nonneg, nonneg)
    f = table.dropna(subset=["all_five_forecast_2027_pct"])
    fc_ok = ((f.all_five_forecast_2027_lower80 <= f.all_five_forecast_2027_pct) &
             (f.all_five_forecast_2027_pct <= f.all_five_forecast_2027_upper80)).all()
    gate("forecast inside its interval", fc_ok, int(len(f)))
    shares = list(s02["S2_variance_share"].values())
    gate("no measure dominates a two-need search (each 15-35%)", min(shares) >= 0.15 and max(shares) <= 0.35, shares)
    return g


def validation_summary(report: dict) -> dict:
    """Headline evidence shown in the app's "How we score" panel, so the page never quotes stale numbers."""
    back = report["small_numbers_adjustment_backtest_2021_to_2024"].values()
    fc = json.loads((ROOT / "reports" / "family_fit" / "school_entry_forecast.json").read_text())
    sel = fc["candidates"][fc["selected"]]
    s02 = report["scale_balance_S0_vs_S2"]
    return {
        "old_engine_largest_two_measures_share": round(sorted(s02["S0_variance_share"].values())[-1]
                                                       + sorted(s02["S0_variance_share"].values())[-2], 3),
        "new_engine_measure_share_range": [min(s02["S2_variance_share"].values()), max(s02["S2_variance_share"].values())],
        "adjustment_error_reduction_range": [min(b["improvement"] for b in back), max(b["improvement"] for b in back)],
        "adjustment_small_area_error_reduction_range": [
            round(min(1 - b["mae_adjusted_small_pp"] / b["mae_raw_small_pp"] for b in back), 4),
            round(max(1 - b["mae_adjusted_small_pp"] / b["mae_raw_small_pp"] for b in back), 4)],
        "gp_border_credit": [s02["of_which_have_gp_access_nearby"], s02["areas_with_no_gp_inside_border"]],
        "forecast_model": fc["selected"], "forecast_skill_vs_persistence": fc["skill_vs_persistence"],
        "forecast_holdout_mae_pp": sel["weighted_mae_pp"], "forecast_holdout_spearman": sel["spearman"],
        "forecast_holdout_coverage_80": sel["coverage_80"],
        "areas_scored_on_every_need": report["coverage"]["areas_scored_on_every_need"],
        "areas": report["coverage"]["areas"],
    }


def artefact(table: pd.DataFrame, scores: pd.DataFrame, report: dict) -> dict:
    pct = {m: percentile_rank(table[m], d) for m, d in MEASURE_DIRECTION.items()}
    def num(v, digits=3):  # noqa: E306
        return None if pd.isna(v) else round(float(v), digits)
    areas = []
    for i, r in table.iterrows():
        areas.append({
            "id": r.neighbourhood_id, "name": r.community_name, "sa3": r.sa3_name, "sa4": r.sa4_name,
            "latitude": num(r.latitude, 5), "longitude": num(r.longitude, 5),
            "needs": {n: num(scores.at[i, n], 4) for n in NEED_IDS},
            "measures": {m: num(r[m]) for m in MEASURE_DIRECTION},
            "percentiles": {m: num(pct[m][i], 4) for m in MEASURE_DIRECTION},
            "adjustment": {m: ([num(r[f"{m.replace('_pct', '')}_alpha"], 4), num(r[f"{m.replace('_pct', '')}_beta"], 4)]
                               if pd.notna(r[f"{m.replace('_pct', '')}_alpha"]) else None) for m in AEDC_MEASURES},
            "children_assessed_2024": None if pd.isna(r.aedc_all_five_on_track_n) else int(r.aedc_all_five_on_track_n),
            "all_five_change_2015_2024_pp": num(r.all_five_change_2015_2024_pp, 2),
            "all_five_change_flag": r.all_five_change_flag,
            "outlook_2027": None if pd.isna(r.all_five_forecast_2027_pct) else {
                "pct": num(r.all_five_forecast_2027_pct, 1), "lower80": num(r.all_five_forecast_2027_lower80, 1),
                "upper80": num(r.all_five_forecast_2027_upper80, 1)},
        })
    return {
        "metadata": {"model_version": MODEL_VERSION, "built_utc": report["built_utc"],
                     "unit": "AEDC reporting area (one or more ASGS 2021 SA2s), Greater Melbourne",
                     "essential_percentile": ESSENTIAL_PERCENTILE, "weights": WEIGHTS, "top_n": TOP_N,
                     "source_id": SOURCE_ID, "input_sha256": report["input_sha256"],
                     "validation": validation_summary(report)},
        "needs": [{"id": n.id, "label": n.label, "measures": [{"id": m, "direction": d} for m, d in n.measures],
                   "explains": n.explains, "does_not_confirm": n.does_not_confirm} for n in NEEDS],
        "areas": areas,
    }


def shapes() -> dict:
    """Simplified area outlines for the overview map (lon/lat, 4 decimals)."""
    from shapely.geometry import shape, mapping
    features = json.loads(BOUNDARIES.read_text())["features"]
    out = {}
    for f in features:
        geom = shape(f["geometry"]).simplify(SIMPLIFY_DEGREES, preserve_topology=True)
        polys = geom.geoms if geom.geom_type == "MultiPolygon" else [geom]
        out[f["properties"]["id"]] = [[[round(x, 4), round(y, 4)] for x, y in p.exterior.coords]
                                      for p in polys if p.area > 1e-7]
    return {"metadata": {"source": "ABS ASGS Edition 3 SA2 boundaries dissolved to AEDC reporting areas",
                         "simplified_degrees": SIMPLIFY_DEGREES, "use": "overview map only; not for measurement"},
            "areas": out}


def change_log(previous: dict | None, new: dict, report: dict) -> dict:
    """What changed for families since the last published artefact (changed-data capture)."""
    if previous is None:
        return {"summary": "First publication; nothing to compare.", "previous_built_utc": None}
    old = {a["id"]: a for a in previous["areas"]}
    cur = {a["id"]: a for a in new["areas"]}
    moved = {}
    for need in NEED_IDS:
        diffs = [abs(cur[i]["needs"][need] - old[i]["needs"][need]) for i in cur.keys() & old.keys()
                 if cur[i]["needs"][need] is not None and old[i]["needs"][need] is not None]
        moved[need] = {"areas_moved_over_10_points": int(sum(d > 10 for d in diffs)),
                       "max_change": round(max(diffs), 2) if diffs else 0}
    changed_inputs = [k for k, v in report["input_sha256"].items()
                      if previous["metadata"].get("input_sha256", {}).get(k) != v]
    summary = (f"{len(changed_inputs)} input file(s) changed; "
               f"{len(cur.keys() - old.keys())} area(s) added, {len(old.keys() - cur.keys())} removed; "
               f"{sum(m['areas_moved_over_10_points'] for m in moved.values())} need score(s) moved by more than 10 points.")
    return {"summary": summary, "previous_built_utc": previous["metadata"].get("built_utc"),
            "changed_inputs": changed_inputs, "added": sorted(cur.keys() - old.keys()),
            "removed": sorted(old.keys() - cur.keys()), "need_score_movement": moved}


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--output", type=Path, default=OUTPUT)
    parser.add_argument("--artefact", type=Path, default=None)
    parser.add_argument("--report", type=Path, default=None)
    args = parser.parse_args(argv)
    default_run = args.output == OUTPUT
    artefact_path = args.artefact or (ARTEFACT if default_run else None)
    report_path = args.report or (REPORT if default_run else None)

    table = build_table()
    scores = need_scores(table[list(MEASURE_DIRECTION)])
    inputs = ["communities.csv", "community_sa2.csv", "child_development.csv", "environmental.csv",
              "transport_suitability.csv", "npi_suitability.csv", "school_child_population_suitability.csv",
              "acecqa_suitability.csv", "access_e2sfca_sa2.csv", "school_entry_forecast_community.csv"]
    cd = pd.read_csv(PROC / "child_development.csv")
    comm = pd.read_csv(PROC / "communities.csv")
    s02 = s0_vs_s2(table)
    report = {
        "built_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M%SZ"),
        "model_version": MODEL_VERSION,
        "input_sha256": {name: sha(PROC / name) for name in inputs},
        "gates": gates(table, scores, s02),
        "coverage": {"areas": int(len(table)),
                     "areas_scored_on_every_need": int(scores.notna().all(axis=1).sum()),
                     "by_need": {n: int(scores[n].notna().sum()) for n in NEED_IDS}},
        "scale_balance_S0_vs_S2": s02,
        "small_numbers_adjustment_backtest_2021_to_2024": shrinkage_backtest(cd, comm),
        "fairness_audit": fairness(table, scores),
        "sensitivity_top10_jaccard": sensitivity(table, scores),
        "reference_scenarios": [],
    }
    for sc in REFERENCE_SCENARIOS:
        r = rank(table, scores, sc)
        report["reference_scenarios"].append({
            **sc, "eligible": int(len(r)),
            "top10": [{"id": x.id, "match": round(float(x.match), 4), "distance_km": round(float(x.distance_km), 3)}
                      for x in r.head(TOP_N).itertuples()],
            "stability": stability(table, sc)})
    failed = [g["gate"] for g in report["gates"] if not g["passed"]]

    args.output.parent.mkdir(parents=True, exist_ok=True)
    table.to_csv(args.output, index=False)
    if report_path:
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(report, indent=2, default=str) + "\n")
    if failed:
        print("BLOCKED: " + "; ".join(failed))
        return 1
    if artefact_path:
        artefact_path.parent.mkdir(parents=True, exist_ok=True)
        previous = json.loads(artefact_path.read_text()) if artefact_path.is_file() else None
        new = artefact(table, scores, report)
        if report_path:
            (report_path.parent / "change_log.json").write_text(
                json.dumps(change_log(previous, new, report), indent=2) + "\n")
        artefact_path.write_text(json.dumps(new, separators=(",", ":")) + "\n")
        shape_data = shapes()
        missing = set(table.neighbourhood_id) - set(shape_data["areas"])
        if missing:
            print(f"BLOCKED: no outline for {sorted(missing)[:5]}")
            return 1
        (artefact_path.parent / SHAPES.name).write_text(json.dumps(shape_data, separators=(",", ":")) + "\n")
    for g in report["gates"]:
        print(("PASS " if g["passed"] else "FAIL ") + g["gate"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
