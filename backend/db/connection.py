"""PostgreSQL connection handling for the API and the load script.

Uses pg8000, a pure-Python driver, so the Lambda bundle stays free of compiled
wheels. Credentials come from AWS Secrets Manager (``KINDERPRINT_DB_SECRET_ARN``)
or, for local work, from ``KINDERPRINT_DB_HOST/PORT/NAME/USER/PASSWORD``.
Credentials are never logged and never written to disk.
"""

from __future__ import annotations

import json
import os
import re
import ssl
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, TypeVar

SCHEMA_ENV = "KINDERPRINT_DB_SCHEMA"
SECRET_ARN_ENV = "KINDERPRINT_DB_SECRET_ARN"
HOST_ENV = "KINDERPRINT_DB_HOST"
PORT_ENV = "KINDERPRINT_DB_PORT"
NAME_ENV = "KINDERPRINT_DB_NAME"
USER_ENV = "KINDERPRINT_DB_USER"
PASSWORD_ENV = "KINDERPRINT_DB_PASSWORD"
SSL_ENV = "KINDERPRINT_DB_SSL"
SSL_ROOT_CERT_ENV = "KINDERPRINT_DB_SSL_ROOT_CERT"
CONNECT_TIMEOUT_ENV = "KINDERPRINT_DB_CONNECT_TIMEOUT"
STATEMENT_TIMEOUT_ENV = "KINDERPRINT_DB_STATEMENT_TIMEOUT_MS"

DEFAULT_SCHEMA = "kinderprint"
# Amazon RDS certificate bundle, added to the Lambda package by
# prepare_lambda_package.sh when it can be downloaded.
BUNDLED_ROOT_CERT = Path(__file__).resolve().parent / "rds-global-bundle.pem"
_SCHEMA_PATTERN = re.compile(r"^[a-z_][a-z0-9_]{0,62}$")
# SQLSTATE classes that mean the session itself is broken and worth one retry:
# 08 connection exception, 57P operator intervention (e.g. admin shutdown),
# 28 invalid authorisation (e.g. a rotated password).
_RETRY_SQLSTATE_PREFIXES = ("08", "57P", "28")

T = TypeVar("T")


class DatabaseUnavailable(OSError):
    """The database could not be reached or could not answer a query.

    Subclasses OSError on purpose: the dataset loaders already treat OSError as
    "the configured dataset could not be read", so database failures surface as
    the same public limitations as an unreadable file.
    """


class DatabaseConfigurationError(DatabaseUnavailable):
    """Connection settings are missing or invalid."""


@dataclass(frozen=True)
class DbSettings:
    host: str
    port: int
    database: str
    user: str
    password: str = ""
    ssl_mode: str = "verify-full"
    ssl_root_cert: str | None = None

    def __repr__(self) -> str:  # never print the password
        return (f"DbSettings(host={self.host!r}, port={self.port}, database={self.database!r}, "
                f"user={self.user!r}, ssl_mode={self.ssl_mode!r})")


def schema_name() -> str:
    """Return the configured schema after checking it is a plain identifier."""
    value = (os.getenv(SCHEMA_ENV) or DEFAULT_SCHEMA).strip()
    if not _SCHEMA_PATTERN.match(value):
        raise DatabaseConfigurationError(f"{SCHEMA_ENV} must be a lower-case identifier.")
    return value


def quote_identifier(name: str) -> str:
    """Quote a table or column name for SQL."""
    if "\x00" in name:
        raise ValueError("Identifiers cannot contain NUL characters.")
    return '"' + name.replace('"', '""') + '"'


def _ssl_mode() -> str:
    value = (os.getenv(SSL_ENV) or "true").strip().lower()
    if value in {"true", "1", "yes", "verify-full"}:
        return "verify-full"
    if value == "require":
        return "require"
    if value in {"false", "0", "no", "disable"}:
        return "disable"
    raise DatabaseConfigurationError(f"{SSL_ENV} must be true, require or false.")


_secret_cache: dict[str, dict[str, Any]] = {}
_secret_lock = threading.Lock()


def fetch_secret(secret_arn: str, *, region: str | None = None, profile: str | None = None,
                 refresh: bool = False) -> dict[str, Any]:
    """Read a standard RDS secret (host, port, username, password, dbname) once per process."""
    with _secret_lock:
        if not refresh and secret_arn in _secret_cache:
            return _secret_cache[secret_arn]
        try:
            import boto3  # provided by the Lambda runtime; imported only when needed
        except ImportError as error:
            raise DatabaseConfigurationError("boto3 is required to read the database secret.") from error
        try:
            session = boto3.session.Session(profile_name=profile, region_name=region)
            client = session.client("secretsmanager")
            response = client.get_secret_value(SecretId=secret_arn)
            secret = json.loads(response["SecretString"])
        except Exception as error:  # boto and JSON errors alike; do not leak details
            raise DatabaseUnavailable("The database secret could not be read.") from error
        if not isinstance(secret, dict):
            raise DatabaseConfigurationError("The database secret must be a JSON object.")
        _secret_cache[secret_arn] = secret
        return secret


def resolve_settings(*, secret_arn: str | None = None, region: str | None = None,
                     profile: str | None = None, refresh_secret: bool = False) -> DbSettings:
    """Build connection settings from Secrets Manager and/or environment variables.

    Secret values win for username and password. Host, port and database name
    come from the secret when present (standard RDS secrets include them) and
    otherwise from the KINDERPRINT_DB_* variables, which covers RDS-managed
    master secrets that only hold a username and password.
    """
    arn = secret_arn if secret_arn is not None else (os.getenv(SECRET_ARN_ENV) or "").strip()
    secret: dict[str, Any] = {}
    if arn:
        secret = fetch_secret(arn, region=region, profile=profile, refresh=refresh_secret)
    host = secret.get("host") or os.getenv(HOST_ENV)
    port = secret.get("port") or os.getenv(PORT_ENV) or 5432
    database = secret.get("dbname") or os.getenv(NAME_ENV)
    user = secret.get("username") or os.getenv(USER_ENV)
    password = secret.get("password") if arn else os.getenv(PASSWORD_ENV)
    if not host or not database or not user:
        raise DatabaseConfigurationError(
            f"Set {SECRET_ARN_ENV}, or {HOST_ENV}, {NAME_ENV} and {USER_ENV}, to reach the database.")
    try:
        port_number = int(port)
    except (TypeError, ValueError) as error:
        raise DatabaseConfigurationError("The database port must be a number.") from error
    root_cert = os.getenv(SSL_ROOT_CERT_ENV) or (str(BUNDLED_ROOT_CERT) if BUNDLED_ROOT_CERT.is_file() else None)
    return DbSettings(host=str(host), port=port_number, database=str(database), user=str(user),
                      password=str(password or ""), ssl_mode=_ssl_mode(), ssl_root_cert=root_cert)


def _ssl_context(settings: DbSettings) -> ssl.SSLContext | bool:
    if settings.ssl_mode == "disable":
        return False  # pg8000 treats None as "try SSL unverified"; False turns it off
    if settings.ssl_mode == "require":
        # Encrypted but not authenticated. Only for networks where the RDS
        # certificate bundle cannot be supplied; prefer verify-full.
        context = ssl.create_default_context()
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE
        return context
    context = ssl.create_default_context(cafile=settings.ssl_root_cert) if settings.ssl_root_cert \
        else ssl.create_default_context()
    context.check_hostname = True
    context.verify_mode = ssl.CERT_REQUIRED
    return context


def _int_env(name: str, default: int) -> int:
    try:
        return max(1, int(os.getenv(name) or default))
    except ValueError:
        return default


def open_connection(settings: DbSettings, *, timeout: float | None = None,
                    statement_timeout_ms: int | None = None, application_name: str = "kinderprint-api"):
    """Open one pg8000 native connection with short network and statement timeouts."""
    import pg8000.native  # imported lazily so files mode never needs the driver

    timeout = timeout if timeout is not None else _int_env(CONNECT_TIMEOUT_ENV, 5)
    statement_timeout_ms = statement_timeout_ms if statement_timeout_ms is not None \
        else _int_env(STATEMENT_TIMEOUT_ENV, 15000)
    try:
        return pg8000.native.Connection(
            user=settings.user, host=settings.host, port=settings.port, database=settings.database,
            password=settings.password, ssl_context=_ssl_context(settings), timeout=timeout,
            application_name=application_name,
            startup_params={"statement_timeout": str(statement_timeout_ms)},
        )
    except DatabaseUnavailable:
        raise
    except Exception as error:
        raise DatabaseUnavailable("Could not connect to the database.") from error


def _is_session_error(error: BaseException) -> bool:
    import pg8000.exceptions

    if isinstance(error, (pg8000.exceptions.InterfaceError, OSError)):
        return True
    if isinstance(error, pg8000.exceptions.DatabaseError) and error.args and isinstance(error.args[0], dict):
        return str(error.args[0].get("C", "")).startswith(_RETRY_SQLSTATE_PREFIXES)
    return False


class _Session:
    """One lazily opened connection shared by the process, guarded by a lock.

    Lambda serves one request per container at a time; the lock keeps local
    multi-threaded servers (uvicorn's thread pool) safe as well.
    """

    def __init__(self) -> None:
        self._connection = None
        self._lock = threading.RLock()

    def close(self) -> None:
        with self._lock:
            if self._connection is not None:
                try:
                    self._connection.close()
                except Exception:
                    pass
            self._connection = None

    def _connect(self, refresh_secret: bool = False):
        self._connection = open_connection(resolve_settings(refresh_secret=refresh_secret))
        return self._connection

    def run(self, work: Callable[[Any], T]) -> T:
        """Run ``work(connection)``, reconnecting once if the session has dropped.

        A failed connection is retried once with a freshly read secret, which
        also covers a rotated password. A query that fails because the session
        broke is retried once on a new connection. Other query errors are not
        retried. Every failure is raised as DatabaseUnavailable.
        """
        with self._lock:
            for attempt in (1, 2):
                last = attempt == 2
                try:
                    connection = self._connection or self._connect(refresh_secret=last)
                except DatabaseConfigurationError:
                    raise
                except DatabaseUnavailable:
                    self.close()
                    if last:
                        raise
                    continue
                try:
                    return work(connection)
                except DatabaseUnavailable:
                    self._rollback_quietly()
                    raise
                except Exception as error:
                    if _is_session_error(error):
                        self.close()
                        if not last:
                            continue
                    else:
                        self._rollback_quietly()
                    raise DatabaseUnavailable("The database query failed.") from error
            raise DatabaseUnavailable("The database query failed.")  # pragma: no cover

    def _rollback_quietly(self) -> None:
        if self._connection is None:
            return
        try:
            self._connection.run("ROLLBACK")
        except Exception:
            self.close()


session = _Session()


def run(work: Callable[[Any], T]) -> T:
    """Run a unit of database work on the shared API connection."""
    return session.run(work)


def reset() -> None:
    """Drop the shared connection and cached secrets (used by tests)."""
    session.close()
    with _secret_lock:
        _secret_cache.clear()
