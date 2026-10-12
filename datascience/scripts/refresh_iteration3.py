"""One-command refresh of the Iteration-3 care-context layer.

Stages
------
1 acquire      acquire_iteration3.py (live, or --offline to re-verify committed files)
2 build        the Iteration-3 builders, in dependency order, including the
               school-entry outlook and Family Fit (which has its own blocking gates)
3 gate         the full datascience test suite
4 KPIs         pipeline_kpis.py (validity, coverage, integrity, lineage,
               reproducibility, freshness, display completeness). A missed KPI
               target is a failure, like any other stage.
5 record       reports/iteration3/refresh_run.json with timings and outcomes

Promotion rule: the previous version stays published unless every stage passes.
Before stage 1, every file the run can write (the Iteration-3 reference files and
manifest, every builder output, every served artefact) is snapshotted, including a
note of which files did not exist yet. If any stage fails, including a missed KPI,
each file is put back exactly as it was and files that did not exist before are
removed. The run happens on a CI checkout or a working copy, never on the files the
API is serving; a person reviews and commits the result.

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


def _rel(path: Path) -> str:
    try:
        return str(path.relative_to(ROOT))
    except ValueError:
        return str(path)


class KpiMissed(RuntimeError):
    """A pipeline KPI target was missed: treated as a failed refresh."""


def tracked_paths(touched: list[str]) -> list[Path]:
    """Every file a refresh can write: reference files and manifest, builder outputs, served artefacts."""
    paths = [PROC / name for name in touched] + list(kpis.SERVED_ARTEFACTS)
    if acq.REF.is_dir():
        paths += sorted(p for p in acq.REF.iterdir() if p.is_file())
    paths.append(acq.MANIFEST)
    return list(dict.fromkeys(paths))


class Snapshot:
    """Copies of tracked files taken before a run, restored exactly if the run fails."""

    def __init__(self, paths: list[Path]):
        self.dir = Path(tempfile.mkdtemp(prefix="kp-refresh-"))
        self.saved: dict[Path, Path | None] = {}
        for i, path in enumerate(paths):
            if path.is_file():
                copy = self.dir / f"{i}__{path.name}"
                shutil.copy2(path, copy)
                self.saved[path] = copy
            else:
                self.saved[path] = None  # did not exist before the run
        self.ref_dir = acq.REF
        self.ref_names = {p.name for p in acq.REF.iterdir() if p.is_file()} if acq.REF.is_dir() else set()

    def restore(self) -> list[str]:
        restored = []
        for path, copy in self.saved.items():
            if copy is not None:
                shutil.copy2(copy, path)
                restored.append(_rel(path))
            elif path.exists():
                path.unlink()
                restored.append(f"removed {_rel(path)}")
        if self.ref_dir.is_dir():  # reference files created during the run
            for extra in self.ref_dir.iterdir():
                if extra.is_file() and extra.name not in self.ref_names and extra not in self.saved:
                    extra.unlink()
                    restored.append(f"removed {_rel(extra)}")
        return restored

    def discard(self) -> None:
        shutil.rmtree(self.dir, ignore_errors=True)


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
    snapshot = Snapshot(tracked_paths(touched))
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
            kpi_code = kpis.main([])
            record["kpis_met"] = kpi_code == 0
            if kpi_code != 0:
                raise KpiMissed("a KPI target was missed")
    except Exception as error:
        exit_code = 2 if isinstance(error, KpiMissed) else 1
        record["outcome"] = f"stopped: {error}; previous version kept"
        record["restored"] = snapshot.restore()
    else:
        record["outcome"] = "published"
        blocked = [k for k, v in record["acquire"].items() if v == "blocked"]
        if blocked:
            record["outcome"] += f"; blocked sources kept previous files: {', '.join(blocked)}"
    finally:
        snapshot.discard()
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(record, indent=2) + "\n")
    print(json.dumps(record, indent=2))
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
