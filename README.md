# KinderPrint

Minimal project foundation with a React frontend and a FastAPI backend.

## Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend is available at `http://localhost:5173` by default.

## Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
uvicorn main:app --reload
```

The backend is available at `http://127.0.0.1:8000` by default.

### Approved data configuration

The Iteration 1 services read only approved, processed datasets. Copy
[`backend/.env.example`](backend/.env.example) into deployment-managed
environment configuration and provide the five dataset paths. Do not commit
the datasets or any secrets. The service deliberately returns an unavailable
or limited state when a source is not configured or cannot be validated.

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

Prepare only the five approved Iteration 1 runtime datasets, then build and
deploy with AWS SAM:

```bash
./backend/prepare_lambda_package.sh
sam build
sam deploy --guided --parameter-overrides FrontendOrigin=https://YOUR-PROJECT.vercel.app
```

Use the `ApiUrl` stack output as the Vercel `VITE_API_BASE_URL`, then redeploy
the frontend. The generated `backend/lambda_package/` and `.aws-sam/`
directories are local build artifacts and are not committed.
