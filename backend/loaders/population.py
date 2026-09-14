"""Load validated VIF SA2 child-population projections."""

import csv
from functools import lru_cache
import math
from pathlib import Path
from typing import Any

from core.data_loader import VIF_PROJECTION_DATA_PATH_ENV, vif_projection_data_path
from core.responses import limitation

REQUIRED_FIELDS = {
    "sa2_code_2021", "sa2_name_2021", "projection_year", "sex",
    "population_age_0_4_projected", "population_age_5_9_projected",
    "population_age_10_14_projected", "population_age_0_9_projected",
    "population_age_0_14_projected", "population_all_ages_projected",
    "source_id", "value_status",
}
NUMERIC_FIELDS = {
    "population_age_0_4_projected", "population_age_5_9_projected",
    "population_age_10_14_projected", "population_age_0_9_projected",
    "population_age_0_14_projected", "population_all_ages_projected",
}


@lru_cache(maxsize=1)
def _load_population_projections(path: Path) -> tuple[tuple[dict[str, Any], ...] | None, tuple[dict[str, Any], ...]]:
    """Read and validate the static projection file once per warm process."""
    if not path.is_file():
        return None, (limitation("population_projection_dataset_unavailable",
            "The configured VIF projection dataset could not be found.", "population_projections"),)
    try:
        with path.open(encoding="utf-8-sig", newline="") as source:
            reader = csv.DictReader(source)
            if not reader.fieldnames or not REQUIRED_FIELDS.issubset(reader.fieldnames):
                raise ValueError
            rows = []
            keys: set[tuple[str, int, str]] = set()
            for raw in reader:
                year = int(raw["projection_year"])
                values = {field: float(raw[field]) for field in NUMERIC_FIELDS}
                if (not raw["sa2_code_2021"].isdigit() or len(raw["sa2_code_2021"]) != 9
                        or not raw["sa2_name_2021"].strip() or not raw["sex"].strip()
                        or raw["value_status"] != "PROJECTED"
                        or any(not math.isfinite(value) or value < 0 for value in values.values())):
                    raise ValueError
                key = (raw["sa2_code_2021"], year, raw["sex"])
                if key in keys:
                    raise ValueError
                keys.add(key)
                rows.append({
                    "sa2_code": raw["sa2_code_2021"],
                    "sa2_name": raw["sa2_name_2021"],
                    "projection_year": year,
                    "sex": raw["sex"],
                    **values,
                    "status": "projected",
                })
    except (OSError, UnicodeError, csv.Error, TypeError, ValueError):
        return None, (limitation("population_projection_dataset_invalid",
            "The configured VIF projection dataset failed schema or value validation.",
            "population_projections"),)
    return tuple(rows), ()


def load_population_projections() -> tuple[tuple[dict[str, Any], ...] | None, list[dict[str, Any]]]:
    path = vif_projection_data_path()
    if path is None:
        return None, [limitation("population_projection_dataset_not_configured",
            f"Set {VIF_PROJECTION_DATA_PATH_ENV} to the validated VIF projection CSV.",
            "population_projections")]
    rows, limitations = _load_population_projections(path)
    return rows, list(limitations)
