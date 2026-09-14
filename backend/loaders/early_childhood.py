"""Load validated locality aggregates from accepted ACECQA/Open G-NAF matches."""

import csv
from functools import lru_cache
import math
from pathlib import Path
from typing import Any

from core.data_loader import ACECQA_CONTEXT_DATA_PATH_ENV, acecqa_context_data_path
from core.responses import limitation

COUNT_FIELDS = {
    "active_education_care_services", "exact_match_services",
    "high_confidence_match_services", "services_with_approved_places",
    "total_approved_places", "long_day_care_services", "kindergarten_services",
    "services_with_current_rating",
}
REQUIRED_FIELDS = {
    "community_id", "neighbourhood_id", "community_name", *COUNT_FIELDS,
    "rating_coverage_pct", "geocoding_source", "match_policy", "context_status",
}


@lru_cache(maxsize=1)
def _load_early_childhood_context(path: Path) -> tuple[tuple[dict[str, Any], ...] | None, tuple[dict[str, Any], ...]]:
    """Read and validate the static locality context once per warm process."""
    if not path.is_file():
        return None, (limitation("early_childhood_context_dataset_unavailable",
            "The configured early-childhood context dataset could not be found.",
            "early_childhood_context"),)
    try:
        with path.open(encoding="utf-8-sig", newline="") as source:
            reader = csv.DictReader(source)
            if not reader.fieldnames or not REQUIRED_FIELDS.issubset(reader.fieldnames):
                raise ValueError
            rows, identifiers = [], set()
            for raw in reader:
                counts = {field: int(raw[field]) for field in COUNT_FIELDS}
                if any(value < 0 for value in counts.values()):
                    raise ValueError
                active = counts["active_education_care_services"]
                if counts["exact_match_services"] + counts["high_confidence_match_services"] != active:
                    raise ValueError
                rating = float(raw["rating_coverage_pct"]) if raw["rating_coverage_pct"] else None
                if ((active == 0 and rating is not None)
                        or (rating is not None and (not math.isfinite(rating) or not 0 <= rating <= 100))
                        or not raw["neighbourhood_id"].strip()
                        or raw["neighbourhood_id"] in identifiers
                        or raw["match_policy"] != "EXACT_OR_HIGH_CONFIDENCE_WITHIN_REPORTING_SCOPE"
                        or raw["context_status"] != "AGGREGATE_SERVICE_CONTEXT"):
                    raise ValueError
                identifiers.add(raw["neighbourhood_id"])
                rows.append({
                    "neighbourhood_id": raw["neighbourhood_id"],
                    "neighbourhood_name": raw["community_name"],
                    **counts,
                    "rating_coverage_pct": rating,
                    "status": "aggregate_context",
                })
    except (OSError, UnicodeError, csv.Error, TypeError, ValueError):
        return None, (limitation("early_childhood_context_dataset_invalid",
            "The configured early-childhood context dataset failed schema or reconciliation validation.",
            "early_childhood_context"),)
    return tuple(rows), ()


def load_early_childhood_context() -> tuple[tuple[dict[str, Any], ...] | None, list[dict[str, Any]]]:
    path = acecqa_context_data_path()
    if path is None:
        return None, [limitation("early_childhood_context_dataset_not_configured",
            f"Set {ACECQA_CONTEXT_DATA_PATH_ENV} to the validated locality aggregate CSV.",
            "early_childhood_context")]
    rows, limitations = _load_early_childhood_context(path)
    return rows, list(limitations)
