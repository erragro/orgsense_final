# Kirana Kart — Governance Control Plane (Backend)

**Stack:** FastAPI · PostgreSQL · Weaviate · OpenAI · Redis · Celery
**Python:** 3.12+
**Auth:** JWT (python-jose) + bcrypt (passlib) + OAuth 2.0

---

## What Is This?

The governance control plane is a **FastAPI backend** that manages the full lifecycle of business rules for a quick-commerce operation. It handles:

- **Authentication & RBAC** — JWT-based auth, per-user per-module permissions, OAuth via GitHub/Google/Microsoft
- **Taxonomy management** — Issue code hierarchy with draft → version → publish → rollback workflow
- **Knowledge base** — Raw policy document upload, LLM compilation into structured rules, vectorization
- **Ticket processing** — 5-phase ingest pipeline, 4-stage LLM resolution, Celery workers
- **BI Agent** — Natural language SQL queries over the read-only `bi_readonly` role
- **Observability** — Prometheus metrics, structured JSON logging, correlation IDs

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  FastAPI App  (port 8001)                    │
│                  app/admin/main.py                           │
└──────────────────────────┬──────────────────────────────────┘
                           │  Registers routers
     ┌─────────────────────┼──────────────────────────────────┐
     │                     │                                   │
     ▼                     ▼                                   ▼
┌─────────┐        ┌──────────────┐               ┌─────────────────┐
│  /auth  │        │  /taxonomy   │               │  /kb  /compiler │
│  /users │        │  /tickets    │               │  /vectorization │
│  /bi    │        │  /customers  │               │  /simulation    │
│  /system│        │  /analytics  │               │  /shadow        │
└─────────┘        └──────────────┘               └─────────────────┘
     │                                                     │
     ▼                                                     ▼
┌──────────────┐                              ┌──────────────────────┐
│  PostgreSQL  │                              │       Weaviate       │
│  kirana_kart │                              │  Vector search (KB)  │
└──────────────┘                              └──────────────────────┘
                   ┌──────────────┐
                   │     Redis    │
                   │  Celery / cache │
                   └──────────────┘
```

### Layer Directory Map

| Directory | Role |
|---|---|
| `app/admin` | Auth, taxonomy, user management, system |
| `app/l1_ingestion` | Raw document upload + KB registry |
| `app/l15_preprocessing` | KB bridge: 6-layer validation + compilation |
| `app/l2_cardinal` | 5-phase ticket ingest pipeline |
| `app/l4_agents` | Celery worker — 4-stage LLM resolution pipeline |
| `app/l45_ml_platform` | Compiler, vectorization, simulation |
| `app/l5_intelligence` | Shadow policy testing |

---

## Quick Start

### Option A — Docker Compose (Recommended)

Everything runs via Docker from the project root:

```bash
cd ..  # project root (kirana_kart_final/)
docker compose up --build -d
```

Governance API is available at `http://localhost:8001`.

Default super-admin: `admin@kirana.local` / `changeme123`

### Option B — Local Development

```bash
cd kirana_kart/
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt

# Edit .env with real values
cp .env .env.local

# Start server
uvicorn app.admin.main:app --reload --host 0.0.0.0 --port 8001
```

---

## Authentication

### How It Works

1. **Sign up** `POST /auth/signup` → user created with view-only access on all modules
2. **Log in** `POST /auth/login` → returns `access_token` (JWT, 60 min) + `refresh_token` (30 days)
3. All protected endpoints require `Authorization: Bearer <access_token>`
4. On 401, client POSTs `POST /auth/refresh` to rotate tokens
5. **Log out** `POST /auth/logout` invalidates the refresh token server-side

### OAuth Flow

OAuth is handled entirely by the backend:

1. Frontend navigates browser to `GET /auth/oauth/{provider}`
2. Backend redirects user to GitHub / Google / Microsoft consent screen
3. Provider redirects to `GET /auth/oauth/{provider}/callback`
4. Backend exchanges code for user info, upserts user, issues JWT
5. Backend redirects to `{FRONTEND_URL}/auth/callback?access_token=...&refresh_token=...`

End users only see the provider's familiar consent screen — no credentials stored in Kirana Kart.

### Permission Model

Each user has per-module `{can_view, can_edit, can_admin}` booleans:

| Module | Routes |
|---|---|
| `dashboard` | Overview stats |
| `tickets` | Ticket list + resolution |
| `taxonomy` | Issue code hierarchy |
| `knowledgeBase` | KB upload + publish |
| `policy` | Compiled rule versions |
| `customers` | Customer records |
| `analytics` | Reports + BI agent |
| `system` | Server status + user management |
| `biAgent` | Natural language SQL |
| `sandbox` | Testing sandbox |

`is_super_admin = true` bypasses all permission checks.

New users via signup or OAuth get `can_view = true` on all modules automatically.

---

## Database Schema

The application uses the `kirana_kart` schema in the `orgintelligence` PostgreSQL database.

### Auth Tables (auto-created on startup)

```sql
-- Users (replaces legacy admin_users table)
kirana_kart.users
  id SERIAL PK, email VARCHAR UNIQUE, full_name VARCHAR,
  password_hash VARCHAR (NULL for OAuth-only users),
  is_active BOOLEAN, is_super_admin BOOLEAN,
  oauth_provider VARCHAR, oauth_id VARCHAR, avatar_url TEXT,
  created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ

-- Per-user, per-module permissions
kirana_kart.user_permissions
  id SERIAL PK, user_id → users(id),
  module VARCHAR, can_view BOOL, can_edit BOOL, can_admin BOOL
  UNIQUE(user_id, module)

-- Refresh token store (for logout invalidation)
kirana_kart.refresh_tokens
  id SERIAL PK, user_id → users(id),
  token_hash VARCHAR UNIQUE, expires_at TIMESTAMPTZ
```

### Business Tables

```sql
kirana_kart.issue_taxonomy          -- Live taxonomy nodes
kirana_kart.taxonomy_drafts         -- Taxonomy draft edits
kirana_kart.issue_taxonomy_versions -- Immutable taxonomy snapshots
kirana_kart.taxonomy_runtime_config -- Active version pointer
kirana_kart.issue_taxonomy_audit    -- Change audit log
kirana_kart.vector_jobs             -- Taxonomy vectorization queue
kirana_kart.kb_raw_uploads          -- Raw policy document uploads
kirana_kart.knowledge_base_versions -- Published KB snapshots
kirana_kart.kb_runtime_config       -- Active + shadow KB pointers
kirana_kart.kb_vector_jobs          -- KB vectorization queue
kirana_kart.rule_registry           -- Compiled structured rules
kirana_kart.master_action_codes     -- Resolution action lookup
kirana_kart.policy_versions         -- Policy version metadata
kirana_kart.policy_shadow_results   -- Shadow vs active comparison
```

---

## Environment Variables

All variables are read via `app/config.py` (Pydantic `BaseSettings`).

### Required

| Variable | Description |
|---|---|
| `DB_HOST` | PostgreSQL host |
| `DB_PORT` | PostgreSQL port (default `5432`) |
| `DB_NAME` | Database name (`orgintelligence`) |
| `DB_USER` | DB user (`orguser`) |
| `DB_PASSWORD` | DB password |
| `DB_SCHEMA` | Schema name (`kirana_kart`) |
| `REDIS_URL` | Redis connection string |
| `LLM_API_BASE_URL` | OpenAI base URL |
| `LLM_API_KEY` | OpenAI API key |
| `JWT_SECRET_KEY` | Secret for signing JWTs (change in production!) |

### Auth & OAuth

| Variable | Description |
|---|---|
| `JWT_ACCESS_EXPIRE_MINUTES` | Access token TTL (default `60`) |
| `JWT_REFRESH_EXPIRE_DAYS` | Refresh token TTL (default `30`) |
| `BOOTSTRAP_ADMIN_EMAIL` | Super-admin email created on first startup |
| `BOOTSTRAP_ADMIN_PASSWORD` | Super-admin password (min 8 chars) |
| `BOOTSTRAP_ADMIN_NAME` | Super-admin display name |
| `OAUTH_REDIRECT_BASE_URL` | Base URL for OAuth callbacks (e.g. `http://localhost:8001`) |
| `FRONTEND_URL` | Frontend origin for post-OAuth redirect (e.g. `http://localhost:5173`) |
| `GITHUB_CLIENT_ID` | GitHub OAuth App client ID |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App client secret |
| `GOOGLE_CLIENT_ID` | Google OAuth 2.0 client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth 2.0 client secret |
| `MICROSOFT_CLIENT_ID` | Azure AD application (client) ID |
| `MICROSOFT_CLIENT_SECRET` | Azure AD client secret value |

### Optional

| Variable | Default | Description |
|---|---|---|
| `DB_POOL_SIZE` | `10` | SQLAlchemy connection pool size |
| `DB_MAX_OVERFLOW` | `20` | Max additional connections above pool |
| `WEAVIATE_HOST` | `weaviate` | Weaviate hostname |
| `WEAVIATE_HTTP_PORT` | `8080` | Weaviate HTTP port |
| `WEAVIATE_GRPC_PORT` | `50051` | Weaviate gRPC port |
| `EMBEDDING_MODEL` | `text-embedding-3-large` | OpenAI embedding model |
| `LOG_FORMAT` | `text` | `text` or `json` |
| `LOG_LEVEL` | `INFO` | Python logging level |
| `PROMETHEUS_ENABLED` | `true` | Enable `/metrics` endpoint |
| `ADMIN_TOKEN` | — | Legacy static token (kept for ingest service compatibility) |
| `BI_DB_USER` | `bi_readonly` | Read-only DB user for BI Agent |
| `BI_DB_PASSWORD` | — | Read-only DB user password |

---

## API Reference

Interactive docs: `http://localhost:8001/docs`

### Authentication (`/auth`)

| Method | Endpoint | Auth Required | Description |
|---|---|---|---|
| POST | `/auth/signup` | No | Register with email + password → viewer access |
| POST | `/auth/login` | No | Email + password → JWT tokens |
| POST | `/auth/refresh` | No | Rotate refresh token → new access token |
| POST | `/auth/logout` | Bearer | Invalidate refresh token |
| GET | `/auth/me` | Bearer | Current user profile + permissions |
| GET | `/auth/oauth/github` | No | Redirect to GitHub consent |
| GET | `/auth/oauth/github/callback` | No | GitHub OAuth callback |
| GET | `/auth/oauth/google` | No | Redirect to Google consent |
| GET | `/auth/oauth/google/callback` | No | Google OAuth callback |
| GET | `/auth/oauth/microsoft` | No | Redirect to Microsoft consent |
| GET | `/auth/oauth/microsoft/callback` | No | Microsoft OAuth callback |

### User Management (`/users`)

Requires `system.admin` permission.

| Method | Endpoint | Description |
|---|---|---|
| GET | `/users` | List all users |
| GET | `/users/{id}` | Get user + permissions |
| PATCH | `/users/{id}/permissions` | Update module permissions |
| PATCH | `/users/{id}/deactivate` | Deactivate user |
| PATCH | `/users/{id}/activate` | Re-activate user |
| DELETE | `/users/{id}` | Permanently delete user |

### Health & Status

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Liveness check |
| GET | `/health/worker` | Vector worker heartbeat |
| GET | `/system-status` | DB + Redis + Weaviate + worker |
| GET | `/metrics` | Prometheus metrics |

### Taxonomy (`/taxonomy`)

Requires `taxonomy.view` (GET) or `taxonomy.edit` / `taxonomy.admin` (mutations).

| Method | Endpoint | Permission | Description |
|---|---|---|---|
| GET | `/taxonomy/` | view | List active issues |
| GET | `/taxonomy/drafts` | view | List drafts |
| GET | `/taxonomy/versions` | view | List versions |
| GET | `/taxonomy/diff` | view | Diff two versions |
| GET | `/taxonomy/audit` | view | Audit log |
| POST | `/taxonomy/draft/save` | edit | Save draft |
| POST | `/taxonomy/add` | edit | Add issue |
| PUT | `/taxonomy/update` | edit | Update issue |
| POST | `/taxonomy/publish` | admin | Publish version |
| POST | `/taxonomy/rollback` | admin | Rollback to prior version |

### KB Registry (`/kb`)

Requires `knowledgeBase.*` permissions.

| Method | Endpoint | Permission | Description |
|---|---|---|---|
| POST | `/kb/upload` | edit | Upload raw policy document |
| PUT | `/kb/update/{id}` | edit | Update draft upload |
| GET | `/kb/versions` | view | List published versions |
| POST | `/kb/publish` | admin | Publish policy version |
| POST | `/kb/rollback/{label}` | admin | Rollback to previous version |

### Compiler, Vectorization, Simulation

| Method | Endpoint | Permission | Description |
|---|---|---|---|
| POST | `/compiler/compile/{label}` | knowledgeBase.admin | LLM compile raw → rules |
| POST | `/vectorization/run` | knowledgeBase.admin | Run pending vector jobs |
| GET | `/vectorization/status/{label}` | knowledgeBase.view | Vector job status |
| POST | `/simulation/run` | policy.admin | Compare two policy versions |

---

## Policy Document Lifecycle

```
1. Author writes business rules in markdown/docx/pdf
         ↓
2. POST /kb/upload  (stores in kb_raw_uploads)
         ↓
3. POST /compiler/compile/{version_label}
   (LLM extracts structured rules → rule_registry + knowledge_base_versions)
         ↓
4. POST /simulation/run  (compare candidate vs baseline on sample tickets)
         ↓
5. POST /shadow/enable {"shadow_version": "v1.1.0"}
   (run shadow in production, capture divergence)
         ↓
6. GET /shadow/stats  (review change_rate_percent)
         ↓
7. POST /kb/publish {"version_label": "v1.1.0"}
   (atomic publish + vector job queued)
         ↓
8. Background worker vectorizes rules into Weaviate (10s poll, SKIP LOCKED)
         ↓
9. Active policy live — agents query Weaviate at resolution time
```

---

## Background Workers

### Vector Worker (daemon thread)
Polls for pending `kb_vector_jobs` every 10 seconds. Uses `FOR UPDATE SKIP LOCKED` for safe concurrent replicas. Embeds rule text via `text-embedding-3-large` (3072 dims) and upserts into Weaviate's `KBRule` class.

Monitor: `GET /health/worker` → `{ alive, last_heartbeat_s, jobs_processed }`

### Celery Workers
Two separate services:
- `worker-poll`: reads `cardinal:dispatch` Redis streams, dispatches tasks to Celery
- `worker-celery`: executes `process_ticket` tasks (4-stage LLM pipeline) with concurrency=2

Queue: `cardinal`
Broker: `redis://redis:6379/1`
Result backend: `redis://redis:6379/1`

---

## Project Structure

```
kirana_kart/
├── requirements.txt              # Pinned Python dependencies
├── .env                          # Environment variables (never commit)
│
├── app/
│   ├── config.py                 # Pydantic BaseSettings (all env vars)
│   ├── metrics.py                # Prometheus metrics + OpenTelemetry
│   │
│   ├── middleware/
│   │   └── logging_middleware.py # JSON structured logging + correlation ID
│   │
│   ├── admin/                    # Governance control plane
│   │   ├── main.py               # FastAPI app, lifespan, middleware, startup
│   │   ├── db.py                 # SQLAlchemy engine + session factory
│   │   ├── redis_client.py       # Redis client (single-node or cluster)
│   │   ├── routes/
│   │   │   ├── auth.py           # Shim re-exporting from auth_service
│   │   │   ├── auth_routes.py    # /auth/* endpoints
│   │   │   ├── user_management.py # /users/* endpoints
│   │   │   ├── taxonomy.py       # /taxonomy/* endpoints
│   │   │   ├── tickets.py        # /tickets/* endpoints
│   │   │   ├── customers.py      # /customers/* endpoints
│   │   │   ├── analytics.py      # /analytics/* endpoints
│   │   │   ├── bi_agent.py       # /bi/* endpoints
│   │   │   └── system.py         # /system/* endpoints
│   │   └── services/
│   │       ├── auth_service.py   # JWT, bcrypt, UserContext, require_permission()
│   │       ├── oauth_service.py  # GitHub / Google / Microsoft OAuth flows
│   │       ├── taxonomy_service.py
│   │       └── vector_service.py
│   │
│   ├── l1_ingestion/             # Raw document upload + KB registry
│   │   └── kb_registry/
│   │       ├── routes.py
│   │       ├── kb_registry_service.py
│   │       └── markdown_converter.py
│   │
│   ├── l2_cardinal/              # 5-phase ticket ingest pipeline
│   │   ├── pipeline.py
│   │   ├── phase1_validator.py   # 8 validation checks
│   │   ├── phase2_deduplicator.py
│   │   ├── phase3_handler.py
│   │   ├── phase4_enricher.py
│   │   └── phase5_dispatcher.py
│   │
│   ├── l4_agents/                # Celery worker — 4-stage LLM pipeline
│   │   ├── worker.py             # Stream poll loop + Celery app
│   │   └── tasks.py              # process_ticket task
│   │
│   ├── l45_ml_platform/          # Compiler + vectorization + simulation
│   │   ├── compiler/
│   │   ├── vectorization/
│   │   └── simulation/
│   │
│   └── l5_intelligence/          # Shadow policy testing
│       └── policy_shadow/
│
├── tests/                        # pytest unit tests
│   ├── conftest.py
│   ├── test_config.py
│   ├── test_phase1_validator.py
│   └── test_redis_client.py
│
└── scripts/
    ├── test_endpoints.py         # Full API integration runner
    ├── kb_compiler.py
    └── run_vectorization.py
```

---

## Running Tests

```bash
# Unit tests (no DB or Redis required)
pytest tests/ -v

# Integration test (server must be running)
python scripts/test_endpoints.py

# Weaviate connection smoke test
python test_weaviate.py
```

---

## OAuth App Setup

To enable social login, register OAuth apps once and set the credentials in `docker-compose.yml` or `.env`.

### GitHub
1. Go to GitHub → Settings → Developer settings → OAuth Apps → New OAuth App
2. Set **Homepage URL**: `http://localhost:8001`
3. Set **Authorization callback URL**: `http://localhost:8001/auth/oauth/github/callback`
4. Copy **Client ID** and **Client Secret** → set `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`

### Google
1. Go to [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials → Create OAuth 2.0 Client ID
2. Application type: **Web application**
3. Add Authorized redirect URI: `http://localhost:8001/auth/oauth/google/callback`
4. Copy credentials → set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`

### Microsoft
1. Go to [Azure Portal](https://portal.azure.com) → App registrations → New registration
2. Supported account types: **Accounts in any organizational directory and personal Microsoft accounts**
3. Redirect URI: `http://localhost:8001/auth/oauth/microsoft/callback`
4. Certificates & secrets → New client secret → copy value → set `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET`

---

## Troubleshooting

**`relation kirana_kart.users does not exist`**
Auth tables are created automatically on startup via `ensure_auth_tables()`. This error means the governance container failed to run startup. Check: `docker compose logs governance`.

**`bcrypt` / `passlib` version error**
`bcrypt` must be pinned `<4.0.0` to stay compatible with `passlib 1.7.x`. The `requirements.txt` already pins `bcrypt>=3.2.0,<4.0.0`.

**`401 Invalid email or password` for `admin@kirana.local`**
The `.local` TLD is a reserved domain not accepted by strict email validators. Auth routes use a custom `@field_validator` on `str` (not `EmailStr`) to allow it.

**OAuth callback shows error**
- Check that `OAUTH_REDIRECT_BASE_URL` matches the callback URL registered with the provider
- Check that `FRONTEND_URL` matches where the frontend is running
- For GitHub: verify the OAuth App is not suspended

**`LLM_API_KEY not found`**
The `.env` file is not loaded. Run from `kirana_kart/` directory or ensure the `env_file` block in `docker-compose.yml` is correct.

**Weaviate not ready**
Wait 10–15 seconds after `docker compose up -d`. Check: `curl http://localhost:8080/v1/meta`.

**Port 8001 conflict**
Another service is using port 8001. Update `docker-compose.yml` ports mapping: `"8002:8001"` and update `VITE_GOVERNANCE_API_URL` in the UI service.

---

## Production Notes

- **Rotate `JWT_SECRET_KEY`** — use a cryptographically random string (≥ 32 chars). Rotating it invalidates all existing tokens.
- **Change `BOOTSTRAP_ADMIN_PASSWORD`** before first deployment.
- **Set `LOG_FORMAT=json`** for structured log aggregation (Datadog, CloudWatch, etc.).
- **`REDIS_CLUSTER_NODES`** — set this instead of `REDIS_URL` for Redis Cluster mode (eliminates single-node SPOF).
- **Prune `refresh_tokens`** — expired tokens are not auto-deleted. Add a cron: `DELETE FROM kirana_kart.refresh_tokens WHERE expires_at < NOW();`
- **Prune `policy_shadow_results`** — accumulates indefinitely; archive or truncate periodically.
- **Celery concurrency** — `worker-celery` defaults to 2 workers. Scale with `--concurrency=N` or run multiple replicas.
- **Weaviate** — `KBRule` class uses delete-then-insert per `policy_version` — safe for re-vectorization. Back up `weaviate_data` volume in production.
