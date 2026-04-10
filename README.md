# WattWatch ATL

Monorepo with a React (Vite) frontend and a FastAPI backend.

## Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

Copy `backend/.env.example` to `backend/.env` and set `ELECTRICITY_MAPS_KEY` for live carbon intensity data; otherwise the API returns mock values.

## Frontend

```bash
cd frontend
npm install
npm run dev
```
