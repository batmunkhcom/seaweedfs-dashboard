from fastapi import Request, HTTPException
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.rbac import has_permission

PUBLIC_PATHS = {"/api/health", "/api/auth/login", "/api/auth/csrf-token", "/docs", "/openapi.json"}


class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.url.path in PUBLIC_PATHS or request.url.path.startswith("/api/health"):
            return await call_next(request)

        session = request.session
        if not session or not session.get("user"):
            return JSONResponse(status_code=401, content={"detail": "Not authenticated"})

        request.state.user = session["user"]
        request.state.role = session.get("role", "viewer")
        return await call_next(request)


def require_permission(permission: str):
    def checker(request: Request) -> bool:
        role = getattr(request.state, "role", None)
        if not role or not has_permission(role, permission):
            raise HTTPException(status_code=403, detail=f"Missing permission: {permission}")
        return True
    return checker


def require_admin(request: Request) -> bool:
    role = getattr(request.state, "role", None)
    if role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return True


def get_current_user(request: Request) -> dict:
    user = getattr(request.state, "user", None)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user
