"""Plan a change (P2) engine and build checks."""
from __future__ import annotations

import ast
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(ROOT / "scripts"))

from kinderprint.analytics import plan_change as pc  # noqa: E402

ARTEFACT = ROOT / "outputs" / "iteration_3" / "plan_change.json"


def make_areas(n: int = 300) -> list[pc.Area]:
    """Synthetic areas: tree cover rises with IRSD, outcome rises with IRSD only."""
    areas = []
    for i in range(n):
        irsd = 900 + i * 0.8
        areas.append(pc.Area(
            id=f"A{i:03d}", name=f"Area {i}",
            levers={"tree_cover": 5 + 20 * i / n + ((i * 37) % 13 - 6), "urban_heat": 10 - (i % 7) * 0.5,
                    "open_space": 5 + (i % 9), "road_traffic": 1000 + 300 * (i % 11)},
            covariates={"irsd": irsd, "children_assessed": 80 + (i * 7) % 30},
            outcomes={"all_five": 40 + (irsd - 900) / 10, "physical": 75 + (irsd - 900) / 20},
        ))
    return areas


def test_engine_is_pure_python():
    tree = ast.parse((ROOT / "src" / "kinderprint" / "analytics" / "plan_change.py").read_text())
    imported = {alias.name.split(".")[0] for node in ast.walk(tree) if isinstance(node, ast.Import) for alias in node.names}
    imported |= {node.module.split(".")[0] for node in ast.walk(tree) if isinstance(node, ast.ImportFrom) and node.module}
    assert not imported & {"numpy", "pandas", "scipy", "sklearn"}


def test_result_is_deterministic_and_interval_contains_estimate():
    engine = pc.Engine(make_areas())
    first = engine.evaluate("A150", {"tree_cover": 5.0})
    assert first == engine.evaluate("A150", {"tree_cover": 5.0})
    assert first["status"] == "ok"
    for outcome in first["outcomes"].values():
        low, high = outcome["interval_80_pp"]
        assert low <= outcome["difference_pp"] <= high


def test_pairs_are_balanced_on_disadvantage():
    engine = pc.Engine(make_areas())
    result = engine.evaluate("A150", {"tree_cover": 5.0})
    assert result["balanced"] is True
    assert len(result["like_plan"]) == len(result["like_now"]) >= pc.MIN_GROUP
    assert not {a["id"] for a in result["like_plan"]} & {a["id"] for a in result["like_now"]}
    assert "A150" not in {a["id"] for a in result["like_plan"] + result["like_now"]}


def test_confounded_link_is_not_reported_as_a_clear_difference():
    # Outcome depends on IRSD only; matching on IRSD should leave no clear gap.
    engine = pc.Engine(make_areas())
    result = engine.evaluate("A150", {"tree_cover": 5.0})
    assert abs(result["outcomes"]["all_five"]["difference_pp"]) < 1.5


@pytest.mark.parametrize("plan", [{}, {"tree_cover": -5.0}, {"urban_heat": 1.0}, {"bogus": 1.0},
                                  {"tree_cover": 5.0, "urban_heat": -1.0, "open_space": 3.0}])
def test_invalid_plans_are_refused(plan):
    assert pc.Engine(make_areas()).evaluate("A150", plan)["status"] == "invalid_plan"


def test_plan_beyond_any_area_is_reported():
    result = pc.Engine(make_areas()).evaluate("A150", {"tree_cover": 80.0})
    assert result == {"status": "beyond_observed", "levers": ["tree_cover"]}


def test_unknown_area():
    assert pc.Engine(make_areas()).evaluate("NOPE", {"tree_cover": 5.0})["status"] == "unknown_area"


def test_traffic_change_is_a_percentage():
    areas = make_areas()
    engine = pc.Engine(areas)
    area = engine.areas["A005"]
    assert engine.target_value(area, "road_traffic", -50.0) == pytest.approx(area.levers["road_traffic"] * 0.5)


def test_calibration_widens_until_chance_rate():
    import build_plan_change as build
    clarity = [i / 100 for i in range(200)]  # 0.00 .. 1.99
    inflate = build.calibrate(clarity, target=0.20)
    assert sum(c > inflate for c in clarity) / len(clarity) <= 0.20
    assert build.calibrate([0.1, 0.2, 0.3], target=0.20) >= 1.0


@pytest.mark.skipif(not ARTEFACT.exists(), reason="artefact not built")
def test_published_artefact_matches_engine():
    artefact = json.loads(ARTEFACT.read_text())
    areas = [pc.Area(r["id"], r["name"], r["levers"], r["covariates"], r["outcomes"]) for r in artefact["areas"]]
    engine = pc.Engine(areas)
    inflate = artefact["parameters"]["inflate"]
    assert inflate >= 1.0
    assert len(artefact["reference"]) == 21
    for ref in artefact["reference"]:
        plan = next(p["plan"] for p in artefact["presets"] if p["id"] == ref["preset"])
        assert engine.evaluate(ref["area_id"], plan, inflate=inflate) == ref["result"]
    words = json.dumps(artefact).lower()
    assert "aboriginal" not in words and "community" not in words.replace("community_", "")
