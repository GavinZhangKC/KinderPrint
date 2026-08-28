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
