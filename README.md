# VKinder

Minimal project foundation with a React frontend and a FastAPI backend.

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
| `/map` | Melbourne map. Selecting an area opens its Child Health board; `/map?area=<SA2 code>&name=<name>` highlights an area |
| `/simulation` | Simulation |
| `/child-health` | Child Health board, parent and practitioner views (`?area=<SA2 code>&name=<name>`; otherwise the last area chosen on this device, or an area chooser) |
| `/where-to-live` | Where to live: compare areas for a family's priorities (`?focus=<home card key>`, `?anchor=<SA2 code>`) |

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
├── core/          # Configuration, response envelopes and readiness checks
├── loaders/       # Validated readers for approved runtime datasets
├── tests/         # Backend and deployment tests
├── main.py        # FastAPI routes and Lambda entry point
├── geography.py   # Boundary validation and spatial filtering
└── validation.py  # Analytical artefact validation and response projection
```

The frontend calls `/api` on its own origin and Vite proxies those requests to
the backend, so LAN clients do not need a separate API URL or permissive CORS
configuration. If Windows Firewall prompts for Python or Node.js access, allow
it only on Private networks.

### Approved data configuration

The services read only approved or explicitly bounded processed datasets. Copy
[`backend/.env.example`](backend/.env.example) into deployment-managed
environment configuration and provide the applicable dataset paths. Do not commit
the datasets or any secrets. The service deliberately returns an unavailable
or limited state when a source is not configured or cannot be validated.

Pattern-insight and prevention-opportunity data paths are intentionally not
configured in the deployment template. Those endpoints remain explicitly
unavailable until defensible, reviewed analytical outputs exist; deployment must
not imply that hypothetical findings have been validated.

VIF projections are exposed at their native SA2 geography. EPA historical data
is exposed only as monitoring-station context, and ACECQA/G-NAF data is exposed
only as an aggregate quality report; the service never returns address rows.

`GET /api/health` confirms that the FastAPI application is running.

### Backend tests

```bash
cd backend
source .venv/bin/activate
python -m pip install -r requirements-dev.txt
python -m pytest
```

### AWS Lambda deployment

The backend is deployed as a zip-based Python 3.13 Lambda behind an API
Gateway HTTP API. The preparation script installs Linux x86_64 wheels into the
generated package, so Docker is not required.

Prepare the approved runtime artefacts, including the bounded Iteration 2 profile and
suitability datasets, then deploy the prepared package with AWS SAM:

```bash
./backend/prepare_lambda_package.sh
sam deploy --template-file template.yaml --guided
```

The preparation script already assembles the deployable package with Linux x86_64
native wheels. Do not run a local `sam build` over that package, because it can
filter required native extension files on macOS.

The template allows the production origins `https://kinderprint.vercel.app`,
`https://kinderprint.me`, `https://www.kinderprint.me`, `https://vkinder.me`,
and `https://www.vkinder.me`. Override the corresponding template parameters
if these domains change.

Use the `ApiUrl` stack output as the Vercel `VITE_API_BASE_URL`, then redeploy
the frontend. The generated `backend/lambda_package/` and `.aws-sam/`
directories are local build artifacts and are not committed.
