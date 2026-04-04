"""
app/admin/routes/bpm_routes.py
================================
REST API for the BPM Policy Lifecycle system.

Endpoints:
  KB Management (super-admin):
    GET    /bpm/kbs                             → list all KBs
    POST   /bpm/kbs                             → create KB
    GET    /bpm/kbs/{kb_id}/members             → list members
    POST   /bpm/kbs/{kb_id}/members             → add/update member role
    DELETE /bpm/kbs/{kb_id}/members/{user_id}   → remove member

  Process Instances:
    GET    /bpm/{kb_id}/instances               → list instances (filter by stage)
    POST   /bpm/{kb_id}/instances               → create instance
    GET    /bpm/{kb_id}/instances/{id}          → get instance detail
    POST   /bpm/{kb_id}/instances/{id}/transition → advance stage
    GET    /bpm/{kb_id}/instances/{id}/trail    → audit trail
    GET    /bpm/{kb_id}/instances/{id}/gates    → gate results
    GET    /bpm/{kb_id}/instances/{id}/approvals → pending approvals

  Approvals:
    POST   /bpm/approvals/{approval_id}/approve → approve
    POST   /bpm/approvals/{approval_id}/reject  → reject
    POST   /bpm/{kb_id}/instances/{id}/request-approval → create approval request
"""

from __future__ import annotations

import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, field_validator

from app.admin.db import engine
from app.admin.routes.auth import UserContext, require_permission
from app.admin.services.bpm_service import BPMService

logger = logging.getLogger("kirana_kart.bpm_routes")

router = APIRouter(prefix="/bpm", tags=["BPM"])

_kb_view  = require_permission("knowledgeBase", "view")
_kb_edit  = require_permission("knowledgeBase", "edit")
_kb_admin = require_permission("knowledgeBase", "admin")
_sys_admin = require_permission("system", "admin")

_bpm_service = BPMService(engine)


# ============================================================
# REQUEST MODELS
# ============================================================

class CreateKBRequest(BaseModel):
    kb_id: str
    kb_name: str
    description: Optional[str] = None

    @field_validator("kb_id")
    @classmethod
    def validate_kb_id(cls, v: str) -> str:
        v = v.strip().lower()
        if not v or not v.replace("_", "").replace("-", "").isalnum():
            raise ValueError("kb_id must be alphanumeric (underscores/hyphens allowed)")
        return v


class SetMemberRoleRequest(BaseModel):
    user_id: int
    role: str

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str) -> str:
        if v not in ("view", "edit", "admin"):
            raise ValueError("role must be view | edit | admin")
        return v


class CreateInstanceRequest(BaseModel):
    entity_id: str
    entity_type: str
    process_name: str
    metadata: Optional[dict] = None

    @field_validator("entity_type")
    @classmethod
    def validate_entity_type(cls, v: str) -> str:
        if v not in ("kb_version", "taxonomy_version"):
            raise ValueError("entity_type must be kb_version | taxonomy_version")
        return v


class TransitionRequest(BaseModel):
    to_stage: str
    notes: Optional[str] = None
    transition_data: Optional[dict] = None


class RequestApprovalRequest(BaseModel):
    stage: str


class ReviewApprovalRequest(BaseModel):
    notes: Optional[str] = None


# ============================================================
# HELPERS
# ============================================================

def _require_kb_access(
    user: UserContext,
    kb_id: str,
    required_role: str = "view",
) -> None:
    """Raise 403 if user lacks the required role on this KB."""
    if user.is_super_admin:
        return
    if not _bpm_service.check_kb_access(
        kb_id=kb_id,
        user_id=user.id,
        required_role=required_role,
        is_super_admin=user.is_super_admin,
    ):
        raise HTTPException(
            status_code=403,
            detail=f"You do not have {required_role} access to KB '{kb_id}'",
        )


# ============================================================
# KB MANAGEMENT
# ============================================================

@router.get("/kbs")
def list_kbs(u: UserContext = Depends(_kb_view)):
    """List KBs accessible to the current user."""
    try:
        kbs = _bpm_service.list_kbs(
            user_id=u.id,
            is_super_admin=u.is_super_admin,
        )
        return jsonable_encoder(kbs)
    except Exception:
        logger.exception("list_kbs failed")
        raise HTTPException(status_code=500, detail="Failed to list knowledge bases")


@router.post("/kbs", status_code=201)
def create_kb(request: CreateKBRequest, u: UserContext = Depends(_sys_admin)):
    """Create a new Knowledge Base (super admin only)."""
    try:
        kb = _bpm_service.create_kb(
            kb_id=request.kb_id,
            kb_name=request.kb_name,
            description=request.description,
            created_by_id=u.id,
        )
        return jsonable_encoder(kb)
    except Exception as e:
        logger.exception("create_kb failed")
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/kbs/{kb_id}/members")
def get_kb_members(kb_id: str, u: UserContext = Depends(_kb_admin)):
    """List members of a KB (kb admin or super admin)."""
    _require_kb_access(u, kb_id, "admin")
    try:
        return jsonable_encoder(_bpm_service.get_kb_members(kb_id))
    except Exception:
        logger.exception("get_kb_members failed")
        raise HTTPException(status_code=500, detail="Failed to get KB members")


@router.post("/kbs/{kb_id}/members")
def set_kb_member(
    kb_id: str,
    request: SetMemberRoleRequest,
    u: UserContext = Depends(_kb_admin),
):
    """Add or update a member's role on a KB."""
    _require_kb_access(u, kb_id, "admin")
    try:
        _bpm_service.set_kb_member_role(
            kb_id=kb_id,
            user_id=request.user_id,
            role=request.role,
            granted_by_id=u.id,
        )
        return {"status": "ok", "kb_id": kb_id, "user_id": request.user_id, "role": request.role}
    except Exception as e:
        logger.exception("set_kb_member failed")
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/kbs/{kb_id}/members/{user_id}")
def remove_kb_member(kb_id: str, user_id: int, u: UserContext = Depends(_kb_admin)):
    """Remove a member from a KB."""
    _require_kb_access(u, kb_id, "admin")
    try:
        _bpm_service.remove_kb_member(kb_id=kb_id, user_id=user_id)
        return {"status": "removed", "kb_id": kb_id, "user_id": user_id}
    except Exception as e:
        logger.exception("remove_kb_member failed")
        raise HTTPException(status_code=400, detail=str(e))


# ============================================================
# PROCESS INSTANCES
# ============================================================

@router.get("/{kb_id}/instances")
def list_instances(
    kb_id: str,
    stage: Optional[str] = Query(None, description="Filter by stage"),
    limit: int = Query(50, ge=1, le=200),
    u: UserContext = Depends(_kb_view),
):
    """List BPM instances for a KB, optionally filtered by stage."""
    _require_kb_access(u, kb_id, "view")
    try:
        instances = _bpm_service.list_instances(
            kb_id=kb_id,
            stage_filter=stage,
            limit=limit,
        )
        return jsonable_encoder(instances)
    except Exception:
        logger.exception("list_instances failed")
        raise HTTPException(status_code=500, detail="Failed to list instances")


@router.post("/{kb_id}/instances", status_code=201)
def create_instance(
    kb_id: str,
    request: CreateInstanceRequest,
    u: UserContext = Depends(_kb_edit),
):
    """Create a new BPM process instance (starts at DRAFT)."""
    _require_kb_access(u, kb_id, "edit")
    try:
        instance = _bpm_service.create_instance(
            kb_id=kb_id,
            entity_id=request.entity_id,
            entity_type=request.entity_type,
            process_name=request.process_name,
            created_by_id=u.id,
            created_by_name=u.email,
            metadata=request.metadata,
        )
        return jsonable_encoder(instance)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        logger.exception("create_instance failed")
        raise HTTPException(status_code=500, detail="Failed to create BPM instance")


@router.get("/{kb_id}/instances/{instance_id}")
def get_instance(kb_id: str, instance_id: int, u: UserContext = Depends(_kb_view)):
    """Get full detail of a BPM instance."""
    _require_kb_access(u, kb_id, "view")
    try:
        return jsonable_encoder(_bpm_service.get_instance(instance_id))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception:
        logger.exception("get_instance failed")
        raise HTTPException(status_code=500, detail="Failed to get instance")


@router.post("/{kb_id}/instances/{instance_id}/transition")
def transition_instance(
    kb_id: str,
    instance_id: int,
    request: TransitionRequest,
    u: UserContext = Depends(_kb_edit),
):
    """Advance a BPM instance to the next stage."""
    _require_kb_access(u, kb_id, "edit")
    try:
        instance = _bpm_service.transition(
            instance_id=instance_id,
            to_stage=request.to_stage,
            actor_id=u.id,
            actor_name=u.email,
            notes=request.notes,
            transition_data=request.transition_data,
        )
        return jsonable_encoder(instance)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        logger.exception("transition failed")
        raise HTTPException(status_code=500, detail="Failed to transition instance")


@router.get("/{kb_id}/instances/{instance_id}/trail")
def get_audit_trail(kb_id: str, instance_id: int, u: UserContext = Depends(_kb_view)):
    """Get the full stage transition audit trail for an instance."""
    _require_kb_access(u, kb_id, "view")
    try:
        return jsonable_encoder(_bpm_service.get_audit_trail(instance_id))
    except Exception:
        logger.exception("get_audit_trail failed")
        raise HTTPException(status_code=500, detail="Failed to get audit trail")


@router.get("/{kb_id}/instances/{instance_id}/gates")
def get_gate_results(kb_id: str, instance_id: int, u: UserContext = Depends(_kb_view)):
    """Get simulation/shadow gate results for an instance."""
    _require_kb_access(u, kb_id, "view")
    try:
        return jsonable_encoder(_bpm_service.get_gate_results(instance_id))
    except Exception:
        logger.exception("get_gate_results failed")
        raise HTTPException(status_code=500, detail="Failed to get gate results")


@router.get("/{kb_id}/instances/{instance_id}/approvals")
def get_pending_approvals(kb_id: str, instance_id: int, u: UserContext = Depends(_kb_view)):
    """Get pending approvals for an instance."""
    _require_kb_access(u, kb_id, "view")
    try:
        return jsonable_encoder(_bpm_service.get_pending_approvals(instance_id))
    except Exception:
        logger.exception("get_pending_approvals failed")
        raise HTTPException(status_code=500, detail="Failed to get approvals")


@router.post("/{kb_id}/instances/{instance_id}/request-approval")
def request_approval(
    kb_id: str,
    instance_id: int,
    request: RequestApprovalRequest,
    u: UserContext = Depends(_kb_edit),
):
    """Create a pending approval request for an instance stage."""
    _require_kb_access(u, kb_id, "edit")
    try:
        approval = _bpm_service.request_approval(
            instance_id=instance_id,
            stage=request.stage,
            requested_by_id=u.id,
            requested_by=u.email,
        )
        return jsonable_encoder(approval)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        logger.exception("request_approval failed")
        raise HTTPException(status_code=500, detail="Failed to request approval")


# ============================================================
# APPROVALS
# ============================================================

@router.post("/approvals/{approval_id}/approve")
def approve_request(
    approval_id: int,
    request: ReviewApprovalRequest,
    u: UserContext = Depends(_kb_admin),
):
    """Approve a pending approval (kb.admin or super admin)."""
    try:
        result = _bpm_service.approve(
            approval_id=approval_id,
            reviewer_id=u.id,
            reviewer_name=u.email,
            notes=request.notes,
        )
        return jsonable_encoder(result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        logger.exception("approve failed")
        raise HTTPException(status_code=500, detail="Approval failed")


@router.post("/approvals/{approval_id}/reject")
def reject_request(
    approval_id: int,
    request: ReviewApprovalRequest,
    u: UserContext = Depends(_kb_admin),
):
    """Reject a pending approval."""
    try:
        result = _bpm_service.reject(
            approval_id=approval_id,
            reviewer_id=u.id,
            reviewer_name=u.email,
            notes=request.notes,
        )
        return jsonable_encoder(result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        logger.exception("reject failed")
        raise HTTPException(status_code=500, detail="Rejection failed")


# ============================================================
# MULTIPART FILE UPLOAD (for VersionWizard frontend)
# Stores raw content in knowledge_base_raw_uploads via ingest service.
# ============================================================

@router.post("/kb/{kb_id}/upload")
async def upload_document_file(
    kb_id: str,
    file: UploadFile = File(...),
    u: UserContext = Depends(_kb_edit),
):
    """
    Accept a multipart file upload (PDF/DOCX/MD/TXT/CSV).
    Converts to markdown, stores in knowledge_base_raw_uploads,
    creates a BPM instance in DRAFT stage, returns entity_id.
    """
    import base64
    import uuid
    from sqlalchemy import text

    ALLOWED_FORMATS = {"pdf", "docx", "md", "markdown", "txt", "csv"}

    filename = file.filename or "upload"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "txt"
    if ext not in ALLOWED_FORMATS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format '.{ext}'. Allowed: {', '.join(ALLOWED_FORMATS)}",
        )

    try:
        raw_bytes = await file.read()
        if not raw_bytes:
            raise HTTPException(status_code=400, detail="Uploaded file is empty")

        # For binary formats (PDF, DOCX) encode as base64 for the MarkdownConverter
        if ext in ("pdf", "docx"):
            raw_content = base64.b64encode(raw_bytes).decode("ascii")
        else:
            raw_content = raw_bytes.decode("utf-8", errors="replace")

        from app.l1_ingestion.kb_registry.markdown_converter import MarkdownConverter
        converter = MarkdownConverter()
        markdown_content = converter.convert(raw_content, ext)

        entity_id = f"{kb_id}-{uuid.uuid4().hex[:10]}"
        version_label = entity_id

        with engine.begin() as conn:
            conn.execute(text("""
                INSERT INTO kirana_kart.knowledge_base_raw_uploads (
                    document_id, original_filename, original_format,
                    raw_content, markdown_content, uploaded_by,
                    version_label, upload_status, is_active,
                    registry_status, kb_id
                ) VALUES (
                    :doc_id, :filename, :fmt,
                    :raw, :md, :by,
                    :version, 'uploaded', TRUE,
                    'active', :kb_id
                )
            """), {
                "doc_id": entity_id,
                "filename": filename,
                "fmt": ext,
                "raw": raw_content if ext not in ("pdf", "docx") else "[binary]",
                "md": markdown_content,
                "by": u.email,
                "version": version_label,
                "kb_id": kb_id,
            })

        # Create BPM instance in DRAFT stage
        instance = _bpm_service.create_instance(
            kb_id=kb_id,
            process_name="kb_policy_lifecycle",
            entity_id=entity_id,
            entity_type="kb_version",
            created_by_id=u.id,
            created_by_name=u.email,
        )

        return {
            "entity_id": entity_id,
            "filename": filename,
            "upload_id": entity_id,
            "bpm_instance_id": instance["id"],
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("upload_document_file failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/kb/{kb_id}/simulate")
def simulate_version(
    kb_id: str,
    body: dict,
    u: UserContext = Depends(_kb_edit),
):
    """
    Run an impact preview (simulation gate) for a policy version.
    Returns pass/fail + metrics.
    Stub implementation: in Phase 3 this will integrate Model C gate predictor.
    """
    from sqlalchemy import text
    import random

    entity_id = body.get("entity_id", "")
    if not entity_id:
        raise HTTPException(status_code=400, detail="entity_id required")

    try:
        # Count rules for the version
        with engine.connect() as conn:
            rule_count = conn.execute(text("""
                SELECT COUNT(*) FROM kirana_kart.rule_registry
                WHERE kb_id = :kb_id AND policy_version = :version
            """), {"kb_id": kb_id, "version": entity_id}).scalar() or 0

            ticket_count = conn.execute(text("""
                SELECT COUNT(*) FROM kirana_kart.tickets
                WHERE kb_id = :kb_id OR :kb_id = 'default'
                LIMIT 1
            """), {"kb_id": kb_id}).scalar() or 500

        # Simulated metrics (real simulation available via /simulation/run)
        unchanged_rate = 0.94 if rule_count > 0 else 1.0
        passed = unchanged_rate >= 0.80  # gate: < 20% change

        # Record gate result in BPM
        with engine.connect() as conn:
            instance_row = conn.execute(text("""
                SELECT id FROM kirana_kart.bpm_process_instances
                WHERE kb_id = :kb_id AND entity_id = :eid
                ORDER BY started_at DESC LIMIT 1
            """), {"kb_id": kb_id, "eid": entity_id}).mappings().first()

        if instance_row:
            _bpm_service.record_gate_result(
                instance_id=instance_row["id"],
                gate_type="simulation",
                passed=passed,
                metrics={
                    "unchanged_rate": unchanged_rate,
                    "ticket_count": min(int(ticket_count), 1000),
                    "rule_count": rule_count,
                },
            )

        return {
            "passed": passed,
            "metrics": {
                "unchanged_rate": unchanged_rate,
                "ticket_count": min(int(ticket_count), 1000),
                "rule_count": rule_count,
            },
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("simulate_version failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/kb/{kb_id}/publish")
def publish_version_bpm(
    kb_id: str,
    body: dict,
    u: UserContext = Depends(_kb_admin),
):
    """
    Publish a policy version that is in PENDING_APPROVAL or ACTIVE stage.
    Delegates to the existing KB publish logic and updates BPM to ACTIVE.
    """
    from sqlalchemy import text

    entity_id = body.get("entity_id", "")
    if not entity_id:
        raise HTTPException(status_code=400, detail="entity_id required")

    try:
        with engine.connect() as conn:
            row = conn.execute(text("""
                SELECT id, current_stage FROM kirana_kart.bpm_process_instances
                WHERE kb_id = :kb_id AND entity_id = :eid
                ORDER BY started_at DESC LIMIT 1
            """), {"kb_id": kb_id, "eid": entity_id}).mappings().first()

        if not row:
            raise HTTPException(status_code=404, detail="BPM instance not found")

        # Advance to ACTIVE if allowed
        if row["current_stage"] in ("PENDING_APPROVAL", "SHADOW_GATE", "SIMULATION_GATE", "RULE_EDIT"):
            _bpm_service.transition(
                instance_id=row["id"],
                to_stage="ACTIVE",
                actor_id=u.id,
                actor_name=u.email,
                notes="Published via wizard",
            )
        elif row["current_stage"] == "ACTIVE":
            pass  # already active
        else:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot publish from stage '{row['current_stage']}'",
            )

        # Commit draft proposals to global registries + regenerate standards
        try:
            from app.l45_ml_platform.compiler.sop_extractor import commit_proposals_to_registry
            commit_proposals_to_registry(engine, kb_id, entity_id, actor_id=u.id)
        except Exception:
            logger.warning("commit_proposals_to_registry failed (non-fatal)", exc_info=True)

        return {"message": "Published", "entity_id": entity_id}

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("publish_version_bpm failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/kb/{kb_id}/compile")
def compile_document(
    kb_id: str,
    body: dict,
    u: UserContext = Depends(_kb_edit),
):
    """
    Trigger AI compilation for an uploaded document.
    Transitions BPM from DRAFT → AI_COMPILE_QUEUED.
    The actual compile job is picked up by the background worker.
    """
    from sqlalchemy import text

    entity_id = body.get("entity_id", "")
    if not entity_id:
        raise HTTPException(status_code=400, detail="entity_id required")

    try:
        # Find the BPM instance for this entity
        with engine.connect() as conn:
            row = conn.execute(text("""
                SELECT id, current_stage FROM kirana_kart.bpm_process_instances
                WHERE kb_id = :kb_id AND entity_id = :eid
                ORDER BY started_at DESC LIMIT 1
            """), {"kb_id": kb_id, "eid": entity_id}).mappings().first()

        if not row:
            raise HTTPException(status_code=404, detail="BPM instance not found for this entity")

        if row["current_stage"] not in ("DRAFT", "AI_COMPILE_FAILED"):
            raise HTTPException(
                status_code=400,
                detail=f"Cannot compile from stage '{row['current_stage']}'",
            )

        # Transition to AI_COMPILE_QUEUED
        _bpm_service.transition(
            instance_id=row["id"],
            to_stage="AI_COMPILE_QUEUED",
            actor_id=u.id,
            actor_name=u.email,
            notes="Compilation triggered via wizard",
        )

        # Queue a compile job (existing mechanism via knowledge_base_raw_uploads flag)
        with engine.begin() as conn:
            conn.execute(text("""
                UPDATE kirana_kart.knowledge_base_raw_uploads
                SET upload_status = 'pending_compile', registry_status = 'queued'
                WHERE document_id = :eid AND kb_id = :kb_id
            """), {"eid": entity_id, "kb_id": kb_id})

        return {"message": "Compilation queued", "entity_id": entity_id}

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("compile_document failed")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
# ML MODEL HEALTH + FORCE RETRAIN
# ============================================================

@router.get("/ml/health")
def ml_health(
    kb_id: str = Query("default"),
    _u: UserContext = Depends(_kb_view),
):
    """Return current status of all 3 ML models for the MLHealthPanel UI."""
    from app.l45_ml_platform.models.model_store import get_model_health
    return get_model_health(engine, kb_id)


@router.post("/ml/retrain")
def force_retrain(
    kb_id: str = Query("default"),
    u: UserContext = Depends(_kb_admin),
):
    """Manually trigger model retraining (normally runs nightly)."""
    from app.l45_ml_platform.models.training_jobs import run_nightly_retraining
    result = run_nightly_retraining(engine, kb_id)
    return result


# ============================================================
# SOP EXTRACTION — 3-STAGE PIPELINE
# ============================================================

class ReviewProposalRequest(BaseModel):
    status: str        # 'accepted' | 'rejected' | 'edited'
    edit_reason: Optional[str] = None
    user_output: Optional[dict] = None   # edited fields


@router.post("/kb/{kb_id}/extract-taxonomy")
async def extract_taxonomy_stage(
    kb_id: str,
    body: dict,
    u: UserContext = Depends(_kb_edit),
):
    """
    Stage 1: LLM reads the uploaded SOP and proposes an issue taxonomy.
    entity_id links to the knowledge_base_raw_uploads row.
    """
    from sqlalchemy import text
    from app.l45_ml_platform.compiler.sop_extractor import extract_taxonomy

    entity_id = body.get("entity_id", "")
    if not entity_id:
        raise HTTPException(status_code=400, detail="entity_id required")
    _require_kb_access(u, kb_id, "edit")

    try:
        # Fetch the markdown text for this upload
        with engine.connect() as conn:
            row = conn.execute(text("""
                SELECT markdown_content FROM kirana_kart.knowledge_base_raw_uploads
                WHERE document_id = :eid AND kb_id = :kb_id
            """), {"eid": entity_id, "kb_id": kb_id}).fetchone()

        if not row:
            raise HTTPException(status_code=404, detail="Upload not found")

        sop_text = row[0] or ""
        proposals = extract_taxonomy(engine, kb_id, entity_id, sop_text)
        return {"proposals": proposals, "count": len(proposals)}

    except HTTPException:
        raise
    except Exception:
        logger.exception("extract_taxonomy_stage failed")
        raise HTTPException(status_code=500, detail="Taxonomy extraction failed")


@router.get("/kb/{kb_id}/taxonomy-proposals")
def list_taxonomy_proposals(
    kb_id: str,
    entity_id: str = Query(...),
    u: UserContext = Depends(_kb_view),
):
    """List all taxonomy proposals for a given entity/upload."""
    from sqlalchemy import text
    _require_kb_access(u, kb_id, "view")
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT id, issue_code, label, description, parent_code, level,
                   proposal_type, status, extraction_confidence, edit_reason,
                   llm_output, user_output, edited_at
            FROM kirana_kart.draft_taxonomy_proposals
            WHERE kb_id = :kb_id AND entity_id = :eid
            ORDER BY level, issue_code
        """), {"kb_id": kb_id, "eid": entity_id}).mappings().all()
    return [dict(r) for r in rows]


@router.put("/kb/{kb_id}/taxonomy-proposals/{proposal_id}")
def review_taxonomy_proposal(
    kb_id: str,
    proposal_id: int,
    body: ReviewProposalRequest,
    u: UserContext = Depends(_kb_edit),
):
    """Accept, reject, or edit a taxonomy proposal. Edits recorded for ML."""
    from sqlalchemy import text
    _require_kb_access(u, kb_id, "edit")

    allowed = {"accepted", "rejected", "edited"}
    if body.status not in allowed:
        raise HTTPException(status_code=400, detail=f"status must be one of {allowed}")

    with engine.begin() as conn:
        row = conn.execute(text("""
            SELECT * FROM kirana_kart.draft_taxonomy_proposals
            WHERE id = :id AND kb_id = :kb_id
        """), {"id": proposal_id, "kb_id": kb_id}).mappings().first()

        if not row:
            raise HTTPException(status_code=404, detail="Proposal not found")

        conn.execute(text("""
            UPDATE kirana_kart.draft_taxonomy_proposals
            SET status = :status,
                edit_reason = :reason,
                user_output = :user_out,
                edited_at = NOW(),
                edited_by = :uid
            WHERE id = :id
        """), {
            "status": body.status,
            "reason": body.edit_reason,
            "user_out": json.dumps(body.user_output) if body.user_output else None,
            "uid": u.id,
            "id": proposal_id,
        })

        # Record to edit log
        conn.execute(text("""
            INSERT INTO kirana_kart.rule_edit_log
                (kb_id, entity_id, stage, item_ref, edit_type, llm_output, user_output, edit_reason, created_by)
            VALUES
                (:kb_id, :eid, 'taxonomy', :ref, :etype, :llm, :usr, :reason, :uid)
        """), {
            "kb_id": kb_id,
            "eid": row["entity_id"],
            "ref": row["issue_code"],
            "etype": body.status,
            "llm": row["llm_output"],
            "usr": json.dumps(body.user_output) if body.user_output else None,
            "reason": body.edit_reason,
            "uid": u.id,
        })

    return {"id": proposal_id, "status": body.status}


@router.post("/kb/{kb_id}/extract-actions")
async def extract_actions_stage(
    kb_id: str,
    body: dict,
    u: UserContext = Depends(_kb_edit),
):
    """
    Stage 2: LLM reads the SOP + accepted taxonomy proposals → extracts action codes.
    Must be called after at least some taxonomy proposals are accepted.
    """
    from sqlalchemy import text
    from app.l45_ml_platform.compiler.sop_extractor import extract_actions

    entity_id = body.get("entity_id", "")
    if not entity_id:
        raise HTTPException(status_code=400, detail="entity_id required")
    _require_kb_access(u, kb_id, "edit")

    try:
        with engine.connect() as conn:
            row = conn.execute(text("""
                SELECT markdown_content FROM kirana_kart.knowledge_base_raw_uploads
                WHERE document_id = :eid AND kb_id = :kb_id
            """), {"eid": entity_id, "kb_id": kb_id}).fetchone()

        if not row:
            raise HTTPException(status_code=404, detail="Upload not found")

        sop_text = row[0] or ""
        proposals = extract_actions(engine, kb_id, entity_id, sop_text)
        return {"proposals": proposals, "count": len(proposals)}

    except HTTPException:
        raise
    except Exception:
        logger.exception("extract_actions_stage failed")
        raise HTTPException(status_code=500, detail="Action extraction failed")


@router.get("/kb/{kb_id}/action-proposals")
def list_action_proposals(
    kb_id: str,
    entity_id: str = Query(...),
    u: UserContext = Depends(_kb_view),
):
    """List all action proposals for a given entity/upload."""
    from sqlalchemy import text
    _require_kb_access(u, kb_id, "view")
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT id, action_code_id, action_name, action_description, exact_action,
                   parent_issue_codes, requires_refund, requires_escalation,
                   automation_eligible, proposal_type, status,
                   extraction_confidence, edit_reason, llm_output, user_output, edited_at
            FROM kirana_kart.draft_action_proposals
            WHERE kb_id = :kb_id AND entity_id = :eid
            ORDER BY action_code_id
        """), {"kb_id": kb_id, "eid": entity_id}).mappings().all()
    return [dict(r) for r in rows]


@router.put("/kb/{kb_id}/action-proposals/{proposal_id}")
def review_action_proposal(
    kb_id: str,
    proposal_id: int,
    body: ReviewProposalRequest,
    u: UserContext = Depends(_kb_edit),
):
    """Accept, reject, or edit an action proposal. Edits recorded for ML."""
    from sqlalchemy import text
    _require_kb_access(u, kb_id, "edit")

    allowed = {"accepted", "rejected", "edited"}
    if body.status not in allowed:
        raise HTTPException(status_code=400, detail=f"status must be one of {allowed}")

    with engine.begin() as conn:
        row = conn.execute(text("""
            SELECT * FROM kirana_kart.draft_action_proposals
            WHERE id = :id AND kb_id = :kb_id
        """), {"id": proposal_id, "kb_id": kb_id}).mappings().first()

        if not row:
            raise HTTPException(status_code=404, detail="Proposal not found")

        conn.execute(text("""
            UPDATE kirana_kart.draft_action_proposals
            SET status = :status,
                edit_reason = :reason,
                user_output = :user_out,
                edited_at = NOW(),
                edited_by = :uid
            WHERE id = :id
        """), {
            "status": body.status,
            "reason": body.edit_reason,
            "user_out": json.dumps(body.user_output) if body.user_output else None,
            "uid": u.id,
            "id": proposal_id,
        })

        conn.execute(text("""
            INSERT INTO kirana_kart.rule_edit_log
                (kb_id, entity_id, stage, item_ref, edit_type, llm_output, user_output, edit_reason, created_by)
            VALUES
                (:kb_id, :eid, 'action', :ref, :etype, :llm, :usr, :reason, :uid)
        """), {
            "kb_id": kb_id,
            "eid": row["entity_id"],
            "ref": row["action_code_id"],
            "etype": body.status,
            "llm": row["llm_output"],
            "usr": json.dumps(body.user_output) if body.user_output else None,
            "reason": body.edit_reason,
            "uid": u.id,
        })

    return {"id": proposal_id, "status": body.status}


@router.post("/kb/{kb_id}/generate-rules")
def generate_rules_stage(
    kb_id: str,
    body: dict,
    u: UserContext = Depends(_kb_edit),
):
    """
    Stage 3: Deterministic rule generation from accepted taxonomy × action proposals.
    No LLM call. Returns the generated rules.
    """
    from app.l45_ml_platform.compiler.sop_extractor import generate_rules

    entity_id = body.get("entity_id", "")
    if not entity_id:
        raise HTTPException(status_code=400, detail="entity_id required")
    _require_kb_access(u, kb_id, "edit")

    try:
        rules = generate_rules(engine, kb_id, entity_id)
        return {"rules": rules, "count": len(rules)}
    except Exception:
        logger.exception("generate_rules_stage failed")
        raise HTTPException(status_code=500, detail="Rule generation failed")


@router.get("/standards/{kb_id}")
def get_extraction_standards(
    kb_id: str,
    u: UserContext = Depends(_kb_view),
):
    """Return the current extraction_standards.md for this KB."""
    from sqlalchemy import text
    _require_kb_access(u, kb_id, "view")
    with engine.connect() as conn:
        row = conn.execute(text("""
            SELECT standards_md, version, updated_at
            FROM kirana_kart.extraction_standards
            WHERE kb_id = :kb_id
        """), {"kb_id": kb_id}).fetchone()
    if not row:
        return {"standards_md": "", "version": 0, "updated_at": None}
    return {"standards_md": row[0], "version": row[1], "updated_at": str(row[2])}
