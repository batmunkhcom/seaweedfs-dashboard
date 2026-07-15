from fastapi import APIRouter, Request, HTTPException, Depends
from starlette.responses import JSONResponse
import bcrypt

from app.database import get_db
from app.middleware.csrf_middleware import generate_csrf_token
from app.middleware.rate_limit import limiter
from app.middleware.auth_middleware import get_current_user
from app.logging_config import get_logger

from pydantic import BaseModel


class LoginBody(BaseModel):
    username: str
    password: str


router = APIRouter(prefix="/auth", tags=["auth"])
logger = get_logger("auth")


@router.post("/login")
@limiter.limit("5/15minute")
async def login(request: Request, body: LoginBody):
    db = await get_db()
    cursor = await db.execute(
        "SELECT username, password_hash, role, enabled FROM users WHERE username = ?",
        (body.username,),
    )
    row = await cursor.fetchone()

    if not row or not row["enabled"]:
        logger.warning("login_failed", username=body.username, reason="not_found_or_disabled")
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not bcrypt.checkpw(body.password.encode(), row["password_hash"].encode()):
        logger.warning("login_failed", username=body.username, reason="wrong_password")
        raise HTTPException(status_code=401, detail="Invalid credentials")

    csrf_token = generate_csrf_token()
    request.session["user"] = body.username
    request.session["role"] = row["role"]
    request.session["csrf_token"] = csrf_token

    response = JSONResponse(
        content={
            "user": {"username": body.username, "role": row["role"]},
            "csrfToken": csrf_token,
        }
    )

    logger.info("login_success", username=body.username, role=row["role"])
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
