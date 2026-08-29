"""Shared Iteration 1 response structures and notices."""

from typing import Any

TBC_NOTICE_MESSAGE = "TBC"
AREA_LEVEL_NOTICE = {"code": "area_level_information", "message": TBC_NOTICE_MESSAGE}
INDICATOR_STATUSES = {"available", "missing", "incompatible", "unavailable", "limited"}
PRIORITY_DOMAINS = {"Child Development", "Social", "Environment"}
HUMAN_DECISION_NOTICE = {
    "code": "human_decision",
    "message": "The system does not make the final investigation or resource-allocation decision; people do.",
}
ASSOCIATION_NOTICE = {"code": "association_not_causation", "message": TBC_NOTICE_MESSAGE}
INVESTIGATION_LEADS_NOTICE = {"code": "investigation_leads", "message": TBC_NOTICE_MESSAGE}
COMPARABLE_NOTICE = {"code": "comparable_not_identical", "message": TBC_NOTICE_MESSAGE}
COMPARISON_AREA_NOTICE = {"code": "area_level_comparison", "message": TBC_NOTICE_MESSAGE}


def envelope(status: str, data: Any, *, metadata: dict[str, Any] | None = None,
             limitations: list[dict[str, Any]] | None = None,
             notices: list[dict[str, str]] | None = None) -> dict[str, Any]:
    """Return the shared Iteration 1 response envelope."""
    return {"status": status, "data": data, "metadata": metadata or {},
            "limitations": limitations or [], "notices": notices or []}


def limitation(code: str, message: str, *affected_fields: str) -> dict[str, Any]:
    return {"code": code, "message": message, "affected_fields": list(affected_fields)}
