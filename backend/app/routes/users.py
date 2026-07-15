from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import bcrypt

from app.database import get_db
from app.middleware.auth_middleware import require_admin, get_current_user
from app.rbac import get_roles, get_default_role

router = APIRouter(prefix="/users", tags=["users"])


class CreateUserRequest(BaseModel):
    username: str
    password: str
    role: str | None = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class UpdateUserRequest(BaseModel):
    role: str | None = None
    enabled: bool | None = None


@router.get("")
async def list_users():
    db = await get_db()
    cursor = await db.execute("SELECT id, username, role, enabled, created_at FROM users ORDER BY username")
    rows = await cursor.fetchall()
    return [dict(r) for r in rows]


@router.get("/roles")
async def list_roles():
    return get_roles()


@router.post("")
async def create_user(body: CreateUserRequest, _: bool = Depends(require_admin)):
    db = await get_db()
    role = body.role or get_default_role()
    allowed = list(get_roles().keys())
    if role not in allowed:
        raise HTTPException(400, f"Invalid role. Allowed: {allowed}")

    hashed = bcrypt.hashpw(body.password.encode(), bcrypt.gensalt()).decode()
    try:
        await db.execute(
            "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
            (body.username, hashed, role),
        )
        await db.commit()
    except Exception:
        raise HTTPException(409, f"User '{body.username}' already exists")

    return {"username": body.username, "role": role, "enabled": True}


@router.put("/{user_id}")
async def update_user(user_id: int, body: UpdateUserRequest, _: bool = Depends(require_admin)):
    db = await get_db()
    if body.role:
        allowed = list(get_roles().keys())
        if body.role not in allowed:
            raise HTTPException(400, f"Invalid role. Allowed: {allowed}")
        await db.execute("UPDATE users SET role = ? WHERE id = ?", (body.role, user_id))
    if body.enabled is not None:
        await db.execute("UPDATE users SET enabled = ? WHERE id = ?", (int(body.enabled), user_id))
    await db.commit()
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
    return {"ok": True}


@router.post("/me/password")
async def change_password(body: ChangePasswordRequest, user: dict = Depends(get_current_user)):
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
