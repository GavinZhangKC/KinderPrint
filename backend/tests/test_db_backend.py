"""PostgreSQL storage must serve exactly what the files serve.

Skipped unless a database is configured, e.g.:

    KINDERPRINT_DB_HOST=127.0.0.1 KINDERPRINT_DB_PORT=5432 KINDERPRINT_DB_NAME=kinderprint_dev \\
    KINDERPRINT_DB_USER=postgres KINDERPRINT_DB_PASSWORD=... KINDERPRINT_DB_SSL=false \\
    python3 -m pytest -q tests/test_db_backend.py

The module loads every dataset into its own schema (KINDERPRINT_TEST_DB_SCHEMA,
default "kinderprint_test") with the real load script and drops that schema at
the end, so it never touches the application schema.
"""

from __future__ import annotations

import csv
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from core import sources
from db import connection, datasets, repository
from main import app

pytestmark = pytest.mark.skipif(
    not (os.getenv(connection.HOST_ENV) or os.getenv(connection.SECRET_ARN_ENV)),
    reason="Set KINDERPRINT_DB_HOST (or KINDERPRINT_DB_SECRET_ARN) to run the PostgreSQL parity tests.",
)

REPO = Path(__file__).resolve().parents[2]
LOADER = REPO / "datascience" / "scripts" / "load_to_db.py"
TEST_SCHEMA = os.getenv("KINDERPRINT_TEST_DB_SCHEMA", "kinderprint_test")
CSV_DATASETS = [dataset for dataset in datasets.DATASETS if dataset.kind == datasets.CSV]
JSON_DATASETS = [dataset for dataset in datasets.DATASETS if dataset.kind == datasets.JSON]

SA2 = "206011106"  # Brunswick East
SA2_OTHER = "213011339"
BOX_HILL = "207031163"


def _file(dataset: datasets.Dataset) -> Path:
    return REPO / dataset.default_path


def _run_loader(*args: str, extra_env: dict[str, str] | None = None) -> subprocess.CompletedProcess:
    env = {key: value for key, value in os.environ.items() if not key.endswith("_DATA_PATH")}
    env.update({"KINDERPRINT_DB_SCHEMA": TEST_SCHEMA, **(extra_env or {})})
    return subprocess.run([sys.executable, str(LOADER), *args], env=env, capture_output=True,
                          text=True, timeout=900, cwd=REPO)


@pytest.fixture(scope="module")
def loaded_schema():
    if "test" not in TEST_SCHEMA or TEST_SCHEMA == connection.DEFAULT_SCHEMA:
        pytest.fail("KINDERPRINT_TEST_DB_SCHEMA must be a dedicated test schema.")
    result = _run_loader()
    assert result.returncode == 0, result.stderr
    yield TEST_SCHEMA
    conn = connection.open_connection(connection.resolve_settings())
    try:
        conn.run(f"DROP SCHEMA IF EXISTS {connection.quote_identifier(TEST_SCHEMA)} CASCADE")
    finally:
        conn.close()


@pytest.fixture
def storage(monkeypatch: pytest.MonkeyPatch, loaded_schema: str):
    """Switch between files and postgres with every dataset configured, starting cold each time."""
    for dataset in datasets.DATASETS:
        monkeypatch.setenv(dataset.env_name, str(_file(dataset)))
    monkeypatch.setenv(connection.SCHEMA_ENV, loaded_schema)

    def use(mode: str) -> None:
        monkeypatch.setenv(sources.DATA_BACKEND_ENV, mode)
        connection.reset()
        repository.clear_cache()
        sources.reset_for_tests()

    yield use
    connection.reset()
    repository.clear_cache()
    sources.reset_for_tests()


# --------------------------------------------------------------------------- (a) stored data

@pytest.mark.parametrize("dataset", CSV_DATASETS, ids=lambda d: d.key)
def test_csv_rows_match_dictreader_exactly(storage, dataset: datasets.Dataset) -> None:
    path = _file(dataset)
    with path.open(encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        expected = list(reader)
        expected_names = reader.fieldnames
    storage(sources.POSTGRES)
    table = sources.read_csv_rows(path, dataset.env_name)
    assert table.fieldnames == expected_names
    assert len(table.rows) == len(expected)
    assert table.rows == expected
    # Same column order in every row, not just equal dictionaries.
    assert all(list(got) == list(want) for got, want in zip(table.rows, expected))
    assert repository.fetch_csv_rows(dataset.key) == expected


@pytest.mark.parametrize("dataset", JSON_DATASETS, ids=lambda d: d.key)
def test_json_documents_match_exactly(storage, dataset: datasets.Dataset) -> None:
    path = _file(dataset)
    storage(sources.POSTGRES)
    assert repository.fetch_json_text(dataset.key) == path.read_text(encoding="utf-8")
    document = sources.read_json(path, dataset.env_name)
    assert document == json.loads(path.read_text(encoding="utf-8"))
    # Key order matters for API output, and jsonb alone would not keep it.
    assert json.dumps(document) == json.dumps(json.loads(path.read_text(encoding="utf-8")))


def test_numeric_columns_are_stored_with_numeric_types(storage) -> None:
    conn = connection.open_connection(connection.resolve_settings())
    try:
        rows = conn.run(
            "SELECT table_name, column_name, data_type FROM information_schema.columns "
            "WHERE table_schema = :schema AND table_name LIKE 'ds\\_%'", schema=TEST_SCHEMA)
        versions = conn.run(f"SELECT dataset_key, row_count, sha256 FROM "
                            f"{connection.quote_identifier(TEST_SCHEMA)}.dataset_versions")
    finally:
        conn.close()
    types = {(table, column): kind for table, column, kind in rows}
    assert types[("ds_hospital_capability", "latitude")] == "double precision"
    assert types[("ds_hospital_capability", "has_paediatric_service")] == "boolean"
    assert types[("ds_seasonal_air", "month")] == "integer"
    assert types[("ds_seasonal_air", "sa2_code")] == "text"  # identifiers stay text
    assert {key for key, _, _ in versions} == set(datasets.BY_KEY)
    for key, row_count, _ in versions:
        if datasets.BY_KEY[key].kind == datasets.CSV:
            with _file(datasets.BY_KEY[key]).open(encoding="utf-8-sig", newline="") as source:
                assert row_count == sum(1 for _ in csv.DictReader(source))


# --------------------------------------------------------------------------- (b) API parity

def _api_urls() -> list[str]:
    profiles = json.loads((REPO / datasets.BY_KEY["profile"].default_path).read_text())["profiles"]
    ids = [profile["neighbourhood"]["id"] for profile in profiles]
    sample = [ids[0], ids[1], ids[len(ids) // 2], ids[-1]]
    outcome = json.loads((REPO / datasets.BY_KEY["outcome_comparison"].default_path).read_text())["comparisons"][0]
    environment = json.loads(
        (REPO / datasets.BY_KEY["environmental_difference"].default_path).read_text())["differences"][0]
    urls = [
        "/api/health", "/api/health/data", "/api/datasets/status",
        "/api/population-projections", "/api/population-projections?limit=5&offset=10",
        "/api/population-projections?sa2_code=201011001&year=2026",
        "/api/digital-health/vcams-area?area_name=Barwon&year=2013",
        "/api/digital-health/vcams-area?area_name=Hume%20Moreland&year=2021",
        "/api/digital-health/vcams-lga?lga_name=Merri-bek%20(C)",
        "/api/digital-health/vcams-lga?lga_name=Alpine%20(S)",
        "/api/digital-health/seasonal-illness",
        "/api/air-quality/stations", "/api/air-quality/station-catalog",
        "/api/air-quality/stations?station_id=10001&year=2022&pollutant=NO2",
        "/api/data-quality/acecqa-geocoding",
        "/api/priority", "/api/neighbourhoods/search?q=Brun", "/api/neighbourhoods/boundaries",
        "/api/map/context", "/api/neighbourhoods/indicators",
        "/api/compare?neighbourhood_id_a={0}&neighbourhood_id_b={1}".format(*sample),
        "/api/compare?neighbourhood_ids={0},{1},{2}".format(*sample),
        f"/api/outcome-comparison?neighbourhood_id_a={outcome['neighbourhood_a']['id']}"
        f"&neighbourhood_id_b={outcome['neighbourhood_b']['id']}",
        f"/api/environmental-difference?neighbourhood_id_a={environment['neighbourhood_a']['id']}"
        f"&neighbourhood_id_b={environment['neighbourhood_b']['id']}",
        "/api/pattern-insight", "/api/prevention-opportunity",
        "/api/localities/suitable", "/api/localities/suitable?criteria=service_access&limit=5",
        "/api/localities/suitable?criteria=child_development,green_space,low_disadvantage&limit=5",
        "/api/family-fit/setup", "/api/family-fit/shapes",
        f"/api/family-fit/search?anchor={BOX_HILL}&radius_km=10",
        f"/api/family-fit/search?anchor={BOX_HILL}&radius_km=15"
        "&priorities=childcare_kinder:essential,gp_access:essential,shade_cooler:prefer&limit=20",
        f"/api/family-fit/search?anchor={SA2}&radius_km=5&priorities=early_development:prefer",
        f"/api/family-fit/areas/{BOX_HILL}", "/api/family-fit/areas/999999999",
        "/api/neighbourhoods/unknown/profile",
    ]
    for neighbourhood_id in sample:
        urls += [
            f"/api/neighbourhoods/{neighbourhood_id}/profile",
            f"/api/neighbourhoods/{neighbourhood_id}/boundary",
            f"/api/neighbourhoods/{neighbourhood_id}/overview",
            f"/api/neighbourhoods/{neighbourhood_id}/priority",
            f"/api/neighbourhoods/{neighbourhood_id}/explanation",
            f"/api/neighbourhoods/{neighbourhood_id}/match",
            f"/api/neighbourhoods/{neighbourhood_id}/child-development",
            f"/api/neighbourhoods/{neighbourhood_id}/early-childhood-services",
            f"/api/neighbourhoods/{neighbourhood_id}/traffic-context",
            f"/api/neighbourhoods/{neighbourhood_id}/industrial-emissions-context",
            f"/api/family-fit/areas/{neighbourhood_id}",
        ]
    for sa2 in (SA2, SA2_OTHER, sample[2], "999999999"):
        urls += [f"/api/digital-health/{name}?sa2_code={sa2}" for name in (
            "facilities", "child-conditions", "child-health-context", "immunisation", "nutrition",
            "prevention-context", "seasonal-air", "vaccination-places", "nearby-services",
            "compare-care", "nutrition-report", "practitioner-context")]
    return urls


API_URLS = _api_urls()


def test_api_responses_are_identical_in_both_modes(storage, monkeypatch: pytest.MonkeyPatch) -> None:
    client = TestClient(app)
    storage(sources.FILES)
    from_files = {url: client.get(url) for url in API_URLS}
    # Prove postgres mode never falls back to the files: point every variable nowhere.
    for dataset in datasets.DATASETS:
        monkeypatch.setenv(dataset.env_name, f"/nonexistent/{Path(dataset.default_path).name}")
    storage(sources.POSTGRES)
    from_database = {url: client.get(url) for url in API_URLS}
    differences = [url for url in API_URLS
                   if (from_files[url].status_code, from_files[url].content)
                   != (from_database[url].status_code, from_database[url].content)]
    assert not differences, f"{len(differences)} endpoint(s) differ, first: {differences[:5]}"
    # The comparison is only meaningful if most endpoints actually served data.
    served = [url for url, response in from_files.items()
              if response.status_code == 200 and response.json().get("status") in {"available", "limited"}]
    assert len(served) >= len(API_URLS) * 0.6, f"only {len(served)} of {len(API_URLS)} endpoints served data"
    print(f"\nAPI parity: {len(API_URLS)} requests identical; {len(served)} served data in both modes.")


def test_warm_responses_match_cold_responses(storage) -> None:
    """Second requests come from the in-process caches and must not drift."""
    client = TestClient(app)
    storage(sources.POSTGRES)
    urls = API_URLS[:25]
    first = [client.get(url).content for url in urls]
    assert [client.get(url).content for url in urls] == first


# --------------------------------------------------------------------------- failure behaviour

def _status_body(client: TestClient) -> tuple[bytes, bytes]:
    return (client.get(f"/api/digital-health/seasonal-air?sa2_code={SA2}").content,
            client.get("/api/family-fit/setup").content)


def test_missing_database_dataset_reports_the_same_limitation_as_a_missing_file(
        storage, monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    client = TestClient(app)
    for dataset in (datasets.BY_KEY["seasonal_air"], datasets.BY_KEY["family_fit"]):
        monkeypatch.setenv(dataset.env_name, str(tmp_path / "missing" / Path(dataset.default_path).name))
    storage(sources.FILES)
    missing_files = _status_body(client)
    assert b"seasonal_air_unavailable" in missing_files[0]
    assert b"family_fit_dataset_unavailable" in missing_files[1]
    monkeypatch.setenv(connection.SCHEMA_ENV, "kinderprint_test_absent")  # nothing loaded there
    storage(sources.POSTGRES)
    assert _status_body(client) == missing_files


def test_unreachable_database_reports_unavailable_not_an_error(
        storage, monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    client = TestClient(app)
    for dataset in (datasets.BY_KEY["seasonal_air"], datasets.BY_KEY["family_fit"]):
        monkeypatch.setenv(dataset.env_name, str(tmp_path / Path(dataset.default_path).name))
    storage(sources.FILES)
    missing_files = _status_body(client)
    monkeypatch.delenv(connection.SECRET_ARN_ENV, raising=False)
    monkeypatch.setenv(connection.HOST_ENV, "127.0.0.1")
    monkeypatch.setenv(connection.PORT_ENV, "9")  # discard port: connection refused
    monkeypatch.setenv(connection.CONNECT_TIMEOUT_ENV, "2")
    storage(sources.POSTGRES)
    response = client.get("/api/health")
    assert response.status_code == 200
    assert _status_body(client) == missing_files


def test_not_configured_is_unchanged_in_postgres_mode(storage, monkeypatch: pytest.MonkeyPatch) -> None:
    client = TestClient(app)
    monkeypatch.delenv(datasets.BY_KEY["seasonal_air"].env_name)
    storage(sources.FILES)
    from_files = client.get(f"/api/digital-health/seasonal-air?sa2_code={SA2}").content
    storage(sources.POSTGRES)
    assert client.get(f"/api/digital-health/seasonal-air?sa2_code={SA2}").content == from_files
    assert b"seasonal_air_not_configured" in from_files


# --------------------------------------------------------------------------- reloads

def test_a_new_load_is_picked_up_without_restarting(storage, monkeypatch: pytest.MonkeyPatch,
                                                    tmp_path: Path) -> None:
    dataset = datasets.BY_KEY["seasonal_illness"]
    original = _file(dataset)
    changed = tmp_path / original.name
    with original.open(encoding="utf-8", newline="") as source:
        rows = list(csv.reader(source))
    column = rows[0].index("reference_years")
    rows[1][column] = "1999-2000"
    with changed.open("w", encoding="utf-8", newline="") as target:
        csv.writer(target, lineterminator="\n").writerows(rows)

    monkeypatch.setenv(repository.CACHE_SECONDS_ENV, "0")
    client = TestClient(app)
    storage(sources.POSTGRES)
    before = client.get("/api/digital-health/seasonal-illness").json()
    assert "1999-2000" not in json.dumps(before)
    try:
        result = _run_loader("--only", dataset.key, extra_env={dataset.env_name: str(changed)})
        assert result.returncode == 0, result.stderr
        after = client.get("/api/digital-health/seasonal-illness").json()
        assert "1999-2000" in json.dumps(after)
    finally:
        restore = _run_loader("--only", dataset.key)
        assert restore.returncode == 0, restore.stderr
    assert client.get("/api/digital-health/seasonal-illness").json() == before


def test_failed_load_leaves_the_previous_version_visible(storage, tmp_path: Path) -> None:
    storage(sources.POSTGRES)
    clinics = datasets.BY_KEY["urgent_care_clinics"]
    illness = datasets.BY_KEY["seasonal_illness"]
    clinics_before = repository.fetch_csv_rows(clinics.key)
    illness_before = repository.fetch_csv_rows(illness.key)
    versions_before = dict(repository.versions(force=True))

    # 1. Bad file: refused before anything is written.
    broken = tmp_path / "broken.csv"
    shutil.copy(_file(clinics), broken)
    with broken.open("a", encoding="utf-8") as target:
        target.write("only,three,fields\n")
    result = _run_loader("--only", clinics.key, extra_env={clinics.env_name: str(broken)})
    assert result.returncode != 0 and "different number of fields" in result.stderr

    # 2. Failure late in the transaction (after tables were swapped): everything rolls back.
    changed = tmp_path / "changed.csv"
    with _file(illness).open(encoding="utf-8", newline="") as source:
        rows = list(csv.reader(source))
    rows[1][rows[0].index("reference_years")] = "1999-2000"
    with changed.open("w", encoding="utf-8", newline="") as target:
        csv.writer(target, lineterminator="\n").writerows(rows)
    result = _run_loader("--only", f"{illness.key},{clinics.key}", "--reader-role", "kinderprint_no_such_role",
                         extra_env={illness.env_name: str(changed)})
    assert result.returncode != 0 and "rolled back" in result.stderr

    repository.clear_cache()
    assert repository.versions(force=True) == versions_before
    assert repository.fetch_csv_rows(clinics.key) == clinics_before
    assert repository.fetch_csv_rows(illness.key) == illness_before


def test_a_dropped_connection_is_reopened_once(storage) -> None:
    storage(sources.POSTGRES)
    key = datasets.BY_KEY["seasonal_illness"].key
    expected = repository.fetch_csv_rows(key)
    admin = connection.open_connection(connection.resolve_settings(), application_name="kinderprint-test-admin")
    try:
        terminated = admin.run("SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
                               "WHERE application_name = 'kinderprint-api' AND pid <> pg_backend_pid()")
    finally:
        admin.close()
    assert terminated and all(row[0] for row in terminated)
    repository.clear_cache()  # force a real query on the dead connection
    assert repository.fetch_csv_rows(key) == expected
