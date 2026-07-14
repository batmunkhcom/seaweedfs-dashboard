import time
from fastapi import APIRouter, Request, Depends

from app.services.seaweed_client import get_seaweed_client
from app.database import get_db
from app.logging_config import get_logger
from app.routes.sse import sse_endpoint, publish_stats
from app.middleware.auth_middleware import require_admin

router = APIRouter(prefix="/dashboard", tags=["dashboard"])
logger = get_logger("dashboard")


@router.get("/stats")
async def dashboard_stats():
    client = get_seaweed_client()
    stats = {
        "totalVolumes": 0,
        "totalFiles": 0,
        "totalSizeBytes": 0,
        "freeSpace": 0,
        "maxSpace": 0,
        "volumeServers": 0,
        "healthyNodes": 0,
        "masterLeader": "",
        "filerStatus": "disconnected",
        "version": "",
    }

    try:
        resp = await client.master_get("/dir/status?pretty=y")
        data = resp.json()
        topology = data.get("Topology", {})
        stats["freeSpace"] = topology.get("Free", 0)
        stats["maxSpace"] = topology.get("Max", 0)
        stats["version"] = data.get("Version", "")

        dc_count = 0
        for dc in topology.get("DataCenters", []):
            dc_count += 1
            for rack in dc.get("Racks", []):
                for node in rack.get("DataNodes", []):
                    stats["volumeServers"] += 1
                    stats["totalVolumes"] += node.get("Volumes", 0)
                    if node.get("Volumes", 0) > 0:
                        stats["healthyNodes"] += 1
    except Exception:
        logger.error("stats_fetch_failed", exc_info=True)

    try:
        leader_resp = await client.master_get("/cluster/status")
        leader_data = leader_resp.json()
        stats["masterLeader"] = leader_data.get("Leader", "")
    except Exception:
        logger.error("leader_fetch_failed", exc_info=True)

    try:
        await client.get_filer()
        stats["filerStatus"] = "connected"
    except Exception:
        logger.error("filer_check_failed", exc_info=True)

    await publish_stats(stats)
    return stats


@router.get("/sse")
async def dashboard_sse(request: Request):
    return await sse_endpoint(request)


@router.get("/alerts")
async def get_alerts(status: str | None = None):
    db = await get_db()
    if status:
        cursor = await db.execute("SELECT * FROM alerts WHERE status = ? ORDER BY created_at DESC", (status,))
    else:
        cursor = await db.execute("SELECT * FROM alerts WHERE status != 'resolved' ORDER BY created_at DESC")
    rows = await cursor.fetchall()
    return [dict(r) for r in rows]


@router.put("/alerts/{alert_id}/acknowledge")
async def acknowledge_alert(alert_id: int, _: bool = Depends(require_admin)):
    db = await get_db()
    await db.execute(
        "UPDATE alerts SET status = 'acknowledged', acknowledged_at = CURRENT_TIMESTAMP WHERE id = ?",
        (alert_id,),
    )
    await db.commit()
    return {"ok": True}


@router.get("/alerts/config")
async def get_alert_config():
    db = await get_db()
    cursor = await db.execute(
        "SELECT key, value FROM runtime_settings WHERE category = 'alerts'"
    )
    rows = await cursor.fetchall()
    return [dict(r) for r in rows]


@router.put("/alerts/config")
async def update_alert_config(config: list[dict], _: bool = Depends(require_admin)):
    db = await get_db()
    for item in config:
        await db.execute(
            "UPDATE runtime_settings SET value = ? WHERE key = ? AND category = 'alerts'",
            (item["value"], item["key"]),
        )
    await db.commit()
    return {"ok": True}


@router.get("/history")
async def dashboard_history(hours: int = 24):
    db = await get_db()
    cutoff = time.time() - hours * 3600
    cursor = await db.execute(
        "SELECT * FROM snapshots WHERE timestamp >= ? ORDER BY timestamp ASC",
        (cutoff,),
    )
    rows = await cursor.fetchall()
    return [dict(r) for r in rows]
