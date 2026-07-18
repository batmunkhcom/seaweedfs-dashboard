from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
import bcrypt
import secrets

from app.middleware.auth_middleware import require_admin, get_current_user
from app.middleware.rate_limit import limiter
from app.database import get_db
from app.services.seaweed_client import get_seaweed_client
from app.logging_config import get_logger
from app.rbac import get_roles, get_default_role
import asyncio

router = APIRouter(prefix="/users", tags=["users"])
logger = get_logger("users")


def _trigger_sync():
    async def _do():
        try:
            from app.services.s3_sync import sync_to_all_gateways
            await sync_to_all_gateways()
        except Exception:
            pass
    asyncio.create_task(_do())

class CreateUserRequest(BaseModel):
    username: str
    password: str
    firstname: str
    lastname: str
    email: str
    phone: str = ""
    role: str | None = None
    create_bucket: bool = False
    s3_permission: str = "readwrite"


class UpdateUserRequest(BaseModel):
    firstname: str | None = None
    lastname: str | None = None
    email: str | None = None
    phone: str | None = None
    role: str | None = None
    enabled: bool | None = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class UpdateProfileRequest(BaseModel):
    firstname: str | None = None
    lastname: str | None = None
    email: str | None = None
    phone: str | None = None


def _generate_s3_credentials(username: str) -> tuple[str, str]:
    access_key = f"AK{secrets.token_hex(10)}"
    secret_key = secrets.token_hex(20)
    return access_key, secret_key


async def _create_s3_bucket(username: str) -> bool:
    client = get_seaweed_client()
    bucket_name = f"user-{username}"
    try:
        await client.request("POST", f"/{bucket_name}?op=mkdir", master=False)
        logger.info("s3_bucket_created", username=username, bucket=bucket_name)
        return True
    except Exception:
        logger.error("s3_bucket_create_failed", username=username, exc_info=True)
        return False


@router.get("")
async def list_users():
    db = await get_db()
    cursor = await db.execute(
        "SELECT id, username, firstname, lastname, email, phone, role, enabled, s3_access_key, s3_permission, created_at FROM users ORDER BY username"
    )
    rows = await cursor.fetchall()
    return [_mask_user(r) for r in rows]


def _mask_user(row) -> dict:
    d = dict(row)
    if d.get("s3_access_key") and len(str(d["s3_access_key"])) > 8:
        d["s3_access_key"] = str(d["s3_access_key"])[:4] + "****" + str(d["s3_access_key"])[-4:]
    return d


@router.get("/roles")
async def list_roles():
    return get_roles()


@router.post("")
async def create_user(body: CreateUserRequest, _: bool = Depends(require_admin)):
    db = await get_db()

    if not body.username.strip() or not body.firstname.strip() or not body.lastname.strip() or not body.email.strip():
        raise HTTPException(400, "Username, firstname, lastname, email are required")

    role = body.role or get_default_role()
    allowed = list(get_roles().keys())
    if role not in allowed:
        raise HTTPException(400, f"Invalid role. Allowed: {allowed}")

    hashed = bcrypt.hashpw(body.password.encode(), bcrypt.gensalt()).decode()
    access_key, secret_key = _generate_s3_credentials(body.username)

    try:
        await db.execute(
            "INSERT INTO users (username, password_hash, firstname, lastname, email, phone, role, s3_access_key, s3_secret_key, s3_permission) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (body.username, hashed, body.firstname, body.lastname, body.email, body.phone or "", role, access_key, secret_key, body.s3_permission),
        )
        await db.commit()
    except Exception:
        raise HTTPException(409, f"User '{body.username}' already exists")

    bucket_created = False
    if body.create_bucket:
        bucket_created = await _create_s3_bucket(body.username)

    _trigger_sync()

    return {
        "username": body.username,
        "role": role,
        "enabled": True,
        "s3_access_key": access_key,
        "s3_secret_key": secret_key,
        "bucket_created": bucket_created,
    }


@router.put("/{user_id}")
async def update_user(user_id: int, body: UpdateUserRequest, _: bool = Depends(require_admin)):
    db = await get_db()
    updates = []
    params = []

    if body.firstname is not None:
        updates.append("firstname = ?")
        params.append(body.firstname)
    if body.lastname is not None:
        updates.append("lastname = ?")
        params.append(body.lastname)
    if body.email is not None:
        updates.append("email = ?")
        params.append(body.email)
    if body.phone is not None:
        updates.append("phone = ?")
        params.append(body.phone)
    if body.role:
        allowed = list(get_roles().keys())
        if body.role not in allowed:
            raise HTTPException(400, f"Invalid role. Allowed: {allowed}")
        updates.append("role = ?")
        params.append(body.role)
    if body.enabled is not None:
        updates.append("enabled = ?")
        params.append(int(body.enabled))

    if updates:
        params.append(user_id)
        await db.execute(f"UPDATE users SET {', '.join(updates)} WHERE id = ?", params)
        await db.commit()

    _trigger_sync()

    return {"ok": True}


@router.delete("/{user_id}")
async def delete_user(user_id: int, _: bool = Depends(require_admin)):
    db = await get_db()
    cursor = await db.execute("SELECT username FROM users WHERE id = ?", (user_id,))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(404, "User not found")
    if row["username"] in ("admin",):
        raise HTTPException(400, "Cannot delete system admin")
    await db.execute("DELETE FROM users WHERE id = ?", (user_id,))
    await db.commit()

    _trigger_sync()

    return {"ok": True}


@router.post("/me/password")
@limiter.limit("10/minute")
async def change_password(request: Request, body: ChangePasswordRequest, user: dict = Depends(get_current_user)):
    db = await get_db()
    cursor = await db.execute(
        "SELECT password_hash FROM users WHERE username = ? AND enabled = 1",
        (user["username"],),
    )
    row = await cursor.fetchone()
    if not row or not bcrypt.checkpw(body.current_password.encode(), row["password_hash"].encode()):
        raise HTTPException(400, "Current password is incorrect")

    hashed = bcrypt.hashpw(body.new_password.encode(), bcrypt.gensalt()).decode()
    await db.execute(
        "UPDATE users SET password_hash = ? WHERE username = ?",
        (hashed, user["username"]),
    )
    await db.commit()
    return {"ok": True}


@router.get("/me/profile")
async def get_profile(user: dict = Depends(get_current_user)):
    db = await get_db()
    cursor = await db.execute(
        "SELECT username, firstname, lastname, email, phone, role, s3_access_key, created_at FROM users WHERE username = ?",
        (user["username"],),
    )
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(404, "User not found")
    return dict(row)


@router.put("/me/profile")
async def update_profile(body: UpdateProfileRequest, user: dict = Depends(get_current_user)):
    db = await get_db()
    updates = []
    params = []

    if body.firstname is not None:
        updates.append("firstname = ?")
        params.append(body.firstname)
    if body.lastname is not None:
        updates.append("lastname = ?")
        params.append(body.lastname)
    if body.email is not None:
        updates.append("email = ?")
        params.append(body.email)
    if body.phone is not None:
        updates.append("phone = ?")
        params.append(body.phone)

    if updates:
        params.append(user["username"])
        await db.execute(f"UPDATE users SET {', '.join(updates)} WHERE username = ?", params)
        await db.commit()

    return {"ok": True}


@router.post("/me/bucket")
async def create_my_bucket(user: dict = Depends(get_current_user)):
    bucket_created = await _create_s3_bucket(user["username"])
    if not bucket_created:
        raise HTTPException(500, "Bucket creation failed")
    return {"bucket": f"user-{user['username']}", "ok": True}
