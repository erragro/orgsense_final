"""
app/admin/rate_limiter.py
==========================
Shared slowapi limiter instance — imported by both main.py and route modules.
Keeping it here avoids circular imports (main.py imports routes; routes cannot
import main.py).
"""

from slowapi import Limiter
from slowapi.util import get_remote_address
from app.config import settings

limiter = Limiter(key_func=get_remote_address, storage_uri=settings.redis_url)
