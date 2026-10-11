#!/bin/sh

set -eu

TASK_SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
TASK_REPOSITORY_DIR=$(CDPATH= cd -- "$TASK_SCRIPT_DIR/.." && pwd)
TASK_PACKAGE_DIR="$TASK_SCRIPT_DIR/lambda_package"
TASK_DATA_DIR="$TASK_REPOSITORY_DIR/datascience/outputs/iteration_1"
TASK_ITERATION_2_DATA_DIR="$TASK_REPOSITORY_DIR/datascience/outputs/iteration_2"
TASK_PROCESSED_DATA_DIR="$TASK_REPOSITORY_DIR/datascience/data/processed"
TASK_ITERATION_3_DATA_DIR="$TASK_REPOSITORY_DIR/datascience/outputs/iteration_3"

rm -rf "$TASK_PACKAGE_DIR"
mkdir -p "$TASK_PACKAGE_DIR/core" "$TASK_PACKAGE_DIR/data" "$TASK_PACKAGE_DIR/db" "$TASK_PACKAGE_DIR/loaders"

cp "$TASK_SCRIPT_DIR"/*.py "$TASK_PACKAGE_DIR/"
cp "$TASK_SCRIPT_DIR/core"/*.py "$TASK_PACKAGE_DIR/core/"
cp "$TASK_SCRIPT_DIR/loaders"/*.py "$TASK_PACKAGE_DIR/loaders/"
cp "$TASK_SCRIPT_DIR/db"/*.py "$TASK_PACKAGE_DIR/db/"
cp "$TASK_SCRIPT_DIR/db/schema.sql" "$TASK_PACKAGE_DIR/db/"
# The admin-only loader function (loader_handler.py) runs the same load script.
cp "$TASK_REPOSITORY_DIR/datascience/scripts/load_to_db.py" "$TASK_PACKAGE_DIR/"
cp "$TASK_ITERATION_2_DATA_DIR/profiles.json" "$TASK_PACKAGE_DIR/data/"
cp "$TASK_DATA_DIR/boundaries.geojson" "$TASK_PACKAGE_DIR/data/"
cp "$TASK_DATA_DIR/priorities.json" "$TASK_PACKAGE_DIR/data/"
cp "$TASK_DATA_DIR/explanations.json" "$TASK_PACKAGE_DIR/data/"
cp "$TASK_DATA_DIR/comparisons.json" "$TASK_PACKAGE_DIR/data/"
cp "$TASK_ITERATION_2_DATA_DIR/suitability.json" "$TASK_PACKAGE_DIR/data/"
cp "$TASK_ITERATION_2_DATA_DIR/outcome_comparisons.json" "$TASK_PACKAGE_DIR/data/"
cp "$TASK_ITERATION_2_DATA_DIR/environmental_differences.json" "$TASK_PACKAGE_DIR/data/"
cp "$TASK_PROCESSED_DATA_DIR/vif_child_population_projections_sa2.csv" "$TASK_PACKAGE_DIR/data/"
cp "$TASK_PROCESSED_DATA_DIR/epa_air_quality_station_year.csv" "$TASK_PACKAGE_DIR/data/"
cp "$TASK_PROCESSED_DATA_DIR/acecqa_gnaf_geocoding.csv" "$TASK_PACKAGE_DIR/data/"
cp "$TASK_PROCESSED_DATA_DIR/acecqa_gnaf_context_community.csv" "$TASK_PACKAGE_DIR/data/"
cp "$TASK_PROCESSED_DATA_DIR/community_context.csv" "$TASK_PACKAGE_DIR/data/"
cp "$TASK_PROCESSED_DATA_DIR/communities.csv" "$TASK_PACKAGE_DIR/data/"
cp "$TASK_PROCESSED_DATA_DIR/vcams_child_health_area.csv" "$TASK_PACKAGE_DIR/data/"
cp "$TASK_PROCESSED_DATA_DIR/vcams_child_health_lga.csv" "$TASK_PACKAGE_DIR/data/"
cp "$TASK_PROCESSED_DATA_DIR/healthdirect_facilities.csv" "$TASK_PACKAGE_DIR/data/"
cp "$TASK_PROCESSED_DATA_DIR/abs_child_health_sa2.csv" "$TASK_PACKAGE_DIR/data/"
cp "$TASK_PROCESSED_DATA_DIR/phidu_child_health_pha.csv" "$TASK_PACKAGE_DIR/data/"
cp "$TASK_PROCESSED_DATA_DIR/phidu_pha_sa2_bridge.csv" "$TASK_PACKAGE_DIR/data/"
cp "$TASK_PROCESSED_DATA_DIR/sa2_department_area_bridge.csv" "$TASK_PACKAGE_DIR/data/"
cp "$TASK_PROCESSED_DATA_DIR/bushfire_context_sa2.csv" "$TASK_PACKAGE_DIR/data/"
cp "$TASK_PROCESSED_DATA_DIR/transport_context_sa2.csv" "$TASK_PACKAGE_DIR/data/"
cp "$TASK_PROCESSED_DATA_DIR/seasonal_air_quality_sa2.csv" "$TASK_PACKAGE_DIR/data/"
cp "$TASK_PROCESSED_DATA_DIR/nearby_health_services_sa2.csv" "$TASK_PACKAGE_DIR/data/"
cp "$TASK_PROCESSED_DATA_DIR/vaccination_places_sa2.csv" "$TASK_PACKAGE_DIR/data/"
cp "$TASK_PROCESSED_DATA_DIR/council_immunisation_sa2.csv" "$TASK_PACKAGE_DIR/data/"
cp "$TASK_PROCESSED_DATA_DIR/hospital_capability_vic.csv" "$TASK_PACKAGE_DIR/data/"
cp "$TASK_PROCESSED_DATA_DIR/care_compare_sa2.csv" "$TASK_PACKAGE_DIR/data/"
cp "$TASK_PROCESSED_DATA_DIR/urgent_care_clinics_vic.csv" "$TASK_PACKAGE_DIR/data/"
cp "$TASK_PROCESSED_DATA_DIR/primary_care_cost_sa3.csv" "$TASK_PACKAGE_DIR/data/"
cp "$TASK_PROCESSED_DATA_DIR/seasonal_illness_vic.csv" "$TASK_PACKAGE_DIR/data/"
cp "$TASK_PROCESSED_DATA_DIR/food_outlets_sa2.csv" "$TASK_PACKAGE_DIR/data/"
cp "$TASK_PROCESSED_DATA_DIR/food_access_sa2.csv" "$TASK_PACKAGE_DIR/data/"
cp "$TASK_PROCESSED_DATA_DIR/child_nutrient_foods.csv" "$TASK_PACKAGE_DIR/data/"
cp "$TASK_PROCESSED_DATA_DIR/../../config/child_nutrient_targets.csv" "$TASK_PACKAGE_DIR/data/"
cp "$TASK_PROCESSED_DATA_DIR/practitioner_context_sa2.csv" "$TASK_PACKAGE_DIR/data/"
cp "$TASK_ITERATION_3_DATA_DIR/family_fit.json" "$TASK_PACKAGE_DIR/data/"
cp "$TASK_ITERATION_3_DATA_DIR/family_fit_shapes.json" "$TASK_PACKAGE_DIR/data/"
cp "$TASK_ITERATION_3_DATA_DIR/plan_change.json" "$TASK_PACKAGE_DIR/data/"
cp "$TASK_PROCESSED_DATA_DIR/play_spaces_sa2.csv" "$TASK_PACKAGE_DIR/data/"
cp "$TASK_PROCESSED_DATA_DIR/play_access_sa2.csv" "$TASK_PACKAGE_DIR/data/"
cp "$TASK_PROCESSED_DATA_DIR/future_demand_sa2.csv" "$TASK_PACKAGE_DIR/data/"

python3 -m pip install \
    --disable-pip-version-check \
    --no-compile \
    --only-binary=:all: \
    --platform manylinux2014_x86_64 \
    --implementation cp \
    --python-version 3.13 \
    --target "$TASK_PACKAGE_DIR" \
    --requirement "$TASK_SCRIPT_DIR/requirements.txt"

# Amazon RDS certificate bundle, so postgres mode can verify the database
# certificate. Supply a local copy with RDS_CA_BUNDLE, or it is downloaded.
# Files mode does not need it, so a failed download is only a warning.
TASK_RDS_CA_URL="https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem"
if [ -n "${RDS_CA_BUNDLE:-}" ]; then
    cp "$RDS_CA_BUNDLE" "$TASK_PACKAGE_DIR/db/rds-global-bundle.pem"
elif ! curl --silent --show-error --fail --location --output "$TASK_PACKAGE_DIR/db/rds-global-bundle.pem" "$TASK_RDS_CA_URL"; then
    rm -f "$TASK_PACKAGE_DIR/db/rds-global-bundle.pem"
    printf '%s\n' "Warning: could not download the RDS certificate bundle; postgres mode will not verify the database certificate until it is added (see docs/DATABASE.md)." >&2
fi

printf '%s\n' "Prepared Lambda source at $TASK_PACKAGE_DIR"
