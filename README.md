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
