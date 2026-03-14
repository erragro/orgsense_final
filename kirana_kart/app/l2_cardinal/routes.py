"""
app/l2_cardinal/routes.py
===========================
Cardinal FastAPI Router

Exposes one endpoint:
    POST /cardinal/ingest

Receives a CardinalIngestRequest, calls pipeline.run(),
and maps the PipelineResponse to the correct HTTP status + body.

The router is thin by design — no business logic here.
All decisions happen inside the pipeline and its phases.

Registered in main.py:
    from app.l2_cardinal.routes import router as cardinal_router
    app.include_router(cardinal_router)
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from app.l1_ingestion.schemas import CardinalIngestRequest
from app.l2_cardinal import pipeline

router = APIRouter(prefix="/cardinal", tags=["Cardinal"])

logger = logging.getLogger("cardinal.routes")


async def _raw_body(request: Request) -> bytes:
    return await request.body()


@router.post("/ingest")
def ingest(request: Request, body: CardinalIngestRequest, raw_body: bytes = Depends(_raw_body)):
    """
    Ingest a ticket through the Cardinal pipeline.

    Returns 202 Accepted on success — processing is async.
    The execution_id in the response can be used to poll
    ticket_processing_state for progress.

    Response codes:
        202  — Accepted and queued
        200  — Duplicate payload (not an error)
        401  — Source verification failed
        403  — Customer is blocked
        422  — Validation error (details in response body)
        500  — Internal system error
        503  — Service unavailable (policy missing or Redis down)
    """
    # Extract Bearer token for Phase 3 API token check
    auth_header = request.headers.get("Authorization", "")
    auth_token  = auth_header if auth_header else None

    result = pipeline.run(
        request=body,
        raw_body=raw_body,
        auth_token=auth_token,
    )

    return JSONResponse(
        status_code=result.http_status,
        content=result.body.model_dump(mode="json"),
    )