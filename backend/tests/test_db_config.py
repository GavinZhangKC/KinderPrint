"""Storage-layer behaviour that does not need a database."""

from __future__ import annotations

import json
import sys
import types
from pathlib import Path

import pytest

from core import sources
from db import codec, connection, datasets, repository

BACKEND_DIR = Path(__file__).resolve().parents[1]
DB_ENV = (
    connection.SECRET_ARN_ENV, connection.HOST_ENV, connection.PORT_ENV, connection.NAME_ENV,
    connection.USER_ENV, connection.PASSWORD_ENV, connection.SSL_ENV, connection.SSL_ROOT_CERT_ENV,
    connection.SCHEMA_ENV,
)


@pytest.fixture(autouse=True)
def clean_db_environment(monkeypatch: pytest.MonkeyPatch):
    for name in DB_ENV:
        monkeypatch.delenv(name, raising=False)
    connection.reset()
    yield
    connection.reset()
    repository.clear_cache()
    sources.reset_for_tests()


@pytest.mark.parametrize("name, values, expected", [
    ("count", ["1", "0", "-12", ""], {"type": codec.INTEGER}),
    ("big", ["1", "9999999999"], {"type": codec.BIGINT}),
    ("pct", ["0.1", "12.5", "1e-05", "3.0", ""], {"type": codec.DOUBLE}),
    ("pct", ["12.50"], {"type": codec.TEXT}),          # trailing zero would be lost
    ("count", ["007"], {"type": codec.TEXT}),          # leading zero would be lost
    ("pct", ["1", "1.5"], {"type": codec.TEXT}),       # "1" would come back as "1.0"
    ("pct", ["nan"], {"type": codec.TEXT}),
    ("flag", ["True", "False", ""], {"type": codec.BOOLEAN, "true": "True", "false": "False"}),
    ("flag", ["true", "False"], {"type": codec.TEXT}),
    ("sa2_code", ["206011106"], {"type": codec.TEXT}),  # identifiers stay text
    ("sa2_code_2021", ["206011106"], {"type": codec.TEXT}),
    ("facility_id", ["12"], {"type": codec.TEXT}),
    ("empty", ["", ""], {"type": codec.TEXT}),
])
def test_column_inference_only_types_values_that_round_trip(name, values, expected) -> None:
    spec = codec.infer_column(name, values)
    assert spec == expected
    for value in values:
        assert codec.format_value(codec.parse_value(value, spec), spec) == value


def test_registry_matches_the_local_run_script_and_template() -> None:
    script = (BACKEND_DIR / "run_local_backend.sh").read_text(encoding="utf-8")
    for dataset in datasets.DATASETS:
        assert f'export {dataset.env_name}="${{PROJECT_ROOT}}/{dataset.default_path}"' in script
    template = (BACKEND_DIR.parent / "template.yaml").read_text(encoding="utf-8")
    assert all(f"{dataset.env_name}:" in template for dataset in datasets.DATASETS)
    assert len({dataset.table_name for dataset in datasets.DATASETS}) == len(datasets.DATASETS)


def test_backend_defaults_to_files(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv(sources.DATA_BACKEND_ENV, raising=False)
    assert sources.data_backend() == sources.FILES
    monkeypatch.setenv(sources.DATA_BACKEND_ENV, "Postgres")
    assert sources.data_backend() == sources.POSTGRES
    monkeypatch.setenv(sources.DATA_BACKEND_ENV, "something-else")
    assert sources.data_backend() == sources.FILES


def test_unregistered_variables_still_read_files_in_postgres_mode(
        monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setenv(sources.DATA_BACKEND_ENV, "postgres")
    path = tmp_path / "pattern.json"
    path.write_text('{"a": 1}', encoding="utf-8")
    assert sources.source_exists(path, "KINDERPRINT_PATTERN_INSIGHT_DATA_PATH")
    assert sources.read_json(path, "KINDERPRINT_PATTERN_INSIGHT_DATA_PATH") == {"a": 1}


def test_schema_name_must_be_a_plain_identifier(monkeypatch: pytest.MonkeyPatch) -> None:
    assert connection.schema_name() == "kinderprint"
    monkeypatch.setenv(connection.SCHEMA_ENV, "analytics_kp")
    assert connection.schema_name() == "analytics_kp"
    monkeypatch.setenv(connection.SCHEMA_ENV, 'kp"; drop schema public; --')
    with pytest.raises(connection.DatabaseConfigurationError):
        connection.schema_name()


def _fake_boto3(monkeypatch: pytest.MonkeyPatch, secret: dict, calls: list) -> None:
    class Client:
        def get_secret_value(self, SecretId):
            calls.append(SecretId)
            return {"SecretString": json.dumps(secret)}

    class Session:
        def __init__(self, profile_name=None, region_name=None):
            pass

        def client(self, name):
            assert name == "secretsmanager"
            return Client()

    module = types.ModuleType("boto3")
    module.session = types.SimpleNamespace(Session=Session)
    monkeypatch.setitem(sys.modules, "boto3", module)


def test_settings_come_from_a_standard_rds_secret(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list = []
    _fake_boto3(monkeypatch, {"engine": "postgres", "host": "db.example.internal", "port": 5432,
                              "username": "kinderprint_api", "password": "s3cret", "dbname": "kinderprint"}, calls)
    monkeypatch.setenv(connection.SECRET_ARN_ENV, "arn:aws:secretsmanager:ap-southeast-2:000000000000:secret:x")
    settings = connection.resolve_settings()
    assert (settings.host, settings.port, settings.database, settings.user, settings.password) == (
        "db.example.internal", 5432, "kinderprint", "kinderprint_api", "s3cret")
    assert settings.ssl_mode == "verify-full"
    assert "s3cret" not in repr(settings)
    connection.resolve_settings()
    assert len(calls) == 1  # cached for the life of the process


def test_rds_managed_secret_without_host_uses_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    _fake_boto3(monkeypatch, {"username": "postgres", "password": "rotated"}, [])
    monkeypatch.setenv(connection.SECRET_ARN_ENV, "arn:aws:secretsmanager:ap-southeast-2:000000000000:secret:y")
    monkeypatch.setenv(connection.HOST_ENV, "cluster.example.internal")
    monkeypatch.setenv(connection.NAME_ENV, "kinderprint")
    monkeypatch.setenv(connection.PASSWORD_ENV, "ignored-when-a-secret-is-used")
    settings = connection.resolve_settings()
    assert (settings.host, settings.database, settings.user, settings.password) == (
        "cluster.example.internal", "kinderprint", "postgres", "rotated")


@pytest.mark.parametrize("value, mode", [
    (None, "verify-full"), ("true", "verify-full"), ("require", "require"), ("false", "disable"),
])
def test_ssl_modes(monkeypatch: pytest.MonkeyPatch, value, mode) -> None:
    monkeypatch.setenv(connection.HOST_ENV, "localhost")
    monkeypatch.setenv(connection.NAME_ENV, "kinderprint")
    monkeypatch.setenv(connection.USER_ENV, "kp")
    if value is not None:
        monkeypatch.setenv(connection.SSL_ENV, value)
    assert connection.resolve_settings().ssl_mode == mode


def test_missing_settings_are_reported_as_unavailable(monkeypatch: pytest.MonkeyPatch) -> None:
    with pytest.raises(connection.DatabaseConfigurationError):
        connection.resolve_settings()
    monkeypatch.setenv(sources.DATA_BACKEND_ENV, "postgres")
    path = BACKEND_DIR / "does-not-matter.csv"
    assert sources.source_exists(path, "KINDERPRINT_SEASONAL_AIR_DATA_PATH") is False
