import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "outputs/iteration_2/environmental_differences.json"


def data():
    return json.loads(TARGET.read_text())


def test_environmental_output_is_approved_complete_and_unique():
    source = data()
    pairs = [(row["neighbourhood_a"]["id"], row["neighbourhood_b"]["id"])
             for row in source["differences"]]
    assert source["approved"] is True
    assert len(pairs) == len(set(pairs)) == 264
    assert all(a != b for a, b in pairs)


def test_every_published_pair_has_three_available_indicators():
    expected = {"env_vegetation_cover", "env_urban_heat", "env_open_space_access"}
    for comparison in data()["differences"]:
        indicators = comparison["environmental_indicators"]
        assert {indicator["id"] for indicator in indicators} == expected
        assert len(comparison["approved_standout_indicator_ids"]) == 1
        assert comparison["approved_standout_indicator_ids"][0] in expected
        for indicator in indicators:
            for field in ("neighbourhood_a", "neighbourhood_b", "approved_difference"):
                assert indicator[field]["status"] == "available"
                assert indicator[field]["value"] is not None


def test_environmental_differences_reconcile_with_source_values():
    for comparison in data()["differences"]:
        for indicator in comparison["environmental_indicators"]:
            expected = round(indicator["neighbourhood_a"]["value"]
                             - indicator["neighbourhood_b"]["value"], 2)
            assert indicator["approved_difference"]["value"] == expected
