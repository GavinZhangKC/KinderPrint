"""Validation and projection for approved analytical datasets."""

from typing import Any

from data_loader import (
    COMPARISON_DATA_PATH_ENV,
    EXPLANATION_DATA_PATH_ENV,
    PRIORITY_DATA_PATH_ENV,
    PROFILE_DATA_PATH_ENV,
    comparison_data_path,
    explanation_data_path,
    load_json_source,
    priority_data_path,
    profile_data_path,
)
from responses import INDICATOR_STATUSES, PRIORITY_DOMAINS, limitation

def valid_indicator(indicator: Any, profile_unit: str) -> bool:
    """Accept only source-supplied indicators with explicit provenance and status."""
    if not isinstance(indicator, dict) or indicator.get("status") not in INDICATOR_STATUSES:
        return False
    required_text = ("id", "name", "source", "geographic_unit", "reference_year")
    if not all(isinstance(indicator.get(field), (str, int)) and str(indicator[field]).strip()
               for field in required_text):
        return False
    if indicator["status"] == "available" and indicator.get("value") is None:
        return False
    if indicator["status"] != "available" and indicator.get("value") is not None:
        return False
    return indicator["status"] != "available" or indicator["geographic_unit"] == profile_unit


def valid_profile(profile: Any) -> bool:
    if not isinstance(profile, dict):
        return False
    area, domains = profile.get("neighbourhood"), profile.get("domains")
    if not isinstance(area, dict) or not isinstance(domains, list):
        return False
    if not all(isinstance(area.get(field), str) and area[field].strip()
               for field in ("id", "name", "geographic_unit")):
        return False
    if len(domains) != len(PRIORITY_DOMAINS):
        return False
    if {domain.get("name") for domain in domains if isinstance(domain, dict)} != PRIORITY_DOMAINS:
        return False
    domain_ids: list[str] = []
    indicator_ids: list[str] = []
    for domain in domains:
        if (not isinstance(domain, dict) or not isinstance(domain.get("id"), str)
                or not domain["id"].strip() or not isinstance(domain.get("name"), str)):
            return False
        domain_ids.append(domain["id"])
        indicators = domain.get("indicators")
        if not isinstance(indicators, list) or not all(valid_indicator(item, area["geographic_unit"]) for item in indicators):
            return False
        indicator_ids.extend(item["id"] for item in indicators)
    return len(domain_ids) == len(set(domain_ids)) and len(indicator_ids) == len(set(indicator_ids))


def load_profiles() -> tuple[list[dict[str, Any]] | None, list[dict[str, Any]]]:
    """Load profiles exactly as prepared by the approved data pipeline."""
    source, limitations = load_json_source(profile_data_path(), PROFILE_DATA_PATH_ENV, "profile")
    if source is None:
        return None, limitations
    profiles = source.get("profiles")
    if not isinstance(profiles, list) or not all(valid_profile(profile) for profile in profiles):
        return None, [limitation(
            "profile_dataset_invalid",
            "The profile dataset must contain a profiles list with neighbourhood, domain, indicator, status, and provenance fields.",
            "profiles")]
    identifiers = [profile["neighbourhood"]["id"] for profile in profiles]
    if len(identifiers) != len(set(identifiers)):
        return None, [limitation("profile_dataset_invalid", "The profile dataset contains duplicate neighbourhood identifiers.", "profiles")]
    return profiles, []


def profile_status(profile: dict[str, Any]) -> str:
    statuses = [indicator["status"] for domain in profile["domains"] for indicator in domain["indicators"]]
    return aggregate_status(statuses)


def aggregate_status(statuses: list[str]) -> str:
    """Summarise inputs without hiding partial or incompatible coverage."""
    if not statuses:
        return "unavailable"
    unique_statuses = set(statuses)
    if len(unique_statuses) == 1:
        return statuses[0]
    return "limited"


def profile_limitations(profile: dict[str, Any]) -> list[dict[str, Any]]:
    """Surface every unavailable input rather than filling, omitting, or estimating it."""
    limitations = list(profile.get("limitations", []))
    if not any(domain["indicators"] for domain in profile["domains"]):
        limitations.append(limitation(
            "profile_inputs_unavailable",
            "No indicators are available for this neighbourhood profile.",
            "indicators"))
    for domain in profile["domains"]:
        for indicator in domain["indicators"]:
            if indicator["status"] != "available":
                limitations.append(limitation(
                    f"indicator_{indicator['status']}",
                    f"{indicator['name']} is {indicator['status']} and no value has been created.",
                    indicator["id"]))
    return limitations


def profile_metadata(profile: dict[str, Any]) -> dict[str, Any]:
    indicators = [indicator for domain in profile["domains"] for indicator in domain["indicators"]]
    source_metadata = profile.get("metadata", {})
    return {
        "sources": sorted({str(indicator["source"]) for indicator in indicators}),
        "reference_years": sorted({str(indicator["reference_year"]) for indicator in indicators}),
        "geographic_unit": profile["neighbourhood"]["geographic_unit"],
        "data_quality": source_metadata.get("data_quality", "Provided by the approved profile dataset"),
    }


def map_indicator_data(profile: dict[str, Any]) -> dict[str, Any]:
    """Project a validated profile to the lightweight map-indicator shape."""
    return {
        "id": profile["neighbourhood"]["id"],
        "geographic_unit": profile["neighbourhood"]["geographic_unit"],
        "indicators": {
            indicator["id"]: {
                "value": indicator["value"],
                "status": indicator["status"],
            }
            for domain in profile["domains"]
            for indicator in domain["indicators"]
        },
    }


def profile_collection_metadata(profiles: list[dict[str, Any]]) -> dict[str, Any]:
    """Summarise provenance supplied by a validated profile collection."""
    indicators = [
        indicator
        for profile in profiles
        for domain in profile["domains"]
        for indicator in domain["indicators"]
    ]
    geographic_units = sorted({
        profile["neighbourhood"]["geographic_unit"] for profile in profiles
    })
    quality_values = sorted({
        str(profile.get("metadata", {}).get(
            "data_quality", "Provided by the approved profile dataset"))
        for profile in profiles
    })
    return {
        "sources": sorted({str(indicator["source"]) for indicator in indicators}),
        "reference_years": sorted({str(indicator["reference_year"]) for indicator in indicators}),
        "geographic_unit": geographic_units[0] if len(geographic_units) == 1 else None,
        "data_quality": quality_values[0] if len(quality_values) == 1 else quality_values,
        "result_count": len(profiles),
    }


def valid_priority_metadata(metadata: Any) -> bool:
    return isinstance(metadata, dict) and all(
        isinstance(metadata.get(field), (str, int)) and str(metadata[field]).strip()
        for field in ("source", "reference_year", "geographic_unit", "data_quality")
    )


def valid_priority_limitation(item: Any) -> bool:
    if (not isinstance(item, dict) or not isinstance(item.get("code"), str)
            or not item["code"].strip() or not isinstance(item.get("message"), str)
            or not item["message"].strip()):
        return False
    affected_fields = item.get("affected_fields", [])
    return isinstance(affected_fields, list) and all(isinstance(field, str) for field in affected_fields)


def valid_priority_result(result: Any) -> bool:
    """Validate that the precomputed result contains a band, never a score."""
    if not isinstance(result, dict) or result.get("status") not in INDICATOR_STATUSES:
        return False
    area = result.get("neighbourhood")
    if not isinstance(area, dict) or not all(isinstance(area.get(field), str) and area[field].strip()
                                             for field in ("id", "name")):
        return False
    if any(key in result for key in ("score", "priority_score", "numeric_score")):
        return False
    domains = result.get("contributing_domains")
    if (not isinstance(domains, list) or len(domains) != len(set(domains))
            or not all(domain in PRIORITY_DOMAINS for domain in domains)):
        return False
    if result["status"] == "available":
        priority_band = result.get("priority_band")
        return (
            result.get("label") == "Priority for Investigation"
            and isinstance(priority_band, str)
            and bool(priority_band.strip())
            and not numeric_string(priority_band)
            and bool(domains)
        )
    return (
        result.get("label") == "Priority for Investigation"
        and result.get("priority_band") is None
        and domains == []
        and isinstance(result.get("limitations"), list)
        and bool(result["limitations"])
        and all(valid_priority_limitation(item) for item in result["limitations"])
    )


def numeric_string(value: str) -> bool:
    """Reject an exact numeric value presented as a priority band string."""
    try:
        float(value.strip())
    except ValueError:
        return False
    return True


def load_priority_results() -> tuple[list[dict[str, Any]] | None, dict[str, Any] | None, list[dict[str, Any]]]:
    """Load only an explicitly approved, precomputed Data Science output."""
    source, limitations = load_json_source(priority_data_path(), PRIORITY_DATA_PATH_ENV, "priority")
    if source is None:
        return None, None, limitations
    results, metadata = source.get("results"), source.get("metadata")
    if source.get("approved") is not True or not isinstance(results, list) or not valid_priority_metadata(metadata):
        return None, None, [limitation(
            "priority_dataset_invalid",
            "The priority dataset must be explicitly approved and contain results with complete provenance metadata.",
            "priority")]
    if not all(valid_priority_result(result) for result in results):
        return None, None, [limitation(
            "priority_dataset_invalid",
            "The priority dataset contains an invalid result, an unsupported label, or a numeric priority value.",
            "results")]
    identifiers = [result["neighbourhood"]["id"] for result in results]
    if len(identifiers) != len(set(identifiers)):
        return None, None, [limitation("priority_dataset_invalid", "The priority dataset contains duplicate neighbourhood identifiers.", "results")]
    return results, metadata, []


def priority_data(result: dict[str, Any]) -> dict[str, Any]:
    """Whitelist the public fields so internal source scores can never leak."""
    return {
        "label": result["label"],
        "neighbourhood": result["neighbourhood"],
        "priority_band": result["priority_band"],
        "contributing_domains": result["contributing_domains"],
    }


def valid_explanation_factor(factor: Any) -> bool:
    if not isinstance(factor, dict) or factor.get("status") not in INDICATOR_STATUSES:
        return False
    return all(isinstance(factor.get(field), (str, int)) and str(factor[field]).strip()
               for field in ("id", "name", "source", "geographic_unit", "reference_year"))


def valid_incomplete_input(item: Any, factor_references: set[str]) -> bool:
    return (
        isinstance(item, dict)
        and isinstance(item.get("indicator"), str)
        and item["indicator"] in factor_references
        and isinstance(item.get("reason"), str)
        and bool(item["reason"].strip())
    )


def valid_explanation(explanation: Any) -> bool:
    """Validate approved factors and preserve their complete input limitations."""
    if not isinstance(explanation, dict) or explanation.get("status") not in INDICATOR_STATUSES:
        return False
    area, domains = explanation.get("neighbourhood"), explanation.get("factor_domains")
    if not isinstance(area, dict) or not all(isinstance(area.get(field), str) and area[field].strip()
                                             for field in ("id", "name")):
        return False
    if not isinstance(domains, list) or not all(isinstance(domain, dict) and domain.get("domain") in PRIORITY_DOMAINS
                                                and isinstance(domain.get("factors"), list) for domain in domains):
        return False
    if len(domains) != len(PRIORITY_DOMAINS) or {domain["domain"] for domain in domains} != PRIORITY_DOMAINS:
        return False
    factors = [factor for domain in domains for factor in domain["factors"]]
    if not all(valid_explanation_factor(factor) for factor in factors):
        return False
    factor_ids = [factor["id"] for factor in factors]
    if len(factor_ids) != len(set(factor_ids)):
        return False
    highlighted = explanation.get("highlighted_factor_ids")
    if not isinstance(highlighted, list) or not all(isinstance(item, str) for item in highlighted):
        return False
    if len(highlighted) != len(set(highlighted)) or not set(highlighted).issubset(factor_ids):
        return False
    incomplete_inputs = explanation.get("incomplete_inputs")
    factor_references = set(factor_ids) | {factor["name"] for factor in factors}
    if not isinstance(incomplete_inputs, list) or not all(valid_incomplete_input(item, factor_references) for item in incomplete_inputs):
        return False
    incomplete_references = {item["indicator"] for item in incomplete_inputs}
    unavailable_factors = [factor for factor in factors if factor["status"] != "available"]
    if not all(factor["id"] in incomplete_references or factor["name"] in incomplete_references
               for factor in unavailable_factors):
        return False
    if explanation["status"] != aggregate_status([factor["status"] for factor in factors]):
        return False
    if explanation["status"] != "available":
        return isinstance(explanation.get("limitations"), list) and bool(explanation["limitations"])
    return True


def load_explanations() -> tuple[list[dict[str, Any]] | None, dict[str, Any] | None, list[dict[str, Any]]]:
    """Load an explicitly approved explanation output without recalculating it."""
    source, limitations = load_json_source(explanation_data_path(), EXPLANATION_DATA_PATH_ENV, "explanation")
    if source is None:
        return None, None, limitations
    explanations, metadata = source.get("explanations"), source.get("metadata")
    if source.get("approved") is not True or not isinstance(explanations, list) or not valid_priority_metadata(metadata):
        return None, None, [limitation(
            "explanation_dataset_invalid",
            "The explanation dataset must be explicitly approved and contain explanations with complete provenance metadata.",
            "explanation")]
    if not all(valid_explanation(explanation) for explanation in explanations):
        return None, None, [limitation(
            "explanation_dataset_invalid",
            "The explanation dataset contains invalid factors, incomplete-input details, or highlighted factors outside the full factor list.",
            "explanations")]
    identifiers = [explanation["neighbourhood"]["id"] for explanation in explanations]
    if len(identifiers) != len(set(identifiers)):
        return None, None, [limitation("explanation_dataset_invalid", "The explanation dataset contains duplicate neighbourhood identifiers.", "explanations")]
    return explanations, metadata, []


def explanation_data(explanation: dict[str, Any]) -> dict[str, Any]:
    """Expose only factors, highlights, and named gaps from the approved output."""
    return {
        "neighbourhood": explanation["neighbourhood"],
        "factor_domains": explanation["factor_domains"],
        "highlighted_factor_ids": explanation["highlighted_factor_ids"],
        "incomplete_inputs": explanation["incomplete_inputs"],
    }


def valid_comparison_area(area: Any) -> bool:
    return isinstance(area, dict) and all(isinstance(area.get(field), str) and area[field].strip()
                                          for field in ("id", "name", "geographic_unit"))


def valid_similarity_basis(basis: Any) -> bool:
    return isinstance(basis, list) and bool(basis) and all(isinstance(item, str) and item.strip() for item in basis)


def valid_side_by_side_field(field: Any) -> bool:
    if not isinstance(field, dict) or not all(isinstance(field.get(key), str) and field[key].strip()
                                              for key in ("id", "name", "source_status", "comparison_status")):
        return False
    if field["source_status"] not in INDICATOR_STATUSES or field["comparison_status"] not in INDICATOR_STATUSES:
        return False
    return (
        ((field.get("source_value") is not None) if field["source_status"] == "available"
         else field.get("source_value") is None)
        and ((field.get("comparison_value") is not None) if field["comparison_status"] == "available"
             else field.get("comparison_value") is None)
    )


def valid_match(match: Any) -> bool:
    if not isinstance(match, dict) or match.get("status") not in {"available", "limited", "no_match"}:
        return False
    if not valid_comparison_area(match.get("source_neighbourhood")):
        return False
    if match["status"] == "no_match":
        return (
            match.get("matched_neighbourhood") is None
            and match.get("match_strength") is None
            and match.get("similarity_basis") == []
            and isinstance(match.get("limitations"), list)
            and bool(match["limitations"])
        )
    return (
        valid_comparison_area(match.get("matched_neighbourhood"))
        and match["source_neighbourhood"]["geographic_unit"] == match["matched_neighbourhood"]["geographic_unit"]
        and valid_similarity_basis(match.get("similarity_basis"))
        and isinstance(match.get("match_strength"), str)
        and bool(match["match_strength"].strip())
    )


def valid_manual_comparison(comparison: Any) -> bool:
    if not isinstance(comparison, dict) or comparison.get("status") not in {"available", "limited", "no_match"}:
        return False
    source, compared = comparison.get("source_neighbourhood"), comparison.get("comparison_neighbourhood")
    if not valid_comparison_area(source) or not valid_comparison_area(compared):
        return False
    if comparison["status"] == "no_match":
        return (
            comparison.get("match_strength") is None
            and comparison.get("similarity_basis") == []
            and comparison.get("side_by_side") == []
            and isinstance(comparison.get("limitations"), list)
            and bool(comparison["limitations"])
        )
    return (
        source["geographic_unit"] == compared["geographic_unit"]
        and valid_similarity_basis(comparison.get("similarity_basis"))
        and isinstance(comparison.get("match_strength"), str)
        and bool(comparison["match_strength"].strip())
        and isinstance(comparison.get("side_by_side"), list)
        and all(valid_side_by_side_field(field) for field in comparison["side_by_side"])
    )


def load_comparison_data() -> tuple[dict[str, list[dict[str, Any]]] | None, dict[str, Any] | None, list[dict[str, Any]]]:
    """Load only approved matching outputs; the API never finds or forces a match."""
    source, limitations = load_json_source(comparison_data_path(), COMPARISON_DATA_PATH_ENV, "comparison")
    if source is None:
        return None, None, limitations
    matches, comparisons, metadata = source.get("matches"), source.get("comparisons"), source.get("metadata")
    if (source.get("approved") is not True or not isinstance(matches, list) or not isinstance(comparisons, list)
            or not valid_priority_metadata(metadata)):
        return None, None, [limitation(
            "comparison_dataset_invalid",
            "The comparison dataset must be explicitly approved and contain matches, comparisons, and complete provenance metadata.",
            "comparison")]
    if not all(valid_match(match) for match in matches) or not all(valid_manual_comparison(item) for item in comparisons):
        return None, None, [limitation(
            "comparison_dataset_invalid",
            "The comparison dataset contains an invalid match, comparison, strength, or side-by-side field.",
            "comparison")]
    match_ids = [match["source_neighbourhood"]["id"] for match in matches]
    if len(match_ids) != len(set(match_ids)):
        return None, None, [limitation("comparison_dataset_invalid", "The comparison dataset contains duplicate recommended-match identifiers.", "matches")]
    return {"matches": matches, "comparisons": comparisons}, metadata, []


def match_data(match: dict[str, Any]) -> dict[str, Any]:
    return {key: match[key] for key in ("source_neighbourhood", "matched_neighbourhood", "similarity_basis", "match_strength")}


def manual_comparison_data(comparison: dict[str, Any], reverse: bool = False) -> dict[str, Any]:
    """Keep the response in the practitioner's selected order when a pair is stored reversed."""
    fields = comparison["side_by_side"]
    if reverse:
        fields = [{
            **field,
            "source_value": field.get("comparison_value"),
            "comparison_value": field.get("source_value"),
            "source_status": field["comparison_status"],
            "comparison_status": field["source_status"],
        } for field in fields]
    return {
        "source_neighbourhood": comparison["comparison_neighbourhood"] if reverse else comparison["source_neighbourhood"],
        "comparison_neighbourhood": comparison["source_neighbourhood"] if reverse else comparison["comparison_neighbourhood"],
        "side_by_side": fields,
        "similarity_basis": comparison["similarity_basis"],
        "match_strength": comparison["match_strength"],
    }
