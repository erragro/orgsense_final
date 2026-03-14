from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel
from sqlalchemy import text

from app.admin.db import get_db_session
from app.admin.routes.auth import authorize, require_role

router = APIRouter(prefix="/admin/users", tags=["admin-users"])


class AdminUserCreate(BaseModel):
    api_token: str
    role: str


@router.get("")
def list_admin_users(token: str = Depends(authorize)):
    require_role(token, ["publisher"])

    with get_db_session() as session:
        rows = session.execute(
            text("""
                SELECT id, api_token, role
                FROM kirana_kart.admin_users
                ORDER BY id
            """)
        ).mappings().all()

    return jsonable_encoder([dict(r) for r in rows])


@router.post("")
def create_admin_user(payload: AdminUserCreate, token: str = Depends(authorize)):
    require_role(token, ["publisher"])

    if not payload.api_token.strip():
        raise HTTPException(status_code=400, detail="api_token is required")

    with get_db_session() as session:
        existing = session.execute(
            text("""
                SELECT id
                FROM kirana_kart.admin_users
                WHERE api_token = :token
            """),
            {"token": payload.api_token},
        ).scalar()

        if existing:
            raise HTTPException(status_code=409, detail="Admin user already exists")

        row = session.execute(
            text("""
                INSERT INTO kirana_kart.admin_users (api_token, role)
                VALUES (:token, :role)
                RETURNING id, api_token, role
            """),
            {"token": payload.api_token, "role": payload.role},
        ).mappings().first()

    return jsonable_encoder(dict(row))


@router.delete("/{user_id}")
def delete_admin_user(user_id: int, token: str = Depends(authorize)):
    require_role(token, ["publisher"])

    with get_db_session() as session:
        row = session.execute(
            text("""
                DELETE FROM kirana_kart.admin_users
                WHERE id = :id
                RETURNING id
            """),
            {"id": user_id},
        ).scalar()

    if not row:
        raise HTTPException(status_code=404, detail="Admin user not found")

    return {"status": "deleted", "id": user_id}
