"""Read datasets back from PostgreSQL in exactly the shape the files provide.

``fetch_csv_rows`` returns what ``csv.DictReader`` returns for the original file
(same column order, same strings, "" for empty values) and ``fetch_json``
returns what ``json.loads`` returns for the original document. The data is
cached in-process against the dataset's sha256; one small query against
``dataset_versions`` checks for a newer load at most every
``KINDERPRINT_DB_CACHE_SECONDS`` seconds (default 60).
"""

from __future__ import annotations

import json
import os
import re
import threading
import time
from dataclasses import dataclass
from typing import Any

from db import connection
from db.codec import format_value
from db.connection import DatabaseUnavailable, quote_identifier

CACHE_SECONDS_ENV = "KINDERPRINT_DB_CACHE_SECONDS"
DEFAULT_CACHE_SECONDS = 60
_TABLE_NAME = re.compile(r"^ds_[a-z0-9_]{1,60}$")


class DatasetNotLoaded(DatabaseUnavailable):
    """The dataset has no row in dataset_versions (it has never been loaded)."""


@dataclass(frozen=True)
class _CsvEntry:
    sha256: str
    fieldnames: tuple[str, ...]
    rows: tuple[tuple[str, ...], ...]


@dataclass(frozen=True)
class _JsonEntry:
    sha256: str
    text: str


_lock = threading.RLock()
_versions: dict[str, str] | None = None
_versions_checked_at = 0.0
_csv_cache: dict[str, _CsvEntry] = {}
_json_cache: dict[str, _JsonEntry] = {}


def cache_seconds() -> float:
    try:
        return max(0.0, float(os.getenv(CACHE_SECONDS_ENV) or DEFAULT_CACHE_SECONDS))
    except ValueError:
        return float(DEFAULT_CACHE_SECONDS)


def _schema() -> str:
    return quote_identifier(connection.schema_name())


def versions(*, force: bool = False) -> dict[str, str]:
    """Return {dataset_key: sha256}, re-reading it when older than the cache window."""
    global _versions, _versions_checked_at
    with _lock:
        now = time.monotonic()
        if not force and _versions is not None and now - _versions_checked_at < cache_seconds():
            return _versions
        sql = f"SELECT dataset_key, sha256 FROM {_schema()}.dataset_versions"
        rows = connection.run(lambda conn: conn.run(sql))
        _versions = {str(key): str(sha).strip() for key, sha in rows}
        _versions_checked_at = now
        return _versions


def has_dataset(key: str) -> bool:
    return key in versions()


def _current_sha(key: str) -> str:
    sha = versions().get(key)
    if sha is None:
        raise DatasetNotLoaded(f"Dataset {key} has not been loaded.")
    return sha


def read_csv_table(conn: Any, schema: str, key: str) -> tuple[str, list[str], list[tuple[str, ...]]]:
    """Read one CSV dataset on an open connection and format it back to text.

    Shared with the load script, which calls it inside its own transaction to
    prove a staged table reproduces the source file before committing.
    """
    found = conn.run(
        f"SELECT table_name, sha256, columns, kind FROM {schema}.dataset_versions WHERE dataset_key = :key",
        key=key)
    if not found:
        raise DatasetNotLoaded(f"Dataset {key} has not been loaded.")
    table_name, sha, columns, kind = found[0]
    if kind != "csv" or not isinstance(columns, list) or not _TABLE_NAME.match(str(table_name)):
        raise DatabaseUnavailable(f"Dataset {key} is not a CSV table.")
    return str(sha).strip(), *read_table_rows(conn, schema, str(table_name), columns)


def read_table_rows(conn: Any, schema: str, table_name: str,
                    columns: list[dict[str, Any]]) -> tuple[list[str], list[tuple[str, ...]]]:
    fieldnames = [column["name"] for column in columns]
    if not columns:
        return fieldnames, []
    select = ", ".join(quote_identifier(column["column"]) for column in columns)
    raw = conn.run(f"SELECT {select} FROM {schema}.{quote_identifier(table_name)} ORDER BY _row_number")
    rows = [tuple(format_value(value, spec) for value, spec in zip(record, columns)) for record in raw]
    return fieldnames, rows


def _read_consistently(work):
    """Run reads in one read-only snapshot so a concurrent reload is never half seen."""
    def unit(conn):
        conn.run("START TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
        result = work(conn)
        conn.run("COMMIT")
        return result
    return connection.run(unit)


def fetch_csv_table(key: str) -> tuple[list[str] | None, list[dict[str, str]]]:
    """Return (fieldnames, rows) exactly as csv.DictReader gives them for the source file."""
    with _lock:
        sha = _current_sha(key)
        entry = _csv_cache.get(key)
        if entry is None or entry.sha256 != sha:
            schema = _schema()
            loaded_sha, fieldnames, rows = _read_consistently(lambda conn: read_csv_table(conn, schema, key))
            entry = _CsvEntry(loaded_sha, tuple(fieldnames), tuple(rows))
            _csv_cache[key] = entry
            if loaded_sha != sha:  # a reload landed since the last version check
                versions(force=True)
    names = list(entry.fieldnames)
    return (names or None), [dict(zip(names, row)) for row in entry.rows]


def fetch_csv_rows(key: str) -> list[dict[str, str]]:
    """Rows exactly as csv.DictReader yields them for the original file."""
    return fetch_csv_table(key)[1]


def fetch_json_text(key: str) -> str:
    """The original JSON document text."""
    with _lock:
        sha = _current_sha(key)
        entry = _json_cache.get(key)
        if entry is None or entry.sha256 != sha:
            sql = f"SELECT sha256, body_text FROM {_schema()}.json_artefacts WHERE artefact_key = :key"
            found = connection.run(lambda conn: conn.run(sql, key=key))
            if not found:
                raise DatasetNotLoaded(f"Artefact {key} has not been loaded.")
            entry = _JsonEntry(str(found[0][0]).strip(), found[0][1])
            _json_cache[key] = entry
            if entry.sha256 != sha:  # a reload landed since the last version check
                versions(force=True)
        return entry.text


def fetch_json(key: str) -> Any:
    """A freshly parsed copy of the JSON document, as json.loads gives it for the file."""
    return json.loads(fetch_json_text(key))


def clear_cache() -> None:
    """Forget cached versions and data (used by tests and after a failed check)."""
    global _versions, _versions_checked_at
    with _lock:
        _versions = None
        _versions_checked_at = 0.0
        _csv_cache.clear()
        _json_cache.clear()
