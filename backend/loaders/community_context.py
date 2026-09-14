"""Load validated traffic and industrial reporting-locality context."""

import csv
from functools import lru_cache
import math
from pathlib import Path
from typing import Any

from core.data_loader import (
    COMMUNITY_CONTEXT_DATA_PATH_ENV,
    COMMUNITY_IDENTITY_DATA_PATH_ENV,
    community_context_data_path,
    community_identity_data_path,
)
from core.responses import limitation

TRAFFIC_FIELDS = (
    "declared_road_km",
    "length_weighted_aadt",
    "length_weighted_heavy_aadt",
    "high_traffic_road_km",
    "high_traffic_road_share_pct",
    "actual_observation_road_share_pct",
)
INDUSTRIAL_COUNT_FIELDS = (
    "npi_facilities",
    "npi_respiratory_reporting_facilities",
)
INDUSTRIAL_DISTANCE_FIELDS = (
    "nearest_npi_facility_km",
    "nearest_npi_respiratory_reporting_facility_km",
)
CONTEXT_FIELDS = {
    "community_id", "context_quality_flag", *TRAFFIC_FIELDS,
    *INDUSTRIAL_COUNT_FIELDS, *INDUSTRIAL_DISTANCE_FIELDS,
}
IDENTITY_FIELDS = {
    "community_id", "community_name", "neighbourhood_id",
    "n_component_sa2", "is_merged",
}
TRAFFIC_METRIC_DEFINITIONS = {
    "declared_road_km": {
        "name": "Declared-road length",
        "unit": "km",
        "definition": "Length of source-covered declared roads intersecting the reporting locality.",
    },
    "length_weighted_aadt": {
        "name": "Length-weighted annual average daily traffic",
        "unit": "vehicles_per_day",
        "definition": "AADT averaged across covered road segments using intersecting road length as weight.",
    },
    "length_weighted_heavy_aadt": {
        "name": "Length-weighted heavy-vehicle AADT",
        "unit": "vehicles_per_day",
        "definition": "Heavy-vehicle AADT averaged across covered road segments using intersecting road length as weight.",
    },
    "high_traffic_road_km": {
        "name": "High-traffic declared-road length",
        "unit": "km",
        "definition": "Length of covered declared roads with AADT at or above 10,000 vehicles per day.",
    },
    "high_traffic_road_share_pct": {
        "name": "High-traffic declared-road share",
        "unit": "percent",
        "definition": "Share of covered declared-road length with AADT at or above 10,000 vehicles per day.",
    },
    "actual_observation_road_share_pct": {
        "name": "Observed-method road share",
        "unit": "percent",
        "definition": "Share of covered declared-road length labelled Actual rather than Estimated by the source.",
    },
}
INDUSTRIAL_METRIC_DEFINITIONS = {
    "npi_facilities": {
        "name": "NPI reporting facilities",
        "unit": "count",
        "definition": "Facilities in the locality reporting to the National Pollutant Inventory in the latest complete year.",
    },
    "npi_respiratory_reporting_facilities": {
        "name": "NPI facilities reporting respiratory-relevant pollutants",
        "unit": "count",
        "definition": "NPI reporting facilities in the locality that reported at least one respiratory-relevant pollutant.",
    },
    "nearest_npi_facility_km": {
        "name": "Distance to nearest NPI reporting facility",
        "unit": "km",
        "definition": "Straight-line distance from the locality context point to the nearest NPI reporting facility.",
    },
    "nearest_npi_respiratory_reporting_facility_km": {
        "name": "Distance to nearest respiratory-relevant NPI facility",
        "unit": "km",
        "definition": "Straight-line distance from the locality context point to the nearest NPI facility reporting a respiratory-relevant pollutant.",
    },
}

TRAFFIC_EVIDENCE = {
    "source": "DTP Historical Annual Average Daily Traffic Volume 2019",
    "publisher": "Victorian Department of Transport and Planning",
    "source_url": "https://opendata.transport.vic.gov.au/dataset/historical-annual-average-daily-traffic-volume",
    "reference_year": "2019",
    "geographic_unit": "KinderPrint reporting locality",
    "data_quality": "CONTEXT_ONLY",
    "methodology": "Road lines were clipped to SA2 boundaries; locality means and shares were weighted by intersecting declared-road length.",
    "coverage": "Declared roads in the 2019 source; local roads are not covered and source values mix Actual and Estimated methods.",
    "thresholds": {"high_traffic_aadt": 10000, "unit": "vehicles_per_day"},
}
INDUSTRIAL_EVIDENCE = {
    "source": "National Pollutant Inventory Emissions",
    "publisher": "Australian Government Department of Climate Change, Energy, the Environment and Water",
    "source_url": "https://data.gov.au/data/dataset/npi/resource/5fc315e6-abe9-4a46-a3fc-93359369c00f",
    "reference_year": "2024/2025",
    "geographic_unit": "KinderPrint reporting locality",
    "data_quality": "CONTEXT_ONLY",
    "methodology": "Latest-year reporting facilities were counted by locality; proximity is straight-line distance and emitted masses were not combined into a score.",
    "coverage": "NPI reporting thresholds omit smaller sources; reported emissions are not ambient concentrations.",
}


@lru_cache(maxsize=1)
def _load_community_identities(
    identity_path: Path,
) -> tuple[dict[str, dict[str, Any]] | None, tuple[dict[str, Any], ...]]:
    """Load reporting-locality identities independently of context metrics."""
    if not identity_path.is_file():
        return None, (limitation(
            "community_identity_dataset_unavailable",
            "The configured reporting-locality identity dataset could not be found.",
            "community_identity",
        ),)
    try:
        with identity_path.open(encoding="utf-8-sig", newline="") as source:
            identity_reader = csv.DictReader(source)
            if (not identity_reader.fieldnames
                    or not IDENTITY_FIELDS.issubset(identity_reader.fieldnames)):
                raise ValueError
            identities: dict[str, dict[str, Any]] = {}
            neighbourhood_ids: set[str] = set()
            for row in identity_reader:
                community_id = row["community_id"].strip()
                neighbourhood_id = row["neighbourhood_id"].strip()
                name = row["community_name"].strip()
                component_sa2_count = int(row["n_component_sa2"])
                is_merged_text = row["is_merged"].strip().lower()
                if is_merged_text not in {"true", "false"}:
                    raise ValueError
                is_merged = is_merged_text == "true"
                if (not community_id or not neighbourhood_id or not name
                        or component_sa2_count < 1
                        or is_merged != (component_sa2_count > 1)
                        or community_id in identities
                        or neighbourhood_id in neighbourhood_ids):
                    raise ValueError
                identities[community_id] = {
                    "neighbourhood": {
                        "id": neighbourhood_id,
                        "name": name,
                        "geographic_unit": "KinderPrint reporting locality",
                    },
                    "component_sa2_count": component_sa2_count,
                    "is_merged": is_merged,
                }
                neighbourhood_ids.add(neighbourhood_id)
    except (OSError, UnicodeError, csv.Error, TypeError, ValueError):
        return None, (limitation(
            "community_identity_dataset_invalid",
            "The reporting-locality identity dataset failed schema or identity validation.",
            "community_identity",
        ),)
    return identities, ()


def load_community_identities(
) -> tuple[dict[str, dict[str, Any]] | None, list[dict[str, Any]]]:
    """Return validated identities indexed by public neighbourhood identifier."""
    identity_path = community_identity_data_path()
    if identity_path is None:
        return None, [limitation(
            "community_identity_dataset_not_configured",
            f"Set {COMMUNITY_IDENTITY_DATA_PATH_ENV} to the reporting-locality identity CSV.",
            "community_identity",
        )]
    identities, limitations = _load_community_identities(identity_path)
    if identities is None:
        return None, list(limitations)
    return {
        identity["neighbourhood"]["id"]: identity
        for identity in identities.values()
    }, []


@lru_cache(maxsize=1)
def _load_community_context(
    context_path: Path,
    identity_path: Path,
) -> tuple[dict[str, dict[str, Any]] | None, tuple[dict[str, Any], ...]]:
    """Load, validate and index static DS context without deriving new values."""
    if not context_path.is_file():
        return None, (limitation(
            "community_context_dataset_unavailable",
            "The configured community context dataset could not be found.",
            "community_context",
        ),)
    identities, identity_limitations = _load_community_identities(identity_path)
    if identities is None:
        return None, identity_limitations
    try:
        with context_path.open(encoding="utf-8-sig", newline="") as source:
            context_reader = csv.DictReader(source)
            if not context_reader.fieldnames or not CONTEXT_FIELDS.issubset(context_reader.fieldnames):
                raise ValueError
            index: dict[str, dict[str, Any]] = {}
            seen_communities: set[str] = set()
            for row in context_reader:
                community_id = row["community_id"].strip()
                if (community_id not in identities or community_id in seen_communities
                        or row["context_quality_flag"] != "CONTEXT_ONLY"):
                    raise ValueError
                traffic_values = {
                    field: float(row[field]) if row[field].strip() else None
                    for field in TRAFFIC_FIELDS
                }
                if any(value is None for value in traffic_values.values()) and not all(
                        value is None for value in traffic_values.values()):
                    raise ValueError
                counts = {field: int(row[field]) for field in INDUSTRIAL_COUNT_FIELDS}
                distances = {
                    field: float(row[field]) if row[field].strip() else None
                    for field in INDUSTRIAL_DISTANCE_FIELDS
                }
                numeric_values = [
                    value for value in (*traffic_values.values(), *counts.values(), *distances.values())
                    if value is not None
                ]
                if (any(not math.isfinite(value) or value < 0 for value in numeric_values)
                        or counts["npi_respiratory_reporting_facilities"] > counts["npi_facilities"]
                        or any(traffic_values[field] is not None
                               and traffic_values[field] > 100
                               for field in ("high_traffic_road_share_pct",
                                             "actual_observation_road_share_pct"))):
                    raise ValueError
                identity = identities[community_id]
                neighbourhood = identity["neighbourhood"]
                index[neighbourhood["id"]] = {
                    "neighbourhood": neighbourhood,
                    "component_sa2_count": identity["component_sa2_count"],
                    "is_merged": identity["is_merged"],
                    "traffic": traffic_values,
                    "industrial_emissions": {**counts, **distances},
                }
                seen_communities.add(community_id)
            if seen_communities != set(identities):
                raise ValueError
    except (OSError, UnicodeError, csv.Error, TypeError, ValueError):
        return None, (limitation(
            "community_context_dataset_invalid",
            "The configured community context failed schema, identity or value validation.",
            "community_context",
        ),)
    return index, ()


def load_community_context() -> tuple[dict[str, dict[str, Any]] | None, list[dict[str, Any]]]:
    context_path = community_context_data_path()
    identity_path = community_identity_data_path()
    if context_path is None:
        return None, [limitation(
            "community_context_dataset_not_configured",
            f"Set {COMMUNITY_CONTEXT_DATA_PATH_ENV} to the community context CSV.",
            "community_context",
        )]
    if identity_path is None:
        return None, [limitation(
            "community_identity_dataset_not_configured",
            f"Set {COMMUNITY_IDENTITY_DATA_PATH_ENV} to the reporting-locality identity CSV.",
            "community_identity",
        )]
    index, limitations = _load_community_context(context_path, identity_path)
    return index, list(limitations)
