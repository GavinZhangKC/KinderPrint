"""One-command refresh of the Iteration-3 care-context layer.

Stages
------
1 acquire      acquire_iteration3.py (live, or --offline to re-verify committed files)
2 build        the Iteration-3 builders, in dependency order, including the
               school-entry outlook and Family Fit (which has its own blocking gates)
3 gate         the full datascience test suite; on failure every processed file
               touched in stage 2, and every served artefact, is restored, so a bad
               refresh never ships
4 KPIs         pipeline_kpis.py (validity, coverage, integrity, lineage,
               reproducibility, freshness, null resolution)
5 record       reports/iteration3/refresh_run.json with timings and outcomes

    python scripts/refresh_iteration3.py            # live acquisition
    python scripts/refresh_iteration3.py --offline  # no network (CI on pull requests)
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))
import acquire_iteration3 as acq  # noqa: E402
import pipeline_kpis as kpis  # noqa: E402

PROC = ROOT / "data" / "processed"
REPORT = ROOT / "reports" / "iteration3" / "refresh_run.json"


def stage(name: str, record: dict):
    class _Stage:
        def __enter__(self):
            self.start = time.perf_counter()
            print(f"== {name}", flush=True)

        def __exit__(self, exc_type, exc, tb):
            record["stages"].append({"stage": name, "seconds": round(time.perf_counter() - self.start, 2),
                                     "status": "failed" if exc else "ok",
                                     **({"error": f"{exc_type.__name__}: {exc}"} if exc else {})})
            return False
    return _Stage()


def run_builders() -> None:
    for script, outputs in kpis.BUILDERS:
        result = subprocess.run([sys.executable, str(ROOT / "scripts" / script)], cwd=ROOT,
                                capture_output=True, text=True)
        if result.returncode != 0:
            raise RuntimeError(f"{script} failed: {result.stderr.strip()[-500:]}")
        print(f"   built {', '.join(outputs)}")


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--offline", action="store_true")
    parser.add_argument("--source", action="append", choices=sorted(acq.SOURCES))
    args = parser.parse_args(argv)
    record = {"run_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M%SZ"),
              "mode": "offline" if args.offline else "live", "stages": []}
    touched = [name for _, outputs in kpis.BUILDERS for name in outputs]
    backup = Path(tempfile.mkdtemp(prefix="kp-proc-"))
    for name in touched:
        if (PROC / name).is_file():
            shutil.copy2(PROC / name, backup / name)
    # Served artefacts are restored too, so the API never serves output from a failed refresh.
    for path in kpis.SERVED_ARTEFACTS:
        if path.is_file():
            shutil.copy2(path, backup / f"artefact__{path.name}")
    exit_code = 0
    try:
        with stage("1 acquire", record):
            summary = acq.run(args.source or list(acq.SOURCES), offline=args.offline, dry_run=False)
            record["acquire"] = {k: v["status"] for k, v in summary["sources"].items()}
            if any(v["status"] == "qa_failed" for v in summary["sources"].values()):
                raise RuntimeError("a source failed QA; its previous files were kept")
        with stage("2 build", record):
            run_builders()
        with stage("3 gate", record):
            # Run from the repository root: some tests import datascience.scripts.*
            env = {**os.environ, "PYTHONPATH": str(ROOT.parent)}
            tests = subprocess.run([sys.executable, "-m", "pytest", "datascience/tests", "-q", "-p", "no:cacheprovider"],
                                   cwd=ROOT.parent, env=env, capture_output=True, text=True)
            record["tests"] = (tests.stdout.strip().splitlines() or ["no output"])[-1]
            if tests.returncode != 0:
                raise RuntimeError(f"test gate failed: {record['tests']}")
        with stage("4 KPIs", record):
            record["kpis_met"] = kpis.main([]) == 0
    except Exception as error:
        exit_code = 1
        record["outcome"] = f"stopped: {error}"
        for name in touched:
            if (backup / name).is_file():
                shutil.copy2(backup / name, PROC / name)
        for path in kpis.SERVED_ARTEFACTS:
            if (backup / f"artefact__{path.name}").is_file():
                shutil.copy2(backup / f"artefact__{path.name}", path)
        record["restored"] = touched + [str(p.relative_to(ROOT)) for p in kpis.SERVED_ARTEFACTS]
    else:
        record["outcome"] = "published" if record.get("kpis_met") else "published; KPI target missed"
        exit_code = 0 if record.get("kpis_met") else 2
        blocked = [k for k, v in record["acquire"].items() if v == "blocked"]
        if blocked:
            record["outcome"] += f"; blocked sources kept previous files: {', '.join(blocked)}"
    finally:
        shutil.rmtree(backup, ignore_errors=True)
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(record, indent=2) + "\n")
    print(json.dumps(record, indent=2))
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
