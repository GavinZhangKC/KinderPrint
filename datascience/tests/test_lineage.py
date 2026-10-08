"""Every processed file is traceable to a producer script and registered sources."""
import csv
import sys
from pathlib import Path

import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import pipeline_kpis  # noqa: E402

LINEAGE = pd.read_csv(ROOT / "config" / "lineage.csv", dtype=str, keep_default_na=False)
REGISTER = {r["source_id"] for r in csv.DictReader(open(ROOT / "config" / "data_source_register.csv"))}
ALIASES = {r["legacy_source_id"]: r["register_source_ids"].split(";")
           for r in csv.DictReader(open(ROOT / "config" / "source_id_aliases.csv"))}
PROCESSED = sorted(p.name for p in (ROOT / "data" / "processed").glob("*.csv"))


def test_every_processed_file_has_one_lineage_row():
    assert not LINEAGE.processed_file.duplicated().any()
    assert sorted(set(PROCESSED) - set(LINEAGE.processed_file)) == []


@pytest.mark.parametrize("row", LINEAGE.to_dict("records"), ids=lambda r: r["processed_file"])
def test_lineage_row_resolves(row):
    assert (ROOT / row["producer"]).is_file()
    assert row["source_ids"], "a processed file must name at least one source"
    assert pipeline_kpis.resolve_ids(row["source_ids"], REGISTER, ALIASES) == []
    for upstream in filter(None, row["upstream_files"].split(";")):
        assert upstream in PROCESSED


def test_aliases_point_only_at_registered_sources():
    for legacy, targets in ALIASES.items():
        assert legacy not in REGISTER
        assert all(t in REGISTER for t in targets)


@pytest.mark.parametrize("name", PROCESSED)
def test_source_id_column_values_resolve(name):
    path = ROOT / "data" / "processed" / name
    if "source_id" not in pd.read_csv(path, nrows=0).columns:
        pytest.skip("no source_id column")
    values = pd.read_csv(path, dtype=str, usecols=["source_id"]).source_id.dropna().unique()
    for value in values:
        assert pipeline_kpis.resolve_ids(value, REGISTER, ALIASES) == [], value
