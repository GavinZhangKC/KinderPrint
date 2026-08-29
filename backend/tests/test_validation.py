from copy import deepcopy

from validation import (
    profile_status,
    valid_explanation,
    valid_indicator,
    valid_priority_result,
    valid_profile,
)


def indicator(identifier: str, status: str = "available", value=1) -> dict:
    return {
        "id": identifier,
        "name": identifier.upper(),
        "value": value,
        "status": status,
        "source": "approved",
        "geographic_unit": "TBC",
        "reference_year": "TBC",
    }


def profile() -> dict:
    return {
        "neighbourhood": {"id": "n", "name": "N", "geographic_unit": "TBC"},
        "domains": [
            {"id": "development", "name": "Child Development", "indicators": [indicator("a")]},
            {"id": "social", "name": "Social", "indicators": [indicator("b")]},
            {"id": "environment", "name": "Environment", "indicators": [indicator("c")]},
        ],
    }


def factor(identifier: str, status: str = "available") -> dict:
    return {
        "id": identifier,
        "name": identifier.upper(),
        "status": status,
        "source": "approved",
        "geographic_unit": "TBC",
        "reference_year": "TBC",
    }


def explanation() -> dict:
    return {
        "status": "limited",
        "neighbourhood": {"id": "n", "name": "N"},
        "factor_domains": [
            {"domain": "Child Development", "factors": [factor("a")]},
            {"domain": "Social", "factors": [factor("b", "missing")]},
            {"domain": "Environment", "factors": []},
        ],
        "highlighted_factor_ids": ["a"],
        "incomplete_inputs": [{"indicator": "b", "reason": "TBC"}],
        "limitations": [{"code": "missing", "message": "TBC"}],
    }


def test_indicator_value_follows_status() -> None:
    assert valid_indicator(indicator("a", "available", 0), "TBC")
    assert not valid_indicator(indicator("a", "available", None), "TBC")
    assert valid_indicator(indicator("a", "missing", None), "TBC")
    assert not valid_indicator(indicator("a", "missing", 0), "TBC")


def test_profile_requires_three_domains() -> None:
    value = profile()
    assert valid_profile(value)
    value["domains"].pop()
    assert not valid_profile(value)


def test_profile_rejects_duplicate_indicator_ids() -> None:
    value = profile()
    value["domains"][1]["indicators"][0]["id"] = "a"
    assert not valid_profile(value)


def test_profile_mixed_status_is_limited() -> None:
    value = profile()
    value["domains"][1]["indicators"][0].update(status="missing", value=None)
    assert valid_profile(value)
    assert profile_status(value) == "limited"


def priority_result() -> dict:
    return {
        "status": "available",
        "neighbourhood": {"id": "n", "name": "N"},
        "label": "Priority for Investigation",
        "priority_band": "TBC band",
        "contributing_domains": ["Social"],
    }


def test_priority_accepts_relative_band() -> None:
    assert valid_priority_result(priority_result())


def test_priority_rejects_numeric_result() -> None:
    value = priority_result()
    value["priority_band"] = "42"
    assert not valid_priority_result(value)
    value = priority_result()
    value["score"] = 42
    assert not valid_priority_result(value)


def test_withheld_priority_requires_reason() -> None:
    value = priority_result()
    value.update(status="incompatible", priority_band=None, contributing_domains=[])
    assert not valid_priority_result(value)
    value["limitations"] = [{"code": "incompatible", "message": "TBC"}]
    assert valid_priority_result(value)


def test_explanation_highlights_are_subset() -> None:
    value = explanation()
    assert valid_explanation(value)
    value["highlighted_factor_ids"] = ["unknown"]
    assert not valid_explanation(value)


def test_explanation_requires_named_incomplete_input() -> None:
    value = explanation()
    value["incomplete_inputs"] = []
    assert not valid_explanation(value)


def test_explanation_rejects_inconsistent_status() -> None:
    value = deepcopy(explanation())
    value["status"] = "available"
    assert not valid_explanation(value)
