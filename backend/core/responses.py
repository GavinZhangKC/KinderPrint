"""Core KinderPrint response structures and notices."""

from typing import Any

AREA_LEVEL_NOTICE = {
    "code": "area_level_information",
    "message": "KinderPrint describes communities, not individual children. Every figure is an area-level statistic and cannot be applied to any person living there.",
}
INDICATOR_STATUSES = {
    "available", "missing", "suppressed", "incompatible", "unavailable", "limited",
}
PRIORITY_DOMAINS = {"Child Development", "Social", "Environment"}
HUMAN_DECISION_NOTICE = {
    "code": "human_decision",
    "message": "The system does not make the final investigation or resource-allocation decision; people do.",
}
ASSOCIATION_NOTICE = {
    "code": "association_not_causation",
    "message": "These are observed associations in area-level data. They do not show that any condition caused any child-development outcome.",
}
INVESTIGATION_LEADS_NOTICE = {
    "code": "investigation_leads",
    "message": "Results are starting points for investigation, not conclusions. They indicate where a closer look may be warranted.",
}
COMPARABLE_NOTICE = {
    "code": "comparable_not_identical",
    "message": "Matched communities are similar on the socioeconomic and demographic measures used for matching. They are not identical, and unmeasured differences remain.",
}
MANUAL_COMPARISON_NOTICE = {
    "code": "user_selected_comparison",
    "message": "These communities were selected by the user and are not necessarily matched or demographically comparable.",
}
COMPARISON_AREA_NOTICE = {
    "code": "area_level_comparison",
    "message": "Differences between communities are subject to sampling uncertainty. Where a difference is not statistically significant this is stated explicitly.",
}
STATION_CONTEXT_NOTICE = {
    "code": "station_context_only",
    "message": "These observations describe monitoring stations. They are not SA2 or locality exposure estimates.",
}
TRAFFIC_CONTEXT_NOTICE = {
    "code": "traffic_context_only",
    "message": "Traffic measures describe declared-road context. They do not cover all roads or represent personal exposure.",
}
INDUSTRIAL_EMISSIONS_CONTEXT_NOTICE = {
    "code": "industrial_emissions_context_only",
    "message": "NPI reporting describes industrial-emissions context. It is not ambient air quality, personal exposure or a health-risk assessment.",
}


def envelope(status: str, data: Any, *, metadata: dict[str, Any] | None = None,
             limitations: list[dict[str, Any]] | None = None,
             notices: list[dict[str, str]] | None = None) -> dict[str, Any]:
    """Return the shared KinderPrint response envelope."""
    return {"status": status, "data": data, "metadata": metadata or {},
            "limitations": limitations or [], "notices": notices or []}


def limitation(code: str, message: str, *affected_fields: str) -> dict[str, Any]:
    return {"code": code, "message": message, "affected_fields": list(affected_fields)}
