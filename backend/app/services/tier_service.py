import json
import time

from app.database import get_db
from app.settings_service import get_setting, get_setting_int
from app.logging_config import get_logger

logger = get_logger("tier_service")

TIER_TYPES = ["hot", "warm", "cold"]
PROVIDERS = ["local", "s3", "gcs", "azure"]


async def get_tiers() -> list[dict]:
    db = await get_db()
    cursor = await db.execute("SELECT * FROM tier_configs ORDER BY tier_type")
    rows = await cursor.fetchall()
    return [dict(r) for r in rows]


async def save_tier(body: dict) -> dict:
    db = await get_db()
    name = body.get("name", "")
    tier_type = body.get("tier_type", "hot")
    provider = body.get("provider", "local")
    config = body.get("config", {})
    enabled = body.get("enabled", True)

    await db.execute(
        "INSERT OR REPLACE INTO tier_configs (name, tier_type, provider, config_json, enabled, updated_at) VALUES (?, ?, ?, ?, ?, datetime('now'))",
        (name, tier_type, provider, json.dumps(config), int(enabled)),
    )
    await db.commit()
    return {"ok": True, "name": name}


async def delete_tier(tier_id: int) -> dict:
    db = await get_db()
    await db.execute("DELETE FROM tier_configs WHERE id=?", (tier_id,))
    await db.commit()
    return {"ok": True}


async def get_tier_stats() -> dict:
    tiers = await get_tiers()
    stats = {"tiers": tiers, "total_estimated_cost": 0.0}
    cost_per_gb = float(await get_setting("tiers_cost_hot_gb_month", "0.05"))
    total_storage = sum(t.get("config_json", {}).get("capacity_gb", 0) if isinstance(t.get("config_json"), dict) else 0 for t in tiers)
    stats["total_estimated_cost"] = round(total_storage * cost_per_gb, 2)
    return stats


async def test_tier_connection(provider: str, config: dict) -> dict:
    try:
        import httpx
        if provider == "s3":
            endpoint = config.get("endpoint", "")
            access_key = config.get("access_key", "")
            async with httpx.AsyncClient(timeout=10) as hc:
                r = await hc.get(endpoint, auth=(access_key, config.get("secret_key", "")))
                return {"ok": r.status_code < 500, "status": r.status_code, "provider": provider}
        return {"ok": False, "error": f"Provider {provider} test not implemented"}
    except Exception as e:
        return {"ok": False, "error": str(e)}
