# EDS Engine (Unified Event Delivery Engine)

**A resilient, multi-tenant webhook ingestion, delivery, and real-time observability platform — full-stack overview.**

---

## 1. Executive Summary

EDS Engine is a production-grade webhook infrastructure platform. Instead of treating webhook delivery as a single synchronous HTTP call, it treats it as a first-class distributed workflow with explicit guarantees around **ingestion, persistence, retries, replay, security, and telemetry**.

The platform has two halves that this documentation set covers together:

- **Backend** — FastAPI ingress, PostgreSQL system of record, RabbitMQ durable broker, Celery delivery workers, Redis Pub/Sub telemetry.
- **Frontend** — a React + Vite + TypeScript dashboard (dark-modern theme) for live logs, project management, secret generation, and DLQ recovery, secured by JWT rotation and fraud-based account locking.

See `ARCHITECTURE.md` for design rationale, `FLOW_DIAGRAMS.md` for visual system topology and sequence diagrams, and `FRONTEND.md` for the frontend component-level breakdown.

---

## 2. Problem Statement

### 2.1 The Legacy Approach

A naive, custom-built webhook receiver accepts a request and synchronously calls the downstream target inline. This fails predictably in production:

| Failure Mode | Root Cause | Consequence |
|---|---|---|
| Synchronous thread blocking | Handler waits on the downstream call before responding | Worker capacity collapses under load |
| Downstream timeout cascades | A slow/hanging target holds the handler open | One bad target starves capacity for every tenant |
| Unmonitored queue bloat | No real queue — just the OS socket backlog | Backpressure is invisible until the process falls over |
| No payload replay controls | Failed payloads are logged to text files or dropped | A downstream outage becomes permanent data loss |
| High polling overhead | Dashboards re-query the primary DB on a timer | Read load scales with open dashboards, not real activity |

### 2.2 How EDS Engine Solves This

- **Asynchronous decoupling** — ingress only authenticates, validates, persists, and acknowledges (`202 Accepted`). It never talks to the downstream target directly.
- **RabbitMQ + Celery** — durable, disk-backed queueing and independently scalable delivery workers with exponential-backoff retries.
- **Dead-Letter Queue (DLQ)** — retries that exhaust are quarantined, not dropped — fully inspectable and replayable by an operator.
- **Redis Pub/Sub fan-out** — dashboards and live logs are pushed in real time, eliminating PostgreSQL polling entirely.
- **JWT rotation + fraud lock** — the frontend silently refreshes access tokens and locks the account for 24 hours if a refresh token is reused (a classic token-theft signal).

---

## 3. Technology Matrix

| Layer | Technology | Primary Responsibility |
|---|---|---|
| API & Ingress | FastAPI (Python) | Auth, signature verification, validation, persistence, `202 Accepted` |
| Message Broker | RabbitMQ | Durable queueing of delivery tasks |
| Async Workers | Celery | Outbound delivery, retry/backoff state machine, DLQ hand-off |
| Telemetry Bus | Redis Pub/Sub | Fan-out of log/metric events to connected dashboards |
| System of Record | PostgreSQL | Companies, projects, events, logs, DLQ — multi-tenant scoped |
| UI Dashboard | React + Vite + TypeScript | Live logs, metrics, project CRUD, DLQ recovery, auth |
| State Management | Zustand | Global auth/session state (persisted) |
| Animation | Framer Motion | Page transitions, card stagger, micro-interactions |
| Runtime Orchestration | Docker Compose | Single-command local/prod-parity deployment |

---

## 4. Quick Start

### 4.1 Backend

```bash
# 1. Start RabbitMQ and Redis
docker run -d -p 5672:5672 -p 15672:15672 --name my-rabbitmq rabbitmq:3-management
docker run -d -p 6379:6379 --name my-redis redis:alpine

# 2. Backend server
cd backend
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
alembic upgrade head
python run.py

# 3. Celery worker (separate shell)
celery -A app.services.celery_worker.celery_app worker --loglevel=info
```

### 4.2 Frontend

```bash
cd frontend
npm install
npm run dev
```

Dev server runs on `http://localhost:5173`.

Environment variables (`frontend/.env`):

```env
VITE_API_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000
```

### 4.3 One-Command Full Stack (Recommended)

```bash
docker compose up -d --build
```

### 4.4 Default Port Mappings

| Service | URL | Purpose |
|---|---|---|
| Frontend Dashboard | `http://localhost:5173` (dev) / `3000` (container) | Live logs, metrics, DLQ, project management |
| FastAPI / Swagger | `http://localhost:8000/docs` | Interactive API documentation |
| RabbitMQ Management UI | `http://localhost:15672` | Queue depth, consumer, broker health |
| PostgreSQL | `localhost:5432` | Direct DB access for operators/migrations |
| Redis | `localhost:6379` | Pub/Sub telemetry bus |

---

## 5. Required Backend Endpoints (Frontend Integration Contract)

```
POST /auth/login                       → { access_token, company_id, company_name, email } + httpOnly refresh_token cookie
POST /auth/refresh                     → { access_token }  (403 + "block" message on token reuse)
GET  /v1/projects/                     → Project[]
POST /v1/projects/Create               → Project
GET  /api/dlq/messages?page=X&limit=20 → paginated DLQ entries
POST /api/dlq/{id}/replay              → re-enqueues a DLQ entry
WS   /ws/logs/{project_id}             → { id, timestamp, level, message, source?, metadata? }
```

CORS must allow the frontend origin with `credentials: true` (the refresh token travels as an httpOnly cookie).

---

## 6. Documentation Index

| File | Contents |
|---|---|
| `README.md` | This file — overview, quick start, tech matrix |
| `ARCHITECTURE.md` | Backend + frontend design rationale, security model, DLQ protocol |
| `FLOW_DIAGRAMS.md` | Mermaid diagrams — topology, webhook lifecycle, telemetry, auth flow |
| `FRONTEND.md` | Frontend structure, page-by-page breakdown, component contracts, theme |