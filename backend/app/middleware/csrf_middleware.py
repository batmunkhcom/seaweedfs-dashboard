import secrets
from fastapi import Request, HTTPException, Response
from starlette.middleware.base import BaseHTTPMiddleware


CSRF_HEADER = "X-CSRF-Token"
CSRF_SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


class CsrfMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.method.upper() in CSRF_SAFE_METHODS:
            return await call_next(request)

        if request.url.path.startswith("/api/auth"):
            return await call_next(request)

        csrf_header = request.headers.get(CSRF_HEADER, "")
        csrf_expected = request.session.get("csrf_token", "")

        if not csrf_header or not csrf_expected or csrf_header != csrf_expected:
            raise HTTPException(status_code=403, detail="Invalid CSRF token")

        return await call_next(request)


def generate_csrf_token() -> str:
    return secrets.token_hex(32)
