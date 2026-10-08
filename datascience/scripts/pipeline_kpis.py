"""Measure the data pipeline against explicit KPIs (DS-20).

KPIs, targets and how each is computed
--------------------------------------
K1 validity          100% of reference files pass every blocking QA rule
                     (iteration3_qa.py); warnings are counted and listed.
K2 join coverage     >= 95% of the 361 Greater Melbourne SA2s in scope are present
                     in every SA2-level Iteration-3 table, and >= 95% of the SA3s
                     those SA2s fall in have a cost row.
K3 key integrity     100% of foreign keys resolve: data items -> hospital units,
                     reported measures; care-compare facility ids -> hospital
                     capability or urgent care clinics.
K4 lineage           100% of processed files have a lineage row whose producer
                     exists and whose source ids resolve to the source register
                     (directly or via config/source_id_aliases.csv).
K5 reproducibility   100% of Iteration-3 builders, re-run from the committed
                     reference files into a temporary folder, reproduce the
                     committed processed files (canonical content hash).
K6 freshness         every reference file was acquired or verified within its
                     source's refresh cadence (manifest.json).
K7 null resolution   share of cells that are populated in the columns the product
                     displays; suppressed or not-published values are counted
                     separately, never imputed.

Outputs
-------
reports/iteration3/pipeline_kpis.json and reports/iteration3/pipeline_kpis.md
Exit status is 1 when any KPI misses its target, so CI can gate on it.
"""
from __future__ import annotations

import argparse
import csv
import json
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))
import acquire_iteration3 as acq  # noqa: E402
import iteration3_qa as qa  # noqa: E402

PROC = ROOT / "data" / "processed"
CONFIG = ROOT / "config"
OUT = ROOT / "reports" / "iteration3"
CADENCE_DAYS = {  # source refresh cadence + grace
    "aihw_myhospitals_api_2026": 120, "aihw_phc_019_mbs_local_areas_2024_25": 400,
    "betterhealth_urgent_care_clinics_2026": 45, "nndss_public_datasets_2025": 400,
    "osm_overpass_food_outlets_2026": 45, "fsanz_afcd_release_3": 400,
}
SA2_TABLES = {"seasonal_air_quality_sa2.csv": "sa2_code", "nearby_health_services_sa2.csv": "sa2_code",
              "care_compare_sa2.csv": "sa2_code", "food_access_sa2.csv": "sa2_code"}
BUILDERS = [  # (script, output files) in dependency order
    ("build_hospital_capability.py", ["hospital_capability_vic.csv"]),
    ("build_primary_care_cost.py", ["primary_care_cost_sa3.csv"]),
    ("build_seasonal_illness.py", ["seasonal_illness_vic.csv"]),
    ("build_child_nutrient_foods.py", ["child_nutrient_foods.csv"]),
    ("build_food_environment.py", ["food_outlets_sa2.csv", "food_access_sa2.csv"]),
    ("build_care_compare.py", ["care_compare_sa2.csv", "urgent_care_clinics_vic.csv"]),
    ("build_access_e2sfca.py", ["access_e2sfca_sa2.csv"]),
]
DISPLAY_COLUMNS = {
    "hospital_capability_vic.csv": ["hospital_name", "latitude", "longitude", "specialised_units"],
    "primary_care_cost_sa3.csv": ["patients", "services", "provider_fees", "benefits_paid",
                                  "patient_contribution_per_service"],
    "care_compare_sa2.csv": ["facility_id", "distance_km"],
    "food_access_sa2.csv": ["within_1km", "within_2km", "nearest_km"],
    "seasonal_air_quality_sa2.csv": ["mean_daily_ug_m3", "valid_days", "station_distance_km"],
    "nearby_health_services_sa2.csv": ["nearest_name", "nearest_distance_km"],
}


def kpi(name, value, target, passed, **detail):
    return {"kpi": name, "value": value, "target": target, "passed": bool(passed), **detail}


def k1_validity() -> dict:
    files, warnings, failed = 0, [], []
    for source in acq.SOURCES.values():
        for name in source.outputs:
            report = qa.check(name, acq.read_reference(name))
            files += 1
            warnings += [f"{name}: {w}" for w in report["warnings"]]
            if not report["passed"]:
                failed.append(name)
    share = 1 - len(failed) / files
    return kpi("K1 validity", round(share, 4), 1.0, share == 1.0, files=files, failed=failed, warnings=warnings)


def k2_coverage() -> dict:
    scope = pd.read_csv(PROC / "healthdirect_facility_counts_sa2.csv", dtype=str)["sa2_code"]
    detail = {}
    for name, column in SA2_TABLES.items():
        present = set(pd.read_csv(PROC / name, dtype=str, usecols=[column])[column])
        detail[name] = round(scope.isin(present).mean(), 4)
    sa3_scope = set(scope.str[:5])
    cost = pd.read_csv(PROC / "primary_care_cost_sa3.csv", dtype=str)
    detail["primary_care_cost_sa3.csv (SA3)"] = round(len(sa3_scope & set(cost.sa3_code)) / len(sa3_scope), 4)
    worst = min(detail.values())
    return kpi("K2 join coverage", worst, 0.95, worst >= 0.95, sa2_in_scope=int(scope.nunique()),
               sa3_in_scope=len(sa3_scope), by_table=detail)


def k3_keys() -> dict:
    hospitals = acq.read_reference("myhospitals_vic_hospitals.csv")
    items = acq.read_reference("myhospitals_vic_data_items.csv")
    reported = acq.read_reference("myhospitals_reported_measures.csv")
    capability = pd.read_csv(PROC / "hospital_capability_vic.csv", dtype=str)
    clinics = pd.read_csv(PROC / "urgent_care_clinics_vic.csv", dtype=str)
    compare = pd.read_csv(PROC / "care_compare_sa2.csv", dtype=str)
    checks = {
        "data items -> reporting units": items.code.isin(set(hospitals.code) | {acq.MYH_STATE}).mean(),
        "data items -> reported measures": items.reported_measure_code.isin(reported.reported_measure_code).mean(),
        "care compare -> facilities": compare.facility_id.isin(set(capability.hospital_code) | set(clinics.facility_id)).mean(),
    }
    worst = min(checks.values())
    return kpi("K3 key integrity", round(worst, 4), 1.0, worst == 1.0, by_check={k: round(v, 4) for k, v in checks.items()})


def resolve_ids(value: str, register: set[str], aliases: dict[str, list[str]]) -> list[str]:
    unresolved = []
    for part in [p for p in str(value).split(";") if p]:
        targets = aliases.get(part, [part])
        unresolved += [t for t in targets if t not in register]
    return unresolved


def k4_lineage() -> dict:
    register = {r["source_id"] for r in csv.DictReader(open(CONFIG / "data_source_register.csv"))}
    aliases = {r["legacy_source_id"]: r["register_source_ids"].split(";")
               for r in csv.DictReader(open(CONFIG / "source_id_aliases.csv"))}
    lineage = pd.read_csv(CONFIG / "lineage.csv", dtype=str, keep_default_na=False)
    processed = sorted(p.name for p in PROC.glob("*.csv"))
    problems = []
    listed = set(lineage.processed_file)
    problems += [f"{name}: no lineage row" for name in processed if name not in listed]
    for row in lineage.itertuples():
        if not (ROOT / row.producer).is_file():
            problems.append(f"{row.processed_file}: producer {row.producer} missing")
        bad = resolve_ids(row.source_ids, register, aliases)
        if bad or not row.source_ids:
            problems.append(f"{row.processed_file}: source ids not in register {bad}")
        for upstream in [u for u in row.upstream_files.split(";") if u]:
            if upstream not in processed:
                problems.append(f"{row.processed_file}: upstream {upstream} missing")
        path = PROC / row.processed_file
        if path.is_file():
            header = pd.read_csv(path, nrows=0).columns
            if "source_id" in header:
                values = pd.read_csv(path, dtype=str, usecols=["source_id"]).source_id.dropna().unique()
                for value in values:
                    bad = resolve_ids(value, register, aliases)
                    if bad:
                        problems.append(f"{row.processed_file}: source_id column value {value} unresolved")
    covered = sum(1 for name in processed if name in listed)
    share = covered / len(processed) if processed else 0
    return kpi("K4 lineage", round(share, 4), 1.0, share == 1.0 and not problems,
               processed_files=len(processed), problems=problems)


def k5_reproducibility() -> dict:
    results = {}
    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)
        for script, outputs in BUILDERS:
            flag = ["--out-dir", str(tmp_dir)] if script == "build_food_environment.py" else ["--output", str(tmp_dir / outputs[0])]
            run = subprocess.run([sys.executable, str(ROOT / "scripts" / script), *flag], cwd=ROOT,
                                 capture_output=True, text=True)
            for name in outputs:
                if run.returncode != 0 or not (tmp_dir / name).is_file():
                    results[name] = f"failed: {run.stderr.strip()[-300:]}"
                    continue
                committed = pd.read_csv(PROC / name, dtype=str, keep_default_na=False)
                rebuilt = pd.read_csv(tmp_dir / name, dtype=str, keep_default_na=False)
                same = list(committed.columns) == list(rebuilt.columns) and \
                    acq.canonical_hash(committed, list(committed.columns)) == acq.canonical_hash(rebuilt, list(rebuilt.columns))
                results[name] = "identical" if same else "differs"
    share = sum(v == "identical" for v in results.values()) / len(results)
    return kpi("K5 reproducibility", round(share, 4), 1.0, share == 1.0, by_file=results)


def k6_freshness(now: datetime) -> dict:
    manifest = acq.load_manifest()
    ages = {}
    stale = []
    for name, entry in manifest.get("files", {}).items():
        acquired = datetime.strptime(entry["acquired_utc"], "%Y-%m-%dT%H%M%SZ").replace(tzinfo=timezone.utc)
        age = (now - acquired).days
        ages[name] = age
        if age > CADENCE_DAYS.get(entry["source_id"], 400):
            stale.append(name)
    expected = [n for s in acq.SOURCES.values() for n in s.outputs]
    missing = [n for n in expected if n not in ages]
    return kpi("K6 freshness", len(expected) - len(stale) - len(missing), len(expected),
               not stale and not missing, age_days=ages, stale=stale, not_in_manifest=missing)


def k7_nulls() -> dict:
    detail = {}
    for name, columns in DISPLAY_COLUMNS.items():
        frame = pd.read_csv(PROC / name, dtype=str, keep_default_na=False)
        cells = frame[columns]
        detail[name] = round(float((cells != "").to_numpy().mean()), 4)
    overall = round(sum(detail.values()) / len(detail), 4)
    return kpi("K7 null resolution", overall, 0.9, overall >= 0.9, by_table=detail,
               note="Missing values stay missing (suppressed, not published, or no service in range); none imputed.")


def render_markdown(result: dict) -> str:
    lines = ["# Pipeline KPIs (DS-20)", "", f"Run: {result['run_utc']}", "",
             "| KPI | Value | Target | Met |", "|---|---|---|---|"]
    for item in result["kpis"]:
        lines.append(f"| {item['kpi']} | {item['value']} | {item['target']} | {'yes' if item['passed'] else 'no'} |")
    lines += ["", "Details are in pipeline_kpis.json.", ""]
    return "\n".join(lines)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--skip-rebuild", action="store_true", help="skip K5 (re-running builders)")
    args = parser.parse_args(argv)
    now = datetime.now(timezone.utc)
    kpis = [k1_validity(), k2_coverage(), k3_keys(), k4_lineage()]
    if not args.skip_rebuild:
        kpis.append(k5_reproducibility())
    kpis += [k6_freshness(now), k7_nulls()]
    result = {"run_utc": now.strftime("%Y-%m-%dT%H%M%SZ"), "kpis": kpis,
              "all_met": all(k["passed"] for k in kpis)}
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "pipeline_kpis.json").write_text(json.dumps(result, indent=2, default=str) + "\n")
    (OUT / "pipeline_kpis.md").write_text(render_markdown(result))
    for item in kpis:
        print(f"{'PASS' if item['passed'] else 'MISS'}  {item['kpi']}: {item['value']} (target {item['target']})")
    return 0 if result["all_met"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
