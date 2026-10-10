"""Read datasets from files or PostgreSQL behind one small interface.

``KINDERPRINT_DATA_BACKEND`` selects the storage:

* ``files`` (default): read the CSV/JSON file named by each
  ``KINDERPRINT_*_DATA_PATH`` variable, exactly as before.
* ``postgres``: read the same dataset from the database, using the dataset
  registry in ``db/datasets.py`` to map the variable to a dataset key.

In both modes the variable must still be set for a dataset to count as
configured, so "not configured" limitations behave the same way. Datasets that
are not in the registry are always read from files.

The loaders keep their own ``lru_cache`` caches. In postgres mode those are
registered through ``dataset_cache`` and cleared by ``refresh_caches_if_changed``
when a new load is published or after a database failure, so a warm Lambda picks
up new data without a redeploy and never keeps serving a transient outage.
"""

from __future__ import annotations

import csv
import json
import logging
import os
import threading
import time
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any, Callable, Iterator

from db import datasets
from db.connection import DatabaseUnavailable

DATA_BACKEND_ENV = "KINDERPRINT_DATA_BACKEND"
FILES = "files"
POSTGRES = "postgres"
FAILURE_RETRY_SECONDS = 5.0

logger = logging.getLogger("kinderprint.sources")


def data_backend() -> str:
    """Return ``files`` or ``postgres``. Unknown values fall back to files, with a warning."""
    value = (os.getenv(DATA_BACKEND_ENV) or FILES).strip().lower()
    if value in {"postgres", "postgresql"}:
        return POSTGRES
    if value != FILES:
        logger.warning("Unknown %s value %r; reading datasets from files.", DATA_BACKEND_ENV, value)
    return FILES


def _database_dataset(env_name: str) -> datasets.Dataset | None:
    if data_backend() != POSTGRES:
        return None
    return datasets.for_env(env_name)


@dataclass
class CsvRows:
    """CSV content with the two things callers used from csv.DictReader."""

    fieldnames: list[str] | None
    rows: list[dict[str, str]] = field(default_factory=list)

    def __iter__(self) -> Iterator[dict[str, str]]:
        return iter(self.rows)

    def __len__(self) -> int:
        return len(self.rows)


def source_exists(path: Path | None, env_name: str) -> bool:
    """File mode: the file exists. Postgres mode: the dataset has been loaded."""
    dataset = _database_dataset(env_name)
    if dataset is None:
        return path is not None and path.is_file()
    from db import repository

    try:
        return repository.has_dataset(dataset.key)
    except DatabaseUnavailable:
        _record_failure(dataset.key)
        return False


def read_csv_rows(path: Path, env_name: str) -> CsvRows:
    """Return the CSV header and rows as csv.DictReader gives them.

    Raises OSError (including DatabaseUnavailable), UnicodeError or csv.Error on
    failure, which the loaders already report as an unreadable dataset.
    """
    dataset = _database_dataset(env_name)
    if dataset is None:
        with path.open(encoding="utf-8-sig", newline="") as source:
            reader = csv.DictReader(source)
            rows = list(reader)
            return CsvRows(reader.fieldnames, rows)
    from db import repository

    try:
        fieldnames, rows = repository.fetch_csv_table(dataset.key)
    except DatabaseUnavailable:
        _record_failure(dataset.key)
        raise
    return CsvRows(fieldnames, rows)


def read_json(path: Path, env_name: str) -> Any:
    """Return the parsed JSON document. Raises OSError or json.JSONDecodeError on failure."""
    dataset = _database_dataset(env_name)
    if dataset is None:
        return json.loads(path.read_text(encoding="utf-8"))
    from db import repository

    try:
        return repository.fetch_json(dataset.key)
    except DatabaseUnavailable:
        _record_failure(dataset.key)
        raise


# --------------------------------------------------------------------------- cache refresh

_registered_caches: list[Callable[..., Any]] = []
_refresh_lock = threading.Lock()
_last_snapshot: dict[str, str] | None = None
_last_check = 0.0
_failed = False


def dataset_cache(maxsize: int = 1) -> Callable[[Callable[..., Any]], Any]:
    """``functools.lru_cache`` that is also cleared when the database data changes."""
    def decorate(function: Callable[..., Any]) -> Any:
        cached = lru_cache(maxsize=maxsize)(function)
        _registered_caches.append(cached)
        return cached
    return decorate


def clear_dataset_caches() -> None:
    for cached in _registered_caches:
        cached.cache_clear()


def _record_failure(key: str) -> None:
    global _failed
    _failed = True
    logger.warning("Dataset %s could not be read from the database.", key)


def refresh_caches_if_changed() -> None:
    """Clear loader caches when a new database load is visible or after a failure.

    Runs one small version query at most every KINDERPRINT_DB_CACHE_SECONDS
    (every few seconds while recovering from a failure). Does nothing in files mode.
    """
    global _last_snapshot, _last_check, _failed
    if data_backend() != POSTGRES:
        return
    from db import repository

    with _refresh_lock:
        now = time.monotonic()
        interval = FAILURE_RETRY_SECONDS if _failed else repository.cache_seconds()
        if _last_check and now - _last_check < interval:
            return
        _last_check = now
        try:
            snapshot = dict(repository.versions(force=True))
        except DatabaseUnavailable:
            # Keep serving whatever the warm caches hold; retry soon.
            _failed = True
            logger.warning("Database version check failed; serving cached datasets.")
            return
        if snapshot != _last_snapshot or _failed:
            if _last_snapshot is not None or _failed:
                clear_dataset_caches()
            _last_snapshot = snapshot
            _failed = False


def reset_for_tests() -> None:
    global _last_snapshot, _last_check, _failed
    with _refresh_lock:
        _last_snapshot = None
        _last_check = 0.0
        _failed = False
    clear_dataset_caches()
