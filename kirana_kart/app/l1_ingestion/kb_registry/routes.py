"""
KB Registry Routes
==================

API layer for Knowledge Base ingestion lifecycle.

Upload != Publish != Rollback

This layer:
- Validates request
- Delegates to KBRegistryService
- Returns structured response
- Contains NO business logic
"""

from fastapi import APIRouter, HTTPException
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, field_validator
from sqlalchemy import create_engine, text
from dotenv import load_dotenv
from pathlib import Path
import os
import logging

from .kb_registry_service import KBRegistryService


# ============================================================
# CONFIG
# ============================================================

PROJECT_ROOT = Path(__file__).resolve().parents[4]
load_dotenv(PROJECT_ROOT / ".env")

DB_HOST = os.getenv("DB_HOST")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME")
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")

DATABASE_URL = (
    f"postgresql+psycopg2://{DB_USER}:{DB_PASSWORD}"
    f"@{DB_HOST}:{DB_PORT}/{DB_NAME}"
)

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True
)

service = KBRegistryService(engine)

router = APIRouter(prefix="/kb", tags=["KB Registry"])

logger = logging.getLogger("kb_routes")
logging.basicConfig(level=logging.INFO)


# ============================================================
# REQUEST MODELS
# ============================================================

class UploadRequest(BaseModel):
    document_id: str
    original_filename: str
    original_format: str
    raw_content: str
    uploaded_by: str
    version_label: str

    @field_validator("raw_content")
    @classmethod
    def validate_content(cls, v):
        if not v or not v.strip():
            raise ValueError("raw_content cannot be empty")
        return v


class UpdateRequest(BaseModel):
    new_raw_content: str
    original_format: str


class PublishRequest(BaseModel):
    version_label: str
    published_by: str


# ============================================================
# ROUTES
# ============================================================

# ------------------------------------------------------------
# Upload Raw
# ------------------------------------------------------------

@router.post("/upload")
def upload_kb(request: UploadRequest):

    try:

        result = service.upload_document(
            document_id=request.document_id,
            original_filename=request.original_filename,
            original_format=request.original_format,
            raw_content=request.raw_content,
            uploaded_by=request.uploaded_by,
            version_label=request.version_label
        )

        return jsonable_encoder(result)

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    except Exception as e:
        logger.exception("Upload failed")
        raise HTTPException(status_code=500, detail=str(e))


# ------------------------------------------------------------
# Update Draft
# ------------------------------------------------------------

@router.put("/update/{raw_id}")
def update_kb(raw_id: int, request: UpdateRequest):

    try:

        result = service.raw_service.update_document(
            raw_upload_id=raw_id,
            new_raw_content=request.new_raw_content,
            original_format=request.original_format
        )

        return jsonable_encoder(result)

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    except Exception as e:
        logger.exception("Update failed")
        raise HTTPException(status_code=500, detail=str(e))


# ------------------------------------------------------------
# Publish Version
# ------------------------------------------------------------

@router.post("/publish")
def publish_kb(request: PublishRequest):

    try:

        result = service.publish_version(
            version_label=request.version_label,
            published_by=request.published_by
        )

        if not result:
            raise HTTPException(status_code=404, detail="Policy version not found")

        return jsonable_encoder(result)

    except HTTPException:
        raise

    except Exception as e:
        logger.exception("Publish failed")
        raise HTTPException(status_code=500, detail=str(e))


# ------------------------------------------------------------
# Rollback Version
# ------------------------------------------------------------

@router.post("/rollback/{version_label}")
def rollback_kb(version_label: str):

    try:

        result = service.rollback(version_label)

        return jsonable_encoder(result)

    except Exception as e:
        logger.exception("Rollback failed")
        raise HTTPException(status_code=500, detail=str(e))


# ------------------------------------------------------------
# Fetch Raw By ID
# ------------------------------------------------------------

@router.get("/raw/{raw_id}")
def get_raw(raw_id: int):

    try:

        result = service.raw_service.fetch_by_id(raw_id)

        if not result:
            raise HTTPException(status_code=404, detail="Document not found")

        return jsonable_encoder(result)

    except HTTPException:
        raise

    except Exception as e:
        logger.exception("Fetch raw failed")
        raise HTTPException(status_code=500, detail=str(e))


# ------------------------------------------------------------
# Fetch Active Draft
# ------------------------------------------------------------

@router.get("/active/{document_id}")
def get_active(document_id: str):

    try:

        result = service.raw_service.fetch_active_draft(document_id)

        if not result:
            raise HTTPException(status_code=404, detail="No active draft found")

        return jsonable_encoder(result)

    except HTTPException:
        raise

    except Exception as e:
        logger.exception("Fetch active draft failed")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
# CONSUMER KB ENDPOINTS
# ============================================================

# ------------------------------------------------------------
# Get Active Published Policy Version
# ------------------------------------------------------------

@router.get("/active-version")
def get_active_policy_version():

    try:

        with engine.connect() as conn:

            row = conn.execute(text("""
                SELECT active_version, activated_at
                FROM kirana_kart.kb_runtime_config
                ORDER BY id DESC
                LIMIT 1
            """)).mappings().first()

        if not row:
            return {"active_version": None, "activated_at": None}

        return {
            "active_version": row["active_version"],
            "activated_at": row["activated_at"],
        }

    except Exception as e:
        logger.exception("Active version lookup failed")
        raise HTTPException(status_code=500, detail=str(e))


# ------------------------------------------------------------
# Get Published Policy Snapshot
# ------------------------------------------------------------

@router.get("/version/{version}")
def get_policy_version(version: str):

    try:

        with engine.connect() as conn:

            row = conn.execute(text("""
                SELECT id, version_label, status, created_by, created_at, snapshot_data
                FROM kirana_kart.knowledge_base_versions
                WHERE version_label = :v
            """), {"v": version}).mappings().first()

        if not row:
            raise HTTPException(status_code=404, detail="Policy version not found")

        return jsonable_encoder(dict(row))

    except HTTPException:
        raise

    except Exception as e:
        logger.exception("Policy fetch failed")
        raise HTTPException(status_code=500, detail=str(e))


# ------------------------------------------------------------
# List All Published Versions
# ------------------------------------------------------------

@router.get("/versions")
def list_policy_versions():

    try:

        with engine.connect() as conn:

            rows = conn.execute(text("""
                SELECT id, version_label, status, created_by, created_at, snapshot_data
                FROM kirana_kart.knowledge_base_versions
                ORDER BY created_at DESC
            """)).mappings().all()

        return jsonable_encoder([dict(r) for r in rows])

    except Exception as e:
        logger.exception("Version list failed")
        raise HTTPException(status_code=500, detail=str(e))


# ------------------------------------------------------------
# List Raw Uploads
# ------------------------------------------------------------

@router.get("/uploads")
def list_raw_uploads():

    try:

        with engine.connect() as conn:

            rows = conn.execute(text("""
                SELECT
                    id,
                    document_id,
                    original_filename,
                    original_format,
                    raw_content,
                    upload_status,
                    uploaded_by,
                    uploaded_at,
                    compile_errors,
                    compiled_hash,
                    markdown_content,
                    version_label,
                    is_active,
                    registry_status,
                    updated_at
                FROM kirana_kart.knowledge_base_raw_uploads
                ORDER BY uploaded_at DESC
            """)).mappings().all()

        return jsonable_encoder([dict(r) for r in rows])

    except Exception as e:
        logger.exception("Uploads list failed")
        raise HTTPException(status_code=500, detail=str(e))
