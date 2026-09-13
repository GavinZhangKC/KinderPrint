import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "outputs/iteration_2/outcome_comparisons.json"


def data():
    return json.loads(OUT.read_text())


def test_outcome_comparisons_are_explicitly_approved_and_unique():
    source = data()
    pairs = [(row["neighbourhood_a"]["id"], row["neighbourhood_b"]["id"])
             for row in source["comparisons"]]
    assert source["approved"] is True
    assert len(pairs) == len(set(pairs)) == 273
    assert all(area_a != area_b for area_a, area_b in pairs)


def test_outcome_comparisons_only_contain_the_primary_aedc_outcome():
    for comparison in data()["comparisons"]:
        assert [item["id"] for item in comparison["outcome_indicators"]] == [
            "aedc_vulnerable_one_or_more"]
        indicator = comparison["outcome_indicators"][0]
        assert indicator["source"] == "AEDC 2024"
        assert indicator["unit"] == "percent"


def test_available_differences_reconcile_exactly():
    for comparison in data()["comparisons"]:
        indicator = comparison["outcome_indicators"][0]
        values = [indicator[field] for field in (
            "neighbourhood_a", "neighbourhood_b", "approved_difference")]
        if comparison["status"] == "available":
            assert all(item["status"] == "available" for item in values)
            assert indicator["approved_difference"]["value"] == round(
                indicator["neighbourhood_a"]["value"]
                - indicator["neighbourhood_b"]["value"], 4)
        else:
            assert indicator["approved_difference"] == {"value": None, "status": "unavailable"}
            assert comparison["limitations"]


def test_non_significant_differences_remain_disclosed():
    limitations = [limitation for comparison in data()["comparisons"]
                   for limitation in comparison["limitations"]]
    assert sum(item["code"] == "difference_not_significant" for item in limitations) == 212
    assert data()["metadata"]["self_comparison_pairs_excluded"] == 0
