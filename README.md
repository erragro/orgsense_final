# Kirana Kart — AI Policy Governance & CRM Platform

**Version:** 5.0.0
**Stack:** FastAPI · React 19 · PostgreSQL · Weaviate · Redis · Celery · OpenAI · Docker

---

## What Is This?

Kirana Kart is a **full-stack AI-powered policy governance, automated ticket-resolution, and CRM platform** for e-commerce / quick-commerce customer support.

It manages the complete lifecycle of business rules — from human-authored knowledge base documents through multi-model LLM compilation, vectorized policy versions, automated 4-stage Cardinal pipeline evaluation, and a Freshdesk-equivalent CRM for human-in-the-loop (HITL) ticket resolution.

**Scale:** ~2.2M support chats/month · 18M orders/month · ₹12.4 Crore/month refund leakage governed by versioned, auditable AI policies.

---

## Business Case Coverage

| # | Problem | Coverage | Key Components |
|---|---|---|---|
| **P1** | Refund fraud & policy leakage — ₹12.4 Cr/month | **~78%** | 4-stage Cardinal pipeline, deterministic rule engine, Weaviate vector retrieval, fraud signal computation, GPS enrichment, tier auto-approve |
| **P2** | Agent quality invisible — 0.2% QA coverage | **~35%** | QA Agent (AI pipeline accuracy + 12 Python + 10 LLM checks), canned-response detector, grammar scorer, sentiment arc, per-agent daily scoring |
| **P3** | Ticket spike root-cause unknown — 3-day lag | **~35%** | BI Agent (reactive SQL), intent classifier, HDBSCAN spike detection, spike report analytics |
| **P4** | True FCR overstated by 20 points | **~45%** | Intent classifier, 48h async FCR checker Celery task, FCR analytics tab |

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
│ /crm/*           │                └──────────┬───────────┘
│ /kb/*            │                           │ Redis Streams
│ /compiler/*      │                           ▼
│ /simulation/*    │                ┌──────────────────────┐
│ /analytics/*     │                │    worker-poll       │
└──────────────────┘                │    worker-celery     │
         │                          │  (4-stage Cardinal)  │
         ▼                          └──────────┬───────────┘
┌──────────────────┐                           │
│   PostgreSQL     │◄──────────────────────────┘
│   :5432          │
│  kirana_kart.*   │
└──────────────────┘
         │
┌──────────────────┐    ┌──────────────────┐
│    Weaviate      │    │      Redis       │
│    :8080         │    │      :6379       │
│ (vector search)  │    │ (streams/cache)  │
└──────────────────┘    └──────────────────┘
```

---

## 8 Docker Containers

| Container | Port | Role |
|---|---|---|
| `governance` | 8001 | FastAPI — admin, CRM, policy, analytics |
| `ingest` | 8000 | FastAPI — ticket ingestion (5-phase pipeline) |
| `postgres` | 5432 | PostgreSQL 14 — primary data store |
| `redis` | 6379 | Redis 7 — streams + Celery broker |
| `weaviate` | 8080 | Vector DB — rule candidates + issue taxonomy |
| `worker-poll` | — | Stream poll loop (dispatches to Celery) |
| `worker-celery` | — | Celery worker (4-stage Cardinal pipeline) |
| `ui` | 5173 | React 19 + Vite — frontend |

---

## Quick Start

### Prerequisites
- Docker + Docker Compose
- OpenAI API key

### 1. Clone & configure
```bash
git clone <repo-url>
cd kirana_kart_final
cp .env.example .env
# Fill in DB_HOST, DB_PASSWORD, OPENAI_API_KEY, JWT_SECRET_KEY, etc.
```

### 2. Start all services
```bash
docker compose up -d
```

### 3. Access
| Service | URL |
|---|---|
| Frontend | http://localhost:5173 |
| Governance API docs | http://localhost:8001/docs |
| Ingest API docs | http://localhost:8000/docs |

### 4. Default admin
```
Email:    admin@kirana.local
Password: REDACTED
```

---

## Authentication & RBAC

- **JWT** (python-jose) + **bcrypt** passwords (passlib, pinned `<4.0.0`)
- 60-minute access tokens + 30-day refresh tokens with rotation
- OAuth: GitHub, Google, Microsoft
- Per-module permissions: `{view, edit, admin}` booleans
- `is_super_admin` flag bypasses all checks

### Modules & Roles

| Module | Description | Default access |
|---|---|---|
| `dashboard` | Overview & stats | view |
| `tickets` | Ticket list & pipeline status | view |
| `crm` | HITL queue, agent dashboard, reports | edit (agents), admin (supervisors) |
| `knowledgeBase` | KB upload, compiler, vectorize | edit |
| `policy` | Version management, simulation, shadow | edit/admin |
| `customers` | Customer 360° profiles | view |
| `analytics` | FCR, spike, agent quality | view |
| `biAgent` | BI chat agent | edit |
| `qaAgent` | QA evaluation agent | admin |
| `system` | System config, beat schedule | admin |
| `sandbox` | Dev sandbox | admin |

---

## The Cardinal Pipeline (4 Stages)

Every ticket that enters the HITL/MANUAL_REVIEW pathway passes through all 4 stages:

```
Stage 0 — Classification         gpt-4o-mini
  ↓  issue_type_l1, issue_type_l2, confidence

Stage 1 — LLM Evaluation         gpt-4.1 + Weaviate rule candidates
  ↓  action_code, refund amount, fraud segment, greedy classification

Stage 2 — Deterministic Validation   pure Python (no LLM)
  ↓  final_action_code, automation_pathway (AUTO_RESOLVED | HITL | MANUAL_REVIEW)

Stage 3 — HITL Response Draft    pure Python (HITL cases only)
  ↓  response_draft, hitl_queue assignment
```

Stage 2 is 100% deterministic — it reads `master_action_codes` flags (`requires_escalation`, `automation_eligible`, `requires_refund`) and applies strict routing logic regardless of LLM output.

---

## CRM System (Freshdesk-equivalent)

A full production-grade internal CRM built on top of the pipeline HITL output.

### Features
- **Ticket queue** with filters (queue type, status, priority, SLA breach, tags, agent)
- **Work view** — split-pane: conversation thread + notes + AI recommendation + action panel
- **Status lifecycle**: Open → In Progress → Pending Customer → Escalated → Resolved → Closed
- **SLA tracking** — resolution SLA + first-response SLA, breach detection, countdown timers
- **AI Recommendation panel** — action code, refund amount, confidence, fraud segment, reasoning
- **Approve / Reject / Modify** AI recommendation with reason capture
- **Internal notes** + customer reply composition
- **Canned responses** from `response_templates` table
- **Customer 360°** — order history, refund history, CSAT, tier, churn probability
- **Audit timeline** — immutable log of every action taken on a ticket
- **Bulk actions** — assign, escalate, close, status change
- **Ticket merge** with audit trail
- **Tag management** + per-ticket tagging
- **Ticket watchers** + in-app notifications
- **Saved filter views** per agent
- **Agent collision detection** (viewing lock)
- **Agent personal dashboard** — volume, avg resolution time, CSAT, approval rate
- **Admin supervisor dashboard** — queue health grid, SLA compliance, volume trend, aging buckets
- **Reports** — volume by agent, SLA compliance, resolution time, action code distribution, refund analysis, first response

### Queue Types & SLA Policy

| Queue | Resolution SLA | First Response SLA |
|---|---|---|
| `ESCALATION_QUEUE` | 60 min | 15 min |
| `SLA_BREACH_REVIEW` | 120 min | 20 min |
| `SENIOR_REVIEW` | 240 min | 30 min |
| `MANUAL_REVIEW` | 240 min | 30 min |
| `STANDARD_REVIEW` | 480 min | 60 min |

### CRM Database Tables
- `kirana_kart.hitl_queue` — central work queue (9 indexes, SLA timestamps, AI snapshot)
- `kirana_kart.crm_notes` — thread entries (internal / customer reply / escalation / system)
- `kirana_kart.crm_agent_actions` — immutable audit log (25+ action types)
- `kirana_kart.crm_tags` + `crm_ticket_tags` — tag system
- `kirana_kart.crm_watchers` — ticket watchers
- `kirana_kart.crm_notifications` — in-app notification system (12 event types)
- `kirana_kart.crm_saved_views` — per-agent filter presets
- `kirana_kart.crm_merge_log` — merge audit
- `kirana_kart.users.crm_availability` — agent availability (ONLINE/BUSY/AWAY/OFFLINE)

---

## Policy Simulation

The Simulation tab in Policy Management lets you run a real ticket through the **full 4-stage Cardinal pipeline** for two policy versions side-by-side.

### How It Works
1. Select a real ticket from the `fdraw` table
2. Choose a baseline and candidate policy version
3. Click **Run Cardinal Simulation**
4. Stage 0 runs once (classification is version-agnostic)
5. Stages 1–3 run for each version with their respective Weaviate rule candidates
6. Results show:
   - Stage 0: issue classification + confidence
   - Stage 1 comparison: LLM action code, fraud/greedy signals, confidence, reasoning
   - Stage 2 comparison: final decision, automation pathway, discrepancy detection
   - Stage 3 (if HITL): response draft + queue assignment
   - Decision diff banner: changed action, pathway, refund amount

### Endpoints
```
POST /simulation/run-ticket-cardinal   # full 4-stage Cardinal per version
POST /simulation/run-ticket            # local rule-matching trace (lightweight)
POST /simulation/run                   # batch simulation over sample_tickets table
GET  /simulation/tickets               # ticket search for picker
GET  /simulation/ticket/{id}           # single ticket detail
```

---

## Policy Document Lifecycle

```
1. Author KB document (Markdown)
2. POST /kb/upload  →  stored in knowledge_base_raw_uploads
3. POST /compiler/extract-actions
      LLM pass extracts Action Code Registry
      → upserts into master_action_codes (with flags)
4. POST /compiler/compile-latest
      LLM reads full document, maps rules → action_codes
      → writes rows to rule_registry
5. POST /vectorization/vectorize
      Embeds rules into Weaviate (policy_rule_candidates collection)
6. POST /kb/publish  →  updates kb_runtime_config.active_version
```

> **Important:** Always run `extract-actions` before `compile-latest`. New action codes must exist in `master_action_codes` before the compiler can reference them — otherwise Stage 2 silently defaults to `automation_eligible=True`, auto-resolving tickets that should be escalated.

---

## Module Overview

```
kirana_kart/
├── app/
│   ├── admin/
│   │   ├── main.py                    # FastAPI app, route registration, startup
│   │   ├── routes/
│   │   │   ├── auth_routes.py         # /auth/* — login, signup, refresh, OAuth
│   │   │   ├── user_management.py     # /users/* — CRUD + permissions
│   │   │   ├── crm_routes.py          # /crm/* — 30 CRM endpoints
│   │   │   └── ...
│   │   └── services/
│   │       ├── auth_service.py        # JWT, bcrypt, UserContext, RBAC
│   │       ├── crm_service.py         # Full CRM business logic
│   │       └── oauth_service.py       # GitHub/Google/Microsoft OAuth
│   │
│   ├── l1_ingest/                     # 5-phase ingestion pipeline
│   ├── l2_enrichment/                 # Order context, GPS, customer risk
│   ├── l3_analytics/                  # FCR checker, spike detection, clustering
│   ├── l4_agents/
│   │   ├── worker.py                  # Celery task — orchestrates 4 stages
│   │   └── ecommerce/
│   │       ├── stage0_classifier.py   # gpt-4o-mini classification
│   │       ├── stage1_evaluator.py    # gpt-4.1 + Weaviate evaluation
│   │       ├── stage2_validator.py    # Deterministic routing (no LLM)
│   │       └── stage3_responder.py    # HITL response draft (no LLM)
│   └── l45_ml_platform/
│       └── simulation/
│           ├── policy_simulation_service.py   # Cardinal + rule-trace simulation
│           └── routes.py                      # /simulation/* endpoints

kirana_kart_ui/src/
├── pages/
│   ├── crm/                           # CRM queue, work view, dashboards, reports
│   ├── policy/PolicyPage.tsx          # Versions + Cardinal Simulation + Shadow
│   ├── analytics/                     # FCR, spike, agent quality tabs
│   └── ...
├── api/governance/
│   ├── crm.api.ts                     # All CRM API calls
│   ├── simulation.api.ts              # Simulation API calls
│   └── ...
└── types/crm.types.ts                 # Full CRM TypeScript interfaces
```

---

## Database Schema

All tables live in the `kirana_kart` schema of the `orgintelligence` PostgreSQL database.

### Core Pipeline Tables
| Table | Purpose |
|---|---|
| `fdraw` | Raw tickets — subject, description, cx_email, module, canonical_payload |
| `llm_output_1` | Stage 0 output — issue_type_l1/l2, confidence |
| `llm_output_2` | Stage 1 output — action_code, fraud_segment, greedy_classification, refund calc |
| `llm_output_3` | Stage 2 output — final_action_code, automation_pathway, policy_version |
| `conversations` + `conversation_turns` | Full chat history per ticket |

### Policy Tables
| Table | Purpose |
|---|---|
| `knowledge_base_raw_uploads` | Raw KB markdown documents |
| `kb_versions` | Compiled policy versions |
| `kb_runtime_config` | Active policy version pointer |
| `rule_registry` | Compiled rules per policy version |
| `master_action_codes` | Action codes with routing flags |
| `weaviate` (external) | Vector-embedded rule candidates |

### CRM Tables
| Table | Purpose |
|---|---|
| `hitl_queue` | Central HITL work queue |
| `crm_notes` | Thread entries (internal / customer reply) |
| `crm_agent_actions` | Immutable audit log |
| `crm_tags` / `crm_ticket_tags` | Tag system |
| `crm_watchers` | Ticket watchers |
| `crm_notifications` | In-app notifications |
| `crm_saved_views` | Per-agent filter presets |
| `crm_merge_log` | Merge audit trail |

### Supporting Tables
| Table | Purpose |
|---|---|
| `users` + `user_permissions` | Auth + RBAC |
| `orders` + `customers` | Order/customer context |
| `refunds` | Refund history |
| `response_templates` | Canned responses by action code |
| `agent_quality_flags` | QA coaching flags |
| `csat_responses` | Customer satisfaction scores |
| `cardinal_beat_schedule` | Celery Beat task registry |

---

## API Reference

### Authentication
```
POST /auth/login          # Email + password → access + refresh tokens
POST /auth/signup         # Create account
POST /auth/refresh        # Rotate refresh token
POST /auth/logout         # Invalidate refresh token
GET  /auth/me             # Current user profile
GET  /auth/github         # OAuth redirect
GET  /auth/google         # OAuth redirect
GET  /auth/microsoft      # OAuth redirect
```

### CRM
```
GET    /crm/queue                      # Paginated queue with filters
GET    /crm/queue/{id}                 # Full work-view detail
POST   /crm/queue/{id}/action          # Take action (approve/reject/resolve/escalate/...)
POST   /crm/queue/{id}/notes           # Add note
POST   /crm/queue/{id}/assign          # Assign to agent
POST   /crm/queue/{id}/self-assign     # Self-assign
POST   /crm/queue/bulk-assign          # Bulk assign
POST   /crm/queue/bulk-escalate        # Bulk escalate
POST   /crm/queue/bulk-close           # Bulk close
GET    /crm/dashboard/agent            # Agent personal dashboard
GET    /crm/dashboard/admin            # Supervisor dashboard
GET    /crm/reports                    # Analytics reports
GET    /crm/agents                     # Agent list with availability
GET    /crm/notifications              # In-app notifications
```

### Policy
```
GET    /simulation/tickets             # Real ticket search for simulation picker
POST   /simulation/run-ticket-cardinal # Full 4-stage Cardinal simulation
POST   /simulation/run-ticket          # Rule-trace simulation (lightweight)
POST   /kb/upload                      # Upload KB document
POST   /compiler/extract-actions       # Extract action codes from KB
POST   /compiler/compile-latest        # Compile rules to rule_registry
POST   /vectorization/vectorize        # Embed rules into Weaviate
POST   /kb/publish                     # Publish policy version
```

---

## Environment Variables

```env
# Database
DB_HOST=postgres
DB_PORT=5432
DB_NAME=orgintelligence
DB_USER=orguser
DB_PASSWORD=your_password

# Redis
REDIS_URL=redis://redis:6379/0

# Weaviate
WEAVIATE_HOST=weaviate
WEAVIATE_PORT=8080

# OpenAI
OPENAI_API_KEY=sk-...

# JWT
JWT_SECRET_KEY=your_secret_key_min_32_chars
JWT_ALGORITHM=HS256

# OAuth (optional)
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=

# App
FRONTEND_URL=http://localhost:5173
```

---

## Common Commands

```bash
# Start all services
docker compose up -d

# Rebuild after code changes
docker compose up --build -d governance ui

# View governance logs
docker logs -f kirana_kart_final-governance-1

# View Celery worker logs
docker logs -f kirana_kart_final-worker-celery-1

# Run a database migration / check tables
docker exec -it kirana_kart_final-postgres-1 psql -U orguser -d orgintelligence

# Stop all
docker compose down

# Stop and wipe volumes (full reset)
docker compose down -v
```

---

## Development Notes

- **Rule matching fix (v4+):** `_fetch_rules` no longer filters by `module` — ticket module labels ("delivery") don't match `rule_registry.module_name` values ("Fraud & Abuse Intelligence"). All rules for the active policy version are fetched; the LLM + Weaviate determine applicability.
- **Stage 2 is deterministic:** `stage2_validator.py` makes zero LLM calls. It reads `master_action_codes.requires_escalation`, `automation_eligible`, `requires_refund` to route tickets. New action codes MUST be extracted via `/compiler/extract-actions` before compiling, or Stage 2 silently auto-resolves escalation-required tickets.
- **CRM enqueue is non-fatal:** The worker wraps CRM enqueue in try/except — a CRM failure never blocks pipeline completion.
- **Cardinal Simulation writes nothing to DB:** `simulate_ticket_cardinal()` calls stage `.run()` functions directly, bypassing the `_run_stage_*` DB-write wrappers in `worker.py`.
- **bcrypt pinned:** `bcrypt<4.0.0` required for passlib 1.7.x compatibility.
- **JWT key:** `kk_auth` localStorage key (not the old `kk_admin_token`).

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Simulation returns "No rules found" | Policy version has no compiled rules | Upload KB → extract-actions → compile → vectorize |
| Stage 2 auto-resolves escalation cases | Action code missing from `master_action_codes` | Run `/compiler/extract-actions` before compile |
| CRM queue empty | Worker not running or pipeline not completing | Check `docker logs worker-celery-1` |
| Weaviate returns empty rule candidates | Rules not vectorized for that policy version | Run `/vectorization/vectorize` |
| Auth token expired | Access token TTL is 60 minutes | Frontend auto-refreshes via interceptor |

---

## Production Checklist

- [ ] Change `admin@kirana.local` bootstrap password
- [ ] Set strong `JWT_SECRET_KEY` (32+ random bytes)
- [ ] Set strong `DB_PASSWORD`
- [ ] Configure OAuth client IDs/secrets
- [ ] Set `FRONTEND_URL` to production domain
- [ ] Enable HTTPS (reverse proxy / load balancer)
- [ ] Set up PostgreSQL backups
- [ ] Configure Celery Beat for `crm-auto-escalate-15m` task
- [ ] Monitor Weaviate memory (default 1Gi limit in compose)
- [ ] Rotate JWT secret on suspected compromise

---

*All company names, persons, financial figures, and business metrics in this project are entirely fictional and for demonstration purposes only.*
