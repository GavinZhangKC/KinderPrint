#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [[ -f "${SCRIPT_DIR}/.venv/bin/activate" ]]; then
  # shellcheck disable=SC1091
  source "${SCRIPT_DIR}/.venv/bin/activate"
fi

export KINDERPRINT_PROFILE_DATA_PATH="${PROJECT_ROOT}/datascience/outputs/iteration_2/profiles.json"
export KINDERPRINT_BOUNDARY_DATA_PATH="${PROJECT_ROOT}/datascience/outputs/iteration_1/boundaries.geojson"
export KINDERPRINT_PRIORITY_DATA_PATH="${PROJECT_ROOT}/datascience/outputs/iteration_1/priorities.json"
export KINDERPRINT_EXPLANATION_DATA_PATH="${PROJECT_ROOT}/datascience/outputs/iteration_1/explanations.json"
export KINDERPRINT_COMPARISON_DATA_PATH="${PROJECT_ROOT}/datascience/outputs/iteration_1/comparisons.json"
export KINDERPRINT_SUITABILITY_DATA_PATH="${PROJECT_ROOT}/datascience/outputs/iteration_2/suitability.json"
export KINDERPRINT_OUTCOME_COMPARISON_DATA_PATH="${PROJECT_ROOT}/datascience/outputs/iteration_2/outcome_comparisons.json"
export KINDERPRINT_ENVIRONMENTAL_DIFFERENCE_DATA_PATH="${PROJECT_ROOT}/datascience/outputs/iteration_2/environmental_differences.json"
export KINDERPRINT_VIF_PROJECTION_DATA_PATH="${PROJECT_ROOT}/datascience/data/processed/vif_child_population_projections_sa2.csv"
export KINDERPRINT_EPA_STATION_YEAR_DATA_PATH="${PROJECT_ROOT}/datascience/data/processed/epa_air_quality_station_year.csv"
export KINDERPRINT_ACECQA_GEOCODING_DATA_PATH="${PROJECT_ROOT}/datascience/data/processed/acecqa_gnaf_geocoding.csv"
export KINDERPRINT_ACECQA_CONTEXT_DATA_PATH="${PROJECT_ROOT}/datascience/data/processed/acecqa_gnaf_context_community.csv"
export KINDERPRINT_COMMUNITY_CONTEXT_DATA_PATH="${PROJECT_ROOT}/datascience/data/processed/community_context.csv"
export KINDERPRINT_COMMUNITY_IDENTITY_DATA_PATH="${PROJECT_ROOT}/datascience/data/processed/communities.csv"
export KINDERPRINT_VCAMS_AREA_DATA_PATH="${PROJECT_ROOT}/datascience/data/processed/vcams_child_health_area.csv"
export KINDERPRINT_VCAMS_LGA_DATA_PATH="${PROJECT_ROOT}/datascience/data/processed/vcams_child_health_lga.csv"
export KINDERPRINT_HEALTH_FACILITY_DATA_PATH="${PROJECT_ROOT}/datascience/data/processed/healthdirect_facilities.csv"
export KINDERPRINT_ABS_CHILD_HEALTH_DATA_PATH="${PROJECT_ROOT}/datascience/data/processed/abs_child_health_sa2.csv"
export KINDERPRINT_PHIDU_CHILD_HEALTH_DATA_PATH="${PROJECT_ROOT}/datascience/data/processed/phidu_child_health_pha.csv"
export KINDERPRINT_PHIDU_PHA_SA2_BRIDGE_DATA_PATH="${PROJECT_ROOT}/datascience/data/processed/phidu_pha_sa2_bridge.csv"

cd "${SCRIPT_DIR}"
exec uvicorn main:app --reload --host 0.0.0.0 --port 8000
