#!/usr/bin/env python3
"""Load the KinderPrint API datasets into PostgreSQL.

Reads every dataset listed in backend/db/datasets.py (the same registry the API
uses), then in ONE transaction:

1. creates the schema and bookkeeping tables (backend/db/schema.sql),
2. loads each CSV into a staging table, adds keys, swaps it in by rename,
3. upserts each JSON/GeoJSON document into json_artefacts,
4. records sha256, row count and columns in dataset_versions,
5. reads every CSV table back and checks it reproduces the file exactly.

If anything fails the transaction is rolled back, so the API never sees a
half-loaded dataset, and the script exits non-zero.

Examples (run from the repository root):

    # Check the files and show what would be loaded, without a database
    python3 datascience/scripts/load_to_db.py --dry-run

    # Local PostgreSQL
    export KINDERPRINT_DB_HOST=127.0.0.1 KINDERPRINT_DB_PORT=5432 \\
           KINDERPRINT_DB_NAME=kinderprint KINDERPRINT_DB_USER=kinderprint_loader \\
           KINDERPRINT_DB_SSL=false
    read -rs KINDERPRINT_DB_PASSWORD && export KINDERPRINT_DB_PASSWORD
    python3 datascience/scripts/load_to_db.py

    # Amazon RDS, credentials from Secrets Manager via your AWS profile
    python3 datascience/scripts/load_to_db.py --secret-arn "$SECRET_ARN" \\
        --region ap-southeast-2 --profile kinderprint --reader-role kinderprint_api

    # Reload only some datasets
    python3 datascience/scripts/load_to_db.py --only family_fit --only boundary

Requires: pg8000 (pip install pg8000) and, for --secret-arn, boto3.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import os
import re
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

# abspath rather than resolve(): keep the checkout layout even if datascience/ is a symlink.
REPO_ROOT = Path(os.path.abspath(__file__)).parents[2]
BACKEND_DIR = REPO_ROOT / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from db import codec, datasets  # noqa: E402
from db.connection import (  # noqa: E402
    DatabaseUnavailable,
    open_connection,
    quote_identifier,
    resolve_settings,
    schema_name,
)
from db.datasets import KEY_COLUMN_CANDIDATES, Dataset  # noqa: E402

# Next to the db package, so this also works inside the Lambda bundle.
SCHEMA_SQL = Path(datasets.__file__).resolve().parent / "schema.sql"
READER_PASSWORD_ENV = "KINDERPRINT_DB_READER_PASSWORD"
_PLAIN_COLUMN = re.compile(r"^[a-z_][a-z0-9_]{0,62}$")
_ROLE = re.compile(r"^[a-z_][a-z0-9_]{0,62}$")


class LoadError(Exception):
    """A dataset could not be prepared or loaded."""


@dataclass
class Prepared:
    dataset: Dataset
    path: Path
    sha256: str
    size: int
    fieldnames: list[str] = field(default_factory=list)
    rows: list[list[str]] = field(default_factory=list)
    columns: list[dict[str, Any]] = field(default_factory=list)
    primary_key: str | None = None
    indexed: list[str] = field(default_factory=list)
    text: str | None = None
    built_utc: str | None = None

    @property
    def row_count(self) -> int | None:
        return len(self.rows) if self.dataset.kind == datasets.CSV else None


# --------------------------------------------------------------------------- preparation

def source_path(dataset: Dataset, repo_root: Path) -> Path:
    """Use the API's own variable when set, otherwise the registry default."""
    configured = os.getenv(dataset.env_name)
    return Path(configured).expanduser() if configured else repo_root / dataset.default_path


def _db_column_name(header: str, index: int, used: set[str]) -> str:
    name = header if _PLAIN_COLUMN.match(header) and header != "_row_number" else f"c{index}"
    while name in used:
        name = f"{name}_{index}"
    used.add(name)
    return name


def prepare_csv(dataset: Dataset, path: Path, raw: bytes, prepared: Prepared) -> None:
    with path.open(encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        records = list(reader)
        fieldnames = list(reader.fieldnames or [])
    if not fieldnames:
        raise LoadError(f"{dataset.key}: the CSV has no header row.")
    if len(set(fieldnames)) != len(fieldnames):
        raise LoadError(f"{dataset.key}: the CSV header repeats a column name.")
    rows = []
    for number, record in enumerate(records, start=2):
        if None in record or any(value is None for value in record.values()):
            raise LoadError(f"{dataset.key}: row {number} has a different number of fields to the header.")
        values = [record[name] for name in fieldnames]
        if any("\x00" in value for value in values):
            raise LoadError(f"{dataset.key}: row {number} contains a NUL character.")
        rows.append(values)
    used: set[str] = set()
    columns = []
    for index, name in enumerate(fieldnames):
        spec = codec.infer_column(name, (row[index] for row in rows))
        columns.append({"name": name, "column": _db_column_name(name, index, used), **spec})
    prepared.fieldnames, prepared.rows, prepared.columns = fieldnames, rows, columns
    by_name = {column["name"]: index for index, column in enumerate(columns)}
    for candidate in KEY_COLUMN_CANDIDATES:
        if candidate not in by_name:
            continue
        index = by_name[candidate]
        values = [row[index] for row in rows]
        if prepared.primary_key is None and all(values) and len(set(values)) == len(values):
            prepared.primary_key = columns[index]["column"]
        else:
            prepared.indexed.append(columns[index]["column"])


def prepare_json(dataset: Dataset, raw: bytes, prepared: Prepared) -> None:
    try:
        text = raw.decode("utf-8")
        document = json.loads(text)
    except (UnicodeError, json.JSONDecodeError) as error:
        raise LoadError(f"{dataset.key}: not valid UTF-8 JSON ({error}).") from None
    if "\x00" in text or "\\u0000" in text:
        raise LoadError(f"{dataset.key}: JSON containing NUL characters cannot be stored in jsonb.")
    prepared.text = text
    metadata = document.get("metadata") if isinstance(document, dict) else None
    if isinstance(metadata, dict):
        for name in ("built_utc", "generated_utc", "created_utc"):
            if isinstance(metadata.get(name), str):
                prepared.built_utc = metadata[name]
                break


def prepare(dataset: Dataset, repo_root: Path) -> Prepared:
    path = source_path(dataset, repo_root)
    if not path.is_file():
        raise LoadError(f"{dataset.key}: source file not found at {path}.")
    raw = path.read_bytes()
    prepared = Prepared(dataset, path, hashlib.sha256(raw).hexdigest(), len(raw))
    if dataset.kind == datasets.CSV:
        prepare_csv(dataset, path, raw, prepared)
    else:
        prepare_json(dataset, raw, prepared)
    return prepared


def display_path(path: Path, repo_root: Path) -> str:
    try:
        return str(path.resolve().relative_to(repo_root.resolve()))
    except ValueError:
        return path.name


# --------------------------------------------------------------------------- database work

def schema_statements(schema: str) -> list[str]:
    text = SCHEMA_SQL.read_text(encoding="utf-8").replace("__SCHEMA__", quote_identifier(schema))
    lines = [line for line in text.splitlines() if not line.lstrip().startswith("--")]
    return [statement.strip() for statement in "\n".join(lines).split(";") if statement.strip()]


def sql_literal(value: str) -> str:
    """Quote a string constant for statements that cannot take bind parameters."""
    from pg8000.native import literal

    return literal(value)


def _copy_field(value: Any) -> str:
    """Encode one value in PostgreSQL COPY text format."""
    if value is None:
        return "\\N"
    if isinstance(value, bool):
        return "t" if value else "f"
    if isinstance(value, float):
        return repr(value)
    if isinstance(value, int):
        return str(value)
    return (value.replace("\\", "\\\\").replace("\t", "\\t")
            .replace("\n", "\\n").replace("\r", "\\r"))


def copy_text(item: Prepared) -> str:
    lines = []
    for row_number, row in enumerate(item.rows, start=1):
        values = [row_number, *(codec.parse_value(text, spec) for text, spec in zip(row, item.columns))]
        lines.append("\t".join(_copy_field(value) for value in values) + "\n")
    return "".join(lines)


def load_csv(conn: Any, schema_q: str, item: Prepared, repo_root: Path) -> None:
    dataset = item.dataset
    table = dataset.table_name
    staging = f"{table}__staging"
    table_q, staging_q = quote_identifier(table), quote_identifier(staging)
    conn.run(f"DROP TABLE IF EXISTS {schema_q}.{staging_q}")
    column_sql = ", ".join(f"{quote_identifier(c['column'])} {c['type']}" for c in item.columns)
    conn.run(f"CREATE TABLE {schema_q}.{staging_q} (_row_number integer NOT NULL, {column_sql})")

    names = ["_row_number", *(column["column"] for column in item.columns)]
    copy_sql = (f"COPY {schema_q}.{staging_q} (" + ", ".join(quote_identifier(name) for name in names)
                + ") FROM STDIN")
    conn.run(copy_sql, stream=io.BytesIO(copy_text(item).encode("utf-8")))

    key_column = item.primary_key or "_row_number"
    conn.run(f"ALTER TABLE {schema_q}.{staging_q} ADD CONSTRAINT {quote_identifier(staging + '_pkey')} "
             f"PRIMARY KEY ({quote_identifier(key_column)})")
    for position, column in enumerate(item.indexed):
        conn.run(f"CREATE INDEX {quote_identifier(f'{staging}_ix{position}')} "
                 f"ON {schema_q}.{staging_q} ({quote_identifier(column)})")

    # Swap in by rename, then give the constraint and indexes their final names.
    conn.run(f"DROP TABLE IF EXISTS {schema_q}.{table_q}")
    conn.run(f"ALTER TABLE {schema_q}.{staging_q} RENAME TO {table_q}")
    conn.run(f"ALTER INDEX {schema_q}.{quote_identifier(staging + '_pkey')} "
             f"RENAME TO {quote_identifier(table + '_pkey')}")
    for position in range(len(item.indexed)):
        conn.run(f"ALTER INDEX {schema_q}.{quote_identifier(f'{staging}_ix{position}')} "
                 f"RENAME TO {quote_identifier(f'{table}_ix{position}')}")
    comment = f"Loaded from {display_path(item.path, repo_root)} (sha256 {item.sha256})."
    conn.run(f"COMMENT ON TABLE {schema_q}.{table_q} IS {sql_literal(comment)}")
    upsert_version(conn, schema_q, item, table, repo_root)


def load_json(conn: Any, schema_q: str, item: Prepared, repo_root: Path) -> None:
    conn.run(
        f"INSERT INTO {schema_q}.json_artefacts (artefact_key, body, body_text, sha256, bytes, loaded_utc) "
        "VALUES (:key, CAST(:body_json AS jsonb), CAST(:body_text AS text), :sha, :bytes, now()) "
        "ON CONFLICT (artefact_key) DO UPDATE SET body = EXCLUDED.body, body_text = EXCLUDED.body_text, "
        "sha256 = EXCLUDED.sha256, bytes = EXCLUDED.bytes, loaded_utc = EXCLUDED.loaded_utc",
        key=item.dataset.key, body_json=item.text, body_text=item.text, sha=item.sha256, bytes=item.size)
    upsert_version(conn, schema_q, item, "json_artefacts", repo_root)


def upsert_version(conn: Any, schema_q: str, item: Prepared, table_name: str, repo_root: Path) -> None:
    conn.run(
        f"INSERT INTO {schema_q}.dataset_versions "
        "(dataset_key, table_name, source_file, kind, row_count, sha256, columns, loaded_utc, built_utc) "
        "VALUES (:key, :table_name, :source, :kind, :rows, :sha, CAST(:columns AS jsonb), now(), :built) "
        "ON CONFLICT (dataset_key) DO UPDATE SET table_name = EXCLUDED.table_name, "
        "source_file = EXCLUDED.source_file, kind = EXCLUDED.kind, row_count = EXCLUDED.row_count, "
        "sha256 = EXCLUDED.sha256, columns = EXCLUDED.columns, loaded_utc = EXCLUDED.loaded_utc, "
        "built_utc = EXCLUDED.built_utc",
        key=item.dataset.key, table_name=table_name, source=display_path(item.path, repo_root),
        kind=item.dataset.kind, rows=item.row_count, sha=item.sha256,
        columns=json.dumps(item.columns) if item.dataset.kind == datasets.CSV else None,
        built=item.built_utc)


def verify(conn: Any, schema_q: str, item: Prepared) -> None:
    """Read the dataset back through the API's own code and compare with the file."""
    from db.repository import read_csv_table

    key = item.dataset.key
    if item.dataset.kind == datasets.CSV:
        sha, fieldnames, rows = read_csv_table(conn, schema_q, key)
        if sha != item.sha256 or fieldnames != item.fieldnames:
            raise LoadError(f"{key}: version or header mismatch after load.")
        if len(rows) != len(item.rows):
            raise LoadError(f"{key}: expected {len(item.rows)} rows, found {len(rows)}.")
        for number, (expected, actual) in enumerate(zip(item.rows, rows), start=2):
            if tuple(expected) != actual:
                raise LoadError(f"{key}: row {number} does not match the source file after load.")
    else:
        found = conn.run(f"SELECT sha256, body_text FROM {schema_q}.json_artefacts WHERE artefact_key = :key",
                         key=key)
        if not found or found[0][0].strip() != item.sha256 or found[0][1] != item.text:
            raise LoadError(f"{key}: stored document does not match the source file.")


def ensure_reader_login(conn: Any, role: str, password: str) -> None:
    """Create the API's read-only login role, or reset its password.

    Used by the Vkinder stack, where the password comes from Secrets Manager
    through the loader's environment. The password is never printed.
    """
    role_q = quote_identifier(role)
    exists = conn.run("SELECT 1 FROM pg_roles WHERE rolname = :role", role=role)
    if exists:
        # Only a superuser may name SUPERUSER in ALTER ROLE, and the RDS admin
        # is not one, so a rerun only renews the login and password.
        conn.run(f"ALTER ROLE {role_q} WITH LOGIN PASSWORD {sql_literal(password)}")
    else:
        conn.run(f"CREATE ROLE {role_q} WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE "
                 f"PASSWORD {sql_literal(password)}")


def grant_reader(conn: Any, schema_q: str, role: str) -> None:
    role_q = quote_identifier(role)
    conn.run(f"GRANT USAGE ON SCHEMA {schema_q} TO {role_q}")
    conn.run(f"GRANT SELECT ON ALL TABLES IN SCHEMA {schema_q} TO {role_q}")


# --------------------------------------------------------------------------- command line

def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Load KinderPrint datasets into PostgreSQL.")
    parser.add_argument("--only", action="append", default=[], metavar="KEY",
                        help="Dataset key to load (repeatable, or comma-separated). Default: all.")
    parser.add_argument("--dry-run", action="store_true",
                        help="Read and check every file and print the plan; do not connect.")
    parser.add_argument("--secret-arn", help="Secrets Manager secret with the database credentials.")
    parser.add_argument("--region", help="AWS region for --secret-arn (default: your AWS configuration).")
    parser.add_argument("--profile", help="AWS named profile for --secret-arn.")
    parser.add_argument("--schema", help="Target schema (default: KINDERPRINT_DB_SCHEMA or kinderprint).")
    parser.add_argument("--reader-role", default=os.getenv("KINDERPRINT_DB_READER_ROLE") or None,
                        help="Database role the API connects as; granted read-only access after every load "
                             "(default: KINDERPRINT_DB_READER_ROLE).")
    parser.add_argument("--repo-root", type=Path, default=REPO_ROOT, help=argparse.SUPPRESS)
    parser.add_argument("--list", action="store_true", help="List dataset keys and exit.")
    return parser.parse_args(argv)


def selected(only: list[str]) -> list[Dataset]:
    keys = [key.strip() for value in only for key in value.split(",") if key.strip()]
    unknown = [key for key in keys if key not in datasets.BY_KEY]
    if unknown:
        raise LoadError(f"Unknown dataset key(s): {', '.join(unknown)}. Use --list to see them.")
    return [datasets.BY_KEY[key] for key in keys] if keys else list(datasets.DATASETS)


def print_summary(items: list[Prepared], status: str) -> None:
    print(f"{'dataset':32} {'kind':4} {'rows':>7} {'typed':>9} {'key':24} {'sha256':12} status")
    for item in items:
        if item.dataset.kind == datasets.CSV:
            typed = sum(1 for column in item.columns if column["type"] != codec.TEXT)
            columns = f"{typed}/{len(item.columns)}"
            key = item.primary_key or "_row_number"
            rows = str(len(item.rows))
        else:
            columns, key, rows = "-", "-", "-"
        print(f"{item.dataset.key:32} {item.dataset.kind:4} {rows:>7} {columns:>9} {key:24} "
              f"{item.sha256[:12]} {status}")


def main(argv: list[str] | None = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)
    if args.list:
        for dataset in datasets.DATASETS:
            print(f"{dataset.key:32} {dataset.kind:4} {dataset.env_name}")
        return 0
    if args.schema:
        os.environ["KINDERPRINT_DB_SCHEMA"] = args.schema
    if args.reader_role and not _ROLE.match(args.reader_role):
        print("error: --reader-role must be a lower-case identifier.", file=sys.stderr)
        return 2
    started = time.monotonic()
    try:
        schema = schema_name()
        chosen = selected(args.only)
        items = [prepare(dataset, args.repo_root) for dataset in chosen]
    except (LoadError, DatabaseUnavailable, OSError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1

    if args.dry_run:
        print_summary(items, "checked")
        print(f"Dry run: {len(items)} dataset(s) ready for schema {schema!r}; nothing was written.")
        return 0

    conn = None
    try:
        settings = resolve_settings(secret_arn=args.secret_arn, region=args.region, profile=args.profile)
        conn = open_connection(settings, timeout=60, statement_timeout_ms=600000,
                               application_name="kinderprint-loader")
        schema_q = quote_identifier(schema)
        conn.run("START TRANSACTION")
        conn.run("SELECT pg_advisory_xact_lock(hashtext(:lock))", lock=f"kinderprint-load:{schema}")
        for statement in schema_statements(schema):
            conn.run(statement)
        for item in items:
            if item.dataset.kind == datasets.CSV:
                load_csv(conn, schema_q, item, args.repo_root)
            else:
                load_json(conn, schema_q, item, args.repo_root)
            verify(conn, schema_q, item)
        if args.reader_role:
            reader_password = os.getenv(READER_PASSWORD_ENV)
            if reader_password:
                ensure_reader_login(conn, args.reader_role, reader_password)
            grant_reader(conn, schema_q, args.reader_role)
        conn.run("COMMIT")
    except Exception as error:  # roll back on anything, then report it
        if conn is not None:
            try:
                conn.run("ROLLBACK")
            except Exception:
                pass
        cause = error.__cause__ or error
        print(f"error: load failed and was rolled back: {type(cause).__name__}: {cause}", file=sys.stderr)
        return 1
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass

    print_summary(items, "loaded")
    print(f"Loaded {len(items)} dataset(s) into schema {schema!r} on {settings.host} "
          f"in {time.monotonic() - started:.1f}s.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
