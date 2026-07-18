from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import settings
from app.logging_config import get_logger

logger = get_logger("rate_limit")

try:
    limiter = Limiter(
        key_func=get_remote_address,
        storage_uri=settings.redis_url or "memory://",
    )
except Exception:
    logger.warning("redis_unavailable_falling_back_to_memory")
    limiter = Limiter(
        key_func=get_remote_address,
        storage_uri="memory://",
    )
