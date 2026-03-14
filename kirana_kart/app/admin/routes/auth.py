import time
from fastapi import Header, HTTPException

from app.admin.services.taxonomy_service import require_role

RATE_LIMIT = 100
WINDOW_SECONDS = 60
_request_log: dict[str, list[float]] = {}


def rate_limiter(api_token: str) -> None:
    now = time.time()
    history = _request_log.get(api_token, [])
    history = [t for t in history if now - t < WINDOW_SECONDS]

    if len(history) >= RATE_LIMIT:
        raise HTTPException(status_code=429, detail="Rate limit exceeded")

    history.append(now)
    _request_log[api_token] = history


def authorize(x_admin_token: str = Header(...)) -> str:
    rate_limiter(x_admin_token)
    return x_admin_token


__all__ = ["authorize", "require_role"]
