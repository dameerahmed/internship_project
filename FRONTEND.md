# EDS Engine — Frontend Documentation

Page-by-page and component-by-component reference for the React + Vite + TypeScript dashboard.

---

## 1. Overview

The frontend is a single-page application built on **React 18 + Vite + TypeScript**, styled with a dark-modern theme, using **Zustand** for global state, **Axios** for API calls with interceptor-based token rotation, and **Framer Motion** for animation.

Design priorities:

- 🔒 **Security** — JWT rotation, 24h fraud-lock, secret auto-expiry
- ⚡ **Performance** — virtual scrolling for high-volume log streams, minimal re-renders
- 🎨 **UX** — consistent dark theme, purposeful motion, clear empty/error states
- 🏗️ **Scalability** — modular components, single source of truth for auth state

---

## 2. Directory Structure

```
frontend/
├── src/
│   ├── api/ (lib/)        # Axios client + interceptors
│   ├── components/        # Sidebar, dashboard cards, test widgets
│   ├── context/           # React Context (if used alongside Zustand)
│   ├── store/             # Zustand global state
│   ├── pages/             # Route-level views
│   └── styles.css         # Core styling + custom animations
├── index.html
└── vite.config.ts
```

Feature-organized component tree:

```
components/
├── Auth/
│   ├── LoginPage.tsx
│   └── AccountBlocked.tsx
├── Terminal/
│   └── LiveLogs.tsx
├── Security/
│   └── SecretGenerator.tsx
└── Dashboard/
    └── ProjectGrid.tsx
```

---

## 3. Pages

### 3.1 Dashboard Overview

Landing view after login. Contains:
- **Throughput metrics** — a live activity chart (SVG-based) showing success/failed/pending counts over the last 60 seconds.
- **Service status indicators** — live connection health for the database, Redis cache, and Celery workers.

### 3.2 Projects Hub

Grid of the tenant's projects with active/inactive status toggles and direct links into each project's detail view. Backed by `ProjectGrid`.

### 3.3 Project Settings & Configuration

- **Details** — edit project title, toggle active state.
- **Credentials** — generate API keys / secret keys via `SecretGenerator` (10-second visibility window).
- **Event type mapping** — map event types (e.g. `order.created`) to one or more forwarding target URLs (multi-destination routing).
- **Payload schema validation** — define expected payload keys and types (`string`, `number`, `boolean`) so the backend can auto-validate inbound payloads against `EventConfig`.
- **Data retention & purge policy** — configure log retention windows (e.g., purge after 7 days) or custom intervals/dates.

### 3.4 Live Logs Inspector

Full-screen `LiveLogs` terminal: live filtering, query matching, download-as-text, pause/resume.

### 3.5 Dead Letter Queue Hub

- **Failed reason** — surfaces the terminal error/status code (e.g., `504 Timeout`, `400 Bad Request`).
- **Bulk replay** — select multiple entries, replay in one action.
- **Manual payload copy** — copy the raw payload as a ready-to-run `curl` command for local debugging.

### 3.6 Auth Views

`LoginPage` and a (documented, not yet built) `RegisterPage`, both using the shared Framer Motion entrance/stagger pattern.

### 3.7 Account Blocked

Full-screen lockout view rendered whenever the session middleware detects a refresh-token reuse signal.

---

## 4. Core Components — Contracts & Behavior

### 4.1 `lib/api.ts` — Axios Client + Interceptors

Responsibilities:
- Attaches `Authorization: Bearer <access_token>` to every request from the auth store.
- On `401` → silently calls `POST /auth/refresh` (cookie-based), stores the new token, retries the original request once.
- On `403` with a "block" message → sets `isAccountBlocked = true`, logs out, redirects to `/account-blocked`.
- Surfaces network/server errors without leaking sensitive detail to the UI.

### 4.2 `store/useAuthStore.ts` — Zustand Auth Store

State: `accessToken`, `companyId`, `companyName`, `email`, `isAuthenticated`, `isAccountBlocked`, `isLoading`, `error`.
Actions: `setAuth(...)`, `setAccessToken(...)`, `setAccountBlocked(bool)`, `logout()`.
Persistence: persisted to `localStorage` for session continuity across reloads — the **access token itself is treated as short-lived and re-derivable via refresh**, while the **refresh token never touches `localStorage`** (httpOnly cookie only).

### 4.3 `components/Auth/LoginPage.tsx`

- Framer Motion page entrance (fade + scale) and card stagger.
- Show/hide password toggle, inline validation, loading spinner on submit.
- On success: store credentials via `useAuthStore`, redirect to `/dashboard`.
- On failure: inline error message (no sensitive backend detail surfaced).

### 4.4 `components/Auth/AccountBlocked.tsx`

- Emergency warning layout with a pulsing alert icon.
- Explains the 24-hour lock and lists security tips (e.g., rotate credentials, check for unfamiliar sessions).
- No action available to self-unlock — by design, this is a hard stop pending the lock window or operator intervention.

### 4.5 `components/Terminal/LiveLogs.tsx`

Props: `projectId`, `height`, `autoScroll`.

- Opens a WebSocket to `WS /ws/logs/{project_id}` on mount; auto-reconnects on disconnect.
- Virtual scrolling (keeps at most ~1000 logs resident) so the terminal stays smooth under high volume.
- Controls: pause/resume streaming, auto-scroll toggle, clear, download-as-`.txt`.
- Filters by level: `INFO`, `WARN`, `ERROR`, `DEBUG`, `SUCCESS`.
- Connection-status indicator (connected / reconnecting / disconnected).

### 4.6 `components/Security/SecretGenerator.tsx`

Props: `secretType`, `onSecretGenerated(secret)`, `title`.

- Generates a high-entropy 64-character secret on demand.
- Show/hide toggle, click-to-copy.
- 10-second visible countdown, after which the secret is cleared from component state — not just hidden, but removed from memory.
- Regeneration is required after expiry; there is no "reveal again" path.

### 4.7 `components/Dashboard/ProjectGrid.tsx`

Props: `onProjectSelect`, `onEdit`, `onDelete`.

- Lists projects as animated cards with active/inactive status badges.
- Empty state with a call-to-action when the tenant has no projects yet.
- Loading state while the project list is being fetched.

---

## 5. Theme

Dark-modern theme (Vercel/Linear-inspired), used consistently across every view:

| Token | Value | Use |
|---|---|---|
| `primary` | `#10b981` (Emerald-500) | Primary actions, success states |
| `secondary` | `#6366f1` (Indigo-500) | Secondary accents |
| `background` | `#020617` (Slate-950) | App background |
| `surface` | `#18181b` (Zinc-900) | Cards, panels |
| `text.primary` | `#f4f4f5` (Zinc-50) | Headlines, primary copy |
| `text.secondary` | `#a1a1aa` (Zinc-400) | Supporting copy |
| `text.muted` | `#71717a` (Zinc-500) | Captions, timestamps |

---

## 6. Security Checklist (Frontend)

- [x] Refresh token stored only in an httpOnly cookie — never in `localStorage` or component state
- [x] Access token attached per-request, refreshed silently on `401`
- [x] Generated secrets auto-cleared from memory after 10 seconds
- [x] Account locked for 24h on detected refresh-token reuse
- [x] CORS-dependent requests only include credentials for the configured API origin
- [x] Form input validated client-side before submission (server remains source of truth)
- [x] WebSocket streams use `ws://` in development / `wss://` in production

---

## 7. Backend Integration Contract

```
POST /auth/login                 (form-encoded) → access_token + refresh_token cookie
POST /auth/refresh                (cookie)      → access_token   |  403 + "block" on reuse
GET  /v1/projects/                (Bearer)       → Project[]
POST /v1/projects/Create          (Bearer)       → Project
GET  /api/dlq/messages?page=&limit=  (Bearer)    → paginated DLQ entries
POST /api/dlq/{id}/replay         (Bearer)       → re-enqueues into RabbitMQ
WS   /ws/logs/{project_id}        (Bearer)       → streamed log/metric events
```

CORS: allow the frontend origin explicitly, `credentials: true`, headers `Content-Type, Authorization`.