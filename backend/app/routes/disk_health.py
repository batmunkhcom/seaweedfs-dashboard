from fastapi import APIRouter

from app.config import settings
from app.database import get_db
from app.logging_config import get_logger

router = APIRouter(prefix="/disk-health", tags=["disk-health"])
logger = get_logger("disk_health")


if not settings.disk_health_enabled:
    @router.get("/status")
    async def disk_health_disabled():
        return {"enabled": False}
else:
    @router.get("/status")
    async def disk_health_status():
        db = await get_db()
        cursor = await db.execute(
            """
            SELECT node, device, MAX(timestamp) as last_scan
            FROM disk_health
            GROUP BY node, device
            ORDER BY node, device
            """
        )
        rows = await cursor.fetchall()
        return {"enabled": True, "devices": [dict(r) for r in rows]}


    @router.get("/{node}/{device}")
    async def disk_health_detail(node: str, device: str):
        db = await get_db()
        cursor = await db.execute(
            "SELECT * FROM disk_health WHERE node = ? AND device = ? ORDER BY timestamp DESC LIMIT 1",
            (node, f"/dev/{device}"),
        )
        row = await cursor.fetchone()
        if not row:
            return {"error": "not found"}
        return dict(row)


    @router.get("/history/{node}/{device}")
    async def disk_health_history(node: str, device: str, days: int = 30):
        db = await get_db()
        import time
        cutoff = time.time() - days * 86400
        cursor = await db.execute(
            "SELECT timestamp, smart_json FROM disk_health WHERE node = ? AND device = ? AND timestamp >= ? ORDER BY timestamp ASC",
            (node, f"/dev/{device}", cutoff),
        )
        rows = await cursor.fetchall()
        return [{"timestamp": r[0], "smart": r[1]} for r in rows]
