"""Family Fit ("Where to live") endpoints, validation, and parity with the data-science engine."""
import copy
import json
from pathlib import Path

import pytest

from loaders import family_fit as ff

REPO = Path(__file__).resolve().parents[2]
ARTEFACT = REPO / "datascience" / "outputs" / "iteration_3" / "family_fit.json"
SHAPES = REPO / "datascience" / "outputs" / "iteration_3" / "family_fit_shapes.json"
REFERENCE = REPO / "datascience" / "reports" / "family_fit" / "family_fit_validation.json"
BOX_HILL = "207031163"


@pytest.fixture
def live(monkeypatch):
    monkeypatch.setenv(ff.FAMILY_FIT_DATA_PATH_ENV, str(ARTEFACT))
    monkeypatch.setenv(ff.FAMILY_FIT_SHAPES_DATA_PATH_ENV, str(SHAPES))
    ff._load.cache_clear()
    yield
    ff._load.cache_clear()


@pytest.fixture
def broken(monkeypatch, tmp_path):
    def write(mutate):
        source = json.loads(ARTEFACT.read_text())
        mutate(source)
        path = tmp_path / "family_fit.json"
        path.write_text(json.dumps(source))
        monkeypatch.setenv(ff.FAMILY_FIT_DATA_PATH_ENV, str(path))
        ff._load.cache_clear()
    yield write
    ff._load.cache_clear()


def _q(priorities: dict) -> str:
    return ",".join(f"{k}:{v}" for k, v in priorities.items())


# ------------------------------------------------------------------ helpers mirror the engine

def test_percentile_ranks_average_ties_and_skip_missing():
    assert ff.percentile_ranks([1, 2, 2, None, 3], 1) == [25.0, 62.5, 62.5, None, 100.0]
    assert ff.percentile_ranks([1, 2, 3], -1) == [100.0, pytest.approx(200 / 3), pytest.approx(100 / 3)]


def test_parse_priorities_rejects_unknown_and_duplicates():
    ids = {"a", "b"}
    assert ff.parse_priorities("a:essential,b:prefer", ids) == {"a": "essential", "b": "prefer"}
    for bad in ["c:prefer", "a:must", "a:prefer,a:essential", "a"]:
        with pytest.raises(ValueError):
            ff.parse_priorities(bad, ids)


def test_essential_weights_double():
    scores = ff.match_scores({"a": [90.0, None], "b": [30.0, 50.0]}, {"a": "essential", "b": "prefer"},
                             {"prefer": 1.0, "essential": 2.0})
    assert scores[0] == pytest.approx(70.0) and scores[1] is None


# ------------------------------------------------------------------ parity with data science

def test_rankings_match_the_data_science_reference_scenarios(client, live):
    reference = json.loads(REFERENCE.read_text())["reference_scenarios"]
    assert reference, "the data-science build publishes reference scenarios"
    for scenario in reference:
        body = client.get("/api/family-fit/search", params={
            "anchor": scenario["anchor"], "radius_km": scenario["radius_km"],
            "priorities": _q(scenario["priorities"]), "limit": 10}).json()
        assert body["status"] == "available"
        assert body["data"]["counts"]["matching"] == scenario["eligible"], scenario["name"]
        got = [(r["id"], r["match"]) for r in body["data"]["results"]]
        want = [(r["id"], round(r["match"], 1)) for r in scenario["top10"]]
        assert [g[0] for g in got] == [w[0] for w in want], scenario["name"]
        for (_, g), (_, w) in zip(got, want):
            assert g == pytest.approx(w, abs=0.11)


def test_confidence_shares_agree_with_the_reference_within_sampling_error(client, live):
    scenario = json.loads(REFERENCE.read_text())["reference_scenarios"][0]
    body = client.get("/api/family-fit/search", params={
        "anchor": scenario["anchor"], "radius_km": scenario["radius_km"], "priorities": _q(scenario["priorities"])}).json()
    reference = scenario["stability"]["top10_share_in_top10"]
    for result in body["data"]["results"]:
        # 200 vs 300 independent draws: allow about four standard errors
        assert result["stability"]["share"] == pytest.approx(reference[result["id"]], abs=0.15)


# ------------------------------------------------------------------ endpoint behaviour

def test_setup_lists_needs_rules_and_places(client, live):
    body = client.get("/api/family-fit/setup").json()
    assert body["status"] == "available"
    assert len(body["data"]["needs"]) == 8 and all(len(n["measures"]) == 2 for n in body["data"]["needs"])
    assert body["data"]["essential_percentile"] == 50
    assert len(body["data"]["places"]) == 346
    assert {n["code"] for n in body["notices"]} >= {"family_fit_comparative_index", "area_level_information"}


def test_search_results_respect_distance_and_essentials(client, live):
    priorities = {"childcare_kinder": "essential", "gp_access": "essential", "shade_cooler": "prefer"}
    body = client.get("/api/family-fit/search", params={"anchor": BOX_HILL, "radius_km": 10,
                                                        "priorities": _q(priorities)}).json()
    data = body["data"]
    assert data["results"]
    detail = {a["id"]: a for a in json.loads(ARTEFACT.read_text())["areas"]}
    for r in data["results"]:
        assert r["distance_km"] <= 10
        assert detail[r["id"]]["needs"]["childcare_kinder"] >= 50 and detail[r["id"]]["needs"]["gp_access"] >= 50
        assert len(r["reasons"]) == 2 and r["limitation"] is not None
        assert r["stability"] is None  # no school-entry measure chosen, so nothing to vary
    matches = [r["match"] for r in data["results"]]
    assert matches == sorted(matches, reverse=True)
    statuses = {m["status"] for m in data["map"]}
    assert statuses <= {"top", "match", "filtered_out", "no_data", "outside"} and "top" in statuses
    assert len(data["map"]) == 346


def test_search_is_deterministic(client, live):
    params = {"anchor": BOX_HILL, "radius_km": 15, "priorities": "early_development:essential,gp_access:prefer"}
    a = client.get("/api/family-fit/search", params=params).json()["data"]
    b = client.get("/api/family-fit/search", params=params).json()["data"]
    assert a == b


def test_too_few_results_suggests_specific_relaxations(client, live):
    body = client.get("/api/family-fit/search", params={
        "anchor": "213031348", "radius_km": 5,
        "priorities": "early_development:essential,social_emotional:essential,shade_cooler:essential"}).json()
    data = body["data"]
    assert data["counts"]["matching"] < 5
    assert data["suggestions"]
    for s in data["suggestions"]:
        assert s["results"] > data["counts"]["matching"]
        assert s["type"] in {"make_preferred", "widen_distance"}


def test_no_priorities_returns_no_results_without_error(client, live):
    body = client.get("/api/family-fit/search", params={"anchor": BOX_HILL, "radius_km": 5}).json()
    assert body["status"] == "missing" and body["data"]["results"] == []


@pytest.mark.parametrize("params", [
    {"anchor": BOX_HILL, "radius_km": 7},
    {"anchor": BOX_HILL, "radius_km": 5, "priorities": "nonsense:prefer"},
    {"anchor": BOX_HILL, "radius_km": 5, "priorities": "gp_access:must"},
    {"anchor": "abc", "radius_km": 5},
    {"anchor": BOX_HILL, "radius_km": 5, "limit": 0},
])
def test_invalid_requests_are_rejected_in_the_envelope(client, live, params):
    response = client.get("/api/family-fit/search", params=params)
    assert response.status_code == 422
    assert response.json()["status"] == "unavailable" and response.json()["limitations"]


def test_unknown_area_is_404(client, live):
    assert client.get("/api/family-fit/search", params={"anchor": "999999999", "radius_km": 5}).status_code == 404
    assert client.get("/api/family-fit/areas/999999999").status_code == 404


def test_area_detail_has_every_need_and_caveat(client, live):
    body = client.get("/api/family-fit/areas/207011147").json()
    data = body["data"]
    assert [n["id"] for n in data["needs"]] == [n.split(":")[0] for n in [
        "early_development", "social_emotional", "physical_outdoor", "shade_cooler", "fewer_pollution_sources",
        "gp_access", "childcare_kinder", "school_transport"]]
    assert all(n["does_not_confirm"] for n in data["needs"])
    assert data["school_entry_change"]["years"] == "2015 to 2024"
    assert data["outlook_2027"]["lower80"] <= data["outlook_2027"]["pct"] <= data["outlook_2027"]["upper80"]


def test_shapes_cover_every_area(client, live):
    body = client.get("/api/family-fit/shapes").json()
    assert body["status"] == "available" and len(body["data"]["areas"]) == 346


# ------------------------------------------------------------------ failure modes

def test_unconfigured_dataset_is_reported_not_raised(client):
    ff._load.cache_clear()
    body = client.get("/api/family-fit/search", params={"anchor": BOX_HILL, "radius_km": 5}).json()
    assert body["status"] == "unavailable"
    assert body["limitations"][0]["code"] == "family_fit_dataset_not_configured"


@pytest.mark.parametrize("mutate", [
    lambda s: s["needs"][0]["measures"].pop(),
    lambda s: s["areas"][0]["needs"].update({"gp_access": 140}),
    lambda s: s["areas"][1].update({"latitude": 0}),
    lambda s: s["areas"][2].update({"id": s["areas"][3]["id"]}),
    lambda s: s["areas"][4]["outlook_2027"].update({"lower80": 99}),
    lambda s: s["areas"][5].update({"all_five_change_flag": "better"}),
    lambda s: s["metadata"].update({"essential_percentile": "half"}),
])
def test_invalid_artefacts_are_refused(client, broken, mutate):
    broken(mutate)
    body = client.get("/api/family-fit/setup").json()
    assert body["status"] == "unavailable"
    assert body["limitations"][0]["code"] == "family_fit_dataset_invalid"


def test_artefact_change_is_picked_up_without_restart(client, broken):
    broken(lambda s: None)
    first = client.get("/api/family-fit/setup").json()["data"]["model_version"]
    broken(lambda s: s["metadata"].update({"model_version": "S2.test"}))
    assert client.get("/api/family-fit/setup").json()["data"]["model_version"] == "S2.test" != first


def test_loader_has_no_numpy_or_pandas_dependency():
    """The Lambda bundle ships without numpy/pandas, so the scorer must be pure Python."""
    import ast
    tree = ast.parse(Path(ff.__file__).read_text())
    imported = {alias.name.split(".")[0] for node in ast.walk(tree) if isinstance(node, ast.Import) for alias in node.names}
    imported |= {node.module.split(".")[0] for node in ast.walk(tree) if isinstance(node, ast.ImportFrom) and node.module}
    assert not imported & {"numpy", "pandas", "scipy", "sklearn"}
