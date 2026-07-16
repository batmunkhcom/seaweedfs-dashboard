from fastapi import APIRouter, Depends

from app.config import settings
from app.database import get_db
from app.logging_config import get_logger
from app.middleware.auth_middleware import require_permission

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
        devices = []
        for r in rows:
            devices.append({"node": r[0], "device": r[1], "last_scan": r[2]})
        return {"enabled": True, "devices": devices}

    @router.post("/scan")
    async def trigger_scan(_: bool = Depends(require_permission("cluster:write"))):
        from app.services.disk_health import get_disk_health
        service = get_disk_health()
        await service.scan()
        return {"ok": True}


    @router.get("/{node}/{device}")
    async def disk_health_detail(node: str, device: str):
        import json
        db = await get_db()
        cursor = await db.execute(
            "SELECT node, device, timestamp, smart_json FROM disk_health WHERE node = ? AND device = ? ORDER BY timestamp DESC LIMIT 1",
            (node, f"/dev/{device}"),
        )
        row = await cursor.fetchone()
        if not row:
            return {"error": "not found"}
        return {"node": row[0], "device": row[1], "timestamp": row[2], "smart": row[3]}


    @router.get("/history/{node}/{device}")
    async def disk_health_history(node: str, device: str, days: int = 30):
        import time, json
        db = await get_db()
        cutoff = time.time() - days * 86400
        cursor = await db.execute(
            "SELECT timestamp, smart_json FROM disk_health WHERE node = ? AND device = ? AND timestamp >= ? ORDER BY timestamp ASC",
            (node, f"/dev/{device}", cutoff),
        )
        rows = await cursor.fetchall()
        result = []
        for r in rows:
            try:
                s = json.loads(r[1]) if isinstance(r[1], str) else {}
                result.append({
                    "timestamp": r[0],
                    "temp": s.get("temperature", {}).get("current", 0),
                    "wear": s.get("ata_smart_attributes", {}).get("table", [{}])[0].get("value", 0) if "ata_smart_attributes" in s else 0,
                })
            except Exception:
                result.append({"timestamp": r[0], "temp": 0, "wear": 0})
        return result
