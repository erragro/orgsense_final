"""
app/admin/routes/auth_routes.py
=================================
Authentication endpoints: signup, login, logout, token refresh, OAuth flows.

Endpoints:
    POST /auth/signup
    POST /auth/login
    POST /auth/refresh
    POST /auth/logout
    GET  /auth/me
    GET  /auth/oauth/github           → redirect to GitHub
    GET  /auth/oauth/github/callback  → exchange code, issue JWT, redirect frontend
    GET  /auth/oauth/google           → redirect to Google
    GET  /auth/oauth/google/callback
    GET  /auth/oauth/microsoft        → redirect to Microsoft
    GET  /auth/oauth/microsoft/callback
"""

from __future__ import annotations

import logging
import secrets
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, field_validator
from sqlalchemy import text

from app.admin.db import get_db_session
from app.admin.services.auth_service import (
    ALL_MODULES,
    UserContext,
    assign_viewer_permissions,
    build_user_context_from_db,
    create_access_token,
    create_refresh_token,
    get_current_user,
    hash_password,
    invalidate_refresh_token,
    store_refresh_token,
    validate_and_rotate_refresh_token,
    verify_password,
)
from app.admin.services.oauth_service import (
    OAuthUserInfo,
    exchange_github_code,
    exchange_google_code,
    exchange_microsoft_code,
    get_github_oauth_url,
    get_google_oauth_url,
    get_microsoft_oauth_url,
)
from app.config import settings

logger = logging.getLogger("kirana_kart.auth_routes")

router = APIRouter(prefix="/auth", tags=["auth"])


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------


class SignupRequest(BaseModel):
    email: str
    password: str
    full_name: str

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        v = v.strip().lower()
        if "@" not in v or "." not in v.split("@")[-1]:
            raise ValueError("Invalid email address")
        return v


class LoginRequest(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        return v.strip().lower()


class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: str


# ---------------------------------------------------------------------------
# Helper: build token response dict
# ---------------------------------------------------------------------------


def _token_response(user: UserContext, refresh_raw: str) -> dict:
    return {
        "access_token": create_access_token(user),
        "token_type": "bearer",
        "refresh_token": refresh_raw,
        "user": {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "avatar_url": user.avatar_url,
            "is_super_admin": user.is_super_admin,
            "permissions": user.permissions,
        },
    }


# ---------------------------------------------------------------------------
# Sign Up
# ---------------------------------------------------------------------------


@router.post("/signup")
def signup(payload: SignupRequest):
    """Register a new user. Grants view-only access on all modules."""
    if len(payload.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    with get_db_session() as session:
        existing = session.execute(
            text("SELECT id FROM kirana_kart.users WHERE email = :email"),
            {"email": payload.email},
        ).scalar()
        if existing:
            raise HTTPException(status_code=409, detail="An account with this email already exists")

        hashed = hash_password(payload.password)
        row = session.execute(
            text("""
                INSERT INTO kirana_kart.users (email, full_name, password_hash, is_active, is_super_admin)
                VALUES (:email, :name, :hash, TRUE, FALSE)
                RETURNING id
            """),
            {"email": payload.email, "name": payload.full_name, "hash": hashed},
        ).mappings().first()

        user_id = row["id"]
        assign_viewer_permissions(user_id, session)

    user = build_user_context_from_db(user_id)
    refresh_raw, refresh_hash = create_refresh_token(user_id)
    store_refresh_token(user_id, refresh_hash)

    logger.info("New user registered: %s (id=%d)", payload.email, user_id)
    return _token_response(user, refresh_raw)


# ---------------------------------------------------------------------------
# Login
# ---------------------------------------------------------------------------


@router.post("/login")
def login(payload: LoginRequest):
    """Authenticate with email + password."""
    with get_db_session() as session:
        row = session.execute(
            text("""
                SELECT id, password_hash, is_active
                FROM kirana_kart.users
                WHERE email = :email AND oauth_provider IS NULL
            """),
            {"email": payload.email},
        ).mappings().first()

    if not row:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not row["is_active"]:
        raise HTTPException(status_code=403, detail="Account is deactivated")
    if not row["password_hash"] or not verify_password(payload.password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    user = build_user_context_from_db(row["id"])
    refresh_raw, refresh_hash = create_refresh_token(row["id"])
    store_refresh_token(row["id"], refresh_hash)

    return _token_response(user, refresh_raw)


# ---------------------------------------------------------------------------
# Refresh
# ---------------------------------------------------------------------------


@router.post("/refresh")
def refresh_token(payload: RefreshRequest):
    """Exchange a refresh token for a new access token + rotated refresh token."""
    user_id, new_refresh_raw = validate_and_rotate_refresh_token(payload.refresh_token)
    user = build_user_context_from_db(user_id)

    return {
        "access_token": create_access_token(user),
        "token_type": "bearer",
        "refresh_token": new_refresh_raw,
    }


# ---------------------------------------------------------------------------
# Logout
# ---------------------------------------------------------------------------


@router.post("/logout")
def logout(payload: LogoutRequest, _user: UserContext = Depends(get_current_user)):
    """Invalidate the refresh token (server-side logout)."""
    invalidate_refresh_token(payload.refresh_token)
    return {"status": "logged out"}


# ---------------------------------------------------------------------------
# Me
# ---------------------------------------------------------------------------


@router.get("/me")
def me(user: UserContext = Depends(get_current_user)):
    """Return the current user's profile and permissions."""
    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "avatar_url": user.avatar_url,
        "is_super_admin": user.is_super_admin,
        "permissions": user.permissions,
    }


# ---------------------------------------------------------------------------
# OAuth helpers
# ---------------------------------------------------------------------------


def _upsert_oauth_user(info: OAuthUserInfo) -> int:
    """
    Upsert an OAuth user in the DB.
    Returns the user_id.
    """
    with get_db_session() as session:
        # Try to find by oauth_provider + oauth_id first
        row = session.execute(
            text("""
                SELECT id FROM kirana_kart.users
                WHERE oauth_provider = :provider AND oauth_id = :oid
            """),
            {"provider": info.provider, "oid": info.oauth_id},
        ).mappings().first()

        if row:
            # Update email/name/avatar in case they changed
            session.execute(
                text("""
                    UPDATE kirana_kart.users
                    SET email = :email, full_name = :name, avatar_url = :avatar,
                        updated_at = NOW()
                    WHERE id = :uid
                """),
                {
                    "email": info.email,
                    "name": info.full_name,
                    "avatar": info.avatar_url,
                    "uid": row["id"],
                },
            )
            return row["id"]

        # Check if a manual account with same email exists; link it
        email_row = session.execute(
            text("SELECT id FROM kirana_kart.users WHERE email = :email"),
            {"email": info.email},
        ).mappings().first()

        if email_row:
            session.execute(
                text("""
                    UPDATE kirana_kart.users
                    SET oauth_provider = :provider, oauth_id = :oid,
                        avatar_url = :avatar, updated_at = NOW()
                    WHERE id = :uid
                """),
                {
                    "provider": info.provider,
                    "oid": info.oauth_id,
                    "avatar": info.avatar_url,
                    "uid": email_row["id"],
                },
            )
            return email_row["id"]

        # New user — create with viewer permissions
        new_row = session.execute(
            text("""
                INSERT INTO kirana_kart.users
                    (email, full_name, oauth_provider, oauth_id, avatar_url, is_active)
                VALUES (:email, :name, :provider, :oid, :avatar, TRUE)
                RETURNING id
            """),
            {
                "email": info.email,
                "name": info.full_name,
                "provider": info.provider,
                "oid": info.oauth_id,
                "avatar": info.avatar_url,
            },
        ).mappings().first()

        user_id = new_row["id"]
        assign_viewer_permissions(user_id, session)
        logger.info("New OAuth user: %s via %s (id=%d)", info.email, info.provider, user_id)
        return user_id


def _oauth_complete(user_id: int) -> RedirectResponse:
    """Issue JWT + refresh token, redirect to frontend /auth/callback."""
    user = build_user_context_from_db(user_id)
    refresh_raw, refresh_hash = create_refresh_token(user_id)
    store_refresh_token(user_id, refresh_hash)
    access_token = create_access_token(user)

    params = urlencode({
        "access_token": access_token,
        "refresh_token": refresh_raw,
    })
    return RedirectResponse(url=f"{settings.frontend_url}/auth/callback?{params}")


def _oauth_error_redirect(detail: str) -> RedirectResponse:
    params = urlencode({"error": detail})
    return RedirectResponse(url=f"{settings.frontend_url}/auth/callback?{params}")


# ---------------------------------------------------------------------------
# GitHub OAuth
# ---------------------------------------------------------------------------


@router.get("/oauth/github")
def github_login():
    state = secrets.token_urlsafe(16)
    return RedirectResponse(url=get_github_oauth_url(state))


@router.get("/oauth/github/callback")
def github_callback(code: str | None = None, error: str | None = None):
    if error or not code:
        return _oauth_error_redirect(error or "GitHub login cancelled")
    try:
        info = exchange_github_code(code)
        user_id = _upsert_oauth_user(info)
        return _oauth_complete(user_id)
    except HTTPException as exc:
        return _oauth_error_redirect(exc.detail)
    except Exception as exc:
        logger.error("GitHub OAuth error: %s", exc)
        return _oauth_error_redirect("GitHub authentication failed")


# ---------------------------------------------------------------------------
# Google OAuth
# ---------------------------------------------------------------------------


@router.get("/oauth/google")
def google_login():
    state = secrets.token_urlsafe(16)
    return RedirectResponse(url=get_google_oauth_url(state))


@router.get("/oauth/google/callback")
def google_callback(code: str | None = None, error: str | None = None):
    if error or not code:
        return _oauth_error_redirect(error or "Google login cancelled")
    try:
        info = exchange_google_code(code)
        user_id = _upsert_oauth_user(info)
        return _oauth_complete(user_id)
    except HTTPException as exc:
        return _oauth_error_redirect(exc.detail)
    except Exception as exc:
        logger.error("Google OAuth error: %s", exc)
        return _oauth_error_redirect("Google authentication failed")


# ---------------------------------------------------------------------------
# Microsoft OAuth
# ---------------------------------------------------------------------------


@router.get("/oauth/microsoft")
def microsoft_login():
    state = secrets.token_urlsafe(16)
    return RedirectResponse(url=get_microsoft_oauth_url(state))


@router.get("/oauth/microsoft/callback")
def microsoft_callback(code: str | None = None, error: str | None = None):
    if error or not code:
        return _oauth_error_redirect(error or "Microsoft login cancelled")
    try:
        info = exchange_microsoft_code(code)
        user_id = _upsert_oauth_user(info)
        return _oauth_complete(user_id)
    except HTTPException as exc:
        return _oauth_error_redirect(exc.detail)
    except Exception as exc:
        logger.error("Microsoft OAuth error: %s", exc)
        return _oauth_error_redirect("Microsoft authentication failed")
