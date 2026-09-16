"""Validation and projection for approved analytical datasets."""

from typing import Any

from data_loader import (
    COMPARISON_DATA_PATH_ENV,
    ENVIRONMENTAL_DIFFERENCE_DATA_PATH_ENV,
    EXPLANATION_DATA_PATH_ENV,
    OUTCOME_COMPARISON_DATA_PATH_ENV,
    PATTERN_INSIGHT_DATA_PATH_ENV,
    PREVENTION_OPPORTUNITY_DATA_PATH_ENV,
    PRIORITY_DATA_PATH_ENV,
    PROFILE_DATA_PATH_ENV,
    SUITABILITY_DATA_PATH_ENV,
    comparison_data_path,
    environmental_difference_data_path,
    explanation_data_path,
    load_json_source,
    outcome_comparison_data_path,
    pattern_insight_data_path,
    prevention_opportunity_data_path,
    priority_data_path,
    profile_data_path,
    suitability_data_path,
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


SUITABILITY_CRITERIA = {
    "development_on_track",
    "lower_developmental_vulnerability",
    "physical_health_on_track",
    "social_competence_on_track",
    "emotional_maturity_on_track",
    "language_cognitive_on_track",
    "communication_knowledge_on_track",
    "tree_canopy",
    "public_open_space",
    "lower_urban_heat",
    "socioeconomic_resources",
    "general_practice_access",
    "hospital_access",
    "pharmacy_access",
    "lower_industrial_emission_source_presence",
    "lower_declared_road_traffic",
    "public_transport_availability",
}


def _valid_suitability_locality(locality: Any) -> bool:
    if not isinstance(locality, dict):
        return False
    if not all(
        isinstance(locality.get(field), str) and locality[field].strip()
        for field in ("id", "name", "geographic_unit")
    ):
        return False
    score = locality.get("score")
    status = locality.get("status")
    criteria = locality.get("criteria")
    limitations = locality.get("limitations")
    return (
        status in {"available", "limited", "unavailable"}
        and (
            (isinstance(score, (int, float)) and not isinstance(score, bool))
            if status == "available"
            else score is None
        )
        and isinstance(criteria, list)
        and all(item in SUITABILITY_CRITERIA for item in criteria)
        and isinstance(limitations, list)
        and (status == "available" or bool(limitations))
    )


def load_suitability_rankings() -> tuple[
    list[dict[str, Any]] | None,
    dict[str, Any] | None,
    list[dict[str, Any]],
]:
    """Load per-criterion locality scores calculated by the Data Science pipeline."""
    source, limitations = load_json_source(
        suitability_data_path(), SUITABILITY_DATA_PATH_ENV, "suitability"
    )
    if source is None:
        return None, None, limitations
    localities, metadata = source.get("localities"), source.get("metadata")
    if not isinstance(localities, list) or not isinstance(metadata, dict):
        return None, None, [limitation(
            "suitability_dataset_invalid",
            "The suitability dataset must contain localities and metadata.",
            "suitability",
        )]
    for locality in localities:
        if not isinstance(locality, dict):
            return None, None, [limitation(
                "suitability_dataset_invalid",
                "The suitability dataset contains an invalid locality.",
                "localities",
            )]
        scores = locality.get("scores")
        if (not all(isinstance(locality.get(field), str) and locality[field].strip()
                    for field in ("id", "name", "geographic_unit"))
                or not isinstance(scores, dict)
                or set(scores) != SUITABILITY_CRITERIA
                or not all(value is None or (isinstance(value, (int, float))
                                              and not isinstance(value, bool))
                           for value in scores.values())):
            return None, None, [limitation(
                "suitability_dataset_invalid",
                "The suitability dataset contains invalid criterion scores.",
                "localities",
            )]
    return localities, metadata, []


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


def profile_comparison_data(
    source_profile: dict[str, Any], comparison_profile: dict[str, Any]
) -> dict[str, Any]:
    """Build a side-by-side projection without calculating similarity or filling gaps."""
    source_indicators = {
        indicator["id"]: indicator
        for domain in source_profile["domains"]
        for indicator in domain["indicators"]
    }
    comparison_indicators = {
        indicator["id"]: indicator
        for domain in comparison_profile["domains"]
        for indicator in domain["indicators"]
    }
    indicator_ids = list(source_indicators)
    indicator_ids.extend(
        identifier for identifier in comparison_indicators if identifier not in source_indicators)

    side_by_side = []
    for identifier in indicator_ids:
        source = source_indicators.get(identifier)
        compared = comparison_indicators.get(identifier)
        exemplar = source or compared
        side_by_side.append({
            "id": identifier,
            "name": exemplar["name"],
            "source_value": source["value"] if source else None,
            "comparison_value": compared["value"] if compared else None,
            "source_status": source["status"] if source else "unavailable",
            "comparison_status": compared["status"] if compared else "unavailable",
        })

    return {
        "source_neighbourhood": source_profile["neighbourhood"],
        "comparison_neighbourhood": comparison_profile["neighbourhood"],
        "side_by_side": side_by_side,
        "similarity_basis": [],
        "match_strength": None,
    }


def profile_comparison_limitations(
    source_profile: dict[str, Any], comparison_profile: dict[str, Any]
) -> list[dict[str, Any]]:
    """Expose profile gaps for both selected neighbourhoods without imputing values."""
    limitations: list[dict[str, Any]] = []
    for profile in (source_profile, comparison_profile):
        identifier = profile["neighbourhood"]["id"]
        limitations.extend({
            **item,
            "affected_fields": list(dict.fromkeys([
                *item.get("affected_fields", []), identifier,
            ])),
        } for item in profile_limitations(profile))

    source_ids = {
        indicator["id"]
        for domain in source_profile["domains"]
        for indicator in domain["indicators"]
    }
    comparison_ids = {
        indicator["id"]
        for domain in comparison_profile["domains"]
        for indicator in domain["indicators"]
    }
    for identifier in sorted(source_ids ^ comparison_ids):
        missing_from = (
            comparison_profile["neighbourhood"]["id"]
            if identifier in source_ids
            else source_profile["neighbourhood"]["id"]
        )
        limitations.append(limitation(
            "indicator_unavailable_for_comparison",
            "This indicator is not present for both selected neighbourhoods.",
            identifier,
            missing_from,
        ))
    return limitations


def profile_boundary_limitations(
    profiles: list[dict[str, Any]], features: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Report identities or geographic units that cannot be joined safely."""
    profile_units = {
        profile["neighbourhood"]["id"]: profile["neighbourhood"]["geographic_unit"]
        for profile in profiles
    }
    boundary_units = {
        feature["properties"]["id"]: feature["properties"]["geographic_unit"]
        for feature in features
    }
    limitations: list[dict[str, Any]] = []
    for identifier in sorted(profile_units.keys() - boundary_units.keys()):
        limitations.append(limitation(
            "boundary_missing_for_profile",
            "No boundary uses this profile neighbourhood identifier.",
            identifier,
        ))
    for identifier in sorted(boundary_units.keys() - profile_units.keys()):
        limitations.append(limitation(
            "profile_missing_for_boundary",
            "No profile uses this boundary neighbourhood identifier.",
            identifier,
        ))
    for identifier in sorted(profile_units.keys() & boundary_units.keys()):
        if profile_units[identifier] != boundary_units[identifier]:
            limitations.append(limitation(
                "incompatible_geographic_unit",
                "The profile and boundary geographic units differ for this neighbourhood.",
                identifier,
                "geographic_unit",
            ))
    return limitations


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


def valid_comparison_value(value: Any) -> bool:
    """Require explicit availability and preserve null for every unavailable value."""
    if not isinstance(value, dict) or value.get("status") not in INDICATOR_STATUSES:
        return False
    return ((value.get("value") is not None) if value["status"] == "available"
            else value.get("value") is None)


def comparison_area_data(area: dict[str, Any]) -> dict[str, Any]:
    """Expose only the public identity fields from a validated comparison area."""
    return {field: area[field] for field in ("id", "name", "geographic_unit")}


def comparison_indicator_data(indicator: dict[str, Any]) -> dict[str, Any]:
    """Exclude internal analytical fields from a validated comparison indicator."""
    return {
        **{field: indicator[field] for field in (
            "id", "name", "unit", "source", "reference_year", "geographic_unit",
        )},
        **{
            field: {
                "value": indicator[field]["value"],
                "status": indicator[field]["status"],
            }
            for field in ("neighbourhood_a", "neighbourhood_b", "approved_difference")
        },
    }


def comparison_indicator_is_available(indicator: dict[str, Any]) -> bool:
    return all(indicator[field]["status"] == "available" for field in (
        "neighbourhood_a", "neighbourhood_b", "approved_difference"))


def valid_outcome_indicator(indicator: Any, geographic_unit: str) -> bool:
    if not isinstance(indicator, dict):
        return False
    required_text = ("id", "name", "unit", "source", "reference_year", "geographic_unit")
    if not all(isinstance(indicator.get(field), (str, int)) and str(indicator[field]).strip()
               for field in required_text):
        return False
    if indicator["geographic_unit"] != geographic_unit:
        return False
    return all(valid_comparison_value(indicator.get(field)) for field in (
        "neighbourhood_a", "neighbourhood_b", "approved_difference"))


def valid_outcome_comparison(comparison: Any) -> bool:
    """Validate a supplied E5 result without deriving differences or significance."""
    if not isinstance(comparison, dict) or comparison.get("status") not in INDICATOR_STATUSES:
        return False
    area_a, area_b = comparison.get("neighbourhood_a"), comparison.get("neighbourhood_b")
    if not valid_comparison_area(area_a) or not valid_comparison_area(area_b):
        return False
    if area_a["id"] == area_b["id"] or area_a["geographic_unit"] != area_b["geographic_unit"]:
        return False
    indicators = comparison.get("outcome_indicators")
    if not isinstance(indicators, list) or not all(
            valid_outcome_indicator(indicator, area_a["geographic_unit"])
            for indicator in indicators):
        return False
    indicator_ids = [indicator["id"] for indicator in indicators]
    if len(indicator_ids) != len(set(indicator_ids)):
        return False
    limitations = comparison.get("limitations", [])
    if not isinstance(limitations, list) or not all(valid_priority_limitation(item) for item in limitations):
        return False
    if comparison["status"] == "available":
        return bool(indicators) and all(
            value["status"] == "available"
            for indicator in indicators
            for value in (
                indicator["neighbourhood_a"],
                indicator["neighbourhood_b"],
                indicator["approved_difference"],
            )
        )
    return bool(limitations)


def load_outcome_comparisons() -> tuple[list[dict[str, Any]] | None, dict[str, Any] | None, list[dict[str, Any]]]:
    """Load only explicitly approved E5 outcome-comparison outputs."""
    source, limitations = load_json_source(
        outcome_comparison_data_path(), OUTCOME_COMPARISON_DATA_PATH_ENV,
        "outcome_comparison")
    if source is None:
        return None, None, limitations
    comparisons, metadata = source.get("comparisons"), source.get("metadata")
    if (source.get("approved") is not True or not isinstance(comparisons, list)
            or not valid_priority_metadata(metadata)):
        return None, None, [limitation(
            "outcome_comparison_dataset_invalid",
            "The outcome-comparison dataset must be explicitly approved and contain comparisons with complete provenance metadata.",
            "outcome_comparison")]
    if not all(valid_outcome_comparison(comparison) for comparison in comparisons):
        return None, None, [limitation(
            "outcome_comparison_dataset_invalid",
            "The outcome-comparison dataset contains an invalid result, value status, or non-null unavailable value.",
            "comparisons")]
    pair_ids = [
        (comparison["neighbourhood_a"]["id"], comparison["neighbourhood_b"]["id"])
        for comparison in comparisons
    ]
    if len(pair_ids) != len(set(pair_ids)):
        return None, None, [limitation(
            "outcome_comparison_dataset_invalid",
            "The outcome-comparison dataset contains duplicate ordered neighbourhood pairs.",
            "comparisons")]
    return comparisons, metadata, []


def outcome_comparison_data(comparison: dict[str, Any]) -> dict[str, Any]:
    """Whitelist public E5 fields from the approved output."""
    return {
        "neighbourhood_a": comparison_area_data(comparison["neighbourhood_a"]),
        "neighbourhood_b": comparison_area_data(comparison["neighbourhood_b"]),
        "outcome_indicators": [
            comparison_indicator_data(indicator)
            for indicator in comparison["outcome_indicators"]
        ],
    }


def valid_environmental_indicator(indicator: Any, geographic_unit: str) -> bool:
    if not isinstance(indicator, dict):
        return False
    required_text = ("id", "name", "unit", "source", "reference_year", "geographic_unit")
    if not all(isinstance(indicator.get(field), (str, int)) and str(indicator[field]).strip()
               for field in required_text):
        return False
    if indicator["geographic_unit"] != geographic_unit:
        return False
    return all(valid_comparison_value(indicator.get(field)) for field in (
        "neighbourhood_a", "neighbourhood_b", "approved_difference"))


def valid_environmental_difference(result: Any) -> bool:
    """Validate supplied E6 differences and approved standout references."""
    if not isinstance(result, dict) or result.get("status") not in INDICATOR_STATUSES:
        return False
    area_a, area_b = result.get("neighbourhood_a"), result.get("neighbourhood_b")
    if not valid_comparison_area(area_a) or not valid_comparison_area(area_b):
        return False
    if area_a["id"] == area_b["id"] or area_a["geographic_unit"] != area_b["geographic_unit"]:
        return False
    indicators = result.get("environmental_indicators")
    if not isinstance(indicators, list) or not all(
            valid_environmental_indicator(indicator, area_a["geographic_unit"])
            for indicator in indicators):
        return False
    indicator_ids = [indicator["id"] for indicator in indicators]
    if len(indicator_ids) != len(set(indicator_ids)):
        return False
    standout_ids = result.get("approved_standout_indicator_ids")
    if (not isinstance(standout_ids, list)
            or not all(isinstance(identifier, str) for identifier in standout_ids)
            or len(standout_ids) != len(set(standout_ids))
            or not set(standout_ids).issubset(indicator_ids)):
        return False
    limitations = result.get("limitations", [])
    if not isinstance(limitations, list) or not all(valid_priority_limitation(item) for item in limitations):
        return False
    if result["status"] == "available":
        return bool(indicators) and all(
            value["status"] == "available"
            for indicator in indicators
            for value in (
                indicator["neighbourhood_a"],
                indicator["neighbourhood_b"],
                indicator["approved_difference"],
            )
        )
    return bool(limitations)


def load_environmental_differences() -> tuple[list[dict[str, Any]] | None, dict[str, Any] | None, list[dict[str, Any]]]:
    """Load only explicitly approved E6 environmental-difference outputs."""
    source, limitations = load_json_source(
        environmental_difference_data_path(), ENVIRONMENTAL_DIFFERENCE_DATA_PATH_ENV,
        "environmental_difference")
    if source is None:
        return None, None, limitations
    results, metadata = source.get("differences"), source.get("metadata")
    if (source.get("approved") is not True or not isinstance(results, list)
            or not valid_priority_metadata(metadata)):
        return None, None, [limitation(
            "environmental_difference_dataset_invalid",
            "The environmental-difference dataset must be explicitly approved and contain differences with complete provenance metadata.",
            "environmental_difference")]
    if not all(valid_environmental_difference(result) for result in results):
        return None, None, [limitation(
            "environmental_difference_dataset_invalid",
            "The environmental-difference dataset contains an invalid result, standout reference, value status, or non-null unavailable value.",
            "differences")]
    pair_ids = [
        (result["neighbourhood_a"]["id"], result["neighbourhood_b"]["id"])
        for result in results
    ]
    if len(pair_ids) != len(set(pair_ids)):
        return None, None, [limitation(
            "environmental_difference_dataset_invalid",
            "The environmental-difference dataset contains duplicate ordered neighbourhood pairs.",
            "differences")]
    return results, metadata, []


def environmental_difference_data(result: dict[str, Any]) -> dict[str, Any]:
    """Whitelist public E6 fields from the approved output."""
    return {
        "neighbourhood_a": comparison_area_data(result["neighbourhood_a"]),
        "neighbourhood_b": comparison_area_data(result["neighbourhood_b"]),
        "environmental_indicators": [
            comparison_indicator_data(indicator)
            for indicator in result["environmental_indicators"]
        ],
        "approved_standout_indicator_ids": result["approved_standout_indicator_ids"],
    }


def valid_pattern(pattern: Any, outcome_ids: set[str], environmental_ids: set[str]) -> bool:
    """Validate source-supplied pattern wording, evidence links, and assessments."""
    if not isinstance(pattern, dict) or pattern.get("status") not in INDICATOR_STATUSES:
        return False
    if not all(isinstance(pattern.get(field), str) and pattern[field].strip()
               for field in ("id", "title", "description")):
        return False
    outcome_references = pattern.get("supporting_outcome_indicator_ids")
    environmental_references = pattern.get("supporting_environmental_indicator_ids")
    if (not isinstance(outcome_references, list)
            or not all(isinstance(identifier, str) for identifier in outcome_references)
            or len(outcome_references) != len(set(outcome_references))
            or not set(outcome_references).issubset(outcome_ids)):
        return False
    if (not isinstance(environmental_references, list)
            or not all(isinstance(identifier, str) for identifier in environmental_references)
            or len(environmental_references) != len(set(environmental_references))
            or not set(environmental_references).issubset(environmental_ids)):
        return False
    return all(valid_comparison_value(pattern.get(field))
               for field in ("confidence", "quality", "stability"))


def valid_pattern_insight(insight: Any) -> bool:
    """Validate an approved E7 result without identifying or explaining patterns."""
    allowed_statuses = {*INDICATOR_STATUSES, "no_pattern"}
    if not isinstance(insight, dict) or insight.get("status") not in allowed_statuses:
        return False
    area_a, area_b = insight.get("neighbourhood_a"), insight.get("neighbourhood_b")
    if not valid_comparison_area(area_a) or not valid_comparison_area(area_b):
        return False
    if area_a["id"] == area_b["id"] or area_a["geographic_unit"] != area_b["geographic_unit"]:
        return False
    outcomes = insight.get("supporting_outcome_indicators")
    environmental = insight.get("supporting_environmental_indicators")
    if (not isinstance(outcomes, list)
            or not all(valid_outcome_indicator(item, area_a["geographic_unit"])
                       for item in outcomes)
            or not isinstance(environmental, list)
            or not all(valid_environmental_indicator(item, area_a["geographic_unit"])
                       for item in environmental)):
        return False
    outcome_ids = [item["id"] for item in outcomes]
    environmental_ids = [item["id"] for item in environmental]
    if (len(outcome_ids) != len(set(outcome_ids))
            or len(environmental_ids) != len(set(environmental_ids))):
        return False
    patterns = insight.get("patterns")
    if not isinstance(patterns, list) or not all(
            valid_pattern(pattern, set(outcome_ids), set(environmental_ids))
            for pattern in patterns):
        return False
    pattern_ids = [pattern["id"] for pattern in patterns]
    if len(pattern_ids) != len(set(pattern_ids)):
        return False
    limitations = insight.get("limitations", [])
    if not isinstance(limitations, list) or not all(valid_priority_limitation(item) for item in limitations):
        return False
    if insight["status"] == "no_pattern":
        return patterns == [] and bool(limitations)
    if insight["status"] == "available":
        return (bool(patterns) and all(
            pattern["status"] == "available"
            and all(pattern[field]["status"] == "available"
                    for field in ("confidence", "quality", "stability"))
            for pattern in patterns
        ) and all(comparison_indicator_is_available(indicator)
                  for indicator in [*outcomes, *environmental]))
    return bool(limitations)


def load_pattern_insights() -> tuple[list[dict[str, Any]] | None, dict[str, Any] | None, list[dict[str, Any]]]:
    """Load only explicitly approved E7 pattern-insight outputs."""
    source, limitations = load_json_source(
        pattern_insight_data_path(), PATTERN_INSIGHT_DATA_PATH_ENV,
        "pattern_insight")
    if source is None:
        return None, None, limitations
    insights, metadata = source.get("insights"), source.get("metadata")
    if (source.get("approved") is not True or not isinstance(insights, list)
            or not valid_priority_metadata(metadata)):
        return None, None, [limitation(
            "pattern_insight_dataset_invalid",
            "The pattern-insight dataset must be explicitly approved and contain insights with complete provenance metadata.",
            "pattern_insight")]
    if not all(valid_pattern_insight(insight) for insight in insights):
        return None, None, [limitation(
            "pattern_insight_dataset_invalid",
            "The pattern-insight dataset contains an invalid pattern, evidence reference, assessment, or non-null unavailable value.",
            "insights")]
    pair_ids = [
        (insight["neighbourhood_a"]["id"], insight["neighbourhood_b"]["id"])
        for insight in insights
    ]
    if len(pair_ids) != len(set(pair_ids)):
        return None, None, [limitation(
            "pattern_insight_dataset_invalid",
            "The pattern-insight dataset contains duplicate ordered neighbourhood pairs.",
            "insights")]
    return insights, metadata, []


def pattern_insight_data(insight: dict[str, Any]) -> dict[str, Any]:
    """Whitelist public E7 fields from the approved output."""
    pattern_fields = (
        "id", "title", "description", "status",
        "supporting_outcome_indicator_ids", "supporting_environmental_indicator_ids",
    )
    return {
        "neighbourhood_a": comparison_area_data(insight["neighbourhood_a"]),
        "neighbourhood_b": comparison_area_data(insight["neighbourhood_b"]),
        "patterns": [{
            **{field: pattern[field] for field in pattern_fields},
            **{
                field: {
                    "value": pattern[field]["value"],
                    "status": pattern[field]["status"],
                }
                for field in ("confidence", "quality", "stability")
            },
        } for pattern in insight["patterns"]],
        "supporting_outcome_indicators": [
            comparison_indicator_data(indicator)
            for indicator in insight["supporting_outcome_indicators"]
        ],
        "supporting_environmental_indicators": [
            comparison_indicator_data(indicator)
            for indicator in insight["supporting_environmental_indicators"]
        ],
    }


def valid_related_pattern(pattern: Any) -> bool:
    return (
        isinstance(pattern, dict)
        and pattern.get("status") in INDICATOR_STATUSES
        and all(isinstance(pattern.get(field), str) and pattern[field].strip()
                for field in ("id", "title", "description"))
    )


def valid_prevention_opportunity(
    opportunity: Any,
    outcome_ids: set[str],
    environmental_ids: set[str],
    pattern_ids: set[str],
) -> bool:
    """Validate an approved condition and its evidence links without deriving it."""
    if not isinstance(opportunity, dict) or opportunity.get("status") not in INDICATOR_STATUSES:
        return False
    if not all(isinstance(opportunity.get(field), str) and opportunity[field].strip()
               for field in ("id", "condition", "description")):
        return False
    references = (
        ("supporting_outcome_indicator_ids", outcome_ids),
        ("supporting_environmental_indicator_ids", environmental_ids),
        ("related_pattern_ids", pattern_ids),
    )
    for field, allowed_ids in references:
        identifiers = opportunity.get(field)
        if (not isinstance(identifiers, list)
                or not all(isinstance(identifier, str) for identifier in identifiers)
                or len(identifiers) != len(set(identifiers))
                or not set(identifiers).issubset(allowed_ids)):
            return False
    return all(valid_comparison_value(opportunity.get(field))
               for field in ("modifiability", "quality", "uncertainty"))


def valid_prevention_result(result: Any) -> bool:
    """Validate an approved E8 result without deciding or ranking opportunities."""
    allowed_statuses = {*INDICATOR_STATUSES, "no_opportunity"}
    if not isinstance(result, dict) or result.get("status") not in allowed_statuses:
        return False
    area_a, area_b = result.get("neighbourhood_a"), result.get("neighbourhood_b")
    if not valid_comparison_area(area_a) or not valid_comparison_area(area_b):
        return False
    if area_a["id"] == area_b["id"] or area_a["geographic_unit"] != area_b["geographic_unit"]:
        return False
    outcomes = result.get("supporting_outcome_indicators")
    environmental = result.get("supporting_environmental_indicators")
    patterns = result.get("related_patterns")
    if (not isinstance(outcomes, list)
            or not all(valid_outcome_indicator(item, area_a["geographic_unit"])
                       for item in outcomes)
            or not isinstance(environmental, list)
            or not all(valid_environmental_indicator(item, area_a["geographic_unit"])
                       for item in environmental)
            or not isinstance(patterns, list)
            or not all(valid_related_pattern(pattern) for pattern in patterns)):
        return False
    outcome_ids = [item["id"] for item in outcomes]
    environmental_ids = [item["id"] for item in environmental]
    pattern_ids = [pattern["id"] for pattern in patterns]
    if (len(outcome_ids) != len(set(outcome_ids))
            or len(environmental_ids) != len(set(environmental_ids))
            or len(pattern_ids) != len(set(pattern_ids))):
        return False
    opportunities = result.get("opportunities")
    if not isinstance(opportunities, list) or not all(
            valid_prevention_opportunity(
                opportunity, set(outcome_ids), set(environmental_ids), set(pattern_ids))
            for opportunity in opportunities):
        return False
    opportunity_ids = [opportunity["id"] for opportunity in opportunities]
    if len(opportunity_ids) != len(set(opportunity_ids)):
        return False
    limitations = result.get("limitations", [])
    if not isinstance(limitations, list) or not all(valid_priority_limitation(item) for item in limitations):
        return False
    if result["status"] == "no_opportunity":
        return opportunities == [] and bool(limitations)
    if result["status"] == "available":
        return (bool(opportunities) and all(
            opportunity["status"] == "available"
            and all(opportunity[field]["status"] == "available"
                    for field in ("modifiability", "quality", "uncertainty"))
            for opportunity in opportunities
        ) and all(comparison_indicator_is_available(indicator)
                  for indicator in [*outcomes, *environmental])
        and all(pattern["status"] == "available" for pattern in patterns))
    return bool(limitations)


def load_prevention_opportunities() -> tuple[list[dict[str, Any]] | None, dict[str, Any] | None, list[dict[str, Any]]]:
    """Load only explicitly approved E8 prevention-opportunity outputs."""
    source, limitations = load_json_source(
        prevention_opportunity_data_path(), PREVENTION_OPPORTUNITY_DATA_PATH_ENV,
        "prevention_opportunity")
    if source is None:
        return None, None, limitations
    results, metadata = source.get("results"), source.get("metadata")
    if (source.get("approved") is not True or not isinstance(results, list)
            or not valid_priority_metadata(metadata)):
        return None, None, [limitation(
            "prevention_opportunity_dataset_invalid",
            "The prevention-opportunity dataset must be explicitly approved and contain results with complete provenance metadata.",
            "prevention_opportunity")]
    if not all(valid_prevention_result(result) for result in results):
        return None, None, [limitation(
            "prevention_opportunity_dataset_invalid",
            "The prevention-opportunity dataset contains an invalid condition, evidence reference, assessment, or non-null unavailable value.",
            "results")]
    pair_ids = [
        (result["neighbourhood_a"]["id"], result["neighbourhood_b"]["id"])
        for result in results
    ]
    if len(pair_ids) != len(set(pair_ids)):
        return None, None, [limitation(
            "prevention_opportunity_dataset_invalid",
            "The prevention-opportunity dataset contains duplicate ordered neighbourhood pairs.",
            "results")]
    return results, metadata, []


def prevention_opportunity_data(result: dict[str, Any]) -> dict[str, Any]:
    """Whitelist public E8 fields and omit any unapproved recommendation fields."""
    opportunity_fields = (
        "id", "condition", "description", "status",
        "supporting_outcome_indicator_ids",
        "supporting_environmental_indicator_ids",
        "related_pattern_ids", "modifiability", "quality", "uncertainty",
    )
    return {
        "neighbourhood_a": comparison_area_data(result["neighbourhood_a"]),
        "neighbourhood_b": comparison_area_data(result["neighbourhood_b"]),
        "opportunities": [
            {field: opportunity[field] for field in opportunity_fields}
            for opportunity in result["opportunities"]
        ],
        "supporting_outcome_indicators": [
            comparison_indicator_data(indicator)
            for indicator in result["supporting_outcome_indicators"]
        ],
        "supporting_environmental_indicators": [
            comparison_indicator_data(indicator)
            for indicator in result["supporting_environmental_indicators"]
        ],
        "related_patterns": [
            {field: pattern[field] for field in ("id", "title", "description", "status")}
            for pattern in result["related_patterns"]
        ],
    }
