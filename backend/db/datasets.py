"""Registry of every dataset the API serves.

This is the single source of truth that links a dataset key to:

* the environment variable the API reads (``KINDERPRINT_*_DATA_PATH``),
* the storage kind (``csv`` rows or a ``json`` document), and
* the default file location relative to the repository root, matching
  ``backend/run_local_backend.sh``.

The backend uses it to route reads to PostgreSQL, and
``datascience/scripts/load_to_db.py`` uses it to decide what to load. Both must
agree, so add new datasets here rather than in either caller.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

CSV = "csv"
JSON = "json"

# Columns that identify a row. The load script makes the first one present and
# unique the primary key, and indexes the others.
KEY_COLUMN_CANDIDATES = (
    "sa2_code_2021",
    "sa2_code",
    "community_id",
    "neighbourhood_id",
    "id",
    "pha_code",
    "facility_id",
    "hospital_code",
    "service_approval_number",
    "nutrient_id",
    "lga_code",
    "sa3_code",
    "station_id",
)

_IDENTIFIER = re.compile(r"^[a-z][a-z0-9_]{0,40}$")


@dataclass(frozen=True)
class Dataset:
    key: str
    env_name: str
    kind: str
    default_path: str

    @property
    def table_name(self) -> str:
        """Typed table holding a CSV dataset (JSON datasets live in json_artefacts)."""
        return f"ds_{self.key}"


def _key_from_env(env_name: str) -> str:
    if not (env_name.startswith("KINDERPRINT_") and env_name.endswith("_DATA_PATH")):
        raise ValueError(f"Unexpected dataset variable name: {env_name}")
    key = env_name[len("KINDERPRINT_"):-len("_DATA_PATH")].lower()
    if not _IDENTIFIER.match(key):
        raise ValueError(f"Dataset key is not a safe identifier: {key}")
    return key


_OUT1 = "datascience/outputs/iteration_1"
_OUT2 = "datascience/outputs/iteration_2"
_OUT3 = "datascience/outputs/iteration_3"
_PROC = "datascience/data/processed"
_CONF = "datascience/config"

_ENTRIES = (
    ("KINDERPRINT_PROFILE_DATA_PATH", JSON, f"{_OUT2}/profiles.json"),
    ("KINDERPRINT_BOUNDARY_DATA_PATH", JSON, f"{_OUT1}/boundaries.geojson"),
    ("KINDERPRINT_PRIORITY_DATA_PATH", JSON, f"{_OUT1}/priorities.json"),
    ("KINDERPRINT_EXPLANATION_DATA_PATH", JSON, f"{_OUT1}/explanations.json"),
    ("KINDERPRINT_COMPARISON_DATA_PATH", JSON, f"{_OUT1}/comparisons.json"),
    ("KINDERPRINT_SUITABILITY_DATA_PATH", JSON, f"{_OUT2}/suitability.json"),
    ("KINDERPRINT_OUTCOME_COMPARISON_DATA_PATH", JSON, f"{_OUT2}/outcome_comparisons.json"),
    ("KINDERPRINT_ENVIRONMENTAL_DIFFERENCE_DATA_PATH", JSON, f"{_OUT2}/environmental_differences.json"),
    ("KINDERPRINT_VIF_PROJECTION_DATA_PATH", CSV, f"{_PROC}/vif_child_population_projections_sa2.csv"),
    ("KINDERPRINT_EPA_STATION_YEAR_DATA_PATH", CSV, f"{_PROC}/epa_air_quality_station_year.csv"),
    ("KINDERPRINT_ACECQA_GEOCODING_DATA_PATH", CSV, f"{_PROC}/acecqa_gnaf_geocoding.csv"),
    ("KINDERPRINT_ACECQA_CONTEXT_DATA_PATH", CSV, f"{_PROC}/acecqa_gnaf_context_community.csv"),
    ("KINDERPRINT_COMMUNITY_CONTEXT_DATA_PATH", CSV, f"{_PROC}/community_context.csv"),
    ("KINDERPRINT_COMMUNITY_IDENTITY_DATA_PATH", CSV, f"{_PROC}/communities.csv"),
    ("KINDERPRINT_VCAMS_AREA_DATA_PATH", CSV, f"{_PROC}/vcams_child_health_area.csv"),
    ("KINDERPRINT_VCAMS_LGA_DATA_PATH", CSV, f"{_PROC}/vcams_child_health_lga.csv"),
    ("KINDERPRINT_HEALTH_FACILITY_DATA_PATH", CSV, f"{_PROC}/healthdirect_facilities.csv"),
    ("KINDERPRINT_ABS_CHILD_HEALTH_DATA_PATH", CSV, f"{_PROC}/abs_child_health_sa2.csv"),
    ("KINDERPRINT_PHIDU_CHILD_HEALTH_DATA_PATH", CSV, f"{_PROC}/phidu_child_health_pha.csv"),
    ("KINDERPRINT_PHIDU_PHA_SA2_BRIDGE_DATA_PATH", CSV, f"{_PROC}/phidu_pha_sa2_bridge.csv"),
    ("KINDERPRINT_DEPARTMENT_AREA_BRIDGE_DATA_PATH", CSV, f"{_PROC}/sa2_department_area_bridge.csv"),
    ("KINDERPRINT_BUSHFIRE_CONTEXT_DATA_PATH", CSV, f"{_PROC}/bushfire_context_sa2.csv"),
    ("KINDERPRINT_TRANSPORT_CONTEXT_DATA_PATH", CSV, f"{_PROC}/transport_context_sa2.csv"),
    ("KINDERPRINT_SEASONAL_AIR_DATA_PATH", CSV, f"{_PROC}/seasonal_air_quality_sa2.csv"),
    ("KINDERPRINT_NEARBY_SERVICES_DATA_PATH", CSV, f"{_PROC}/nearby_health_services_sa2.csv"),
    ("KINDERPRINT_VACCINATION_PLACES_DATA_PATH", CSV, f"{_PROC}/vaccination_places_sa2.csv"),
    ("KINDERPRINT_COUNCIL_IMMUNISATION_DATA_PATH", CSV, f"{_PROC}/council_immunisation_sa2.csv"),
    ("KINDERPRINT_FAMILY_FIT_DATA_PATH", JSON, f"{_OUT3}/family_fit.json"),
    ("KINDERPRINT_FAMILY_FIT_SHAPES_DATA_PATH", JSON, f"{_OUT3}/family_fit_shapes.json"),
    ("KINDERPRINT_HOSPITAL_CAPABILITY_DATA_PATH", CSV, f"{_PROC}/hospital_capability_vic.csv"),
    ("KINDERPRINT_CARE_COMPARE_DATA_PATH", CSV, f"{_PROC}/care_compare_sa2.csv"),
    ("KINDERPRINT_URGENT_CARE_CLINICS_DATA_PATH", CSV, f"{_PROC}/urgent_care_clinics_vic.csv"),
    ("KINDERPRINT_PRIMARY_CARE_COST_DATA_PATH", CSV, f"{_PROC}/primary_care_cost_sa3.csv"),
    ("KINDERPRINT_SEASONAL_ILLNESS_DATA_PATH", CSV, f"{_PROC}/seasonal_illness_vic.csv"),
    ("KINDERPRINT_FOOD_OUTLETS_DATA_PATH", CSV, f"{_PROC}/food_outlets_sa2.csv"),
    ("KINDERPRINT_FOOD_ACCESS_DATA_PATH", CSV, f"{_PROC}/food_access_sa2.csv"),
    ("KINDERPRINT_CHILD_NUTRIENT_FOODS_DATA_PATH", CSV, f"{_PROC}/child_nutrient_foods.csv"),
    ("KINDERPRINT_CHILD_NUTRIENT_TARGETS_DATA_PATH", CSV, f"{_CONF}/child_nutrient_targets.csv"),
    ("KINDERPRINT_PRACTITIONER_CONTEXT_DATA_PATH", CSV, f"{_PROC}/practitioner_context_sa2.csv"),
)

DATASETS: tuple[Dataset, ...] = tuple(
    Dataset(_key_from_env(env_name), env_name, kind, path) for env_name, kind, path in _ENTRIES
)
BY_KEY: dict[str, Dataset] = {dataset.key: dataset for dataset in DATASETS}
BY_ENV: dict[str, Dataset] = {dataset.env_name: dataset for dataset in DATASETS}

if len(BY_KEY) != len(DATASETS) or len(BY_ENV) != len(DATASETS):
    raise RuntimeError("Dataset registry contains duplicate keys or variables.")


def for_env(env_name: str) -> Dataset | None:
    """Return the dataset served through ``env_name``, or None when unregistered."""
    return BY_ENV.get(env_name)
