# Database storage (PostgreSQL)

The KinderPrint API can read its datasets from PostgreSQL instead of from files
bundled with Lambda. As of 12 October 2026, the production frontend uses the
team member's RDS-connected API; the original Lambda remains on file-based
storage for historical frontends. Local development can keep using files.
The storage adapter is designed to preserve API responses in both modes; live
PostgreSQL parity tests require an actual test database and are skipped without
its configuration. See [deployment responsibilities](AWS_VKINDER.md).

## Contents

1. [Architecture](#architecture)
2. [Storage modes and settings](#storage-modes-and-settings)
3. [Tables](#tables)
4. [How exactness is guaranteed](#how-exactness-is-guaranteed)
5. [One-off database set-up](#one-off-database-set-up)
6. [Loading data](#loading-data)
7. [Deploying the API in postgres mode](#deploying-the-api-in-postgres-mode)
8. [Caching and picking up new loads](#caching-and-picking-up-new-loads)
9. [Security](#security)
10. [Rollback](#rollback)
11. [Testing](#testing)
12. [Known limits](#known-limits)

## Architecture

```text
datascience/ outputs (CSV, JSON, GeoJSON)
        │
        │  datascience/scripts/load_to_db.py (reachable host or private loader Lambda)
        ▼
PostgreSQL configured schema (default "kinderprint"; built-in AWS stack "vkinder")
  ├── dataset_versions      one row per dataset: sha256, row count, columns
  ├── json_artefacts        JSON and GeoJSON documents
  └── ds_<dataset_key>      one typed table per CSV dataset
        │
        │  pg8000, TLS, runtime secret lookup or deploy-time injected credentials
        ▼
backend/db/repository.py    rows exactly as csv.DictReader / json.loads give them
        │
backend/core/sources.py     read_csv_rows / read_json: files or database
        │
backend/loaders/*.py, backend/validation.py, backend/geography.py
        │
FastAPI routes (main.py)    same envelopes, limitations and responses
```

Key points:

- **One registry.** `backend/db/datasets.py` lists every dataset: its key, the
  `KINDERPRINT_*_DATA_PATH` variable the API reads, whether it is CSV or JSON,
  and its default file in the repository. Both the API and the load script use
  it, so they cannot drift apart.
- **Loaders are unchanged in behaviour.** The loaders still validate every row,
  raise the same limitation codes and keep their in-process caches. Only the
  line that opened the file now calls `read_csv_rows(path, env_name)` or
  `read_json(path, env_name)` in `backend/core/sources.py`, which picks the
  storage.
- **Pure Python driver.** The Lambda bundle uses `pg8000` and its pure-Python
  dependencies (`scramp`, `asn1crypto`, `python-dateutil`, `six`); no compiled
  database driver is added to the package.
- **Separate schema.** Everything lives in one schema (default `kinderprint`,
  set by `KINDERPRINT_DB_SCHEMA`), so it can share an existing database without
  touching other schemas.

## Storage modes and settings

| Variable | Default | Purpose |
| --- | --- | --- |
| `KINDERPRINT_DATA_BACKEND` | `files` | `files` or `postgres`. Unknown values fall back to `files` with a warning. |
| `KINDERPRINT_*_DATA_PATH` | – | Still required in both modes. In postgres mode the value is not read, but an unset variable still means "not configured", exactly as before. |
| `KINDERPRINT_DB_SECRET_ARN` | – | Optional runtime Secrets Manager credential lookup, used by the external-database configuration. |
| `KINDERPRINT_DB_HOST`, `_PORT`, `_NAME`, `_USER`, `_PASSWORD` | port `5432` | Local connections, deploy-time injected credentials, or connection details absent from a runtime secret. |
| `KINDERPRINT_DB_SSL` | `true` | `true` verifies the server certificate and host name; `require` encrypts without verifying; `false` is for a local database only. |
| `KINDERPRINT_DB_SSL_ROOT_CERT` | bundled RDS CA | CA bundle used when `KINDERPRINT_DB_SSL=true`. |
| `KINDERPRINT_DB_SCHEMA` | `kinderprint` | Schema holding the tables. The built-in `CreateDatabase=true` stack sets `vkinder`; importer and API must use the same schema. Must be a lower-case identifier. |
| `KINDERPRINT_DB_CACHE_SECONDS` | `60` | How often the API checks for a newer load. |
| `KINDERPRINT_DB_CONNECT_TIMEOUT` | `5` | Seconds for connecting and for each network read. |
| `KINDERPRINT_DB_STATEMENT_TIMEOUT_MS` | `15000` | Server-side statement timeout for API queries. |

When a secret ARN is set, the username and password always come from the
secret. Host, port and database name come from the secret when it has them
(standard RDS secrets do) and otherwise from the `KINDERPRINT_DB_*` variables.

The built-in AWS stack resolves its generated Secrets Manager passwords through
CloudFormation at deployment and injects them into Lambda environment variables.
This differs from runtime secret lookup: environment credentials do not refresh
automatically when a secret rotates. Update the deployment after rotation, and
restrict access to Lambda configuration. Do not place credentials in `VITE_*`
variables, browser code, documentation or Git.

Datasets that are not in the registry (the unapproved pattern-insight and
prevention-opportunity paths) are always read from files.

## Tables

All tables are in the configured schema. `backend/db/schema.sql` creates the two
bookkeeping tables and is safe to run repeatedly; the load script runs it each time.

### `dataset_versions`

| Column | Type | Notes |
| --- | --- | --- |
| `dataset_key` | text, primary key | e.g. `seasonal_air`, `family_fit` |
| `table_name` | text | `ds_<dataset_key>` for CSV, `json_artefacts` for JSON |
| `source_file` | text | Path relative to the repository root |
| `kind` | text | `csv` or `json` |
| `row_count` | integer | CSV rows; null for JSON |
| `sha256` | char(64) | Hash of the exact source file bytes |
| `columns` | jsonb | CSV only: ordered list of `{name, column, type, …}` |
| `loaded_utc` | timestamptz | When the load committed |
| `built_utc` | text, nullable | `metadata.built_utc` from a JSON artefact when present |

### `json_artefacts`

| Column | Type | Notes |
| --- | --- | --- |
| `artefact_key` | text, primary key | Same as `dataset_key` |
| `body` | jsonb | Queryable form of the document |
| `body_text` | text | The original document text, served by the API |
| `sha256` | char(64) | Hash of the source file |
| `bytes` | bigint | Size of the source file |
| `loaded_utc` | timestamptz | |

### `ds_<dataset_key>` (one per CSV dataset)

- `_row_number` (integer, not null) keeps the original file order.
- One column per CSV header, typed as `integer`, `bigint`, `double precision`,
  `boolean` or `text` (see the next section).
- Primary key: the first of `sa2_code_2021`, `sa2_code`, `community_id`,
  `neighbourhood_id`, `id`, `pha_code`, `facility_id`, `hospital_code`,
  `service_approval_number`, `nutrient_id`, `lga_code`, `sa3_code`, `station_id`
  that is present, never empty and unique. Any other of these columns that is
  present gets an index. If none is unique, `_row_number` is the primary key.

Example query:

```sql
SELECT sa2_code, month, mean_daily_ug_m3
FROM kinderprint.ds_seasonal_air
WHERE pollutant = 'PM2.5' AND mean_daily_ug_m3 > 10
ORDER BY mean_daily_ug_m3 DESC;
```

Run `python3 datascience/scripts/load_to_db.py --list` to see every dataset key.

## How exactness is guaranteed

The loaders were written against `csv.DictReader` output, so the database has to
return exactly the strings that were in the file, in the same column order.

- **Typed only when lossless.** The load script gives a column a numeric or
  boolean type only if every value turns back into its original text by a fixed
  rule (`backend/db/codec.py`): canonical integers (`"12"`, not `"012"`), floats
  where `repr(float(text)) == text` (`"0.1"`, `"25.0"`, not `"12.50"`), and
  booleans with exactly one true and one false spelling (`"True"`/`"False"`).
  Anything else stays `text`. Identifier columns (`*_code`, `*_id`, postcodes,
  phone numbers) always stay `text`.
- **Empty values.** An empty value in a typed column is stored as `NULL` and
  returned as `""`. Text columns store `""` as `""`.
- **JSON text kept.** `jsonb` reorders object keys and normalises numbers, which
  would change API output, so the original document is kept in `body_text` and
  that is what the API parses.
- **Checked before publishing.** Inside the load transaction the script reads
  every CSV table back through the API's own `read_csv_table` and compares it
  with the file row by row, and compares each stored JSON document with the
  file. Any difference rolls the whole load back.
- **Checked by tests.** `backend/tests/test_db_backend.py` compares every CSV
  and JSON dataset, and 129 API requests across all route groups, between the two
  modes byte for byte.

## One-off database set-up

This section describes a generic existing database using schema `kinderprint`
and roles `kinderprint_loader` / `kinderprint_api`. It is not the built-in private
stack procedure. That stack uses schema `vkinder`, an administrative loader
Lambda and the `vkinder_api` read-only role; follow [AWS_VKINDER.md](AWS_VKINDER.md)
in its owning account instead. Do not open the private database to the internet
just to run a laptop import.

The steps below assume an Amazon RDS for PostgreSQL instance or Aurora
PostgreSQL cluster in `ap-southeast-2`, reachable from your laptop (for loading)
and from the Lambda's subnets. Use two roles: a loader that owns the schema, and
a read-only role for the API.

Connect as an administrator (for example with `psql`) and run, choosing your own
passwords when prompted rather than typing them into a file:

```sql
CREATE ROLE kinderprint_loader LOGIN;
\password kinderprint_loader
CREATE ROLE kinderprint_api LOGIN;
\password kinderprint_api

CREATE SCHEMA IF NOT EXISTS kinderprint AUTHORIZATION kinderprint_loader;
GRANT CONNECT ON DATABASE kinderprint TO kinderprint_loader, kinderprint_api;
-- The API role needs nothing else here: the load script grants it
-- USAGE on the schema and SELECT on the tables after every load.
```

Then store each role's credentials in AWS Secrets Manager using the standard RDS
secret format (the console's "Credentials for Amazon RDS database" type creates
it), for example `kinderprint/db/api` and `kinderprint/db/loader`:

```json
{"engine": "postgres", "host": "<endpoint>", "port": 5432,
 "username": "kinderprint_api", "password": "<strong random password>", "dbname": "kinderprint"}
```

When runtime secret lookup is configured, the API re-reads the secret after an
authentication failure. Deploy-time injected credentials instead require a
deployment update after rotation.

## Loading data

Run from the repository root on a machine with the processed outputs. The script
needs `pg8000` (and `boto3` for `--secret-arn`):

```bash
python3 -m pip install pg8000 boto3
```

1. **Check the files first (no database needed):**

   ```bash
   python3 datascience/scripts/load_to_db.py --dry-run
   ```

   This reads and checks every dataset and prints the planned row counts,
   typed columns, primary keys and hashes.

2. **Load into RDS with the loader secret** (uses your local AWS profile):

   ```bash
   python3 datascience/scripts/load_to_db.py \
     --secret-arn "arn:aws:secretsmanager:ap-southeast-2:<account-id>:secret:kinderprint/db/loader-XXXXXX" \
     --region ap-southeast-2 --profile <your-profile> \
     --reader-role kinderprint_api
   ```

   Always pass `--reader-role` (or set `KINDERPRINT_DB_READER_ROLE`): each load
   recreates the CSV tables, and the grant is re-applied in the same transaction.

3. **Or load into a local PostgreSQL:**

   ```bash
   export KINDERPRINT_DB_HOST=127.0.0.1 KINDERPRINT_DB_PORT=5432 \
          KINDERPRINT_DB_NAME=kinderprint KINDERPRINT_DB_USER=kinderprint_loader \
          KINDERPRINT_DB_SSL=false
   read -rs KINDERPRINT_DB_PASSWORD && export KINDERPRINT_DB_PASSWORD
   python3 datascience/scripts/load_to_db.py
   ```

4. **Reload only what changed:**

   ```bash
   python3 datascience/scripts/load_to_db.py --only family_fit --only family_fit_shapes \
     --secret-arn "$LOADER_SECRET_ARN" --region ap-southeast-2 --reader-role kinderprint_api
   ```

Other options: `--schema <name>` targets another schema, and `--list` prints the
dataset keys. If a `KINDERPRINT_*_DATA_PATH` variable is set in your shell, the
script loads that file instead of the registry default.

What a load does, in a single transaction:

1. takes an advisory lock so two loads cannot overlap;
2. runs `schema.sql`;
3. for each CSV: creates `ds_<key>__staging`, copies the rows in with `COPY`,
   adds the key and indexes, drops the old table and renames the staging table;
4. upserts each JSON document into `json_artefacts`;
5. records each dataset in `dataset_versions` and verifies it as described above;
6. grants read access to the reader role, then commits.

If any step fails, nothing is committed: the API keeps serving the previous
version and the script exits with a non-zero status and the reason. A file with
a ragged row, a repeated header or a NUL character is refused before the
database is touched.

## Deploying the API in postgres mode

1. Load the data (above).
2. Package as usual. The script now also copies `backend/db/` and downloads the
   Amazon RDS certificate bundle into the package so the database certificate
   can be verified. Without internet access, download
   `https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem` once and
   pass it in:

   ```bash
   RDS_CA_BUNDLE=/path/to/global-bundle.pem ./backend/prepare_lambda_package.sh
   ```

3. Deploy with the new parameters:

   ```bash
   sam deploy --template-file template.yaml --guided \
     --parameter-overrides \
       DataBackend=postgres \
       DbSecretArn="arn:aws:secretsmanager:ap-southeast-2:<account-id>:secret:kinderprint/db/api-XXXXXX" \
       SubnetIds="subnet-aaaa,subnet-bbbb" \
       SecurityGroupIds="sg-cccc"
   ```

Template parameters (all optional; a deploy without them behaves exactly as before):

| Parameter | Default | Effect |
| --- | --- | --- |
| `DataBackend` | `files` | Sets `KINDERPRINT_DATA_BACKEND`. |
| `DbSecretArn` | empty | Sets `KINDERPRINT_DB_SECRET_ARN` and, only when set, adds an IAM statement allowing `secretsmanager:GetSecretValue` on that one secret. |
| `SubnetIds`, `SecurityGroupIds` | empty | When both are set, the function runs in those subnets (`VpcConfig`). |
| `CreateDatabase` | `false` | Creates the built-in private RDS stack when `true`, using schema `vkinder` and deploy-time injected credentials. See the separate stack procedure before enabling it. |

Networking notes:

- If the database is not publicly reachable (recommended), give the function
  private subnets and a security group, and allow inbound TCP 5432 on the
  database's security group from the function's security group.
- Private subnets do not provide internet access by themselves. Runtime secret
  lookup needs connectivity to Secrets Manager, such as an interface endpoint or
  NAT. The built-in stack uses deploy-time credential injection and does not
  require that runtime lookup route.
- Each warm Lambda container keeps one connection. Keep reserved concurrency
  within the database's connection limit, or put RDS Proxy in front.
- Aurora Serverless v2 scaled to zero can take several seconds to resume. The
  first requests may report datasets as unavailable; the API retries every few
  seconds and recovers on its own.

## Caching and picking up new loads

- The first read of each dataset in a container fetches it once and keeps it in
  memory, keyed by its `sha256`.
- At most every `KINDERPRINT_DB_CACHE_SECONDS` (default 60) a request triggers a
  single small query of `dataset_versions`. If any hash changed, the loaders'
  caches are cleared and the next request reads the new data. New loads
  therefore appear within about a minute, with no redeploy.
- Every read uses one read-only, repeatable-read snapshot, so a load committing
  at the same moment is never seen half-applied.
- If the database becomes unreachable, warm containers keep serving the data
  they already hold. A cold container reports the affected datasets with the
  same "unavailable" or "invalid" limitations that a missing or unreadable file
  produces, and retries every few seconds until the database is back.

## Security

- **No credentials in code or chat.** Secrets Manager stores the built-in
  stack's passwords, but deploy-time injection also places them in Lambda
  environment configuration. Restrict access to both. Local passwords are typed into the shell (`read -rs`), never
  written into files, scripts or messages. `.env.example` contains no secrets.
  Connection settings never print the password.
- **Least privilege.**
  - External-database runtime lookup grants `secretsmanager:GetSecretValue` on
    the configured secret ARN; the built-in stack uses deploy-time injection.
    Network, logging and other permissions depend on the selected stack.
  - The generic API connects as `kinderprint_api` (`vkinder_api` in the built-in
    stack), with `USAGE` on the configured schema and `SELECT` on its tables.
    The API itself only runs
    `SELECT` statements (CSV reads inside read-only transactions).
  - The generic loader owns the configured schema. The built-in loader uses
    administrative credentials and must remain separate from the public API.
- **Encryption in transit.** TLS is on by default and verifies the server
  certificate and host name against the Amazon RDS certificate bundle. Turn on
  `rds.force_ssl` on the database parameter group so plain connections are
  refused. Use `KINDERPRINT_DB_SSL=false` only for a local database.
- **Network.** Keep the database in private subnets; reach it from the Lambda
  through security groups and from laptops through a bastion, VPN or Session
  Manager port forwarding rather than a public endpoint.
- **SQL safety.** Values are always passed as bind parameters; schema, table and
  column names are checked against strict identifier patterns and quoted.

## Rollback

Apply rollback only to the intended backend in its owning account. Switching
Vercel's API base URL and redeploying the frontend is a separate operation; do
not alter frozen deployments or the original Lambda unintentionally. For the
built-in `vkinder` stack, use the parameter-preserving command in
[AWS_VKINDER.md](AWS_VKINDER.md), rather than an unqualified deployment below.

The data files are still packaged with the Lambda, so returning to files mode
needs no rebuild:

```bash
sam deploy --template-file template.yaml --parameter-overrides DataBackend=files
```

or, for an immediate change, set the function's `KINDERPRINT_DATA_BACKEND`
environment variable to `files` in the Lambda console. Locally, unset
`KINDERPRINT_DATA_BACKEND` or set it to `files`.

To roll back a bad data load while staying in postgres mode, re-run the load
script on the previous outputs (for example from the previous Git commit). Each
load replaces the dataset atomically.

## Testing

Files mode (default; the database tests are skipped):

```bash
cd backend
python3 -m pytest -q tests
```

Postgres parity tests against any PostgreSQL you control. They load every
dataset into a separate schema (`kinderprint_test`, or
`KINDERPRINT_TEST_DB_SCHEMA`) with the real load script, compare everything,
and drop that schema at the end:

```bash
cd backend
export KINDERPRINT_DB_HOST=127.0.0.1 KINDERPRINT_DB_PORT=5432 \
       KINDERPRINT_DB_NAME=kinderprint_dev KINDERPRINT_DB_USER=postgres KINDERPRINT_DB_SSL=false
read -rs KINDERPRINT_DB_PASSWORD && export KINDERPRINT_DB_PASSWORD
python3 -m pip install pg8000
python3 -m pytest -q tests/test_db_backend.py
```

These tests check that:

- every CSV dataset comes back exactly as `csv.DictReader` reads the file
  (header, values, column order) and every JSON document exactly as the file;
- numeric columns really are stored with numeric types;
- 129 API requests (profiles, boundaries, indicators, compare, priority,
  explanation, match, outcome and environmental comparisons, suitability,
  family-fit setup/search/areas/shapes, all child-health and digital-health
  routes, care comparison, nearby services, immunisation, nutrition, air
  quality, population projections and readiness) return identical bytes in
  both modes, with the data files made unreachable in postgres mode;
- a missing dataset, an unreachable database and an unset variable give the
  same responses as the matching file situations;
- a new load is picked up without a restart, and a failed load leaves the
  previous version in place.

## Known limits

- The data files stay in the Lambda package so rollback is instant. Removing
  them later would shrink the package but make rollback a redeploy.
- The pattern-insight and prevention-opportunity variables are not in the
  registry; they stay file-only until approved outputs exist.
- `template.yaml` adds the standard Lambda VPC execution policy whenever the
  `VpcConfig` property is present in the template, even when it resolves to no
  VPC. It only grants network-interface permissions.
- If the RDS certificate bundle is not in the package and
  `KINDERPRINT_DB_SSL_ROOT_CERT` is not set, certificate verification fails and
  postgres mode reports datasets as unavailable. It never falls back to an
  unverified connection unless `KINDERPRINT_DB_SSL=require` is set explicitly.
