"""
app/admin/routes/bi_agent.py
=============================
BI Agent routes — governance plane (port 8001).

Endpoints:
  GET  /bi-agent/modules               → taxonomy issue types for filter dropdown
  GET  /bi-agent/sessions              → list chat sessions for current token
  POST /bi-agent/sessions              → create new chat session
  PATCH /bi-agent/sessions/{id}        → rename session
  DELETE /bi-agent/sessions/{id}       → delete session + messages
  GET  /bi-agent/sessions/{id}/messages → message history
  POST /bi-agent/query                 → STREAMING analyst query (text/event-stream)
"""

from __future__ import annotations

import hashlib
import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import text

from app.admin.db import get_db_session, engine
from app.admin.routes.auth import authorize, require_role
from app.admin.services.bi_agent_service import (
    understand_question,
    generate_sql,
    validate_sql,
    execute_sql,
    stream_response,
)

logger = logging.getLogger("kirana_kart.bi_agent")

router = APIRouter(prefix="/bi-agent", tags=["bi-agent"])


# ============================================================
# STARTUP — ensure tables exist
# ============================================================

def ensure_bi_tables() -> None:
    """Create BI chat tables if they don't exist yet."""
    ddl = """
    CREATE TABLE IF NOT EXISTS kirana_kart.bi_chat_sessions (
        id          SERIAL PRIMARY KEY,
        label       VARCHAR(200) NOT NULL DEFAULT 'New Chat',
        token_hash  VARCHAR(64)  NOT NULL,
        created_at  TIMESTAMPTZ  DEFAULT NOW(),
        updated_at  TIMESTAMPTZ  DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS kirana_kart.bi_chat_messages (
        id          SERIAL PRIMARY KEY,
        session_id  INT          NOT NULL
                        REFERENCES kirana_kart.bi_chat_sessions(id) ON DELETE CASCADE,
        role        VARCHAR(20)  NOT NULL,
        content     TEXT         NOT NULL,
        sql_query   TEXT,
        created_at  TIMESTAMPTZ  DEFAULT NOW()
    );
    """
    try:
        with engine.connect() as conn:
            conn.execute(text(ddl))
            conn.commit()
        logger.info("BI chat tables ensured.")
    except Exception as exc:
        logger.error("Failed to create BI chat tables: %s", exc)


# ============================================================
# HELPERS
# ============================================================

def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


# ============================================================
# REQUEST / RESPONSE MODELS
# ============================================================

class CreateSessionRequest(BaseModel):
    label: str = Field(default="New Chat", max_length=200)


class RenameSessionRequest(BaseModel):
    label: str = Field(..., max_length=200)


class QueryRequest(BaseModel):
    session_id: int
    question: str = Field(..., min_length=3, max_length=2000)
    module: str = Field(..., min_length=1)
    date_from: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    date_to: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")


# ============================================================
# GET /bi-agent/modules
# ============================================================

@router.get("/modules")
def get_modules(token: str = Depends(authorize)):
    require_role(token, ["viewer", "editor", "publisher"])

    with get_db_session() as session:
        rows = session.execute(
            text("""
                SELECT segment                  AS issue_code,
                       INITCAP(segment)         AS label,
                       COUNT(*)::int            AS customer_count
                FROM kirana_kart.customers
                WHERE segment IS NOT NULL
                GROUP BY segment
                ORDER BY COUNT(*) DESC
            """)
        ).mappings().all()

    return [dict(r) for r in rows]


# ============================================================
# GET /bi-agent/sessions
# ============================================================

@router.get("/sessions")
def list_sessions(token: str = Depends(authorize)):
    require_role(token, ["viewer", "editor", "publisher"])
    th = _token_hash(token)

    with get_db_session() as session:
        rows = session.execute(
            text("""
                SELECT id, label, created_at, updated_at
                FROM kirana_kart.bi_chat_sessions
                WHERE token_hash = :th
                ORDER BY updated_at DESC
            """),
            {"th": th},
        ).mappings().all()

    return [dict(r) for r in rows]


# ============================================================
# POST /bi-agent/sessions
# ============================================================

@router.post("/sessions", status_code=201)
def create_session(
    body: CreateSessionRequest,
    token: str = Depends(authorize),
):
    require_role(token, ["viewer", "editor", "publisher"])
    th = _token_hash(token)

    with get_db_session() as session:
        row = session.execute(
            text("""
                INSERT INTO kirana_kart.bi_chat_sessions (label, token_hash)
                VALUES (:label, :th)
                RETURNING id, label, created_at, updated_at
            """),
            {"label": body.label, "th": th},
        ).mappings().first()

    return dict(row)


# ============================================================
# PATCH /bi-agent/sessions/{session_id}
# ============================================================

@router.patch("/sessions/{session_id}")
def rename_session(
    session_id: int,
    body: RenameSessionRequest,
    token: str = Depends(authorize),
):
    require_role(token, ["viewer", "editor", "publisher"])
    th = _token_hash(token)

    with get_db_session() as session:
        row = session.execute(
            text("""
                UPDATE kirana_kart.bi_chat_sessions
                SET label = :label, updated_at = NOW()
                WHERE id = :sid AND token_hash = :th
                RETURNING id, label, updated_at
            """),
            {"label": body.label, "sid": session_id, "th": th},
        ).mappings().first()

    if not row:
        raise HTTPException(status_code=404, detail="Session not found")
    return dict(row)


# ============================================================
# DELETE /bi-agent/sessions/{session_id}
# ============================================================

@router.delete("/sessions/{session_id}", status_code=204)
def delete_session(
    session_id: int,
    token: str = Depends(authorize),
):
    require_role(token, ["viewer", "editor", "publisher"])
    th = _token_hash(token)

    with get_db_session() as session:
        result = session.execute(
            text("""
                DELETE FROM kirana_kart.bi_chat_sessions
                WHERE id = :sid AND token_hash = :th
            """),
            {"sid": session_id, "th": th},
        )
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Session not found")


# ============================================================
# GET /bi-agent/sessions/{session_id}/messages
# ============================================================

@router.get("/sessions/{session_id}/messages")
def get_messages(
    session_id: int,
    token: str = Depends(authorize),
):
    require_role(token, ["viewer", "editor", "publisher"])
    th = _token_hash(token)

    # Verify ownership
    with get_db_session() as session:
        owner = session.execute(
            text("""
                SELECT id FROM kirana_kart.bi_chat_sessions
                WHERE id = :sid AND token_hash = :th
            """),
            {"sid": session_id, "th": th},
        ).first()
        if not owner:
            raise HTTPException(status_code=404, detail="Session not found")

        rows = session.execute(
            text("""
                SELECT id, role, content, sql_query, created_at
                FROM kirana_kart.bi_chat_messages
                WHERE session_id = :sid
                ORDER BY created_at ASC
            """),
            {"sid": session_id},
        ).mappings().all()

    return [dict(r) for r in rows]


# ============================================================
# POST /bi-agent/query  (STREAMING)
# ============================================================

@router.post("/query")
async def query_stream(
    body: QueryRequest,
    token: str = Depends(authorize),
):
    require_role(token, ["viewer", "editor", "publisher"])
    th = _token_hash(token)

    # Verify session ownership
    with get_db_session() as session:
        owner = session.execute(
            text("""
                SELECT id FROM kirana_kart.bi_chat_sessions
                WHERE id = :sid AND token_hash = :th
            """),
            {"sid": body.session_id, "th": th},
        ).first()
    if not owner:
        raise HTTPException(status_code=404, detail="Session not found")

    def _sse_event(payload: dict) -> str:
        return f"data: {json.dumps(payload)}\n\n"

    def _generate():
        assistant_content = ""
        final_sql = ""

        try:
            # ── Step 1: Understand question ──────────────────────────
            yield _sse_event({"type": "status", "text": "Understanding your question…"})

            intent = understand_question(
                body.question, body.module, body.date_from, body.date_to
            )

            # ── Step 2: Generate SQL ──────────────────────────────────
            yield _sse_event({"type": "status", "text": "Generating SQL query…"})

            raw_sql = generate_sql(intent, body.module, body.date_from, body.date_to)

            try:
                clean_sql = validate_sql(raw_sql)
            except ValueError as e:
                yield _sse_event({"type": "error", "text": f"SQL validation failed: {e}"})
                return

            final_sql = clean_sql
            yield _sse_event({"type": "sql", "query": clean_sql})

            # ── Step 3: Execute SQL ───────────────────────────────────
            yield _sse_event({"type": "status", "text": "Querying the database…"})

            try:
                rows = execute_sql(clean_sql)
            except Exception as e:
                logger.error("SQL execution error: %s", e)
                yield _sse_event({"type": "error", "text": f"Query execution failed: {e}"})
                return

            row_count = len(rows)
            yield _sse_event({"type": "status", "text": f"Analysing {row_count} rows…"})

            # ── Step 4: Stream analyst response ──────────────────────
            for chunk in stream_response(body.question, intent, clean_sql, rows):
                # chunk is already an SSE string; extract text for saving
                try:
                    inner = json.loads(chunk.removeprefix("data: ").strip())
                    assistant_content += inner.get("text", "")
                except Exception:
                    pass
                yield chunk

            yield _sse_event({"type": "done"})

        except Exception as exc:
            logger.error("BI Agent stream error: %s", exc, exc_info=True)
            yield _sse_event({"type": "error", "text": "An unexpected error occurred. Please try again."})
        finally:
            # Persist both messages to DB
            try:
                with get_db_session() as session:
                    session.execute(
                        text("""
                            INSERT INTO kirana_kart.bi_chat_messages
                                (session_id, role, content, sql_query)
                            VALUES (:sid, 'user', :content, NULL)
                        """),
                        {"sid": body.session_id, "content": body.question},
                    )
                    if assistant_content:
                        session.execute(
                            text("""
                                INSERT INTO kirana_kart.bi_chat_messages
                                    (session_id, role, content, sql_query)
                                VALUES (:sid, 'assistant', :content, :sql)
                            """),
                            {
                                "sid": body.session_id,
                                "content": assistant_content,
                                "sql": final_sql or None,
                            },
                        )
                    # Touch session updated_at
                    session.execute(
                        text("""
                            UPDATE kirana_kart.bi_chat_sessions
                            SET updated_at = NOW()
                            WHERE id = :sid
                        """),
                        {"sid": body.session_id},
                    )
            except Exception as db_exc:
                logger.error("Failed to persist BI messages: %s", db_exc)

    return StreamingResponse(
        _generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
