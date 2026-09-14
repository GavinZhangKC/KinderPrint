"""Validated traffic and industrial context for KinderPrint reporting localities."""

import csv
from functools import lru_cache
import math
from pathlib import Path
from typing import Any

from data_loader import (
    COMMUNITY_CONTEXT_DATA_PATH_ENV,
    COMMUNITY_IDENTITY_DATA_PATH_ENV,
    community_context_data_path,
    community_identity_data_path,
)
from responses import limitation

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
IDENTITY_FIELDS = {"community_id", "community_name", "neighbourhood_id"}


@lru_cache(maxsize=1)
def _load_community_context(
    context_path: Path,
    identity_path: Path,
) -> tuple[dict[str, dict[str, Any]] | None, tuple[dict[str, Any], ...]]:
    """Load, validate and index static DS context without deriving new values."""
    if not context_path.is_file() or not identity_path.is_file():
        return None, (limitation(
            "community_context_dataset_unavailable",
            "A configured community context or identity dataset could not be found.",
            "community_context",
        ),)
    try:
        with identity_path.open(encoding="utf-8-sig", newline="") as source:
            identity_reader = csv.DictReader(source)
            if not identity_reader.fieldnames or not IDENTITY_FIELDS.issubset(identity_reader.fieldnames):
                raise ValueError
            identities: dict[str, dict[str, str]] = {}
            neighbourhood_ids: set[str] = set()
            for row in identity_reader:
                community_id = row["community_id"].strip()
                neighbourhood_id = row["neighbourhood_id"].strip()
                name = row["community_name"].strip()
                if (not community_id or not neighbourhood_id or not name
                        or community_id in identities or neighbourhood_id in neighbourhood_ids):
                    raise ValueError
                identities[community_id] = {
                    "id": neighbourhood_id,
                    "name": name,
                    "geographic_unit": "KinderPrint reporting locality",
                }
                neighbourhood_ids.add(neighbourhood_id)

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
                distances = {field: float(row[field]) for field in INDUSTRIAL_DISTANCE_FIELDS}
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
                neighbourhood = identities[community_id]
                index[neighbourhood["id"]] = {
                    "neighbourhood": neighbourhood,
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
    if context_path is None or identity_path is None:
        missing_variables = [
            variable for path, variable in (
                (context_path, COMMUNITY_CONTEXT_DATA_PATH_ENV),
                (identity_path, COMMUNITY_IDENTITY_DATA_PATH_ENV),
            ) if path is None
        ]
        return None, [limitation(
            "community_context_dataset_not_configured",
            f"Configure the required community context datasets: {', '.join(missing_variables)}.",
            "community_context",
        )]
    index, limitations = _load_community_context(context_path, identity_path)
    return index, list(limitations)
