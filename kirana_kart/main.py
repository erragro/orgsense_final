"""
main.py — Cardinal Ingest Plane
=================================
FastAPI application for the Cardinal ingestion pipeline.

This is a SEPARATE service from the governance/admin plane
(app/admin/main.py). They run as independent processes:

    Governance plane:  uvicorn app.admin.main:app --port 8001
    Cardinal plane:    uvicorn main:app --port 8000

Why separate:
    The governance plane manages KB compilation, vectorisation,
    policy publishing, and shadow testing — long-running admin
    operations that should not share a process with the
    high-throughput ingest path.

    The Cardinal ingest plane handles real-time ticket ingestion.
    It must stay lean, fast, and isolated from admin operations.

Routes registered:
    POST /cardinal/ingest   — main ingest endpoint (phase1→5 pipeline)
    GET  /health            — liveness probe
    GET  /system-status     — DB + Redis connectivity check
"""

import logging
import os
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv

load_dotenv()

from app.middleware.logging_middleware import configure_logging, CorrelationIdMiddleware
from app.metrics import configure_otel, metrics_endpoint

logger = logging.getLogger("kirana_kart.ingest")

# ----------------------------------------------------------------
# LIFESPAN — startup / shutdown hooks
# ----------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Cardinal ingest plane starting")
    yield
    logger.info("Cardinal ingest plane shutting down")


# ----------------------------------------------------------------
# OBSERVABILITY — before app creation so FastAPIInstrumentor wraps
# the ASGI stack before the middleware stack is frozen.
# ----------------------------------------------------------------

configure_logging()

# ----------------------------------------------------------------
# APP
# ----------------------------------------------------------------

app = FastAPI(
    title="OrgIntelligence — Cardinal Ingest Plane",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# CORS for local UI access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(CorrelationIdMiddleware)

# OTel — after app + middleware are registered, before first request
configure_otel(app, service_name="kirana-kart-ingest")

# ----------------------------------------------------------------
# ROUTE REGISTRATION
# ----------------------------------------------------------------

from app.l2_cardinal.routes import router as cardinal_router

app.include_router(cardinal_router)
app.add_route("/metrics", metrics_endpoint)

# ----------------------------------------------------------------
# HEALTH
# ----------------------------------------------------------------

@app.get("/health", tags=["Ops"])
def health():
    return {"status": "ok", "service": "cardinal-ingest"}


# ----------------------------------------------------------------
# SYSTEM STATUS
# ----------------------------------------------------------------

@app.get("/system-status", tags=["Ops"])
def system_status():

    status = {
        "status": "unhealthy",
        "database": "error",
        "redis": "error",
        "active_version": None,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }

    # ---- Database --------------------------------------------------
    try:
        import psycopg2
        conn = psycopg2.connect(
            host=os.getenv("DB_HOST"),
            port=os.getenv("DB_PORT", "5432"),
            dbname=os.getenv("DB_NAME"),
            user=os.getenv("DB_USER"),
            password=os.getenv("DB_PASSWORD"),
        )
        with conn.cursor() as cur:
            cur.execute("SELECT 1")
        conn.close()
        status["database"] = "ok"
    except Exception as e:
        status["database"] = "error"

    # ---- Redis -----------------------------------------------------
    try:
        from app.admin.redis_client import get_redis
        r = get_redis()
        r.ping()
        status["redis"] = "ok"
    except Exception as e:
        status["redis"] = "error"

    # ---- Active policy version ------------------------------------
    try:
        import psycopg2
        conn = psycopg2.connect(
            host=os.getenv("DB_HOST"),
            port=os.getenv("DB_PORT", "5432"),
            dbname=os.getenv("DB_NAME"),
            user=os.getenv("DB_USER"),
            password=os.getenv("DB_PASSWORD"),
        )
        with conn.cursor() as cur:
            cur.execute(
                "SELECT active_version FROM kirana_kart.kb_runtime_config "
                "ORDER BY id DESC LIMIT 1"
            )
            row = cur.fetchone()
        conn.close()
        status["active_version"] = row[0] if row else None
    except Exception:
        status["active_version"] = None

    ok_count = sum(1 for k in ("database", "redis") if status[k] == "ok")
    if ok_count == 2:
        status["status"] = "healthy"
    elif ok_count > 0:
        status["status"] = "degraded"
    else:
        status["status"] = "unhealthy"

    return status
