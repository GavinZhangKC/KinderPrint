#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [[ -f "${SCRIPT_DIR}/.venv/bin/activate" ]]; then
  # shellcheck disable=SC1091
  source "${SCRIPT_DIR}/.venv/bin/activate"
fi

export KINDERPRINT_PROFILE_DATA_PATH="${PROJECT_ROOT}/datascience/outputs/iteration_1/profiles.json"
export KINDERPRINT_BOUNDARY_DATA_PATH="${PROJECT_ROOT}/datascience/outputs/iteration_1/boundaries.geojson"
export KINDERPRINT_PRIORITY_DATA_PATH="${PROJECT_ROOT}/datascience/outputs/iteration_1/priorities.json"
export KINDERPRINT_EXPLANATION_DATA_PATH="${PROJECT_ROOT}/datascience/outputs/iteration_1/explanations.json"
export KINDERPRINT_COMPARISON_DATA_PATH="${PROJECT_ROOT}/datascience/outputs/iteration_1/comparisons.json"
export KINDERPRINT_VIF_PROJECTION_DATA_PATH="${PROJECT_ROOT}/datascience/data/processed/vif_child_population_projections_sa2.csv"
export KINDERPRINT_EPA_STATION_YEAR_DATA_PATH="${PROJECT_ROOT}/datascience/data/processed/epa_air_quality_station_year.csv"
export KINDERPRINT_ACECQA_GEOCODING_DATA_PATH="${PROJECT_ROOT}/datascience/data/processed/acecqa_gnaf_geocoding.csv"
export KINDERPRINT_ACECQA_CONTEXT_DATA_PATH="${PROJECT_ROOT}/datascience/data/processed/acecqa_gnaf_context_community.csv"
export KINDERPRINT_COMMUNITY_CONTEXT_DATA_PATH="${PROJECT_ROOT}/datascience/data/processed/community_context.csv"
export KINDERPRINT_COMMUNITY_IDENTITY_DATA_PATH="${PROJECT_ROOT}/datascience/outputs/iteration_1/communities.csv"

cd "${SCRIPT_DIR}"
exec uvicorn main:app --reload --host 0.0.0.0 --port 8000