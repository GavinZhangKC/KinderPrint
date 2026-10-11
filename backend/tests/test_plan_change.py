"""Plan a change: endpoints, validation and parity with the data-science engine."""
import ast
import json
from pathlib import Path

import pytest

from loaders import plan_change as pc

REPO = Path(__file__).resolve().parents[2]
ARTEFACT = REPO / "datascience" / "outputs" / "iteration_3" / "plan_change.json"
ENGINE = REPO / "datascience" / "src" / "kinderprint" / "analytics" / "plan_change.py"
BRUNSWICK_EAST = "206011106"


@pytest.fixture
def live(monkeypatch):
    monkeypatch.setenv(pc.PLAN_CHANGE_DATA_PATH_ENV, str(ARTEFACT))
    pc._load.cache_clear()
    yield
    pc._load.cache_clear()


@pytest.fixture
def broken(monkeypatch, tmp_path):
    def write(mutate):
        source = json.loads(ARTEFACT.read_text())
        mutate(source)
        path = tmp_path / "plan_change.json"
        path.write_text(json.dumps(source))
        monkeypatch.setenv(pc.PLAN_CHANGE_DATA_PATH_ENV, str(path))
        pc._load.cache_clear()
    yield write
    pc._load.cache_clear()


def _engine_body(text: str) -> str:
    start = text.index("from __future__ import annotations")
    end = text.find("# --------------------------------------------------------------------------- serving")
    return text[start:end if end != -1 else None].strip()


def test_engine_is_an_exact_copy_of_the_data_science_engine():
    assert _engine_body((Path(pc.__file__)).read_text()) == _engine_body(ENGINE.read_text())


def test_loader_has_no_numpy_or_pandas_dependency():
    tree = ast.parse(Path(pc.__file__).read_text())
    names = {alias.name.split(".")[0] for node in ast.walk(tree) if isinstance(node, ast.Import) for alias in node.names}
    names |= {node.module.split(".")[0] for node in ast.walk(tree) if isinstance(node, ast.ImportFrom) and node.module}
    assert not names & {"numpy", "pandas", "scipy"}


def test_reference_searches_match_the_published_results(live):
    loaded, limitations = pc.load_plan_change()
    assert limitations == []
    source = loaded["source"]
    presets = {p["id"]: p["plan"] for p in source["presets"]}
    assert len(source["reference"]) == 21
    for ref in source["reference"]:
        got = loaded["engine"].evaluate(ref["area_id"], presets[ref["preset"]], inflate=source["parameters"]["inflate"])
        assert got == ref["result"], (ref["area_name"], ref["preset"])


def test_setup_lists_levers_presets_and_caveat(client, live):
    body = client.get("/api/plan-change/setup").json()
    assert body["status"] == "available"
    assert [lever["id"] for lever in body["data"]["levers"]] == ["tree_cover", "urban_heat", "open_space", "road_traffic"]
    assert len(body["data"]["presets"]) == 7
    assert "not the effect" in body["data"]["caveat"]
    assert body["notices"][0]["code"] == "plan_change_association"


def test_area_detail_accepts_an_sa2_inside_the_area(client, live):
    body = client.get(f"/api/plan-change/areas/{BRUNSWICK_EAST}").json()
    assert body["status"] == "available"
    data = body["data"]
    assert data["name"] == "Brunswick East"
    assert set(data["place_features"]) == set(pc.LEVER_IDS)
    assert data["outlook_2027"]["lower_80"] <= data["outlook_2027"]["all_five_pct"] <= data["outlook_2027"]["upper_80"]


def test_evaluate_returns_matched_groups(client, live):
    body = client.get(f"/api/plan-change/evaluate?area={BRUNSWICK_EAST}&tree_cover=5").json()
    assert body["status"] == "available"
    data = body["data"]
    assert data["status"] == "ok"
    assert len(data["like_plan"]) == len(data["like_now"]) >= 5
    ids = {a["id"] for a in data["like_plan"] + data["like_now"]}
    assert BRUNSWICK_EAST not in ids
    for outcome in data["outcomes"].values():
        low, high = outcome["interval_80_pp"]
        assert low <= outcome["difference_pp"] <= high
        assert "clarity" not in outcome
        assert outcome["direction"] in {"higher", "lower", "unclear"}


def test_plan_beyond_any_melbourne_area_is_explained(client, live):
    body = client.get(f"/api/plan-change/evaluate?area={BRUNSWICK_EAST}&tree_cover=40").json()
    assert body["status"] == "no_match"
    assert body["limitations"][0]["code"] == "plan_beyond_observed"


@pytest.mark.parametrize("query", ["", "&tree_cover=5&urban_heat=-1&open_space=3"])
def test_zero_or_three_changes_are_refused(client, live, query):
    body = client.get(f"/api/plan-change/evaluate?area={BRUNSWICK_EAST}{query}").json()
    assert body["status"] == "unavailable"
    assert body["limitations"][0]["code"] == "invalid_plan"


@pytest.mark.parametrize("query", ["tree_cover=-5", "urban_heat=1", "road_traffic=-95", "tree_cover=abc"])
def test_changes_in_the_wrong_direction_are_rejected(client, live, query):
    assert client.get(f"/api/plan-change/evaluate?area={BRUNSWICK_EAST}&{query}").status_code == 422


def test_unknown_area(client, live):
    body = client.get("/api/plan-change/evaluate?area=999999999&tree_cover=5").json()
    assert body["status"] == "unavailable"
    assert body["limitations"][0]["code"] == "unknown_area"


def test_unconfigured_dataset_is_reported(client, monkeypatch):
    monkeypatch.delenv(pc.PLAN_CHANGE_DATA_PATH_ENV, raising=False)
    pc._load.cache_clear()
    body = client.get("/api/plan-change/setup").json()
    assert body["status"] == "unavailable"
    assert body["limitations"][0]["code"] == "plan_change_dataset_not_configured"
    pc._load.cache_clear()


@pytest.mark.parametrize("mutate", [
    lambda s: s.update(schema_version=2),
    lambda s: s["parameters"].update(inflate=0.5),
    lambda s: s["areas"][0]["levers"].pop("tree_cover"),
    lambda s: s["areas"][1].update(id=s["areas"][0]["id"]),
    lambda s: s["areas"][0]["outcomes"].update(all_five=140),
    lambda s: s["presets"][0].update(plan={"rent": 1}),
])
def test_invalid_artefacts_are_refused(client, broken, mutate):
    broken(mutate)
    body = client.get("/api/plan-change/setup").json()
    assert body["status"] == "unavailable"
    assert body["limitations"][0]["code"] == "plan_change_dataset_invalid"
