# VKinder

VKinder (KinderPrint) is a React + TypeScript frontend and FastAPI backend for
area-level child development, health and environmental exploration. The current
repository includes Iterations 1–3: maps and profiles, comparisons, Child Health
Today, Family Fit, future demand, Plan Change and simulation experiences.
Dataset availability and interpretation limits remain specific to each service;
area-level results are not assessments of an individual child.

## About the app

VKinder is a student-developed web application that brings together information
about children and the places where they grow up across Greater Melbourne.
It helps users explore how neighbourhood development indicators, social context,
environmental conditions and nearby services vary between areas, rather than
having to navigate separate datasets.

The app combines interactive maps, area profiles, health information and
exploratory scenario tools. Its purpose is to make local evidence easier to
understand and investigate—not to diagnose a child, identify a single "best"
neighbourhood or make resource-allocation decisions automatically.

### Who it is for

- **Parents and carers:** explore local context, nearby services, child-health
  information and areas that fit selected family priorities.
- **Practitioners and community stakeholders:** inspect area-level evidence,
  compare localities and explore service-demand and environmental-change context.
- **Project reviewers:** examine the implemented experiences alongside their
  source, methodology and limitation documentation.

### Main features

| Feature | What users can do |
|---|---|
| Interactive neighbourhood map | Search and select areas; explore development, heat, social disadvantage, vegetation and green-space layers, with a basemap that follows the light/dark theme. |
| Area profiles and comparison | View development, social and environmental indicators, Priority for Investigation and available supporting evidence; compare selected localities through the current comparison experience. |
| Insight Journey | Explore an immersive Cesium-based introduction; the earlier narrative Three.js journey is retained separately. |
| Child Health Today | Switch between parent and practitioner views of an area's health context, healthy-day tools, vaccines, Play today, Seasons and Care nearby. |
| Where to live — Family Fit | Select a reference area, distance and family priorities, then explore matching areas, their supporting measures and limitations. |
| Future demand — In 2031 | Explore published child-population projections and service-pressure context across available projection years. |
| Plan Change | Compare similar areas that already have selected environmental characteristics, with explicit association and uncertainty framing. |
| Simulation Engine | Select an area, adjust scenario controls and explore baseline/scenario results; simulation output is exploratory, not a proven causal effect. |

These features are implemented in the repository. Their live results depend on
the deployed backend version and available datasets. An existing endpoint or
screen does not mean every optional evidence product is available.

### Reading the results

- Information describes areas or explicitly labelled broader geographies, not
  the health or development of an individual child.
- Different sources can use different years and geographic units. Read their
  provenance and limitations before comparing them.
- Missing values remain missing (`null`), rather than being replaced with zero
  or fabricated measurements.
- Nearby service listings do not confirm current capacity, cost or waiting time.
- Comparisons, projections and scenarios are investigation aids. Association
  does not establish causation, and final decisions remain with people.

## Current deployment

- Production website: `https://vkinder.me` / `https://www.vkinder.me`, hosted on Vercel.
- Production API: `https://aockxpua5f.execute-api.ap-southeast-2.amazonaws.com`,
  the team member's complete backend connected to RDS PostgreSQL.
- Original API: `https://ufeig1cv2i.execute-api.ap-southeast-2.amazonaws.com`,
  retained for historical frozen frontends; its Lambda is not being shut down.

Vercel Production's `VITE_API_BASE_URL` selects the production API at build time.
Set it before releasing `main`, then verify the deployed pages. Do not change
frozen deployments' API settings when updating production. If a frozen frontend
shares a Vercel project, confirm its settings before rebuilding it.

The production API owner handles backend deployments, RDS imports and CORS.
Merging backend code or data into Git does not deploy it or load the database.
Frontend-only changes need a frontend deployment, not a Lambda deployment.
See [AWS deployment responsibilities](docs/AWS_VKINDER.md).

## Frontend

```bash
cd frontend
npm install
npm run dev
```

Vite listens on all network interfaces. The frontend is available locally at
`http://localhost:5173`, or from another device at
`http://<this-computer-LAN-IP>:5173`.

### Pages

| Path | Page |
|---|---|
| `/` | Home |
| `/insight-journey` | Insight Journey |
| `/insight-journey-legacy` | Older procedural Three.js journey; the current Insight Journey uses Cesium |
| `/map` | Melbourne map. Selecting an area loads its profile popup, with actions to open Child Health or Where to live; `/map?area=<SA2 code>&name=<name>` highlights an area |
| `/simulation` | Simulation |
| `/child-health` | Child Health board, parent and practitioner views (`?area=<SA2 code>&name=<name>`); without an area link, opens the map for selection |
| `/map/where-to-live` or `/where-to-live` | Parent: Family Fit area search; Practitioner: Plan Change. Supports `?focus=<home card key>`, `?anchor=<SA2 code>` and `?view=plan` |

The main Child Health navigation opens the map. The neighbourhood map follows
the light/dark theme without recreating the map or changing indicator colours.
See [theme implementation](docs/midnight-glass-theme.md).

## Where to live (Family Fit): handover

* Rebuild the data: `python datascience/scripts/model_school_entry_forecast.py`,
  then `python datascience/scripts/build_family_fit.py`. Both run inside
  `datascience/scripts/refresh_iteration3.py`, which also gates on the tests and
  the pipeline KPIs and restores the previous artefacts on failure.
* Served files: `datascience/outputs/iteration_3/family_fit.json` and
  `family_fit_shapes.json`. Set the backend variables
  `KINDERPRINT_FAMILY_FIT_DATA_PATH` and
  `KINDERPRINT_FAMILY_FIT_SHAPES_DATA_PATH`.
* Docs: `datascience/docs/MODEL_CARD_FAMILY_FIT.md`,
  `datascience/docs/decisions/ADR-009-family-fit-and-forecast.md`,
  `datascience/docs/FAMILY_FIT_DEPLOYMENT_LOG.md`, and the Family Fit section of
  `docs/api-contract.md`.
* Tests: `datascience/tests/test_family_fit.py`,
  `backend/tests/test_family_fit.py`.

## Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
cd ..
./backend/run_local_backend.sh
```

The local backend script sets all required approved dataset paths automatically.
Running `uvicorn main:app` directly does not configure those paths and will make
data-backed endpoints report that their datasets are unavailable.

After the environment has been created, later runs only need:

```bash
./backend/run_local_backend.sh
```

The backend listens on all network interfaces. It is available locally at
`http://127.0.0.1:8000`, or from another device at
`http://<this-computer-LAN-IP>:8000`.

### Backend structure

```text
backend/
├── core/          # Configuration, response envelopes, readiness checks, file/database dispatch
├── db/            # PostgreSQL storage: dataset registry, schema, connection, repository
├── loaders/       # Validated readers for approved runtime datasets
├── tests/         # Backend and deployment tests
├── main.py        # FastAPI routes and Lambda entry point
├── geography.py   # Boundary validation and spatial filtering
└── validation.py  # Analytical artefact validation and response projection
```

With `VITE_API_BASE_URL` unset or empty, the frontend calls `/api` on its own origin and Vite proxies those requests to
the backend, so LAN clients do not need a separate API URL or permissive CORS
configuration. If Windows Firewall prompts for Python or Node.js access, allow
it only on Private networks.

To test against the production API instead, set `VITE_API_BASE_URL` in
`frontend/.env.local` and restart Vite. Configure `VITE_MAPBOX_ACCESS_TOKEN`
there for the neighbourhood map. Never put database passwords or AWS credentials
in `VITE_*` variables: their values are included in browser code. Keep local
environment files out of Git.

### Approved data configuration

The services read only approved or explicitly bounded processed datasets. Copy
[`backend/.env.example`](backend/.env.example) into deployment-managed
environment configuration and provide the applicable dataset paths. Existing
reviewed runtime datasets are tracked in this repository; do not add unreviewed,
restricted or sensitive datasets, and never commit credentials. The service deliberately returns an unavailable
or limited state when a source is not configured or cannot be validated.

Pattern-insight and prevention-opportunity data paths are intentionally not
configured in the deployment template. Those endpoints remain explicitly
unavailable until defensible, reviewed analytical outputs exist; deployment must
not imply that hypothetical findings have been validated.

VIF projections are exposed at their native SA2 geography. EPA historical data
is exposed only as monitoring-station context, and ACECQA/G-NAF data is exposed
only as an aggregate quality report; the service never returns address rows.

`GET /api/health` confirms that the FastAPI application is running.

### Data storage: files or PostgreSQL

The API reads datasets from files by default (`KINDERPRINT_DATA_BACKEND=files`),
which is what local development and the tests use. Production can read the same
datasets from PostgreSQL instead (`KINDERPRINT_DATA_BACKEND=postgres`), as the
current production API does. The source adapter preserves the existing loaders,
validation and response envelopes. Live parity tests require a configured test
database; they are skipped when that configuration is absent.

The generic schema default is `kinderprint`; the built-in AWS database stack
uses `vkinder`. Dataset paths still declare which inputs are configured, even
in PostgreSQL mode. The API's database login is read-only; imports use a separate
loader. Changed database loads invalidate warm caches through version checks
(default interval 60 seconds). Files remain in Lambda packages for import and
rollback: database reads do not automatically remove bundled data.

```bash
# Check the files that would be loaded, without a database
python3 datascience/scripts/load_to_db.py --dry-run
```

To roll back, set `KINDERPRINT_DATA_BACKEND=files` (or deploy with
`DataBackend=files`); the data files are still packaged. See
[`docs/DATABASE.md`](docs/DATABASE.md) for the tables, security and tests, and
[`docs/AWS_VKINDER.md`](docs/AWS_VKINDER.md) for the Vkinder AWS database stack.

### Backend tests

```bash
cd backend
source .venv/bin/activate
python -m pip install -r requirements-dev.txt
python -m pytest
```

### AWS Lambda deployment

Only run deployment commands in the intended backend owner's account. The
current production API and original historical Lambda are separate deployments.
The database helper defaults to stack `vkinder`, not the original
`kinderprint-backend-iteration1`; using it is not a routine frontend release step.

The backend is deployed as a zip-based Python 3.13 Lambda behind an API
Gateway HTTP API. The preparation script installs Linux x86_64 wheels into the
generated package, so Docker is not required.

Prepare the approved runtime artefacts, including the bounded Iteration 2 profile and
suitability datasets, then deploy the prepared package with AWS SAM:

```bash
./backend/prepare_lambda_package.sh
sam deploy --template-file template.yaml --guided
```

Deploys default to files mode and create no database. To run Vkinder with its
own private PostgreSQL database, alerts and the daily credit guard, use
`infra/vkinder_aws.sh deploy <alert email>` (see
[`docs/AWS_VKINDER.md`](docs/AWS_VKINDER.md)).

The preparation script already assembles the deployable package with Linux x86_64
native wheels. Do not run a local `sam build` over that package, because it can
filter required native extension files on macOS.

The template allows the production origins `https://kinderprint.vercel.app`,
`https://kinderprint.me`, `https://www.kinderprint.me`, `https://vkinder.me`,
and `https://www.vkinder.me`. Override the corresponding template parameters
if these domains change.

Use the `ApiUrl` stack output as the Vercel `VITE_API_BASE_URL`, then redeploy
the intended frontend only when changing its API destination is agreed. Do not
replace the current production URL with a different stack's output by accident.
The generated `backend/lambda_package/` and `.aws-sam/`
directories are local build artifacts and are not committed.

## Documentation

- [API contract v0.4](docs/api-contract.md): response conventions, current routes and provisional contracts.
- [Database storage](docs/DATABASE.md): file/PostgreSQL modes, schemas, imports, caching, security and tests.
- [AWS operations](docs/AWS_VKINDER.md): deployment ownership, separate stacks, rollback and credit guard.
- [Theme implementation](docs/midnight-glass-theme.md): shared theme and neighbourhood basemap changes.
- [Legacy Insight Journey](docs/insight-journey.md): historical Three.js implementation and verification records.
- [Data Science documentation](datascience/README.md): data products, pipelines and model/evidence references.

Normal development uses feature branches based on `pre-main`. Integrate into
`pre-main`, verify, and promote to `main` only with explicit approval. Preserve
contributors' original commits; do not automatically squash or merge branches.
