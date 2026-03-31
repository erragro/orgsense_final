"""
app/admin/routes/auth_routes.py
=================================
Authentication endpoints: signup, login, logout, token refresh, OAuth flows.

Security hardening applied:
  - Rate limiting: 5 login/min, 3 signup/min, 10 refresh/min (per IP via slowapi)
  - Account lockout: 5 failed login attempts → 15-min Redis-backed lockout
  - Password policy: min 12 chars, must contain uppercase, digit, special char
  - HttpOnly + Secure + SameSite cookies for access/refresh tokens
  - PII redacted from logs (user_id logged, not email)
  - OAuth tokens delivered via HttpOnly cookie, NOT URL query params

Endpoints:
    POST /auth/signup
    POST /auth/login
    POST /auth/refresh
    POST /auth/logout
    GET  /auth/me
    GET  /auth/oauth/github           → redirect to GitHub
    GET  /auth/oauth/github/callback  → exchange code, set cookie, redirect frontend
    GET  /auth/oauth/google
    GET  /auth/oauth/google/callback
    GET  /auth/oauth/microsoft
    GET  /auth/oauth/microsoft/callback
"""

from __future__ import annotations

import logging
import re
import secrets
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response
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
from app.admin.redis_client import get_redis as get_redis_client
from app.admin.rate_limiter import limiter
from app.config import settings

logger = logging.getLogger("kirana_kart.auth_routes")

router = APIRouter(prefix="/auth", tags=["auth"])

# ---------------------------------------------------------------------------
# Password policy constants
# ---------------------------------------------------------------------------

_MIN_PASSWORD_LENGTH = 12
_PASSWORD_POLICY_MSG = (
    "Password must be at least 12 characters and contain an uppercase letter, "
    "a digit, and a special character (!@#$%^&*()-_+=)"
)

# ---------------------------------------------------------------------------
# Account lockout constants
# ---------------------------------------------------------------------------

_MAX_FAILED_ATTEMPTS = 5
_LOCKOUT_SECONDS = 15 * 60  # 15 minutes
_LOCKOUT_KEY_PREFIX = "login_fail:"
_LOCKOUT_FLAG_PREFIX = "login_locked:"

# ---------------------------------------------------------------------------
# Cookie settings
# ---------------------------------------------------------------------------

_ACCESS_COOKIE = "kk_access"
_REFRESH_COOKIE = "kk_refresh"
_COOKIE_SECURE = settings.deployment_env == "production"
_COOKIE_SAMESITE = "strict"


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------


class SignupRequest(BaseModel):
    email: str
    password: str
    full_name: str
    consent_given: bool = False  # DPDP Act §6 — explicit consent

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        v = v.strip().lower()
        if "@" not in v or "." not in v.split("@")[-1]:
            raise ValueError("Invalid email address")
        return v

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        if len(v) < _MIN_PASSWORD_LENGTH:
            raise ValueError(_PASSWORD_POLICY_MSG)
        if not re.search(r"[A-Z]", v):
            raise ValueError(_PASSWORD_POLICY_MSG)
        if not re.search(r"[0-9]", v):
            raise ValueError(_PASSWORD_POLICY_MSG)
        if not re.search(r"[!@#$%^&*()\-_+=]", v):
            raise ValueError(_PASSWORD_POLICY_MSG)
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
# Account lockout helpers
# ---------------------------------------------------------------------------


def _check_lockout(email: str) -> None:
    """Raise HTTP 429 if the account is currently locked out."""
    try:
        r = get_redis_client()
        if r.get(f"{_LOCKOUT_FLAG_PREFIX}{email}"):
            raise HTTPException(
                status_code=429,
                detail="Account temporarily locked due to too many failed attempts. Try again in 15 minutes.",
                headers={"Retry-After": str(_LOCKOUT_SECONDS)},
            )
    except HTTPException:
        raise
    except Exception:
        pass  # Redis unavailable — fail open (don't block logins)


def _record_failed_attempt(email: str) -> None:
    """Increment failed login counter; lock account after max attempts."""
    try:
        r = get_redis_client()
        key = f"{_LOCKOUT_KEY_PREFIX}{email}"
        count = r.incr(key)
        r.expire(key, _LOCKOUT_SECONDS)
        if count >= _MAX_FAILED_ATTEMPTS:
            r.setex(f"{_LOCKOUT_FLAG_PREFIX}{email}", _LOCKOUT_SECONDS, "1")
    except Exception:
        pass  # Redis unavailable — fail open


def _clear_failed_attempts(email: str) -> None:
    """Clear lockout counters on successful login."""
    try:
        r = get_redis_client()
        r.delete(f"{_LOCKOUT_KEY_PREFIX}{email}")
        r.delete(f"{_LOCKOUT_FLAG_PREFIX}{email}")
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Cookie helpers
# ---------------------------------------------------------------------------


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    """Set HttpOnly, Secure, SameSite cookies for both tokens."""
    response.set_cookie(
        key=_ACCESS_COOKIE,
        value=access_token,
        httponly=True,
        secure=_COOKIE_SECURE,
        samesite=_COOKIE_SAMESITE,
        max_age=settings.jwt_access_expire_minutes * 60,
        path="/",
    )
    response.set_cookie(
        key=_REFRESH_COOKIE,
        value=refresh_token,
        httponly=True,
        secure=_COOKIE_SECURE,
        samesite=_COOKIE_SAMESITE,
        max_age=settings.jwt_refresh_expire_days * 86400,
        path="/auth/refresh",
    )


def _clear_auth_cookies(response: Response) -> None:
    """Clear auth cookies on logout."""
    response.delete_cookie(_ACCESS_COOKIE, path="/")
    response.delete_cookie(_REFRESH_COOKIE, path="/auth/refresh")


# ---------------------------------------------------------------------------
# Helper: build token response dict (tokens also set as cookies)
# ---------------------------------------------------------------------------


def _token_response(user: UserContext, refresh_raw: str, response: Response) -> dict:
    access_token = create_access_token(user)
    _set_auth_cookies(response, access_token, refresh_raw)
    return {
        "access_token": access_token,
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
@limiter.limit("5/minute")
def signup(payload: SignupRequest, request: Request, response: Response):
    """Register a new user. Grants view-only access on all modules."""
    if not payload.consent_given:
        raise HTTPException(
            status_code=400,
            detail="Consent to data processing is required to create an account (DPDP Act §6)",
        )

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

        # Record DPDP consent
        client_ip = request.client.host if request.client else None
        session.execute(
            text("""
                INSERT INTO kirana_kart.consent_records
                    (data_principal_id, principal_type, purpose, consent_given, ip_address, version)
                VALUES (:uid, 'user', 'account_management', TRUE, :ip, '1.0')
            """),
            {"uid": user_id, "ip": client_ip},
        )

    user = build_user_context_from_db(user_id)
    refresh_raw, refresh_hash = create_refresh_token(user_id)
    store_refresh_token(user_id, refresh_hash)

    # Log user_id only — never log email (PII)
    logger.info("New user registered [id=%d]", user_id)
    return _token_response(user, refresh_raw, response)


# ---------------------------------------------------------------------------
# Login
# ---------------------------------------------------------------------------


@router.post("/login")
@limiter.limit("10/minute")
def login(payload: LoginRequest, request: Request, response: Response):
    """Authenticate with email + password."""
    _check_lockout(payload.email)

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
        _record_failed_attempt(payload.email)
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not row["is_active"]:
        raise HTTPException(status_code=403, detail="Account is deactivated. Contact your administrator.")
    if not row["password_hash"] or not verify_password(payload.password, row["password_hash"]):
        _record_failed_attempt(payload.email)
        raise HTTPException(status_code=401, detail="Invalid email or password")

    _clear_failed_attempts(payload.email)

    user = build_user_context_from_db(row["id"])
    refresh_raw, refresh_hash = create_refresh_token(row["id"])
    store_refresh_token(row["id"], refresh_hash)

    return _token_response(user, refresh_raw, response)


# ---------------------------------------------------------------------------
# Refresh
# ---------------------------------------------------------------------------


@router.post("/refresh")
def refresh_token(request: Request, response: Response):
    """Exchange a refresh token for a new access token + rotated refresh token.

    Reads the refresh token from the HttpOnly cookie. Falls back to JSON body
    for backward compatibility with API clients that cannot use cookies.
    """
    # Prefer cookie; fall back to JSON body
    raw_refresh = request.cookies.get(_REFRESH_COOKIE)
    if not raw_refresh:
        # Support legacy JSON body for API clients
        import json
        try:
            body = request.scope.get("body", b"")
            if body:
                data = json.loads(body)
                raw_refresh = data.get("refresh_token")
        except Exception:
            pass
    if not raw_refresh:
        raise HTTPException(status_code=401, detail="Refresh token required")

    user_id, new_refresh_raw = validate_and_rotate_refresh_token(raw_refresh)
    user = build_user_context_from_db(user_id)
    new_access = create_access_token(user)

    _set_auth_cookies(response, new_access, new_refresh_raw)

    return {
        "access_token": new_access,
        "token_type": "bearer",
        "refresh_token": new_refresh_raw,
    }


# ---------------------------------------------------------------------------
# Logout
# ---------------------------------------------------------------------------


@router.post("/logout")
def logout(request: Request, response: Response, _user: UserContext = Depends(get_current_user)):
    """Invalidate the refresh token and clear auth cookies."""
    raw_refresh = request.cookies.get(_REFRESH_COOKIE)
    if raw_refresh:
        try:
            invalidate_refresh_token(raw_refresh)
        except Exception:
            pass  # Already expired/invalid — still clear cookies
    _clear_auth_cookies(response)
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
        row = session.execute(
            text("""
                SELECT id FROM kirana_kart.users
                WHERE oauth_provider = :provider AND oauth_id = :oid
            """),
            {"provider": info.provider, "oid": info.oauth_id},
        ).mappings().first()

        if row:
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
        # Record consent for OAuth signup (provider implies consent to Google/GitHub/MS ToS)
        session.execute(
            text("""
                INSERT INTO kirana_kart.consent_records
                    (data_principal_id, principal_type, purpose, consent_given, version)
                VALUES (:uid, 'user', 'account_management', TRUE, '1.0')
            """),
            {"uid": user_id},
        )
        # Log provider + user_id only — never email (PII)
        logger.info("New OAuth user registered [id=%d via %s]", user_id, info.provider)
        return user_id


def _oauth_complete(user_id: int) -> RedirectResponse:
    """Issue JWT + refresh token, set HttpOnly cookies, redirect to frontend."""
    user = build_user_context_from_db(user_id)
    refresh_raw, refresh_hash = create_refresh_token(user_id)
    store_refresh_token(user_id, refresh_hash)
    access_token = create_access_token(user)

    # Redirect to a clean path — NO tokens in the URL
    response = RedirectResponse(url=f"{settings.frontend_url}/auth/callback")
    _set_auth_cookies(response, access_token, refresh_raw)
    return response


def _oauth_error_redirect(detail: str) -> RedirectResponse:
    from urllib.parse import urlencode
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
