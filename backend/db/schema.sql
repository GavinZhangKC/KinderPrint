-- KinderPrint dataset storage. Safe to run repeatedly.
--
-- __SCHEMA__ is replaced with KINDERPRINT_DB_SCHEMA (default "kinderprint") after
-- the name has been checked against a strict identifier pattern. Everything lives
-- in that one schema so it can sit inside a shared database without touching
-- other schemas.
--
-- Each CSV dataset also gets a typed table __SCHEMA__.ds_<dataset_key>, created
-- by datascience/scripts/load_to_db.py from the CSV header and values.

CREATE SCHEMA IF NOT EXISTS __SCHEMA__;

-- One row per loaded dataset (CSV and JSON). The API checks sha256 here to know
-- when a cached copy is stale.
CREATE TABLE IF NOT EXISTS __SCHEMA__.dataset_versions (
    dataset_key  text PRIMARY KEY,
    table_name   text NOT NULL,
    source_file  text NOT NULL,
    kind         text NOT NULL CHECK (kind IN ('csv', 'json')),
    row_count    integer,
    sha256       char(64) NOT NULL,
    -- CSV only: ordered list of {name, column, type, ...} describing how each
    -- original header maps to a table column and how to format it back to text.
    columns      jsonb,
    loaded_utc   timestamptz NOT NULL DEFAULT now(),
    built_utc    text
);

-- JSON and GeoJSON documents. body is queryable jsonb; body_text keeps the
-- original document text, because jsonb reorders keys and normalises numbers
-- and the API must serve exactly what the data-science pipeline published.
CREATE TABLE IF NOT EXISTS __SCHEMA__.json_artefacts (
    artefact_key text PRIMARY KEY,
    body         jsonb NOT NULL,
    body_text    text NOT NULL,
    sha256       char(64) NOT NULL,
    bytes        bigint NOT NULL,
    loaded_utc   timestamptz NOT NULL DEFAULT now()
);
