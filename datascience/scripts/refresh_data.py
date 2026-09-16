"""
KinderPrint end-to-end data refresh.

    export KINDERPRINT_RAW_DIR=/path/to/data/raw
    python -m scripts.refresh_data

Raw -> clean -> environment -> analytical table -> priority -> matching ->
environmental differences -> validate -> artefacts.

Every stage logs. No stage fails silently. Validation is a GATE: if the test
suite fails, artefacts are not published and the previous ones stay live.
A run manifest records input checksums so any published figure traces to the
exact bytes that produced it.
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

RAW = Path(os.environ.get("KINDERPRINT_RAW_DIR", ROOT / "data/raw"))
REF = ROOT / "data/reference"
INTERIM = ROOT / "data/interim"
PROC = ROOT / "data/processed"
OUT = ROOT / "outputs" / "iteration_1"
ITERATION_2_OUT = ROOT / "outputs" / "iteration_2"

PIPELINE_VERSION = "2.0.0"
SCHEMA_VERSION = "2"

# Matching covariates: see src/kinderprint/analytics/matching.py and ADR-006.
# Environment and AEDC outcomes are absent (they are what we compare afterwards),
# and IRSD is absent (it is built from these same Census variables).
from kinderprint.analytics.matching import MATCH_FEATURES_M4 as MATCH_FEATURES
PRIORITY_FEATURES = ["irsd_score", "children_0_4_pct", "irsd_sa1_spread"]
ENV_INDICATORS = ["vegetation_pct", "uhi_degc", "open_space_pct"]
HIGHER_BAND_Z = 1.28          # ADR-004, pre-registered
CALIPER_PCT = 80              # ADR: 80th percentile of within-SA4 distance
MAX_DISADVANTAGE_R = 0.20     # regression guard: V1 must not become a SEIFA map

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)-7s %(message)s")
log = logging.getLogger("refresh")


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


class Stage:
    def __init__(self, name, manifest):
        self.name, self.manifest = name, manifest

    def __enter__(self):
        log.info("START  %s", self.name)
        self.t = time.time()
        return self

    def __exit__(self, exc_type, exc, tb):
        secs = round(time.time() - self.t, 2)
        self.manifest["stages"].append(
            {"stage": self.name, "status": "ok" if exc is None else "failed", "seconds": secs})
        (log.info if exc is None else log.error)(
            "%s %s (%.2fs)%s", "DONE  " if exc is None else "FAILED", self.name, secs,
            "" if exc is None else f": {exc}")
        return False


def find(pattern: str, root: Path) -> Path:
    if not root.exists():
        raise FileNotFoundError(
            f"Raw data directory not found: {root}\n"
            f"        Raw sources are not committed to git.\n"
            f"        export KINDERPRINT_RAW_DIR=/path/to/your/data/raw\n"
            f"        Checksums are in config/data_source_register.csv.")
    hits = sorted(root.rglob(pattern))
    if not hits:
        raise FileNotFoundError(
            f"{pattern} not found under {root}\n"
            f"        Expected: <raw>/aedc/<date>/sa2-2009-24.xlsx\n"
            f"                  <raw>/seifa/<date>/*SEIFA_2021.xlsx\n"
            f"                  <raw>/census/<date>/.../2021Census_G01_VIC_SA2.csv")
    return hits[-1]


def wilson(k, n, z=1.96):
    if n <= 0 or pd.isna(k) or pd.isna(n):
        return (np.nan, np.nan)
    p = k / n
    den = 1 + z * z / n
    c = (p + z * z / (2 * n)) / den
    h = z * np.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den
    return ((c - h) * 100, (c + h) * 100)


def main() -> int:
    started = datetime.now(timezone.utc)
    manifest = {"pipeline_version": PIPELINE_VERSION, "schema_version": SCHEMA_VERSION,
                "started_utc": started.isoformat(), "stages": [], "inputs": {}, "metrics": {}}

    from kinderprint.data.cleaning.aedc import clean as clean_aedc
    from kinderprint.data.cleaning.socioeconomic import build as build_socio
    import kinderprint.api.build_artefacts as B

    PROC.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    ITERATION_2_OUT.mkdir(parents=True, exist_ok=True)

    # ---------------------------------------------------------------- 01
    with Stage("01 verify raw inputs", manifest):
        inputs = {"aedc": find("sa2-2009-24.xlsx", RAW),
                  "seifa": find("*SEIFA_2021.xlsx", RAW),
                  "asgs_lookup": REF / "sa2_ed3_lookup.csv",
                  "boundaries": REF / "sa2_melbourne.geojson"}
        census_dir = find("2021Census_G01_VIC_SA2.csv", RAW).parent
        env_csv = INTERIM / "environment_by_sa2.csv"
        for k, p in inputs.items():
            if not p.is_file():
                raise FileNotFoundError(p)
            try:
                shown = str(p.relative_to(ROOT))
            except ValueError:
                shown = str(p)
            manifest["inputs"][k] = {"path": shown, "sha256": sha256(p), "bytes": p.stat().st_size}
            log.info("  %-12s %s", k, manifest["inputs"][k]["sha256"][:16])
        log.info("  %-12s %s", "environment", "present" if env_csv.is_file() else "ABSENT (Environment will be unavailable)")

    # ---------------------------------------------------------------- 02
    with Stage("02 clean AEDC", manifest):
        comm, bridge, child = clean_aedc(inputs["aedc"], inputs["asgs_lookup"])
        comm["neighbourhood_id"] = comm.aedc_area_code.astype(str).str.replace("/", "_", regex=False)
        for df, name in [(comm, "communities"), (bridge, "community_sa2"),
                         (child, "child_development")]:
            df.to_csv(PROC / f"{name}.csv", index=False)
        manifest["metrics"]["communities"] = len(comm)
        manifest["metrics"]["child_development_rows"] = len(child)
        log.info("  %d communities, %d observations", len(comm), len(child))

    # ---------------------------------------------------------------- 03
    with Stage("03 clean SEIFA + Census", manifest):
        wide, long = build_socio(inputs["seifa"], census_dir, bridge)
        wide.to_csv(PROC / "socioeconomic_wide.csv", index=False)
        long.to_csv(PROC / "socioeconomic.csv", index=False)
        manifest["metrics"]["socioeconomic_rows"] = len(long)

    # ---------------------------------------------------------------- 04
    with Stage("04 integrate environment", manifest):
        if env_csv.is_file():
            e = pd.read_csv(env_csv, dtype={"SA2_CODE_2021": str})
            m = bridge.astype({"sa2_code_2021": str}).merge(
                e, left_on="sa2_code_2021", right_on="SA2_CODE_2021", how="left")
            cols = ["peranyveg", "peranytree", "pergrass", "pertr15pl", "uhi18_m", "open_space_pct"]
            rows = []
            for cid, g in m.groupby("community_id"):
                w = g["n_mesh_blocks"].fillna(0)
                if w.sum() == 0:
                    w = pd.Series(np.ones(len(g)), index=g.index)
                r = {"community_id": cid}
                for c in cols:
                    v = pd.to_numeric(g.get(c), errors="coerce")
                    ok = v.notna() & (w > 0)
                    r[c] = round(float((v[ok] * w[ok]).sum() / w[ok].sum()), 4) if ok.any() else None
                cov = pd.to_numeric(g.env_coverage_pct, errors="coerce")
                r["env_coverage_pct"] = round(float(cov.mean()), 2) if cov.notna().any() else 0.0
                r["n_mesh_blocks"] = int(pd.to_numeric(g.n_mesh_blocks, errors="coerce").fillna(0).sum())
                rows.append(r)
            env = pd.DataFrame(rows)
            env["env_quality_flag"] = np.where(
                env.peranytree.isna(), "UNAVAILABLE",
                np.where(env.env_coverage_pct < 50, "PARTIAL_COVERAGE",
                         np.where(env.env_coverage_pct < 90, "REDUCED_COVERAGE", "VALUE")))
            env = env.rename(columns={"peranytree": "vegetation_pct", "uhi18_m": "uhi_degc"})
            env.to_csv(PROC / "environmental.csv", index=False)
            usable = int((env.env_quality_flag.isin(["VALUE", "REDUCED_COVERAGE"])).sum())
            manifest["metrics"]["communities_with_environment"] = usable
            log.info("  %d of %d communities have usable environment data", usable, len(env))
        else:
            env = pd.DataFrame({"community_id": comm.community_id})
            for c in ENV_INDICATORS:
                env[c] = np.nan
            env["env_quality_flag"] = "UNAVAILABLE"
            env["env_coverage_pct"] = 0.0
            env.to_csv(PROC / "environmental.csv", index=False)
            manifest["metrics"]["communities_with_environment"] = 0
            log.warning("  environment_by_sa2.csv absent -- Environment domain will report unavailable")

    # ---------------------------------------------------------------- 05
    with Stage("05 build analytical table", manifest):
        aedc = child[(child.reference_year == 2024) &
                     (child.domain == "Vulnerable on one or more domains")]
        w = aedc.pivot(index="community_id", columns="indicator", values="value")
        w["aedc_flag"] = aedc[aedc.indicator == "vulnerable_pct"].set_index("community_id")["quality_flag"]
        extra = child[(child.reference_year == 2024) &
                      child.domain.isin(["Vulnerable on two or more domains",
                                         "On track on all five domains"]) &
                      child.indicator.isin(["vulnerable_pct", "on_track_pct"])]
        piv = extra.pivot_table(index="community_id", columns="domain", values="value", aggfunc="first")
        piv.columns = ["ontrack5_pct", "vuln2_pct"]
        domains = child[(child.reference_year == 2024) &
                        (child.domain_type == "domain") &
                        (child.indicator == "on_track_pct")].pivot_table(
                            index="community_id", columns="domain", values="value", aggfunc="first")
        domains = domains.rename(columns={
            "Physical health and wellbeing": "physical_on_track_pct",
            "Social competence": "social_on_track_pct",
            "Emotional maturity": "emotional_on_track_pct",
            "Language and cognitive skills": "language_on_track_pct",
            "Communication skills and general knowledge": "communication_on_track_pct",
        })

        keep_env = [c for c in ["vegetation_pct", "uhi_degc", "open_space_pct",
                                "env_coverage_pct", "env_quality_flag"] if c in env.columns]
        # wide repeats columns already on `comm` (n_component_sa2); drop the dupes
        # so the merge does not silently suffix them and break downstream access.
        dupes = [c for c in wide.columns if c in comm.columns and c != "community_id"]
        full = (comm.merge(w.reset_index(), on="community_id", how="left")
                    .merge(wide.drop(columns=dupes), on="community_id", how="left")
                    .merge(piv.reset_index(), on="community_id", how="left")
                    .merge(domains.reset_index(), on="community_id", how="left")
                    .merge(env[["community_id"] + keep_env], on="community_id", how="left"))
        full["aedc_flag"] = full["aedc_flag"].fillna("SUPPRESSED_RULE")

        # Environment is suppressed where the source mapping does not reach.
        bad = full.env_quality_flag.isin(["PARTIAL_COVERAGE", "UNAVAILABLE"])
        for c in ENV_INDICATORS:
            if c in full.columns:
                full.loc[bad, c] = np.nan

        usable = full[(full.aedc_flag == "VALUE") & full.irsd_score.notna() &
                      full.median_hh_income_weekly.notna()].reset_index(drop=True)
        usable.to_csv(PROC / "analytical_table.csv", index=False)
        manifest["metrics"]["study_population"] = len(usable)
        manifest["metrics"]["excluded"] = len(full) - len(usable)
        log.info("  study population %d, excluded %d", len(usable), len(full) - len(usable))

    # ---------------------------------------------------------------- 06
    with Stage("06 priority model V1", manifest):
        from scipy import stats
        X = usable[PRIORITY_FEATURES]
        X = (X - X.mean()) / X.std()
        X.insert(0, "const", 1.0)
        y, wt = usable.vulnerable_pct.values, usable.n_children.values
        beta, *_ = np.linalg.lstsq(X.values * np.sqrt(wt)[:, None], y * np.sqrt(wt), rcond=None)
        resid = y - X.values @ beta
        p = np.clip(y / 100, 1e-6, 1 - 1e-6)
        se = np.sqrt(p * (1 - p) / wt) * 100
        usable["v1_z"] = resid / np.sqrt(se ** 2 + resid.std() ** 2)
        usable["v1_band"] = pd.cut(usable.v1_z, [-99, 0.5, HIGHER_BAND_Z, 99],
                                   labels=["Lower", "Moderate", "Higher"]).astype(object)
        # V0 retained as the documented baseline the V1 change was triggered by.
        sig_cols = {"vulnerable_pct": "high", "irsd_score": "low",
                    "unemployment_rate": "high", "one_parent_family_pct": "high"}
        flags = pd.DataFrame(index=usable.index)
        for c, d in sig_cols.items():
            t = usable[c].quantile(0.75 if d == "high" else 0.25)
            flags[c] = usable[c] >= t if d == "high" else usable[c] <= t
        usable["v0_count"] = flags.sum(axis=1)

        r = abs(stats.spearmanr(usable.v1_z, -usable.irsd_score)[0])
        manifest["metrics"]["v1_disadvantage_correlation"] = round(float(r), 4)
        manifest["metrics"]["higher_band_n"] = int((usable.v1_band == "Higher").sum())
        if r > MAX_DISADVANTAGE_R:
            raise ValueError(f"V1 correlates {r:.3f} with disadvantage; it has become a disadvantage map")
        log.info("  V1 vs disadvantage r=%.3f, Higher band n=%d", r, int((usable.v1_band == "Higher").sum()))

    # ---------------------------------------------------------------- 07
    with Stage("07 community matching M4", manifest):
        from kinderprint.analytics import matching as M
        d = M.match(usable, MATCH_FEATURES)          # raises if the leakage rule is broken
        ok = (d.match_idx >= 0).values
        bal = M.balance(d, MATCH_FEATURES)
        val = M.irsd_validation(d)
        manifest["metrics"]["max_pair_smd"] = round(float(bal.pair_smd.max()), 4)
        manifest["metrics"]["max_group_smd"] = round(float(bal.group_smd.max()), 4)
        manifest["metrics"]["irsd_out_of_sample_corr"] = round(val["irsd_correlation"], 4)
        manifest["metrics"]["irsd_within_one_decile_pct"] = round(val["pct_within_one_decile"], 1)
        log.info("  balance: max pair SMD %.3f, max group SMD %.3f",
                 bal.pair_smd.max(), bal.group_smd.max())
        log.info("  IRSD agreement (OUT OF SAMPLE): r=%.3f, %.1f%% within one decile",
                 val["irsd_correlation"], val["pct_within_one_decile"])

        rows = []
        for i, r_ in d[ok].iterrows():
            pr = d.loc[int(r_.match_idx)]
            n1, n2 = r_.n_children, pr.n_children
            p1, p2 = r_.vulnerable_pct / 100, pr.vulnerable_pct / 100
            sd = np.sqrt(p1 * (1 - p1) / n1 + p2 * (1 - p2) / n2)
            z = (p1 - p2) / sd if sd > 0 else 0
            lo1, hi1 = wilson(r_.vulnerable_n, n1)
            lo2, hi2 = wilson(pr.vulnerable_n, n2)
            rows.append({"community_id": r_.community_id, "sig": bool(abs(z) > 1.96),
                         "ci_overlap": bool(not (hi1 < lo2 or hi2 < lo1)),
                         "ci_lo": lo1, "ci_hi": hi1, "peer_ci_lo": lo2, "peer_ci_hi": hi2})
        d = d.merge(pd.DataFrame(rows), on="community_id", how="left")
        d.to_csv(PROC / "matched_table.csv", index=False)
        manifest["metrics"]["matched_pairs"] = int(ok.sum())
        manifest["metrics"]["no_match"] = int((~ok).sum())
        manifest["metrics"]["significant_pairs"] = int(d.sig.fillna(False).sum())
        log.info("  %d matched, %d no_match, %d differences significant at 95%%",
                 int(ok.sum()), int((~ok).sum()), int(d.sig.fillna(False).sum()))

    # ---------------------------------------------------------------- 08
    with Stage("08 environmental difference signature", manifest):
        labels = {"vegetation_pct": ("Tree canopy", "%"),
                  "uhi_degc": ("Urban heat island", "\u00b0C"),
                  "open_space_pct": ("Public open space", "%")}
        present = [c for c in ENV_INDICATORS if c in d.columns and d[c].notna().any()]
        sd = {c: d[c].std() for c in present}
        recs = []
        for i, r_ in d.iterrows():
            if r_.match_idx is None or pd.isna(r_.match_idx) or int(r_.match_idx) < 0:
                continue
            pr = d.loc[int(r_.match_idx)]
            for c in present:
                a, b = r_[c], pr[c]
                if pd.isna(a) or pd.isna(b) or not sd[c]:
                    continue
                lab, unit = labels[c]
                recs.append({"community_id": r_.community_id, "peer_id": pr.community_id,
                             "indicator": c, "label": lab, "unit": unit,
                             "source_value": round(a, 2), "peer_value": round(b, 2),
                             "abs_diff": round(a - b, 2), "std_diff": round((a - b) / sd[c], 3),
                             "aedc_gap": round(r_.vulnerable_pct - pr.vulnerable_pct, 1),
                             "aedc_sig": bool(r_.sig) if pd.notna(r_.sig) else None})
        sig_df = pd.DataFrame(recs)
        if len(sig_df):
            sig_df["rank"] = sig_df.groupby("community_id")["std_diff"].transform(
                lambda s: s.abs().rank(ascending=False))
        sig_df.to_csv(PROC / "environmental_differences.csv", index=False)
        manifest["metrics"]["difference_records"] = len(sig_df)
        log.info("  %d difference records across %d pairs",
                 len(sig_df), sig_df.community_id.nunique() if len(sig_df) else 0)

    # ---------------------------------------------------------------- 09
    with Stage("09 assemble final table", manifest):
        carry = ["community_id", "v1_z", "v1_band", "v0_count", "match_idx", "match_dist",
                 "match_strength", "sig", "ci_overlap", "ci_lo", "ci_hi",
                 "peer_ci_lo", "peer_ci_hi"]
        final = full.merge(d[[c for c in carry if c in d.columns]], on="community_id", how="left")
        final.to_csv(PROC / "final_table.csv", index=False)
        log.info("  final table %d rows x %d columns", len(final), final.shape[1])

    # ---------------------------------------------------------------- 10
    with Stage("10 validate (gate)", manifest):
        res = subprocess.run([sys.executable, "-m", "pytest", "tests/", "-q"],
                             cwd=ROOT, capture_output=True, text=True)
        summary = res.stdout.strip().splitlines()[-1] if res.stdout.strip() else "no output"
        log.info("  %s", summary)
        manifest["metrics"]["tests"] = summary
        if res.returncode != 0:
            log.error(res.stdout[-2000:])
            raise RuntimeError("validation suite failed; artefacts NOT published")

    # ---------------------------------------------------------------- 11
    with Stage("11 build artefacts", manifest):
        geo = json.loads((REF / "sa2_melbourne.geojson").read_text())
        profiles = B.build_profiles(final)
        for name, obj in {"profiles.json": profiles,
                          "priorities.json": B.build_priorities(final),
                          "explanations.json": B.build_explanations(final),
                          "comparisons.json": B.build_comparisons(final),
                          "boundaries.geojson": B.build_boundaries(geo, final)}.items():
            (OUT / name).write_text(json.dumps(obj, separators=(",", ":")))
            log.info("  %-20s %6.2f MB", name, (OUT / name).stat().st_size / 1e6)
        suitability_path = ITERATION_2_OUT / "suitability.json"
        service_scores_path = PROC / "health_service_suitability.csv"
        service_scores = pd.read_csv(service_scores_path) if service_scores_path.is_file() else None
        npi_scores_path = PROC / "npi_suitability.csv"
        if npi_scores_path.is_file():
            npi_scores = pd.read_csv(npi_scores_path)
            service_scores = (
                npi_scores if service_scores is None else service_scores.merge(
                    npi_scores[["neighbourhood_id", "npi_reporting_facility_count", "lower_industrial_source_presence_score"]],
                    on="neighbourhood_id", how="outer",
                )
            )
        transport_scores_path = PROC / "transport_suitability.csv"
        if transport_scores_path.is_file():
            transport_scores = pd.read_csv(transport_scores_path)
            transport_columns = [
                "neighbourhood_id", "lower_declared_road_traffic_score",
                "public_transport_availability_score", "declared_road_traffic_intensity",
                "public_transport_stops_per_10000",
            ]
            service_scores = (
                transport_scores if service_scores is None else service_scores.merge(
                    transport_scores[transport_columns], on="neighbourhood_id", how="outer"
                )
            )
        bushfire_scores_path = PROC / "bushfire_suitability.csv"
        if bushfire_scores_path.is_file():
            bushfire_scores = pd.read_csv(bushfire_scores_path)
            bushfire_columns = ["neighbourhood_id", "bushfire_prone_pct", "lower_bushfire_prone_share_score"]
            service_scores = (
                bushfire_scores if service_scores is None else service_scores.merge(
                    bushfire_scores[bushfire_columns], on="neighbourhood_id", how="outer"
                )
            )
        acecqa_scores_path = PROC / "acecqa_suitability.csv"
        if acecqa_scores_path.is_file():
            acecqa_scores = pd.read_csv(acecqa_scores_path)
            acecqa_columns = [
                "neighbourhood_id", "approved_early_childhood_places_score",
                "long_day_care_availability_score", "kindergarten_availability_score",
                "approved_places_per_1000_children_0_4",
                "long_day_care_services_per_1000_children_0_4",
                "kindergarten_services_per_1000_children_0_4",
            ]
            service_scores = (
                acecqa_scores if service_scores is None else service_scores.merge(
                    acecqa_scores[acecqa_columns], on="neighbourhood_id", how="outer"
                )
            )
        school_scores_path = PROC / "school_child_population_suitability.csv"
        if school_scores_path.is_file():
            school_scores = pd.read_csv(school_scores_path)
            school_columns = [
                "neighbourhood_id", "primary_school_campuses_per_1000_children_5_9",
                "primary_school_campus_availability_score",
            ]
            service_scores = (
                school_scores if service_scores is None else service_scores.merge(
                    school_scores[school_columns], on="neighbourhood_id", how="outer"
                )
            )
        suitability_path.write_text(json.dumps(
            B.build_suitability(profiles["profiles"], service_scores), separators=(",", ":")))
        log.info("  %-20s %6.2f MB", suitability_path.name,
                 suitability_path.stat().st_size / 1e6)

    manifest["finished_utc"] = datetime.now(timezone.utc).isoformat()
    manifest["duration_seconds"] = round((datetime.now(timezone.utc) - started).total_seconds(), 2)
    (OUT / "run_manifest.json").write_text(json.dumps(manifest, indent=2))
    log.info("REFRESH COMPLETE in %.1fs", manifest["duration_seconds"])
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        log.error("REFRESH ABORTED: %s", e)
        sys.exit(1)
