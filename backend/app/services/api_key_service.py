import secrets
from datetime import datetime, timezone

import bcrypt

from app.database import get_db
from app.logging_config import get_logger

logger = get_logger("api_keys")


def generate_key() -> str:
    return "bkp_" + secrets.token_hex(32)


async def validate_api_key(key: str) -> dict | None:
    if not key or not key.startswith("bkp_"):
        return None

    db = await get_db()
    cursor = await db.execute(
        "SELECT * FROM api_keys WHERE key = ? AND is_active = 1", (key,)
    )
    row = await cursor.fetchone()

    if not row:
        return None

    return dict(row)


async def record_usage(key_id: int, endpoint: str = "") -> bool:
    db = await get_db()
    now = datetime.now(timezone.utc).isoformat()
    await db.execute(
        "UPDATE api_keys SET usage_count = usage_count + 1, last_used_at = ?, last_used_endpoint = ? WHERE id = ?",
        (now, endpoint, key_id),
    )
    await db.commit()
    return True


async def create_api_key(name: str, permissions: str = "backup:read,backup:write", created_by: str = "admin") -> dict:
    key = generate_key()
    db = await get_db()
    await db.execute(
        "INSERT INTO api_keys (key, name, permissions, created_by) VALUES (?, ?, ?, ?)",
        (key, name, permissions, created_by),
    )
    await db.commit()

    logger.info("api_key_created", name=name, created_by=created_by)
    return {"key": key, "name": name, "permissions": permissions}


async def reveal_api_key(key_id: int, admin_password: str, username: str) -> str | None:
    db = await get_db()
    cursor = await db.execute(
        "SELECT password_hash FROM users WHERE username = ? AND enabled = 1",
        (username,),
    )
    row = await cursor.fetchone()
    if not row or not bcrypt.checkpw(admin_password.encode(), row["password_hash"].encode()):
        logger.warning("reveal_key_failed", username=username, reason="wrong_admin_password")
        return None

    cursor = await db.execute("SELECT key FROM api_keys WHERE id = ?", (key_id,))
    key_row = await cursor.fetchone()
    if not key_row:
        return None

    logger.info("api_key_revealed", key_id=key_id, by=username)
    return key_row["key"]


async def get_api_key_detail(key_id: int) -> dict | None:
    db = await get_db()
    cursor = await db.execute(
        "SELECT id, name, permissions, created_at, last_used_at, is_active, usage_count, last_used_endpoint, created_by FROM api_keys WHERE id = ?",
        (key_id,),
    )
    row = await cursor.fetchone()
    if not row:
        return None
    result = dict(row)
    result["permissions"] = result["permissions"].split(",") if result["permissions"] else []
    return result


async def list_api_keys() -> list[dict]:
    db = await get_db()
    cursor = await db.execute(
        "SELECT id, name, permissions, created_at, last_used_at, is_active, usage_count, last_used_endpoint, created_by FROM api_keys ORDER BY id DESC"
    )
    return [dict(row) for row in await cursor.fetchall()]


async def revoke_api_key(key_id: int) -> bool:
    db = await get_db()
    await db.execute("UPDATE api_keys SET is_active = 0 WHERE id = ?", (key_id,))
    await db.commit()
    return True
