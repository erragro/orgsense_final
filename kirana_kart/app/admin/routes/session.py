from __future__ import annotations

from fastapi import APIRouter, Depends

from app.admin.routes.auth import authorize
from app.admin.services.taxonomy_service import get_user_role

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/me")
def me(token: str = Depends(authorize)):
    role = get_user_role(token)
    return {"role": role}
