# Cafeteria IQ

Analytics and unsupervised machine learning for cafeteria transactions: segment customers, explore clusters in 2D, mine association rules, and surface anomalies. The stack is a **React** dashboard, **Node.js / Express** API with **MongoDB**, and a **Python / Flask** ML service that powers clustering, dimensionality reduction, and market-basket analysis.

## Features

- **Transaction ingestion** — CSV upload and Mongo-backed storage; dashboards for trends, heatmaps, RFM-style stats.
- **Customer clustering** — K-Means, DBSCAN, hierarchical clustering, Gaussian mixture models, optional autoencoder-based clustering; algorithm comparison and metrics.
- **Dimensionality reduction** — PCA, t-SNE, and UMAP for interactive visualization.
- **Anomaly detection** — isolation forest on behavioral features.
- **Association rules** — Apriori-style mining for menu / basket insights.
- **Auth** — JWT-based login/register for protected routes.
- **Notebooks** — Optional offline workflow (EDA, preprocessing, clustering experiments, exports). See `backend/notebooks/README.md`.

## Architecture

```
┌─────────────────┐     REST (JWT)      ┌──────────────────┐     HTTP       ┌─────────────────┐
│  React (Vite)   │ ◄────────────────► │  Express API     │ ◄────────────► │  Flask ML       │
│  Port 3000      │                    │  Port 5000       │                │  Port 5001      │
└─────────────────┘                    └────────┬─────────┘                └─────────────────┘
                                              │
                                       MongoDB (transactions, users, …)
```

The API proxies ML-heavy work to the Flask service via `ML_SERVICE_URL`. The frontend talks only to the Express API (`VITE_API_URL`), not directly to Flask.

## Repository layout

| Path | Purpose |
|------|---------|
| `frontend/` | React 18, Vite, Tailwind, Plotly/Recharts/D3 |
| `backend/` | Express server, routes, Mongoose models, CSV upload |
| `backend/ml/` | Flask app, scikit-learn / TensorFlow pipelines |
| `backend/notebooks/` | Jupyter workflow for analysis and exports |
| `database/` | Seed scripts for MongoDB |

## Prerequisites

- **Node.js** 18+ (with npm)
- **Python** 3.10+ (3.11 recommended for ML stack)
- **MongoDB** — local instance or [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)

Optional: GPU not required; TensorFlow CPU build is listed in `backend/ml/requirements.txt`.

## Configuration

### Backend (`backend/.env`)

Copy `backend/.env.example` to `backend/.env` and set:

| Variable | Description |
|----------|-------------|
| `PORT` | Express port (default `5000`) |
| `MONGODB_URI` | Mongo connection string; database name often `cafeteria_iq` |
| `JWT_SECRET` | Secret for signing JWTs (use a long random string in production) |
| `ML_SERVICE_URL` | Flask ML base URL (default `http://localhost:5001`) |
| `NODE_ENV` | e.g. `development` |

### Frontend (`frontend/.env`)

Point the UI at your API:

```env
VITE_API_URL=http://localhost:5000/api
```

Adjust host/port if you deploy behind a reverse proxy.

### Flask / Mongo

Flask reads `MONGODB_URI` from `backend/.env` (loaded from `backend/ml` via parent `.env`). Default fallback in code is `mongodb://localhost:27017/cafeteria_iq`.

## Local setup

### 1. MongoDB

Run MongoDB locally or create a cluster on Atlas and copy the SRV connection string into `MONGODB_URI`.

### 2. Backend API

```bash
cd backend
cp .env.example .env
# Edit .env — set MONGODB_URI, JWT_SECRET, ML_SERVICE_URL

npm install
npm run seed        # optional: seed demo data (see package.json)
npm run dev         # or: npm start
```

Health check: `GET http://localhost:5000/api/health`

### 3. ML service (Flask)

Use a virtual environment:

```bash
cd backend/ml
python -m venv .venv

# Windows
.venv\Scripts\activate
# macOS / Linux
# source .venv/bin/activate

pip install -r requirements.txt
python app.py
```

Default ML health: `GET http://localhost:5001/ml/health` (if exposed).

### 4. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open the URL shown by Vite (default **http://localhost:3000**).

### Run order

1. MongoDB  
2. Flask ML (`5001`) — clustering/reduction requests fail without it  
3. Express (`5000`)  
4. React (`3000`)

## Scripts reference

**Backend** (`backend/package.json`)

| Script | Command |
|--------|---------|
| `npm run dev` | API with nodemon |
| `npm start` | Production-style start |
| `npm run seed` | Run `database/seed_data.js` |

**Frontend**

| Script | Command |
|--------|---------|
| `npm run dev` | Vite dev server |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |

## API overview

Base path: `/api` (combined with `VITE_API_URL` on the client).

| Area | Examples |
|------|----------|
| Health | `GET /api/health` |
| Auth | `/api/auth/login`, `/api/auth/register`, `/api/auth/me` |
| Data | `/api/transactions`, `/api/menu`, `/api/upload`, `/api/dashboard` |
| ML (proxied to Flask) | `/api/clustering/*`, `/api/reduce/*`, `/api/association/*` |

Exact payloads match `backend/src/routes/*.js` and `backend/ml/app.py`.

## Notebooks

Offline analysis lives under `backend/notebooks/`. Follow the numbered flow in `backend/notebooks/README.md` (ingestion → preprocessing → clustering → evaluation → anomalies → association rules → insights).

Generated artifacts are typically written under `backend/notebooks/outputs/` (CSV/JSON for reports).

## Tech stack summary

- **Frontend:** React, Vite, Tailwind CSS, TanStack Query, Axios, Socket.IO client, Plotly.js, Recharts, D3  
- **Backend:** Express, Mongoose, JWT, Multer, Socket.IO  
- **ML:** Flask, pandas, NumPy, scikit-learn, scipy, mlxtend, TensorFlow (autoencoder), umap-learn, matplotlib/seaborn  

## Security notes

- Never commit `.env` files; rotate `JWT_SECRET` for production.
- Use HTTPS and restrictive CORS in production.
- Scope MongoDB Atlas IP allowlists and use strong database users.

## License

Specify your license here (e.g. MIT) if you publish the repo publicly.

## Contributing

Issues and pull requests are welcome. For larger changes, open an issue first to align on scope.
