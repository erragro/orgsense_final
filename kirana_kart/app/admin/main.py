# app/admin/main.py
#
# Kirana Kart Governance Control Plane
# Runs on port 8001. Cardinal ingest plane is separate (main.py, port 8000).

import threading
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.middleware.base import BaseHTTPMiddleware
from sqlalchemy import text

from app.config import settings
from app.admin.db import engine
from app.middleware.logging_middleware import (
    CorrelationIdMiddleware,
    configure_logging,
)
from app.metrics import (
    configure_otel,
    metrics_endpoint,
    update_pool_metrics,
    vector_worker_running,
    vector_worker_last_heartbeat,
)
from app.admin.services.auth_service import ensure_auth_tables, ensure_bootstrap_admin
from app.admin.routes.bi_agent import ensure_bi_tables
from app.admin.routes.qa_agent import ensure_qa_tables
from app.admin.routes.cardinal import ensure_schedule_table, ensure_master_action_codes_constraints
from app.admin.services.integration_service import ensure_integration_tables, run_integration_poller
from app.admin.services.crm_service import ensure_crm_tables
from app.middleware.pii_audit_middleware import ensure_pii_audit_table
from app.admin.services.bpm_tables import ensure_bpm_tables

import logging

logger = logging.getLogger("kirana_kart.governance")


# ============================================================
# VECTOR BACKGROUND WORKER
# ============================================================

from app.l45_ml_platform.vectorization.vector_service import VectorService

_worker_thread: threading.Thread | None = None
_worker_running: bool = False
_worker_last_heartbeat: float = 0.0      # unix timestamp
_worker_jobs_processed: int = 0


def _vector_worker_loop() -> None:
    """
    Continuous background job runner — polls kb_vector_jobs every
    VECTOR_WORKER_POLL_INTERVAL seconds for pending vectorization work.

    Production note: For a multi-instance deployment, migrate this to
    a Celery Beat scheduled task to avoid multiple instances competing
    on the same jobs (the FOR UPDATE SKIP LOCKED handles it safely, but
    Celery Beat is more observable and manageable).
    """
    global _worker_running, _worker_last_heartbeat, _worker_jobs_processed

    _worker_running = True
    service = VectorService()

    while _worker_running:
        try:
            service.run_pending_jobs()
            _worker_jobs_processed += 1
        except Exception as exc:
            logger.error("Vector worker error: %s", exc, exc_info=True)

        # Update observability metrics
        _worker_last_heartbeat = time.time()
        vector_worker_running.set(1)
        vector_worker_last_heartbeat.set(_worker_last_heartbeat)
        update_pool_metrics()

        time.sleep(settings.vector_worker_poll_interval)

    _worker_running = False
    vector_worker_running.set(0)


def start_background_worker() -> None:
    """Start the vectorization worker thread (idempotent)."""
    global _worker_thread

    if _worker_thread and _worker_thread.is_alive():
        return

    _worker_thread = threading.Thread(
        target=_vector_worker_loop,
        daemon=True,
        name="kirana-vector-worker",
    )
    _worker_thread.start()
    logger.info(
        "Vector background worker started | poll_interval=%ds",
        settings.vector_worker_poll_interval,
    )


# ============================================================
# FASTAPI LIFESPAN
# ============================================================

def _run_startup_ddl() -> None:
    """Run all DDL migrations under a PostgreSQL advisory lock (lock id 88010001).
    Only one Cloud Run instance will execute the DDL block at a time; others wait."""
    import time as _time
    _LOCK_ID = 88010001
    with engine.connect() as conn:
        while True:
            locked = conn.execute(text("SELECT pg_try_advisory_lock(:id)"), {"id": _LOCK_ID}).scalar()
            if locked:
                break
            logger.info("Startup DDL lock held by another instance — waiting 2s...")
            _time.sleep(2)
        try:
            ensure_auth_tables()
            ensure_bootstrap_admin()
            ensure_bi_tables()
            ensure_qa_tables()
            ensure_schedule_table()
            ensure_master_action_codes_constraints()
            ensure_crm_tables()
            from app.admin.services.crm_automation_engine import seed_cardinal_rules
            seed_cardinal_rules()
            ensure_integration_tables()
            ensure_pii_audit_table()
            ensure_bpm_tables(engine)
        finally:
            conn.execute(text("SELECT pg_advisory_unlock(:id)"), {"id": _LOCK_ID})


@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- Startup ---
    _run_startup_ddl()
    threading.Thread(
        target=run_integration_poller,
        daemon=True,
        name="kirana-integration-poller",
    ).start()
    start_background_worker()
    logger.info(
        "Governance control plane starting | version=%s", settings.service_version
    )
    yield
    # --- Shutdown ---
    global _worker_running
    _worker_running = False
    logger.info("Governance control plane shutting down")


# ============================================================
# OBSERVABILITY — must run before app creation so FastAPIInstrumentor
# can wrap the ASGI stack before the middleware stack is frozen.
# ============================================================

configure_logging()

# ============================================================
# RATE LIMITER
# ============================================================

from app.admin.rate_limiter import limiter  # noqa: E402 — after configure_logging()


# ============================================================
# SECURITY HEADERS MIDDLEWARE
# ============================================================

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Inject OWASP-recommended security headers on every response."""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
        # HSTS: only effective over HTTPS — safe to set always (browsers ignore over HTTP)
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"
        return response


# ============================================================
# APP
# ============================================================

app = FastAPI(
    title="Kirana Kart Governance Control Plane",
    version=settings.service_version,
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# Rate limiter state + error handler
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


# ============================================================
# GLOBAL ERROR HANDLER — prevent internal details leaking to clients
# ============================================================

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """
    Catch-all handler: log the full exception server-side,
    return a generic 500 message to the client — never expose
    stack traces, SQL errors, or internal paths externally.
    """
    logger.exception(
        "Unhandled exception | method=%s path=%s",
        request.method,
        request.url.path,
        exc_info=exc,
    )
    return JSONResponse(
        status_code=500,
        content={"detail": "An internal server error occurred. Please contact support."},
    )

# Security headers on every response
app.add_middleware(SecurityHeadersMiddleware)

# CORS for UI — allow credentials (needed for Authorization header + cookies)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Correlation-ID"],
)

# Correlation ID injection + structured request logging
app.add_middleware(CorrelationIdMiddleware)

# OTel FastAPI instrumentation — called here (module level, after app creation,
# before first request) so the middleware stack is not yet frozen.
configure_otel(app)

# Prometheus scrape endpoint
app.add_route("/metrics", metrics_endpoint)

# ============================================================
# ROUTE REGISTRATION
# ============================================================

from app.admin.routes.taxonomy import router as taxonomy_router
from app.admin.routes.tickets import router as tickets_router
from app.admin.routes.customers import router as customers_router
from app.admin.routes.analytics import router as analytics_router
from app.admin.routes.system import router as system_router
from app.admin.routes.session import router as session_router
from app.admin.routes.auth_routes import router as auth_router
from app.admin.routes.user_management import router as user_management_router
from app.l1_ingestion.kb_registry.routes import router as kb_router
from app.l45_ml_platform.compiler.routes import router as compiler_router
from app.l45_ml_platform.vectorization.routes import router as vector_router
from app.l45_ml_platform.simulation.routes import router as simulation_router
from app.l5_intelligence.policy_shadow.routes import router as shadow_router
from app.admin.routes.bi_agent import router as bi_agent_router
from app.admin.routes.qa_agent import router as qa_agent_router
from app.admin.routes.integrations import router as integrations_router
from app.admin.routes.cardinal import router as cardinal_router
from app.admin.routes.crm_routes import router as crm_router
from app.admin.routes.consent_routes import router as consent_router
from app.admin.routes.data_rights_routes import router as data_rights_router
from app.admin.routes.bpm_routes import router as bpm_router
from app.admin.routes.rule_routes import router as rule_router

app.include_router(auth_router)
app.include_router(session_router)
app.include_router(user_management_router)
app.include_router(taxonomy_router)
app.include_router(tickets_router)
app.include_router(customers_router)
app.include_router(analytics_router)
app.include_router(system_router)
app.include_router(kb_router)
app.include_router(compiler_router)
app.include_router(vector_router)
app.include_router(simulation_router)
app.include_router(shadow_router)
app.include_router(bi_agent_router)
app.include_router(qa_agent_router)
app.include_router(integrations_router)
app.include_router(cardinal_router)
app.include_router(crm_router)
app.include_router(consent_router)
app.include_router(data_rights_router)
app.include_router(bpm_router)
app.include_router(rule_router)


# ============================================================
# HEALTH CHECK
# ============================================================

@app.get("/health", tags=["ops"])
def health():
    """
    Liveness probe — returns 200 if the process is running.
    Does NOT check downstream dependencies (use /system-status for that).
    """
    return {"status": "ok", "service": "governance"}


# ============================================================
# WORKER HEALTH
# ============================================================

@app.get("/health/worker", tags=["ops"])
def worker_health():
    """
    Background vector worker health check.

    Returns:
        alive        — thread is running
        last_heartbeat_s — seconds since the worker last completed a poll cycle
        jobs_processed   — total job poll iterations since startup
        poll_interval_s  — configured poll interval (seconds)

    A last_heartbeat_s value significantly larger than poll_interval_s
    indicates the worker thread is stuck and may need a restart.
    """
    alive = bool(_worker_thread and _worker_thread.is_alive())
    last_heartbeat_ago = (
        round(time.time() - _worker_last_heartbeat, 1)
        if _worker_last_heartbeat else None
    )
    return {
        "status": "alive" if alive else "dead",
        "last_heartbeat_s": last_heartbeat_ago,
        "jobs_processed": _worker_jobs_processed,
        "poll_interval": settings.vector_worker_poll_interval,
    }


# ============================================================
# SYSTEM STATUS
# ============================================================

@app.get("/system-status", tags=["ops"])
def system_status():
    """
    Readiness probe — checks all downstream dependencies.
    Use this for load-balancer health checks and alerting.
    """
    from app.admin.redis_client import ping as redis_ping

    status: dict = {
        "status": "unhealthy",
        "database": "error",
        "redis": "error",
        "pgvector": "error",
        "active_version": None,
        "shadow_version": None,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }

    # Database
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        status["database"] = "ok"
    except Exception:
        status["database"] = "error"

    # Redis
    status["redis"] = "ok" if redis_ping() else "error"

    # pgvector (replaced Weaviate)
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT COUNT(*) FROM kirana_kart.kb_rule_vectors LIMIT 1"))
        status["pgvector"] = "ok"
    except Exception:
        status["pgvector"] = "error"

    # Active + shadow policy version
    try:
        with engine.connect() as conn:
            row = conn.execute(
                text("""
                    SELECT active_version, shadow_version
                    FROM kirana_kart.kb_runtime_config
                    LIMIT 1
                """)
            ).mappings().first()

        if row:
            status["active_version"] = row["active_version"]
            status["shadow_version"] = row["shadow_version"]
    except Exception:
        pass

    ok_count = sum(1 for k in ("database", "redis", "pgvector") if status[k] == "ok")
    if ok_count == 3:
        status["status"] = "healthy"
    elif ok_count > 0:
        status["status"] = "degraded"
    else:
        status["status"] = "unhealthy"

    return status
