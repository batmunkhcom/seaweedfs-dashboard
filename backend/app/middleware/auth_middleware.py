from fastapi import Request, HTTPException
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.rbac import has_permission
from app.services.api_key_service import validate_api_key, record_usage

PUBLIC_PATHS = {"/api/health", "/api/info", "/api/auth/login", "/api/auth/csrf-token", "/docs", "/openapi.json"}


class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.url.path in PUBLIC_PATHS or request.url.path.startswith("/api/health"):
            return await call_next(request)

         # Try API key first (for backend service access)
        api_key = request.headers.get("X-API-Key")
        if api_key:
            key_data = await validate_api_key(api_key)
            if key_data:
                request.state.user = "api_key"
                request.state.role = "backup_admin"
                request.state.permissions = key_data["permissions"].split(",")
                request.state.api_key_id = key_data["id"]
                await record_usage(key_data["id"], request.url.path)
                return await call_next(request)

        # Fallback to session-based auth
        session = request.session
        if not session or not session.get("user"):
            return JSONResponse(status_code=401, content={"detail": "Not authenticated"})

        request.state.user = session["user"]
        request.state.role = session.get("role", "viewer")
        return await call_next(request)


def require_permission(permission: str):
    def checker(request: Request) -> bool:
        role = getattr(request.state, "role", None)
        permissions = getattr(request.state, "permissions", [])
        
         # API key users need explicit permission
        if role == "backup_admin":
            if permission not in permissions:
                raise HTTPException(status_code=403, detail=f"Missing permission: {permission}")
            return True
        
         # Session-based auth uses RBAC
        from app.rbac import has_permission
        if not has_permission(role, permission):
            raise HTTPException(status_code=403, detail=f"Missing permission: {permission}")
        return True
    
    return checker


def require_admin(request: Request) -> bool:
    role = getattr(request.state, "role", None)
    if role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return True


def get_current_user(request: Request) -> dict:
    username = getattr(request.state, "user", None)
    if not username:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return {"username": username, "role": getattr(request.state, "role", "viewer")}
