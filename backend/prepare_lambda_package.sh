#!/bin/sh

set -eu

TASK_SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
TASK_REPOSITORY_DIR=$(CDPATH= cd -- "$TASK_SCRIPT_DIR/.." && pwd)
TASK_PACKAGE_DIR="$TASK_SCRIPT_DIR/lambda_package"
TASK_DATA_DIR="$TASK_REPOSITORY_DIR/datascience/outputs/iteration_1"
TASK_ITERATION_2_DATA_DIR="$TASK_REPOSITORY_DIR/datascience/outputs/iteration_2"
TASK_PROCESSED_DATA_DIR="$TASK_REPOSITORY_DIR/datascience/data/processed"

rm -rf "$TASK_PACKAGE_DIR"
mkdir -p "$TASK_PACKAGE_DIR/data"

cp "$TASK_SCRIPT_DIR"/*.py "$TASK_PACKAGE_DIR/"
cp "$TASK_DATA_DIR/profiles.json" "$TASK_PACKAGE_DIR/data/"
cp "$TASK_DATA_DIR/boundaries.geojson" "$TASK_PACKAGE_DIR/data/"
cp "$TASK_DATA_DIR/priorities.json" "$TASK_PACKAGE_DIR/data/"
cp "$TASK_DATA_DIR/explanations.json" "$TASK_PACKAGE_DIR/data/"
cp "$TASK_DATA_DIR/comparisons.json" "$TASK_PACKAGE_DIR/data/"
cp "$TASK_ITERATION_2_DATA_DIR/suitability.json" "$TASK_PACKAGE_DIR/data/"
cp "$TASK_PROCESSED_DATA_DIR/vif_child_population_projections_sa2.csv" "$TASK_PACKAGE_DIR/data/"
cp "$TASK_PROCESSED_DATA_DIR/epa_air_quality_station_year.csv" "$TASK_PACKAGE_DIR/data/"
cp "$TASK_PROCESSED_DATA_DIR/acecqa_gnaf_geocoding.csv" "$TASK_PACKAGE_DIR/data/"
cp "$TASK_PROCESSED_DATA_DIR/acecqa_gnaf_context_community.csv" "$TASK_PACKAGE_DIR/data/"

python3 -m pip install \
    --disable-pip-version-check \
    --no-compile \
    --only-binary=:all: \
    --platform manylinux2014_x86_64 \
    --implementation cp \
    --python-version 3.13 \
    --target "$TASK_PACKAGE_DIR" \
    --requirement "$TASK_SCRIPT_DIR/requirements.txt"

printf '%s\n' "Prepared Lambda source at $TASK_PACKAGE_DIR"
