import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def module():
    path = ROOT / "scripts/acquire_vicmap_foi.py"
    spec = importlib.util.spec_from_file_location("acquire_vicmap_foi", path)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


def test_vicmap_query_is_paginated_and_selective():
    value = module()
    assert value.PAGE_SIZE == 2000
    assert "child care" in value.WHERE
    assert "maternal/child health centre" in value.WHERE
    assert "playground" in value.WHERE
    assert "swimming pool" in value.WHERE
    assert "aged care" not in value.WHERE
