"""Fault injection for the one-command refresh: a failure at any stage, including a
missed KPI target, must leave the previously published version exactly as it was."""
from __future__ import annotations

import json
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS))
import refresh_iteration3 as refresh  # noqa: E402


@pytest.fixture
def sandbox(tmp_path, monkeypatch):
    proc, ref = tmp_path / "processed", tmp_path / "reference"
    proc.mkdir()
    ref.mkdir()
    served = tmp_path / "family_fit.json"
    monkeypatch.setattr(refresh, "PROC", proc)
    monkeypatch.setattr(refresh, "REPORT", tmp_path / "refresh_run.json")
    monkeypatch.setattr(refresh.kpis, "BUILDERS", [("fake_builder.py", ["out.csv", "new_out.csv"])])
    monkeypatch.setattr(refresh.kpis, "SERVED_ARTEFACTS", [served])
    monkeypatch.setattr(refresh.acq, "REF", ref)
    monkeypatch.setattr(refresh.acq, "MANIFEST", ref / "manifest.json")
    return SimpleNamespace(proc=proc, ref=ref, served=served)


def publish_previous(box):
    (box.proc / "out.csv").write_text("id,value\n1,old\n")
    box.served.write_text('{"version": "old"}')
    (box.ref / "source.csv").write_text("id\nold\n")
    (box.ref / "manifest.json").write_text('{"files": {}}')


def state(box) -> dict:
    files = [box.proc / "out.csv", box.proc / "new_out.csv", box.served,
             box.ref / "source.csv", box.ref / "manifest.json", box.ref / "new_source.csv"]
    return {p.name: (p.read_text() if p.exists() else None) for p in files}


def install_stages(monkeypatch, box, *, fail_at: str | None):
    def acquire(sources, offline, dry_run):
        (box.ref / "source.csv").write_text("id\nnew\n")
        (box.ref / "new_source.csv").write_text("id\nnew\n")
        (box.ref / "manifest.json").write_text('{"files": {"source.csv": {}}}')
        if fail_at == "acquire":
            raise RuntimeError("network down")
        return {"sources": {"s": {"status": "ok"}}}

    def build():
        (box.proc / "out.csv").write_text("id,value\n1,new\n")
        (box.proc / "new_out.csv").write_text("id\n1\n")
        box.served.write_text('{"version": "new"}')
        if fail_at == "build":
            raise RuntimeError("builder failed")

    def tests(*args, **kwargs):
        code = 1 if fail_at == "gate" else 0
        return SimpleNamespace(returncode=code, stdout="1 failed" if code else "10 passed", stderr="")

    monkeypatch.setattr(refresh.acq, "run", acquire)
    monkeypatch.setattr(refresh, "run_builders", build)
    monkeypatch.setattr(refresh.subprocess, "run", tests)
    monkeypatch.setattr(refresh.kpis, "main", lambda argv: 1 if fail_at == "kpi" else 0)


@pytest.mark.parametrize("fail_at", ["acquire", "build", "gate", "kpi"])
def test_failure_at_any_stage_keeps_the_previous_version(sandbox, monkeypatch, fail_at):
    publish_previous(sandbox)
    before = state(sandbox)
    install_stages(monkeypatch, sandbox, fail_at=fail_at)
    code = refresh.main(["--offline"])
    assert code == (2 if fail_at == "kpi" else 1)
    assert state(sandbox) == before, "a failed refresh changed published files"
    record = json.loads(refresh.REPORT.read_text())
    assert record["outcome"].startswith("stopped") and record["outcome"].endswith("previous version kept")


def test_missed_kpi_is_never_published(sandbox, monkeypatch):
    publish_previous(sandbox)
    install_stages(monkeypatch, sandbox, fail_at="kpi")
    refresh.main(["--offline"])
    assert sandbox.served.read_text() == '{"version": "old"}'
    assert "published" not in json.loads(refresh.REPORT.read_text())["outcome"].split(";")[0]


def test_first_run_failure_leaves_nothing_behind(sandbox, monkeypatch):
    # No previous version at all: a failed first run must not leave partial outputs.
    install_stages(monkeypatch, sandbox, fail_at="gate")
    assert refresh.main(["--offline"]) == 1
    assert all(value is None for value in state(sandbox).values())


def test_successful_run_publishes(sandbox, monkeypatch):
    publish_previous(sandbox)
    install_stages(monkeypatch, sandbox, fail_at=None)
    assert refresh.main(["--offline"]) == 0
    after = state(sandbox)
    assert after["family_fit.json"] == '{"version": "new"}' and after["new_out.csv"] == "id\n1\n"
    assert json.loads(refresh.REPORT.read_text())["outcome"] == "published"
