# EDS Engine — Flow Diagrams

Visual system topology and lifecycle sequences, covering both backend delivery and frontend session flows. Diagrams are written in [Mermaid](https://mermaid.js.org/) and render natively in GitHub/GitLab and most Markdown viewers.

---

## 1. High-Level System Architecture Topology

```mermaid
flowchart TB
    subgraph External["External Parties"]
        Sender["External Webhook Client<br/>(signs with HMAC/RSA)"]
        Target["Downstream Target Server<br/>(verifies X-Gateway-Signature)"]
    end

    subgraph Ingress["Ingress Boundary — FastAPI Gateway"]
        Auth["Tenant API Key Auth<br/>HTTP 401 on failure"]
        RateLimit["Redis Sliding-Window<br/>Rate Limiter — HTTP 429"]
        SigVerify["HMAC-SHA256 / RSA<br/>Signature Verification"]
        Validate["Pydantic Schema +<br/>EventConfig Payload Validation"]
    end

    subgraph Storage["Storage & Queues"]
        PG[("PostgreSQL<br/>Company / Project / Event / Log / DLQ<br/>tenant-scoped")]
        MQ[["RabbitMQ<br/>Durable Delivery Queue"]]
        Redis[("Redis<br/>Cache + Rate Limiter + Pub/Sub")]
    end

    subgraph Workers["Background Workers — Celery"]
        Deliver["Delivery Task<br/>+ Egress HMAC Signing"]
        Retry["Exponential Backoff<br/>Retry State Machine"]
        Failover["Failover Buffer<br/>(if RabbitMQ unreachable)"]
    end

    subgraph Frontend["React + Vite Dashboard"]
        AuthUI["Login / Token Rotation /<br/>Account Blocked (24h lock)"]
        Logs["Live Logs Terminal<br/>(WebSocket, virtual scroll)"]
        Metrics["Metrics Dashboard<br/>(WebSocket, Redis-fed)"]
        DLQUI["DLQ Inspection<br/>& Replay / Discard UI"]
        Projects["Project & Secret<br/>Management (10s auto-expiry)"]
    end

    Sender -->|"POST /v1/gateway"| Auth
    Auth --> RateLimit --> SigVerify --> Validate
    Validate -->|"persist event + log"| PG
    Validate -->|"HTTP 202 Accepted"| Sender
    Validate -->|"enqueue task"| MQ
    MQ -.->|"broker unreachable"| Failover

    MQ --> Deliver
    Deliver -->|"success"| Target
    Target -->|"2xx"| PG
    Deliver -->|"failure"| Retry
    Retry -->|"retry attempt"| Deliver
    Retry -->|"attempts exhausted"| PG

    Deliver -->|"publish outcome"| Redis
    Redis -->|"push"| Metrics
    Redis -->|"push"| Logs
    PG -->|"DLQ state"| DLQUI
    DLQUI -->|"POST /api/dlq/{id}/replay"| MQ

    AuthUI -->|"Bearer token"| Auth
    Projects -->|"CRUD"| PG

    style Ingress fill:#1e293b,stroke:#38bdf8,color:#f1f5f9
    style Storage fill:#1e293b,stroke:#a78bfa,color:#f1f5f9
    style Workers fill:#1e293b,stroke:#fb923c,color:#f1f5f9
    style Frontend fill:#1e293b,stroke:#34d399,color:#f1f5f9
    style External fill:#1e293b,stroke:#f87171,color:#f1f5f9
```

---

## 2. End-to-End Webhook Lifecycle Sequence

```mermaid
sequenceDiagram
    autonumber
    participant S as External Sender
    participant API as FastAPI Gateway
    participant PG as PostgreSQL
    participant MQ as RabbitMQ
    participant W as Celery Worker
    participant T as Downstream Target
    participant R as Redis Pub/Sub
    participant FE as React Frontend

    S->>API: POST /v1/gateway (signed payload)
    API->>API: Verify tenant API key
    API->>API: Verify HMAC-SHA256 / RSA signature
    API->>API: Rate limit + schema/payload validation
    API->>PG: Persist WebhookEvent + WebhookLog
    API-->>S: HTTP 202 Accepted

    API->>MQ: Enqueue delivery task
    MQ->>W: Deliver task to Celery worker

    W->>W: Sign outbound payload (secret_key HMAC)
    W->>T: POST payload + X-Gateway-Signature

    alt Delivery succeeds (2xx)
        T-->>W: 2xx response
        W->>PG: WebhookLog.status = SUCCESS
        W->>R: Publish success telemetry
        R-->>FE: Push metrics update (WebSocket)
    else Delivery fails
        T-->>W: Non-2xx / timeout / connection error
        W->>W: Increment attempt_number
        W->>W: Schedule retry (exponential backoff)
        W->>R: Publish failure telemetry

        loop Until max attempts or success
            W->>T: Retry delivery attempt
            alt Retry succeeds
                T-->>W: 2xx response
                W->>PG: WebhookLog.status = SUCCESS
            else Retries exhausted
                W->>PG: WebhookLog.status = DLQ (headers, payload, error log)
                W->>R: Publish DLQ telemetry
            end
        end
        R-->>FE: Push DLQ update (WebSocket)
    end

    Note over FE: Operator may later trigger<br/>POST /api/dlq/{id}/replay<br/>to re-enqueue via RabbitMQ
```

---

## 3. Real-Time Telemetry Fan-Out

```mermaid
sequenceDiagram
    participant W as Celery Worker
    participant R as Redis Pub/Sub
    participant API as FastAPI WebSocket Endpoint
    participant FE as React Frontend

    W->>R: Publish log event
    W->>R: Publish metrics snapshot (success/failure counts)
    R-->>API: Fan-out to all subscribed processes
    API-->>FE: Push over WS /ws/logs/{project_id}
    FE->>FE: Append to virtual-scrolled log list
    FE->>FE: Recompute Success Rate / Failure Ratio
```

*Design intent: live logs are conceptually one-directional (SSE-shaped) while dashboard metrics are conceptually bidirectional (WebSocket-shaped). The current implementation carries both over WebSocket for consistency — see `ARCHITECTURE.md` §2.5.*

---

## 4. Frontend Authentication & Token Rotation Flow

```mermaid
sequenceDiagram
    participant U as User
    participant FE as React App
    participant Store as Zustand Auth Store
    participant API as FastAPI /auth

    U->>FE: Submit login form
    FE->>API: POST /auth/login
    API-->>FE: access_token + httpOnly refresh_token cookie
    FE->>Store: setAuth(access_token, company_id, email)
    FE->>U: Redirect to /dashboard

    Note over FE,API: Later — any authenticated request
    FE->>API: Request with Bearer access_token
    API-->>FE: 401 Unauthorized (token expired)
    FE->>API: POST /auth/refresh (httpOnly cookie)
    alt Refresh valid
        API-->>FE: new access_token
        FE->>Store: setAccessToken(new_token)
        FE->>API: Retry original request
        API-->>FE: 200 OK
    else Refresh token reuse detected (theft signal)
        API-->>FE: 403 Forbidden + "block" message
        FE->>Store: setAccountBlocked(true) + logout()
        FE->>U: Redirect to /account-blocked (24h lock)
    end
```

---

## 5. Secret Generation & Auto-Expiry Flow

```mermaid
flowchart LR
    A["Operator clicks<br/>Generate Secret"] --> B["Backend/client generates<br/>high-entropy secret (64 chars)"]
    B --> C["Secret displayed<br/>+ 10s countdown starts"]
    C --> D{"Operator copies<br/>within 10s?"}
    D -->|Yes| E["Secret stored by operator<br/>outside the UI"]
    D -->|No| F["Secret cleared from<br/>component memory"]
    C --> G["Show / Hide toggle<br/>available during countdown"]
    F --> H["Operator must regenerate<br/>if needed"]
```

---

## 6. Diagram Fidelity Notes

- No diagram shows the ingress path making a direct, blocking call to a downstream target — every delivery goes through RabbitMQ → Celery, matching `ARCHITECTURE.md` §1.2.
- The DLQ replay loop closes back into **RabbitMQ**, not directly into the worker, so a replayed message re-enters the same durable queue and retry state machine as a fresh event.
- The telemetry diagram (§3) and its note make explicit that live-log and metrics traffic currently share one WebSocket transport, rather than implying a shipped SSE endpoint that doesn't yet exist in code.