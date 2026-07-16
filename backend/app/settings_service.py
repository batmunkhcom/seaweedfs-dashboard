from app.database import get_db

_cache: dict[str, str] = {}
_cache_loaded = False


async def load_runtime_settings():
    global _cache_loaded, _cache
    db = await get_db()
    cursor = await db.execute("SELECT key, value FROM runtime_settings")
    rows = await cursor.fetchall()
    _cache = {row["key"]: row["value"] for row in rows}
    _cache_loaded = True


async def get_setting(key: str, default: str = "") -> str:
    global _cache_loaded
    if not _cache_loaded:
        await load_runtime_settings()
    return _cache.get(key, default)


async def get_setting_int(key: str, default: int = 0) -> int:
    val = await get_setting(key, str(default))
    try:
        return int(val)
    except ValueError:
        return default


async def get_setting_float(key: str, default: float = 0.0) -> float:
    val = await get_setting(key, str(default))
    try:
        return float(val)
    except ValueError:
        return default


async def get_setting_list(key: str, default: list[str] | None = None) -> list[str]:
    val = await get_setting(key, ",".join(default or []))
    return [v.strip() for v in val.split(",") if v.strip()]


async def update_setting(key: str, value: str) -> bool:
    db = await get_db()
    await db.execute(
        "INSERT OR REPLACE INTO runtime_settings (key, value) VALUES (?, ?)",
        (key, value),
     )
    await db.commit()
    _cache[key] = value
    return True
