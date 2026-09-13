"""Aggregate ACECQA/G-NAF quality reporting without address disclosure."""

import csv
from collections import Counter
from typing import Any

from data_loader import ACECQA_GEOCODING_DATA_PATH_ENV, acecqa_geocoding_data_path
from responses import limitation

REQUIRED_FIELDS = {
    "service_approval_number", "match_status", "assigned_sa2",
    "assigned_kinderprint_locality", "included_in_spatial_analysis",
}
MATCH_STATUSES = {"EXACT", "HIGH_CONFIDENCE", "REVIEW", "UNMATCHED"}


def load_geocoding_quality() -> tuple[dict[str, Any] | None, list[dict[str, Any]]]:
    path = acecqa_geocoding_data_path()
    if path is None:
        return None, [limitation("geocoding_dataset_not_configured",
            f"Set {ACECQA_GEOCODING_DATA_PATH_ENV} to the validated ACECQA/G-NAF CSV.",
            "geocoding_quality")]
    if not path.is_file():
        return None, [limitation("geocoding_dataset_unavailable",
            "The configured ACECQA/G-NAF dataset could not be found.", "geocoding_quality")]
    try:
        with path.open(encoding="utf-8-sig", newline="") as source:
            reader = csv.DictReader(source)
            if not reader.fieldnames or not REQUIRED_FIELDS.issubset(reader.fieldnames):
                raise ValueError
            counts: Counter[str] = Counter()
            service_ids: set[str] = set()
            for row in reader:
                status = row["match_status"]
                included_value = row["included_in_spatial_analysis"].casefold()
                if (status not in MATCH_STATUSES or included_value not in {"true", "false"}
                        or not row["service_approval_number"].strip()
                        or row["service_approval_number"] in service_ids):
                    raise ValueError
                service_ids.add(row["service_approval_number"])
                included = included_value == "true"
                if included and (status not in {"EXACT", "HIGH_CONFIDENCE"}
                                 or not row["assigned_sa2"].strip()
                                 or not row["assigned_kinderprint_locality"].strip()):
                    raise ValueError
                counts[status] += 1
                counts["included" if included else "excluded"] += 1
                if row["assigned_sa2"].strip():
                    counts["sa2_assigned"] += 1
                if row["assigned_kinderprint_locality"].strip():
                    counts["locality_assigned"] += 1
    except (OSError, UnicodeError, csv.Error, TypeError, ValueError):
        return None, [limitation("geocoding_dataset_invalid",
            "The configured ACECQA/G-NAF dataset failed schema or quality-boundary validation.",
            "geocoding_quality")]
    return {
        "total_services": len(service_ids),
        "exact_matches": counts["EXACT"],
        "high_confidence_matches": counts["HIGH_CONFIDENCE"],
        "review_matches": counts["REVIEW"],
        "unmatched": counts["UNMATCHED"],
        "sa2_assignment_success": counts["sa2_assigned"],
        "locality_assignment_success": counts["locality_assigned"],
        "included_in_spatial_analysis": counts["included"],
        "excluded_from_spatial_analysis": counts["excluded"],
    }, []
