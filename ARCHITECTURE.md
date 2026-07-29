# EDS Engine — Architecture

Deep technical design, rationale, and security model for both the backend platform and the frontend dashboard.

---

## 1. Architectural Evolution

### 1.1 Phase 1 — Naive Synchronous Approach (Rejected)

Receive a webhook, synchronously POST it to the target, return the target's response code. Rejected because:

- **Thread starvation** — one slow target holds a worker for the full round trip, starving unrelated tenants.
- **Permanent data loss on crash** — the event exists only in memory for the duration of the request.
- **No retry semantics** — a downstream 500 has nowhere to go but back to the sender.
- **No observability** — success/failure is a single ephemeral HTTP response.

### 1.2 Phase 2 — Asynchronous, Event-Driven Pivot (Adopted)

Ingress and delivery are separated by a durable queue:

1. FastAPI validates and **persists** the event to PostgreSQL.
2. FastAPI publishes a delivery task to RabbitMQ and returns `202 Accepted` immediately — the sender is never blocked on downstream availability.
3. Celery workers consume tasks independently, with full retry/backoff and DLQ hand-off.

Because the event is durably written *before* the response is returned, a crash anywhere downstream of ingress cannot cause data loss.

---

## 2. Backend Components

### 2.1 FastAPI Gateway Layer

Responsibilities, all performed before anything is queued:

- **Schema validation** (Pydantic) — malformed bodies rejected with `422` before touching the database.
- **Authentication** — requests without a valid tenant API key rejected with `401` before signature work is attempted.
- **Rate limiting** (Redis sliding window) — tenants exceeding their configured limit receive `429`.
- **Signature verification** — HMAC-SHA256 (shared secret) or RSA public-key verification of inbound payloads.

Only requests that pass all checks are persisted and enqueued. The gateway is intentionally *not* where delivery executes — it is where trust and acceptance happen. On startup, `main.py` also runs a **recovery routine** that scans for `PENDING` (stuck) messages and re-queues them into RabbitMQ, preventing silent loss from a prior crash.

### 2.2 RabbitMQ & Celery Delivery Engine

RabbitMQ was chosen for **disk-backed durability** — messages in durable queues survive a broker restart, a hard requirement for the platform's zero-data-loss guarantee. Celery workers execute a retry state machine per delivery:

1. Attempt delivery to the target URL (with egress HMAC signature attached).
2. **Success** → mark `delivered`, record latency/status code, publish telemetry to Redis.
3. **Failure** (non-2xx, timeout, connection error) → increment attempt counter, schedule retry with **exponential backoff**, bounded by a max attempt count.
4. **Attempts exhausted** → route to the DLQ (Section 4).

Delivery throughput scales by adding Celery worker replicas — entirely independent of ingress capacity. A `failover.py` service also buffers incoming webhooks locally if RabbitMQ itself becomes unreachable, monitoring broker health and re-flushing once it recovers.

### 2.3 PostgreSQL Multi-Tenancy

Every tenant-owned table (`Project`, `WebhookEvent`, `WebhookLog`, `EventConfig`) carries both `company_id` and `project_id`. Every tenant-scoped query is constructed as:

```sql
SELECT * FROM webhook_events
WHERE company_id = :company_id
  AND project_id = :project_id
  AND ...
```

This is enforced at the query-construction layer (`dependencies.py`), not left to convention — application code cannot issue a tenant-scoped read/write without both identifiers, preventing cross-tenant leakage even under an application-layer bug.

### 2.4 Redis — Telemetry Backbone, Not Just a Cache

Redis serves three roles:

- **Caching** project auth configuration for fast lookups on every ingress request.
- **Rate limiting** via sliding-window counters (`rate_limiter.py`).
- **Pub/Sub fan-out** — when a Celery worker completes a delivery attempt, it publishes the outcome to a Redis channel (`pubsub_service.py`). Every backend process holding open WebSocket connections is subscribed and simply forwards the message to connected clients.

This keeps the dashboard responsive without database polling — PostgreSQL read load scales with actual write activity, not with the number of open dashboards.

### 2.5 Real-Time Telemetry — Design Intent vs. Current Implementation

Architecturally, the platform draws a distinction between two data shapes:

- **Live logs** are a one-directional, append-only stream — the server has something to say, the client only listens. This is naturally suited to **Server-Sent Events** (`text/event-stream`): plain HTTP, works through standard proxies, browser `EventSource` handles reconnection automatically.
- **Dashboard metrics** are bidirectional, high-frequency, and multi-subscriber — a client may need to send filter/subscription changes while continuously receiving updates. This is naturally suited to **WebSockets**.

**Current implementation note:** for operational consistency and lower implementation friction, both live logs and dashboard metrics currently ship over WebSocket transport (`WS /ws/logs/{project_id}`), backed by the same Redis Pub/Sub fan-out described above. A dedicated SSE endpoint for strictly one-way log streaming is a documented future evolution (see `README.md` future scope), not a currently shipped code path — this document intentionally does not claim SSE is implemented today.

### 2.6 Accurate Mathematical Dashboards

Metrics are computed directly from real delivery-attempt counts, with no mocked or fallback values:

```
Success Rate  = (Successful Deliveries / Total Attempts) * 100
Failure Ratio = (Failed Deliveries / Total Attempts) * 100
```

Recalculated on each incoming telemetry event and pushed via the WebSocket/Redis path — the displayed percentage always reflects the current state of `Total Attempts` in PostgreSQL.

---

## 3. Backend Security — HMAC & RSA

### 3.1 Ingress Verification

- **HMAC-SHA256** — sender and gateway share a secret key (`Project.secret_key`); the gateway recomputes the HMAC over the raw body and compares it in constant time against the signature header.
- **RSA public-key verification** — for senders that sign asymmetrically, the gateway holds the sender's public key and verifies the signature over the raw body, avoiding any shared-secret exchange.

Verification happens at the edge, before persistence — an invalid signature never results in a stored event or a queued task.

### 3.2 Egress Signing

Celery workers sign the outgoing payload with the project's secret at delivery time and attach it as `X-Gateway-Signature` (also referred to as `X-EDS-Signature`), so downstream target servers can independently verify authenticity and integrity.

---

## 4. Failure Handling & DLQ Protocol

1. **Retry exhaustion** — the Celery retry state machine attempts delivery with exponential backoff up to a configured maximum; every attempt (timestamp, response code/error, latency) is recorded in `WebhookLog`.
2. **Quarantine** — once retries are exhausted, the event moves to a dedicated DLQ state, storing the full original headers, raw payload, and accumulated error log.
3. **Operator inspection** — paginated: `GET /api/dlq/messages?page=X&limit=20`, scoped to the requesting tenant.
4. **Manual replay** — `POST /api/dlq/{id}/replay` extracts the original payload/headers, re-enqueues onto RabbitMQ, and clears the DLQ state once the replay task is confirmed enqueued.
5. **Bulk replay & discard** — operators can select multiple DLQ entries for one-click replay, or permanently discard poison messages that can never succeed.
6. **Real-time DLQ notification** — every DLQ state change is published to Redis Pub/Sub so the dashboard's DLQ view updates immediately, without a manual refresh.

A dead-letter workflow protects the platform from poison messages that would otherwise retry forever, while giving operators a recovery path that doesn't require reprocessing everything blindly.

---

## 5. Frontend Architecture

### 5.1 Structure

```
frontend/src/
├── lib/api.ts                  # Axios instance + interceptors (token refresh, block detection)
├── store/useAuthStore.ts       # Zustand global auth state (persisted)
├── utils/constants.ts          # API/WS endpoints, theme tokens, security settings
├── utils/validators.ts         # Form validation
├── components/Auth/            # LoginPage, AccountBlocked
├── components/Terminal/        # LiveLogs (WebSocket + virtual scrolling)
├── components/Security/        # SecretGenerator (10s auto-expiry)
├── components/Dashboard/       # ProjectGrid (CRUD)
└── pages/                      # Route-level views
```

Full component-by-component detail lives in `FRONTEND.md`.

### 5.2 Security Model

**Token rotation.** Every request attaches the current access token. On a `401`, the interceptor silently calls `POST /auth/refresh` (refresh token travels as an httpOnly cookie, never in `localStorage`), stores the new access token, and retries the original request — no user-visible interruption.

**Fraud / token-reuse detection.** If a refresh token is reused (a strong signal of theft/replay), the backend returns `403` with a "block" message. The interceptor catches this, sets `isAccountBlocked = true`, force-logs-out, and redirects to `/account-blocked` — a 24-hour lockout screen.

**Secret auto-expiry.** Generated API keys/secrets are displayed once, with a visible 10-second countdown, and are cleared from component state afterward — they cannot linger in memory or be screen-captured at leisure.

### 5.3 Why This Split Matters Operationally

The same reasoning that drives the backend's DLQ design drives the frontend's auth design: **failure should be visible and recoverable, never silent.** A stolen refresh token doesn't just get quietly rejected — it locks the account and tells the operator why. A failed delivery doesn't vanish — it lands in the DLQ with full context. Both patterns trade a small amount of friction for a large amount of trustworthiness.

---

## 6. Multi-Tenant Isolation, End to End

Tenancy is not bolted on at the API layer — it is structural:

- **Database**: every row is scoped by `company_id`/`project_id`.
- **Backend queries**: cannot execute without both identifiers supplied.
- **Frontend session**: `useAuthStore` carries `company_id` from login and scopes all subsequent API/WebSocket calls (e.g., `/ws/logs/{project_id}`) to the authenticated tenant.

This is the property that makes the platform viable as a shared, SaaS-style deployment rather than a single-tenant tool.

---

## 7. Deployment Topology

Runtime units, each independently scalable:

- PostgreSQL (system of record)
- Redis (cache + Pub/Sub broker)
- RabbitMQ (durable message broker)
- FastAPI backend (ingress/control plane)
- Celery worker(s) (delivery execution)
- React frontend, served via Nginx in production

All orchestrated via Docker Compose for development-to-production parity.