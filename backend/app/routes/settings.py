from fastapi import APIRouter, Depends
from app.database import get_db
from app.middleware.auth_middleware import require_admin

router = APIRouter(prefix="/settings", tags=["settings"])

SENSITIVE_KEYS = {"ai_api_key", "ai_embedding_api_key", "redis_url", "s3_secret_key"}


def _mask_sensitive(key: str, value: str) -> str:
    if key in SENSITIVE_KEYS and value:
        if len(value) > 8:
            return value[:4] + "***" + value[-4:]
        return "***"
    return value


@router.get("")
async def get_settings():
    db = await get_db()
    cursor = await db.execute("SELECT key, value, description, category FROM runtime_settings ORDER BY category, key")
    rows = await cursor.fetchall()

    categories: dict[str, list[dict]] = {}
    for row in rows:
        cat = row["category"]
        if cat not in categories:
            categories[cat] = []
        categories[cat].append({"key": row["key"], "value": _mask_sensitive(row["key"], row["value"]), "description": row["description"]})

    return {"categories": categories}


@router.put("")
async def update_settings(settings: dict[str, str], _: bool = Depends(require_admin)):
    db = await get_db()
    for key, value in settings.items():
        await db.execute(
            "UPDATE runtime_settings SET value = ? WHERE key = ?",
            (str(value), key),
        )
    await db.commit()
    return {"ok": True}
