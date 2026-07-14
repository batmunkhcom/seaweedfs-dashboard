from fastapi import Request, HTTPException
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import settings

limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=settings.redis_url or "memory://",
)


def get_rate_limit_key(request: Request) -> str:
    return f"rate:{get_remote_address(request)}:{request.url.path}"


async def login_rate_limit(request: Request):
    if getattr(request.state, "rate_limit_exceeded", False):
        raise HTTPException(status_code=429, detail="Too many login attempts. Try again later.")
