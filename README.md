# Kirana Kart — Full Stack

An AI-powered policy governance and automated ticket-resolution engine for e-commerce / quick-commerce customer support. The platform ingests support tickets, classifies issues through a multi-stage LLM pipeline, enforces versioned business policies, and surfaces analytics through a role-based admin UI.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Tech Stack](#tech-stack)
3. [Quick Start](#quick-start)
4. [Services](#services)
5. [Processing Pipeline](#processing-pipeline)
6. [Admin UI — Pages & Features](#admin-ui--pages--features)
7. [Database Schema](#database-schema)
8. [API Reference](#api-reference)
9. [Configuration & Environment Variables](#configuration--environment-variables)
10. [Admin Tokens & Roles](#admin-tokens--roles)
11. [Scripts](#scripts)
12. [Data Generation](#data-generation)
13. [Development Notes](#development-notes)

---

## Architecture Overview

```
                        ┌─────────────────────────────────────┐
                        │           Admin UI  :5173            │
                        │   React 19 · TypeScript · Tailwind   │
                        └────────────┬────────────────────────┘
                                     │ REST
          ┌──────────────────────────┼─────────────────────────────┐
          ▼                          ▼                             ▼
  ┌───────────────┐        ┌──────────────────┐       ┌───────────────────┐
  │  Ingest API   │        │ Governance API   │       │  BI Agent (SSE)   │
  │    :8000      │        │     :8001        │       │  (part of :8001)  │
  │  (L1+L2+L3)  │        │  Admin control   │       │  NL → SQL → LLM   │
  └──────┬────────┘        └──────────────────┘       └───────────────────┘
         │ Redis Stream
         ▼
  ┌───────────────┐
  │ worker-poll   │  ← polls Redis streams, fans out to Celery
  └──────┬────────┘
         │ Celery task
         ▼
  ┌───────────────┐        ┌──────────────────┐
  │ worker-celery │ ──────▶│  LLM Pipeline    │
  │  (4 stages)   │        │  gpt-4o-mini     │
  └───────────────┘        │  gpt-4.1         │
                           │  o3-mini         │
                           │  gpt-4o          │
                           └──────────────────┘
         │
         ▼
  ┌─────────────────────────────────────────────────────────┐
  │                      PostgreSQL :5432                    │
  │  schema: kirana_kart  ·  44 tables  ·  ~14K tickets     │
  └─────────────────────────────────────────────────────────┘
         │
  ┌──────┴───────┐      ┌──────────────────┐
  │    Redis     │      │    Weaviate       │
  │    :6379     │      │    :8080          │
  │  Streams +   │      │  Vector search   │
  │  Celery      │      │  (KBRule class)  │
  └──────────────┘      └──────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite 7, TanStack Query, Zustand, Radix UI, Tailwind CSS |
| Backend | Python 3.13, FastAPI, SQLAlchemy 2, Uvicorn |
| Workers | Celery 5.4, Redis Streams |
| Database | PostgreSQL 14 |
| Cache / Broker | Redis 7 |
| Vector DB | Weaviate 1.29.4 |
| LLM | OpenAI (gpt-4o-mini, gpt-4.1, o3-mini, gpt-4o) |
| Embeddings | text-embedding-3-large (3072 dims) |
| Observability | Prometheus, OpenTelemetry, structured JSON logging |
| Container | Docker Compose |

---

## Quick Start

```bash
# 1. Clone and enter the directory
cd "kirana_kart_fullstack copy"

# 2. Set your OpenAI key (required for LLM features)
echo 'LLM_API_KEY=sk-...' >> kirana_kart/.env

# 3. Build and start all services
docker compose up --build

# 4. (Optional) Seed the database with synthetic data
docker exec kirana_kart_fullstackcopy-governance-1 \
  python3 /app/scripts/generate_sim_data.py --customers 25000 --orders 100000

# 5. (Optional) Backfill LLM output & evaluation data
docker exec kirana_kart_fullstackcopy-governance-1 \
  python3 /app/scripts/backfill_eval_data.py
```

### Service URLs

| Service | URL |
|---|---|
| Admin UI | http://localhost:5173 |
| Governance API | http://localhost:8001 |
| Ingest API | http://localhost:8000 |
| Governance API docs | http://localhost:8001/docs |
| Ingest API docs | http://localhost:8000/docs |
| Weaviate console | http://localhost:8080 |
| PostgreSQL | localhost:5432 |

### Login

Navigate to http://localhost:5173 and log in with:

```
Token: local_admin_token   (publisher role — full access)
```

---

## Services

### `governance` — Admin Control Plane (port 8001)

FastAPI application that powers the admin UI. Handles:

- Ticket inspection and execution history
- Customer management
- Issue taxonomy CRUD and versioning
- Knowledge base upload, compile, and publish workflow
- Policy version management and shadow testing
- Analytics — Evaluation Matrix (LLM output analysis)
- BI Agent — natural language → SQL queries via streaming SSE
- System health and configuration

Entry point: `kirana_kart/app/admin/main.py`

### `ingest` — Ticket Ingestion Endpoint (port 8000)

FastAPI application that accepts incoming support tickets via `POST /ingest`. Runs a 5-phase synchronous pipeline (validate → normalize → deduplicate → route → enrich) before dispatching to a Redis stream for async LLM processing.

Entry point: `kirana_kart/main.py`

### `worker-poll` — Stream Consumer

Continuously polls the Redis priority streams (`P1_CRITICAL`, `P2_HIGH`, `P3_MEDIUM`, `P4_LOW`) and dispatches tickets as Celery tasks to the worker pool.

### `worker-celery` — LLM Pipeline Worker

Celery worker that processes tickets through a 4-stage LLM pipeline:

| Stage | Model | Purpose |
|---|---|---|
| Stage 0 — Classifier | gpt-4o-mini | Issue classification + L1/L2 taxonomy |
| Stage 1 — Evaluator | gpt-4.1 | Business logic evaluation, fraud checks, refund calculation |
| Stage 2 — Validator | o3-mini | Cross-validation + discrepancy detection |
| Stage 3 — Responder | gpt-4o | Customer-facing response generation |

### `postgres` — Database (port 5432)

PostgreSQL 14 with a single `kirana_kart` schema containing 44 tables. Initialized from `kirana_kart/exports/kirana_kart_full_export_*.sql`.

### `redis` — Cache & Message Broker (port 6379)

Three logical databases:
- `db 0` — Application cache + Redis Streams (ticket queues)
- `db 1` — Celery broker + result backend
- `db 2` — Reserved

### `weaviate` — Vector Database (port 8080)

Weaviate 1.29.4 with a single class `KBRule` storing vectorized policy rules for semantic retrieval during LLM evaluation.

### `ui` — Frontend (port 5173)

Vite + React 19 development server serving the admin dashboard. In production, build with `npm run build` and serve the `dist/` directory.

---

## Processing Pipeline

### L1 — Ingestion (`POST /ingest`)

```
Incoming Request
    │
    ├─ Phase 1: Validator         ← 8 schema/constraint checks
    ├─ Phase 2: Deduplicator      ← Redis cache + rate limiting
    ├─ Phase 3: Handler           ← Intent matching, issue routing
    ├─ Phase 4: Enricher          ← Metadata enrichment
    └─ Phase 5: Dispatcher        ← Priority-weighted Redis stream push
                                     (P1_CRITICAL → P4_LOW)
```

### L2 — LLM Processing (Celery)

```
Redis Stream
    │
    └─ Stage 0: Classifier (gpt-4o-mini)
         ├─ Weaviate rule retrieval
         ├─ Issue type L1/L2 classification
         └─ writes → llm_output_1

    └─ Stage 1: Evaluator (gpt-4.1)
         ├─ Fraud signal detection (greedy, IGCC, history)
         ├─ Refund calculation with multipliers/caps
         ├─ Action code selection
         └─ writes → llm_output_2

    └─ Stage 2: Validator (o3-mini)
         ├─ Cross-validation of stage 1 decisions
         ├─ Discrepancy detection + severity rating
         ├─ Override logic
         └─ writes → llm_output_3

    └─ Stage 3: Responder (gpt-4o)
         ├─ Customer-facing response generation
         └─ writes → ticket_execution_summary
```

### Priority Queue Weights

| Priority | Redis Stream | Use Case |
|---|---|---|
| P1_CRITICAL | Critical threshold | VIP / high-value orders |
| P2_HIGH | High priority | Standard refund cases |
| P3_MEDIUM | Medium priority | Info / tracking requests |
| P4_LOW | Low priority | Batch / bulk processing |

---

## Admin UI — Pages & Features

### Dashboard `/`
KPI overview — total tickets, avg CSAT, SLA breach rate, refund totals, daily ticket trend, module breakdown charts.

### Tickets `/tickets`
- Paginated ticket list with full-text search
- Filters: module, status, date range, action code
- **Ticket Detail** `/tickets/:id` — raw payload, execution trace, LLM outputs for all 3 stages, audit log

### Customers `/customers`
- Customer roster with segment (Swiggy, Zomato, Blinkit, etc.) and churn risk indicators
- **Customer Detail** `/customers/:id` — order history, ticket history, risk profile

### Taxonomy `/taxonomy`
- Live issue taxonomy editor (L1 → L2 hierarchy)
- Version history with diff view
- Publish / rollback versioned snapshots
- Vector job management (triggers re-vectorization)

### Knowledge Base `/knowledge-base`
- Upload DOCX / PDF / Markdown policy documents
- Compile: LLM extracts structured rules → `rule_registry`
- Vectorize: embed rules into Weaviate
- Publish: promote a version to live

### Policy `/policy`
- Policy version management (view, compare, activate)
- **Shadow mode**: run a candidate policy in parallel with the active one — compare decisions without affecting production
- Simulation: run A/B tests against historical tickets

### Analytics `/analytics`
- **Evaluation Matrix** — paginated table of all 16,000+ tickets showing:
  - *Source Data*: raw issue, fraud segment, order value, complaint amount
  - *Evaluation (LLM Output 2)*: verified issue, greedy classification, multiplier, calculated refund, confidence scores
  - *Validation (LLM Output 3)*: final action, discrepancy severity, override type, LLM accuracy, automation pathway
- Filter by module, issue type, fraud segment, value segment, action code, date range, greedy classification

### BI Agent `/bi-agent`
Natural language query interface over the operations database:
- Select module + date range to scope queries
- Ask questions in plain English — agent generates SQL, executes it, and streams a Senior Business Analyst-style response referencing industry BI formulas (CSAT, SLA, FCR, AHT, P95, Refund Rate, Escalation Rate, etc.)
- Persistent chat sessions with full history
- SQL shown in a collapsible code block with copy button

### Sandbox `/sandbox`
Test policy decisions against hypothetical tickets without affecting production data.

### System `/system`
Health checks, service status, active configuration, Redis stream depths, Weaviate connection status.

---

## Database Schema

All tables live in the `kirana_kart` PostgreSQL schema.

### Operational Tables

| Table | Rows | Description |
|---|---|---|
| `fdraw` | ~13,900 | Raw inbound tickets (source of truth) |
| `customers` | ~25,000 | Customer master (segment, churn probability, tier) |
| `orders` | ~100,000 | Order records |
| `refunds` | ~4,500 | Processed refunds |
| `delivery_events` | ~600,000 | Delivery tracking events |
| `conversations` | ~13,500 | Conversation sessions |
| `csat_responses` | ~4,700 | Customer satisfaction ratings |

### Execution / LLM Output Tables

| Table | Rows | Description |
|---|---|---|
| `ticket_execution_summary` | ~13,400 | Final processed result per ticket |
| `llm_output_1` | ~13,900 | Stage 0 — issue classification |
| `llm_output_2` | ~13,900 | Stage 1 — business logic evaluation |
| `llm_output_3` | ~13,900 | Stage 2 — validation + final decision |
| `execution_metrics` | ~13,400 | Duration (ms), token counts per stage |
| `execution_audit_log` | — | Immutable processing audit trail |
| `ticket_processing_state` | — | In-flight state for active tickets |

### Policy & Rules Tables

| Table | Description |
|---|---|
| `policy_versions` | Immutable policy snapshots |
| `rule_registry` | Compiled rules (conditions, actions, constraints) |
| `master_action_codes` | Action code definitions (28 codes: REFUND_*, REJECT_*, ESCALATE_*, etc.) |
| `policy_simulation_runs` | A/B test run metadata |
| `policy_simulation_results` | Row-level simulation decisions |
| `policy_shadow_results` | Shadow vs active comparison results |

### Knowledge Base & Taxonomy Tables

| Table | Description |
|---|---|
| `issue_taxonomy` | Live issue taxonomy (L1 → L2 hierarchy) |
| `issue_taxonomy_versions` | Immutable taxonomy version snapshots |
| `taxonomy_drafts` | Work-in-progress taxonomy edits |
| `knowledge_base_versions` | Published KB snapshots |
| `knowledge_base_drafts` | Draft KB documents |
| `knowledge_base_raw_uploads` | Raw uploaded source documents |
| `kb_vector_jobs` | Vectorization job queue |
| `vector_jobs` | Taxonomy vectorization jobs |

### Administrative Tables

| Table | Description |
|---|---|
| `admin_users` | API tokens, roles (viewer / editor / publisher) |
| `bi_chat_sessions` | BI Agent chat sessions (per token) |
| `bi_chat_messages` | BI Agent message history |
| `model_registry` | Registered LLM model configurations |
| `response_templates` | Pre-written response templates |
| `semantic_cache_log` | LLM response cache entries |
| `circuit_breaker_log` | Circuit breaker state per service |

### Action Codes Reference

| Code | ID | Description | Refund? |
|---|---|---|---|
| `TRACK_ORDER` | TO001 | Track Order Status | No |
| `REFUND_PARTIAL` | RP002 | Refund – Partial Amount | Yes |
| `REFUND_FULL` | RF003 | Refund – Full Amount | Yes |
| `REFUND_STATUS` | RS001 | Refund Status Update | Yes |
| `APOLOGY_COUPON` | AC001 | Apology Coupon Issued | No |
| `REFUND_CALCULATED` | RC001 | Refund – Calculated Amount | Yes |
| `REFUND_FULL_CRITICAL` | RF001 | Refund – Full (Critical Issue) | Yes |
| `REFUND_FULL_SLA_BREACH` | RF002 | Refund – Full (SLA Breach) | Yes |
| `REJECT_FRAUD_GREEDY` | RJ001 | Reject – Greedy Logic Triggered | No |
| `ESCALATE_HIGH_VALUE` | EH001 | Escalate – High Value Order | No |
| `HOLD_MANUAL_REVIEW` | HM001 | Hold – Manual Review Queue | No |
| *(28 codes total)* | | | |

---

## API Reference

### Governance API (port 8001)

All endpoints require `X-Admin-Token: <token>` header.

| Method | Path | Description |
|---|---|---|
| `GET` | `/auth/me` | Verify token and return role |
| `GET` | `/analytics/summary` | KPI summary (tickets, CSAT, SLA, refunds) |
| `GET` | `/analytics/evaluations` | Evaluation Matrix rows (paginated, filterable) |
| `GET` | `/analytics/evaluation-filters` | Filter dropdown values |
| `GET` | `/analytics/refunds` | Refund analytics |
| `GET` | `/tickets` | Paginated ticket list |
| `GET` | `/tickets/{id}` | Ticket detail + full execution trace |
| `GET` | `/customers` | Paginated customer list |
| `GET` | `/customers/{id}` | Customer detail |
| `GET` | `/taxonomy` | Current taxonomy tree |
| `POST` | `/taxonomy` | Create / update taxonomy |
| `GET` | `/taxonomy/versions` | Version history |
| `POST` | `/taxonomy/publish` | Publish a version |
| `GET` | `/kb/versions` | KB version list |
| `POST` | `/kb/upload` | Upload a KB document |
| `POST` | `/kb/compile/{version}` | Compile rules from KB |
| `POST` | `/kb/vectorize/{version}` | Vectorize a KB version |
| `POST` | `/kb/publish/{version}` | Publish KB version to live |
| `GET` | `/policy/versions` | Policy version list |
| `POST` | `/shadow/enable` | Enable shadow policy mode |
| `POST` | `/shadow/disable` | Disable shadow policy mode |
| `GET` | `/shadow/stats` | Shadow vs active decision comparison |
| `GET` | `/bi-agent/modules` | List taxonomy issue types for BI filter |
| `GET` | `/bi-agent/sessions` | List BI chat sessions |
| `POST` | `/bi-agent/sessions` | Create BI chat session |
| `POST` | `/bi-agent/query` | **SSE** — stream BI query response |
| `GET` | `/system/health` | Service health check |

Full interactive docs: http://localhost:8001/docs

### Ingest API (port 8000)

| Method | Path | Description |
|---|---|---|
| `POST` | `/ingest` | Submit a ticket for processing |
| `GET` | `/health` | Health check |

Full interactive docs: http://localhost:8000/docs

#### Sample Ingest Payload

```json
{
  "ticket_id": "12345",
  "order_id": "ORD20260314001",
  "customer_id": "CUST001234",
  "org": "zomato",
  "module": "quality",
  "channel": "email",
  "subject": "Missing item in my order",
  "description": "I ordered 3 items but only received 2. One item is missing.",
  "img_flg": 0,
  "attachment": 0,
  "source": "api"
}
```

---

## Configuration & Environment Variables

Copy `kirana_kart/.env.example` to `kirana_kart/.env` and set values:

```bash
# ── LLM / OpenAI ──────────────────────────────────────
LLM_API_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=sk-...                  # Required for all LLM features
MODEL1=gpt-4o-mini                  # Stage 0: classifier
MODEL2=gpt-4.1                      # Stage 1: evaluator
MODEL3=o3-mini                      # Stage 2: validator
MODEL4=gpt-4o                       # Stage 3: responder
EMBEDDING_MODEL=text-embedding-3-large

# ── Database ───────────────────────────────────────────
DB_HOST=postgres                    # Docker service name
DB_PORT=5432
DB_NAME=orgintelligence
DB_USER=orguser
DB_PASSWORD=orgpassword
DB_SCHEMA=kirana_kart

# ── Redis ──────────────────────────────────────────────
REDIS_URL=redis://redis:6379/0
CELERY_BROKER_URL=redis://redis:6379/1
CELERY_RESULT_BACKEND=redis://redis:6379/1

# ── Weaviate ───────────────────────────────────────────
WEAVIATE_HOST=weaviate
WEAVIATE_HTTP_PORT=8080
WEAVIATE_GRPC_PORT=50051

# ── Admin & Security ───────────────────────────────────
ADMIN_TOKEN=local_admin_token       # Change for production

# ── Worker Tuning ──────────────────────────────────────
PROCESS_BATCH_SIZE=10               # Celery batch size

# ── Observability ──────────────────────────────────────
LOG_FORMAT=json                     # json | text
LOG_LEVEL=INFO
PROMETHEUS_ENABLED=false
OTLP_ENDPOINT=                      # Optional OpenTelemetry collector
```

---

## Admin Tokens & Roles

Roles are enforced on every governance API endpoint.

| Token | Role | Permissions |
|---|---|---|
| `local_admin_token` | publisher | Full access — read, write, publish, manage users |
| `editor_test_token` | editor | Read + write (no publish, no user management) |
| `viewer_test_token` | viewer | Read-only |

To add a custom token, insert a row into `kirana_kart.admin_users`:

```sql
INSERT INTO kirana_kart.admin_users (api_token, role, label)
VALUES ('your-token-here', 'editor', 'My API Token');
```

---

## Scripts

All scripts are in `kirana_kart/scripts/`. Run them inside the governance container:

```bash
docker exec kirana_kart_fullstackcopy-governance-1 python3 /app/scripts/<script>.py
```

| Script | Description |
|---|---|
| `generate_sim_data.py` | Generate synthetic customers, orders, tickets, refunds, CSAT. Flags: `--customers 25000 --orders 100000 --seed 42 --mode reset\|append` |
| `backfill_eval_data.py` | Populate `llm_output_1/2/3`, `execution_metrics`, and missing action codes. Idempotent — safe to re-run |
| `simulate_tickets.py` | Run policy simulation against a set of tickets |
| `test_cardinal.py` | End-to-end ingestion pipeline integration test |
| `test_endpoints.py` | Full API endpoint test suite |
| `test_kb_upload.py` | KB upload → compile → vectorize workflow test |
| `kb_compiler.py` | Standalone KB rule compiler |
| `run_vectorization.py` | Process all pending vector jobs |
| `process_streams_eager.py` | Eagerly drain Redis streams without Celery |
| `analyze_kb_markdown.py` | Analyze structure of a KB markdown file |
| `vectorize_corpora.py` | Vectorize entire KB corpus |
| `export_schema.py` | Dump DB schema to file |
| `ensure_complaints_table.py` | Initialize complaints auxiliary table |

---

## Data Generation

To seed a fresh database with realistic synthetic data:

```bash
# Full reset — generates 25k customers, 100k orders, ~13.5k tickets
docker exec kirana_kart_fullstackcopy-governance-1 \
  python3 /app/scripts/generate_sim_data.py \
  --customers 25000 --orders 100000 --seed 42 --mode reset

# Then backfill LLM evaluation data for all tickets
docker exec kirana_kart_fullstackcopy-governance-1 \
  python3 /app/scripts/backfill_eval_data.py
```

**Generated data profile:**

| Table | Rows | Notes |
|---|---|---|
| customers | 25,000 | 6 segments: Swiggy, Zomato, Blinkit, Zepto, Instamart, Dunzo |
| orders | 100,000 | |
| delivery_events | ~600,000 | ~6 events per order |
| fdraw (raw tickets) | ~13,500 | ticket-rate = 13.5% of orders |
| ticket_execution_summary | ~13,400 | |
| refunds | ~4,500 | refund-rate = 4.5% of orders |
| csat_responses | ~4,700 | 35% of resolved tickets |

**Ticket issue distribution:**

| Issue Type | Share | Action |
|---|---|---|
| WISMO | 40% | TRACK_ORDER |
| Missing Item | 20% | REFUND_PARTIAL |
| Wrong Item | 18% | REFUND_FULL |
| Damaged Item | 12% | REFUND_PARTIAL |
| Refund Status | 10% | REFUND_STATUS |
| Late Delivery | ~4% | APOLOGY_COUPON |

**Data time window:** March 2025 → March 2026 (~1 year, ~1,100 tickets/month)

---

## Development Notes

### Running backends locally (without Docker)

```bash
# Governance (requires Postgres + Redis + Weaviate running)
cd kirana_kart
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.admin.main:app --port 8001 --reload

# Ingest
uvicorn main:app --port 8000 --reload

# Worker
celery -A app.l4_agents.worker worker --loglevel=info
```

### Running the UI locally

```bash
cd kirana_kart_ui
npm install
npm run dev       # http://localhost:5173
npm run build     # production build → dist/
```

### Theme System

The UI supports full dark/light mode:
- Tailwind `darkMode: 'class'` — `.dark` class toggled on `<html>`
- Semantic CSS variable tokens in `src/index.css` (`--surface`, `--foreground`, `--muted`, etc.)
- Persisted to `localStorage` via Zustand
- Toggle button (Sun/Moon) in the top-right header

### BI Agent SQL Safety

The BI Agent enforces strict read-only SQL:
- Only `SELECT` statements allowed (regex-guarded before execution)
- Forbidden keywords: `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `CREATE`, `TRUNCATE`, `EXEC`
- SQL comments stripped before validation
- Max 500 rows per query

### Rebuilding After Backend Changes

```bash
docker compose build governance && docker compose up -d governance
```

### Database Snapshots

A full DB export is stored at:
```
kirana_kart/exports/kirana_kart_full_export_20260304_143135.sql
```
This is loaded automatically on first `docker compose up` via the postgres init script.
