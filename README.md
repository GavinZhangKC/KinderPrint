# KinderPrint

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

## Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
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

Prepare the approved Iteration 1 artefacts and bounded Iteration 2 runtime datasets, then build and
deploy with AWS SAM:

```bash
./backend/prepare_lambda_package.sh
sam build
sam deploy --guided
```

The template allows the production origins `https://kinderprint.vercel.app`,
`https://kinderprint.me`, `https://www.kinderprint.me`, `https://vkinder.me`,
and `https://www.vkinder.me`. Override the corresponding template parameters
if these domains change.

Use the `ApiUrl` stack output as the Vercel `VITE_API_BASE_URL`, then redeploy
the frontend. The generated `backend/lambda_package/` and `.aws-sam/`
directories are local build artifacts and are not committed.
