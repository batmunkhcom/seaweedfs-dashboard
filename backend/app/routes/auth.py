from fastapi import APIRouter, Request, HTTPException, Depends
from starlette.responses import JSONResponse

from app.config import settings
from app.middleware.csrf_middleware import generate_csrf_token
from app.middleware.rate_limit import limiter
from app.middleware.auth_middleware import get_current_user
from app.logging_config import get_logger

router = APIRouter(prefix="/auth", tags=["auth"])
logger = get_logger("auth")


@router.post("/login")
@limiter.limit("5/15minute")
async def login(request: Request, body: LoginRequest):
    if body.username == settings.admin_user and body.password == settings.admin_password:
        role = "admin"
    elif body.username == settings.readonly_user and body.password == settings.readonly_password:
        role = "readonly"
    else:
        logger.warning("login_failed", username=body.username)
        raise HTTPException(status_code=401, detail="Invalid credentials")

    csrf_token = generate_csrf_token()
    request.session["user"] = body.username
    request.session["role"] = role
    request.session["csrf_token"] = csrf_token

    response = JSONResponse(
        content={
            "user": {"username": body.username, "role": role},
            "csrfToken": csrf_token,
        }
    )
    response.set_cookie("session_id", "set", httponly=True, samesite="strict")

    logger.info("login_success", username=body.username, role=role)
    return response


@router.post("/logout")
async def logout(request: Request):
    request.session.clear()
    return {"message": "logged out"}


@router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    return {"username": user["username"], "role": user.get("role", "readonly")}


@router.get("/csrf-token")
async def csrf_token(request: Request):
    token = generate_csrf_token()
    request.session["csrf_token"] = token
    return {"token": token}
