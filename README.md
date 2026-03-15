# Kirana Kart — Policy Governance Platform

**Version:** 3.3.0
**Stack:** FastAPI · React 19 · PostgreSQL · Weaviate · Redis · Celery · OpenAI · Docker

---

## What Is This?

Kirana Kart is an **AI-powered policy governance and automated ticket-resolution engine** for e-commerce / quick-commerce customer support. It manages the full lifecycle of business rules — from human-authored documents through LLM compilation all the way to vectorized, published policy versions that power automated ticket resolution.

The platform handles ~13,500 support tickets against 25,000 customers / 100,000 orders, with ₹82.8 Crore in annual refund exposure governed by versioned, auditable policies.

---

## Table of Contents

1. [Architecture](#architecture)
2. [Quick Start](#quick-start)
3. [Authentication & Access Control](#authentication--access-control)
4. [OAuth Setup](#oauth-setup)
5. [Services](#services)
6. [Module Overview](#module-overview)
7. [Policy Document Lifecycle](#policy-document-lifecycle)
8. [Processing Pipeline](#processing-pipeline)
9. [Database Schema](#database-schema)
10. [API Reference](#api-reference)
11. [Environment Variables](#environment-variables)
12. [Common Commands](#common-commands)
13. [Scripts & Data Generation](#scripts--data-generation)
14. [Development Notes](#development-notes)
15. [Troubleshooting](#troubleshooting)
16. [Production Checklist](#production-checklist)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        React UI  :5173                              │
│   JWT auth · per-module RBAC · OAuth (GitHub / Google / Microsoft)  │
└──────────────────────┬──────────────────────────────────────────────┘
                       │  REST / Axios + Authorization: Bearer <token>
         ┌─────────────┴──────────────────────┐
         ▼                                    ▼
┌──────────────────┐                ┌──────────────────────┐
│  Governance API  │                │     Ingest API       │
│     :8001        │                │       :8000          │
│                  │                │                      │
│ /auth/*          │                │ POST /ingest         │
│ /users/*         │                │ (L1 5-phase pipeline)│
│ /taxonomy/*      │                └──────────┬───────────┘
│ /kb/*            │                           │ Redis Streams
│ /compiler/*      │                           ▼
│ /vectorization/* │                ┌──────────────────────┐
│ /simulation/*    │                │    worker-poll       │
│ /analytics/*     │                │  (stream consumer)   │
│ /bi-agent/*      │                └──────────┬───────────┘
│ /system/*        │                           │ Celery tasks
└──────┬───────────┘                           ▼
       │                            ┌──────────────────────┐
       ▼                            │   worker-celery      │
┌──────────────────────────┐        │   (4-stage LLM       │
│  PostgreSQL  :5432        │        │    pipeline)         │
│  schema: kirana_kart     │        └──────────────────────┘
│  44 tables · ~14K tickets│
└──────────────────────────┘
       │
┌──────┴──────┐   ┌──────────────────┐
│   Redis     │   │    Weaviate      │
│   :6379     │   │    :8080         │
│  Streams +  │   │  Vector search   │
│  Celery     │   │  (KBRule class)  │
└─────────────┘   └──────────────────┘
```

---

## Quick Start

### Prerequisites

- Docker Desktop running
- An OpenAI API key

### 1. Clone

```bash
git clone <your-repo-url> kirana_kart_final
cd kirana_kart_final
```

### 2. Set your OpenAI key

```bash
echo 'LLM_API_KEY=sk-...' >> kirana_kart/.env
```

### 3. Start all 8 containers

```bash
docker-compose up --build -d
```

| Container | Port | Description |
|---|---|---|
| `governance` | 8001 | Governance API (FastAPI) |
| `ingest` | 8000 | Ingest API (FastAPI) |
| `postgres` | 5432 | PostgreSQL 14 |
| `redis` | 6379 | Redis 7 |
| `weaviate` | 8080 | Weaviate vector DB |
| `worker-poll` | — | Redis stream consumer |
| `worker-celery` | — | Celery LLM pipeline worker |
| `ui` | 5173 | React admin console |

### 4. Open the console

Go to **http://localhost:5173** and sign in with the bootstrap super-admin:

```
Email:    admin@kirana.local
Password: REDACTED
```

> Change this password immediately after first login.

---

## Authentication & Access Control

### Sign-in methods

| Method | How it works |
|---|---|
| **Email + password** | Standard account — bcrypt-hashed password stored in DB |
| **GitHub OAuth** | One-click — GitHub consent screen → JWT issued |
| **Google OAuth** | One-click — Google consent screen → JWT issued |
| **Microsoft OAuth** | One-click — Microsoft consent screen → JWT issued |

OAuth users never have a password stored in the database (`password_hash = NULL`). They authenticate entirely through the provider's consent screen on every sign-in.

New accounts (email signup or first-time OAuth login) automatically receive **viewer** access on all modules. A super-admin can promote permissions from the `/users` page.

### JWT token flow

```
POST /auth/login ──► { access_token (60 min), refresh_token (30 days) }
                              │
                  Axios injects: Authorization: Bearer <token>
                              │
               On 401 ──► auto-refresh ──► retry original request
               On refresh fail ──► logout ──► redirect /login
```

### RBAC — per-user, per-module

Every user has three independent permission flags per module:

| Flag | What it unlocks |
|---|---|
| `view` | Read-only — list, get, search, export |
| `edit` | Create and update operations |
| `admin` | Publish, rollback, vectorize, delete |

**Modules:** `dashboard` · `tickets` · `taxonomy` · `knowledgeBase` · `policy` · `customers` · `analytics` · `system` · `biAgent` · `sandbox`

`is_super_admin` bypasses all permission checks entirely.

Permission management lives at **http://localhost:5173/users** (requires `system.admin`).

### Auth database tables

| Table | Purpose |
|---|---|
| `kirana_kart.users` | User accounts (email/password + OAuth provider fields) |
| `kirana_kart.user_permissions` | Per-user, per-module `can_view / can_edit / can_admin` |
| `kirana_kart.refresh_tokens` | SHA-256 hashed refresh tokens with expiry |

---

## OAuth Setup

This is a one-time task done by whoever deploys the system. End users just click the button and see the provider's standard consent screen — no setup on their part.

After updating credentials in `docker-compose.yml`, apply them with:
```bash
docker-compose up -d governance
```

### GitHub

1. github.com → Settings → Developer settings → OAuth Apps → **New OAuth App**
2. Set:
   - Homepage URL: `http://localhost:5173`
   - Authorization callback URL: `http://localhost:8001/auth/oauth/github/callback`
3. Generate a Client Secret (shown once — copy immediately)
4. In `docker-compose.yml`:
   ```yaml
   GITHUB_CLIENT_ID: "your-client-id"
   GITHUB_CLIENT_SECRET: "your-client-secret"
   ```

### Google

1. console.cloud.google.com → APIs & Services → Credentials → **Create OAuth 2.0 Client ID**
2. Application type: **Web application**
3. Authorized redirect URI: `http://localhost:8001/auth/oauth/google/callback`
4. In `docker-compose.yml`:
   ```yaml
   GOOGLE_CLIENT_ID: "your-client-id"
   GOOGLE_CLIENT_SECRET: "your-client-secret"
   ```
> While in "Testing" mode only whitelisted accounts can sign in. Go to **OAuth consent screen → Publish App** to open it to everyone.

### Microsoft

1. portal.azure.com → App registrations → **New registration**
2. Supported account types: **Accounts in any org + personal Microsoft accounts**
3. Redirect URI (Web): `http://localhost:8001/auth/oauth/microsoft/callback`
4. Certificates & secrets → **New client secret** → copy the **Value**
5. In `docker-compose.yml`:
   ```yaml
   MICROSOFT_CLIENT_ID: "your-application-client-id"
   MICROSOFT_CLIENT_SECRET: "your-client-secret-value"
   ```

---

## Services

### `governance` — Admin Control Plane (port 8001)

FastAPI application powering the admin console. Handles auth, RBAC, tickets, taxonomy, knowledge base, policy versioning, analytics, BI agent, and system health.

Entry: `kirana_kart/app/admin/main.py`

### `ingest` — Ticket Ingestion (port 8000)

FastAPI application accepting tickets via `POST /ingest`. Runs a 5-phase synchronous pipeline before pushing to Redis Streams for async LLM processing.

Entry: `kirana_kart/main.py`

### `worker-poll` — Stream Consumer

Continuously polls Redis priority streams (`P1_CRITICAL` → `P4_LOW`) and dispatches Celery tasks.

### `worker-celery` — LLM Pipeline Worker

4-stage LLM pipeline per ticket:

| Stage | Model | Purpose |
|---|---|---|
| Stage 0 — Classifier | gpt-4o-mini | Issue classification + L1/L2 taxonomy mapping |
| Stage 1 — Evaluator | gpt-4.1 | Business logic, fraud checks, refund calculation |
| Stage 2 — Validator | o3-mini | Cross-validation, discrepancy detection, override logic |
| Stage 3 — Responder | gpt-4o | Customer-facing response generation |

### `postgres` — Database (port 5432)

PostgreSQL 14 with `kirana_kart` schema containing 44 tables. Auto-initialized from `kirana_kart/exports/*.sql` on first start.

### `redis` — Cache & Broker (port 6379)

- `db 0` — App cache + Redis Streams (ticket queues)
- `db 1` — Celery broker + result backend

### `weaviate` — Vector DB (port 8080)

Weaviate 1.29.4. Single class `KBRule` — vectorized policy rules for semantic retrieval during LLM evaluation. Embedding model: `text-embedding-3-large` (3072 dims).

### `ui` — Frontend (port 5173)

React 19 + TypeScript + Vite. In production, build with `npm run build` and serve `dist/`.

---

## Module Overview

| Module | Route | Description |
|---|---|---|
| Dashboard | `/dashboard` | KPIs — tickets, CSAT, SLA breach rate, refund totals, daily trends |
| Tickets | `/tickets` | Paginated list, full-text search, LLM execution trace per ticket |
| Sandbox | `/sandbox` | Submit test tickets without affecting production data |
| Taxonomy | `/taxonomy` | Issue code hierarchy — draft, version, publish, rollback, vectorize |
| Knowledge Base | `/knowledge-base` | Upload docs, compile via LLM, vectorize, publish versions |
| Policy | `/policy` | Rule registry, simulation A/B tests, shadow policy mode |
| Customers | `/customers` | Profiles, order history, churn risk |
| Analytics | `/analytics` | Evaluation Matrix — 16K+ tickets with LLM output analysis |
| BI Agent | `/bi-agent` | Natural language → SQL → streamed analyst-style response |
| System | `/system` | Service health, DB / Redis / Weaviate status |
| Users | `/users` | User table + per-module permission editor (system.admin only) |

---

## Policy Document Lifecycle

```
1. Author writes business rules in Markdown / PDF / DOCX
        ↓
2. Upload  →  POST /kb/upload
        ↓
3. Compile  →  POST /compiler/compile/{version}
   (LLM extracts structured rules into rule_registry)
        ↓
4. Simulate  →  POST /simulation/run
   (compare candidate vs baseline on sample tickets)
        ↓
5. Shadow  →  POST /shadow/enable {"shadow_version": "v1.1.0"}
   (run in parallel with live, capture divergence rate)
        ↓
6. Review  →  GET /shadow/stats
        ↓
7. Publish  →  POST /kb/publish {"version_label": "v1.1.0"}
   (atomic publish + vector job queued automatically)
        ↓
8. Background worker vectorizes rules into Weaviate
        ↓
9. Live — agents query Weaviate at resolution time
```

---

## Processing Pipeline

### L1 Ingest (5 phases)

```
POST /ingest
  ├─ Phase 1: Validator       8 schema + constraint checks
  ├─ Phase 2: Deduplicator    Redis cache + rate limiting
  ├─ Phase 3: Handler         Intent matching, issue routing
  ├─ Phase 4: Enricher        Metadata enrichment
  └─ Phase 5: Dispatcher      Priority-weighted Redis stream push
```

### Priority Queue

| Stream | Priority | Use Case |
|---|---|---|
| `P1_CRITICAL` | Highest | VIP / high-value orders |
| `P2_HIGH` | High | Standard refund cases |
| `P3_MEDIUM` | Medium | Info / tracking requests |
| `P4_LOW` | Low | Batch / bulk processing |

---

## Database Schema

All tables are in the `kirana_kart` PostgreSQL schema.

### Operational

| Table | ~Rows | Description |
|---|---|---|
| `fdraw` | 13,900 | Raw inbound tickets |
| `customers` | 25,000 | Customer master (segment, churn risk, tier) |
| `orders` | 100,000 | Order records |
| `refunds` | 4,500 | Processed refunds |
| `delivery_events` | 600,000 | Delivery tracking events |
| `conversations` | 13,500 | Conversation sessions |
| `csat_responses` | 4,700 | Customer satisfaction ratings |

### LLM Execution

| Table | Description |
|---|---|
| `ticket_execution_summary` | Final processed result per ticket |
| `llm_output_1` | Stage 0 — issue classification |
| `llm_output_2` | Stage 1 — business logic evaluation |
| `llm_output_3` | Stage 2 — validation + final decision |
| `execution_metrics` | Duration (ms) + token counts per stage |
| `execution_audit_log` | Immutable processing audit trail |

### Policy & Rules

| Table | Description |
|---|---|
| `policy_versions` | Immutable policy snapshots |
| `rule_registry` | Compiled rules (conditions, actions, constraints) |
| `master_action_codes` | 28 action codes (REFUND_*, REJECT_*, ESCALATE_*, etc.) |
| `policy_shadow_results` | Shadow vs active comparison results |

### Knowledge Base & Taxonomy

| Table | Description |
|---|---|
| `issue_taxonomy` | Live issue taxonomy (L1 → L2) |
| `issue_taxonomy_versions` | Immutable taxonomy snapshots |
| `knowledge_base_versions` | Published KB snapshots |
| `kb_vector_jobs` | Vectorization job queue |

### Auth (created on first startup)

| Table | Description |
|---|---|
| `users` | User accounts — email, password_hash, OAuth fields, is_super_admin |
| `user_permissions` | Per-user per-module can_view / can_edit / can_admin |
| `refresh_tokens` | Hashed refresh tokens with expiry timestamps |

---

## API Reference

### Auth (`/auth`)

| Method | Endpoint | Description |
|---|---|---|
| POST | `/auth/signup` | Register — gets viewer access automatically |
| POST | `/auth/login` | Email + password login |
| POST | `/auth/refresh` | Rotate refresh token |
| POST | `/auth/logout` | Invalidate refresh token |
| GET | `/auth/me` | Current user profile + permissions |
| GET | `/auth/oauth/github` | Redirect to GitHub consent |
| GET | `/auth/oauth/google` | Redirect to Google consent |
| GET | `/auth/oauth/microsoft` | Redirect to Microsoft consent |

### Users (`/users`) — requires `system.admin`

| Method | Endpoint | Description |
|---|---|---|
| GET | `/users` | List all users with permissions |
| PATCH | `/users/{id}/permissions` | Bulk update module permissions |
| PATCH | `/users/{id}/activate` | Reactivate a deactivated user |
| PATCH | `/users/{id}/deactivate` | Deactivate a user |
| DELETE | `/users/{id}` | Delete a user |

### Governance (key routes)

| Method | Endpoint | Auth required | Description |
|---|---|---|---|
| GET | `/health` | None | Liveness check |
| GET | `/system-status` | `system.view` | DB + Redis + Weaviate status |
| GET | `/tickets` | `tickets.view` | Paginated ticket list |
| GET | `/tickets/{id}` | `tickets.view` | Ticket detail + LLM trace |
| GET | `/customers` | `customers.view` | Customer list |
| GET | `/taxonomy` | `taxonomy.view` | Issue taxonomy tree |
| POST | `/taxonomy/publish` | `taxonomy.admin` | Publish a taxonomy version |
| POST | `/kb/upload` | `knowledgeBase.edit` | Upload a policy document |
| POST | `/compiler/compile/{v}` | `knowledgeBase.admin` | Compile rules via LLM |
| POST | `/kb/publish` | `knowledgeBase.admin` | Publish KB version |
| POST | `/shadow/enable` | `policy.admin` | Enable shadow policy mode |
| GET | `/analytics/summary` | `analytics.view` | KPI summary |
| GET | `/analytics/evaluations` | `analytics.view` | Evaluation Matrix (paginated) |
| POST | `/bi-agent/query` | `biAgent.view` | SSE — stream BI response |

Full interactive docs: **http://localhost:8001/docs**

### Ingest API (port 8000)

| Method | Endpoint | Description |
|---|---|---|
| POST | `/ingest` | Submit a ticket |
| GET | `/health` | Liveness check |

**Sample payload:**
```json
{
  "ticket_id": "12345",
  "order_id": "ORD20260314001",
  "customer_id": "CUST001234",
  "org": "zomato",
  "module": "quality",
  "channel": "email",
  "subject": "Missing item in my order",
  "description": "I ordered 3 items but received 2.",
  "source": "api"
}
```

---

## Environment Variables

Set in `docker-compose.yml` for Docker. For local dev, use `kirana_kart/.env`.

### Core

| Variable | Default | Description |
|---|---|---|
| `DB_HOST` | `postgres` | PostgreSQL host |
| `DB_NAME` | `orgintelligence` | Database name |
| `DB_USER` | `orguser` | DB username |
| `DB_PASSWORD` | `REDACTED` | DB password |
| `REDIS_URL` | `redis://redis:6379/0` | Redis connection |
| `WEAVIATE_HOST` | `weaviate` | Weaviate host |

### Auth & JWT

| Variable | Default | Description |
|---|---|---|
| `JWT_SECRET_KEY` | *(change me)* | JWT signing secret — use a long random string in production |
| `JWT_ACCESS_EXPIRE_MINUTES` | `60` | Access token lifetime |
| `JWT_REFRESH_EXPIRE_DAYS` | `30` | Refresh token lifetime |
| `BOOTSTRAP_ADMIN_EMAIL` | `admin@kirana.local` | Super-admin created on first startup |
| `BOOTSTRAP_ADMIN_PASSWORD` | `REDACTED` | Change this |
| `BOOTSTRAP_ADMIN_NAME` | `Super Admin` | Display name |

### OAuth

| Variable | Description |
|---|---|
| `OAUTH_REDIRECT_BASE_URL` | Governance API base URL for OAuth callbacks |
| `FRONTEND_URL` | Frontend URL — OAuth success redirects here |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub OAuth app credentials |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth app credentials |
| `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` | Microsoft app credentials |

### LLM

| Variable | Default | Description |
|---|---|---|
| `LLM_API_BASE_URL` | `https://api.openai.com/v1` | LLM provider |
| `LLM_API_KEY` | *(set in .env)* | OpenAI API key |
| `MODEL1` | `gpt-4o-mini` | Stage 0 — classifier |
| `MODEL2` | `gpt-4.1` | Stage 1 — evaluator |
| `MODEL3` | `o3-mini` | Stage 2 — validator |
| `MODEL4` | `gpt-4o` | Stage 3 — responder |
| `EMBEDDING_MODEL` | `text-embedding-3-large` | Embedding model |

### Observability

| Variable | Default | Description |
|---|---|---|
| `LOG_FORMAT` | `text` | `json` for production |
| `LOG_LEVEL` | `INFO` | Log level |
| `PROMETHEUS_ENABLED` | `false` | Expose `/metrics` |
| `OTLP_ENDPOINT` | *(empty)* | OpenTelemetry collector gRPC address |

---

## Common Commands

```bash
# Start everything
docker-compose up --build -d

# Live logs for a service
docker-compose logs -f governance
docker-compose logs -f worker-celery

# Restart governance after config changes (e.g. OAuth credentials)
docker-compose up -d governance

# Stop everything
docker-compose down

# Stop and wipe all data volumes (fresh start)
docker-compose down -v

# Rebuild a single service
docker-compose up --build -d governance
```

---

## Scripts & Data Generation

All scripts are in `kirana_kart/scripts/`. Run inside the governance container:

```bash
docker exec kirana_kart_final-governance-1 python3 /app/scripts/<script>.py
```

| Script | Description |
|---|---|
| `generate_sim_data.py` | Generate synthetic customers, orders, tickets, refunds, CSAT. Flags: `--customers 25000 --orders 100000 --seed 42 --mode reset\|append` |
| `backfill_eval_data.py` | Populate `llm_output_1/2/3` and `execution_metrics`. Idempotent |
| `simulate_tickets.py` | Run policy simulation against a ticket set |
| `test_cardinal.py` | End-to-end ingestion pipeline integration test |
| `test_endpoints.py` | Full API endpoint test suite |
| `run_vectorization.py` | Process all pending vector jobs |

### Seed a fresh database

```bash
# Generate 25k customers, 100k orders, ~13.5k tickets
docker exec kirana_kart_final-governance-1 \
  python3 /app/scripts/generate_sim_data.py \
  --customers 25000 --orders 100000 --seed 42 --mode reset

# Backfill LLM evaluation data
docker exec kirana_kart_final-governance-1 \
  python3 /app/scripts/backfill_eval_data.py
```

**Generated data profile:**

| Table | Rows |
|---|---|
| customers | 25,000 |
| orders | 100,000 |
| delivery_events | ~600,000 |
| fdraw (tickets) | ~13,500 |
| refunds | ~4,500 |
| csat_responses | ~4,700 |

---

## Development Notes

### Run backends locally (no Docker)

```bash
# Governance
cd kirana_kart
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.admin.main:app --port 8001 --reload

# Ingest
uvicorn main:app --port 8000 --reload

# Celery worker
celery -A app.l4_agents.worker worker --loglevel=info
```

### Run frontend locally

```bash
cd kirana_kart_ui
npm install
npm run dev       # http://localhost:5173
npm run build     # production build → dist/
```

### Project structure

```
kirana_kart_final/
├── docker-compose.yml
├── kirana_kart/                        # Backend
│   ├── requirements.txt
│   ├── .env
│   ├── app/
│   │   ├── config.py                   # All settings (pydantic-settings)
│   │   ├── admin/
│   │   │   ├── main.py                 # FastAPI app + startup hooks
│   │   │   ├── db.py                   # SQLAlchemy engine + session
│   │   │   ├── routes/
│   │   │   │   ├── auth_routes.py      # /auth/* — login, signup, OAuth
│   │   │   │   ├── user_management.py  # /users/* — CRUD + permissions
│   │   │   │   ├── taxonomy.py
│   │   │   │   ├── tickets.py
│   │   │   │   ├── customers.py
│   │   │   │   ├── analytics.py
│   │   │   │   ├── system.py
│   │   │   │   └── bi_agent.py
│   │   │   └── services/
│   │   │       ├── auth_service.py     # JWT, bcrypt, RBAC dependencies
│   │   │       └── oauth_service.py    # GitHub / Google / Microsoft
│   │   ├── l1_ingestion/               # KB upload + registry
│   │   ├── l2_cardinal/                # 5-phase ingest pipeline
│   │   ├── l4_agents/                  # Celery worker + tasks
│   │   └── l45_ml_platform/            # Compiler, vectorization, simulation
│   └── exports/
│       └── *.sql                       # DB seed (auto-loaded by postgres)
│
└── kirana_kart_ui/                     # Frontend
    ├── src/
    │   ├── stores/
    │   │   └── auth.store.ts           # Zustand: user, tokens
    │   ├── api/
    │   │   ├── clients.ts              # Axios instances
    │   │   ├── interceptors.ts         # Bearer + 401→refresh→retry
    │   │   └── governance/
    │   │       ├── auth.api.ts
    │   │       └── users.api.ts
    │   ├── lib/
    │   │   └── access.ts               # hasPermission(user, module, perm)
    │   ├── pages/
    │   │   ├── auth/
    │   │   │   ├── LoginPage.tsx
    │   │   │   ├── SignupPage.tsx
    │   │   │   └── OAuthCallbackPage.tsx
    │   │   └── users/
    │   │       └── UserManagementPage.tsx
    │   ├── components/layout/
    │   │   ├── AuthGuard.tsx
    │   │   ├── AccessGuard.tsx
    │   │   ├── AppShell.tsx
    │   │   └── Sidebar.tsx
    │   └── router/index.tsx
    └── vite.config.ts
```

---

## Troubleshooting

**"Login failed" on the login page**
The governance container isn't reachable or took too long to start. Run `docker-compose logs governance` to check.

**Bootstrap admin not created (governance logs show error)**
Usually a `bcrypt` version mismatch. Confirm `requirements.txt` has `bcrypt>=3.2.0,<4.0.0` (already set by default).

**OAuth button returns "invalid_client"**
The `CLIENT_ID` / `CLIENT_SECRET` in `docker-compose.yml` are wrong or still set to the placeholder. Double-check and restart governance.

**"Permission denied" after logging in**
Your account has no permissions on that module. Ask a super-admin to grant access via the `/users` page.

**`relation kirana_kart.xxx does not exist`**
The DB seed SQL was not loaded. This happens when the `pgdata` volume already exists from a previous run. Run `docker-compose down -v` to reset volumes, then `docker-compose up -d`.

**Weaviate returns connection errors**
Weaviate needs ~10 seconds to be ready after the container starts. The governance service retries automatically — wait a moment and check logs again.

**Embedding count mismatch (vectorization fails)**
OpenAI rate-limit issue. Reduce `PROCESS_BATCH_SIZE` in your `.env`.

---

## Production Checklist

- [ ] Set a strong random `JWT_SECRET_KEY` (32+ characters)
- [ ] Change `BOOTSTRAP_ADMIN_PASSWORD` immediately after first login
- [ ] Set `LOG_FORMAT: json` for structured logging
- [ ] Configure `OTLP_ENDPOINT` for OpenTelemetry traces
- [ ] Set `PROMETHEUS_ENABLED: "true"` and scrape `/metrics`
- [ ] Use managed PostgreSQL and Redis instead of Docker containers
- [ ] Set `OAUTH_REDIRECT_BASE_URL` and `FRONTEND_URL` to your production domain
- [ ] Register OAuth apps with production callback URLs
- [ ] Restrict CORS in `app/admin/main.py` to your production frontend domain
- [ ] Rotate the OpenAI API key and set via secret manager, not plain env
