import time
from fastapi import APIRouter, Request, Depends

from app.services.seaweed_client import get_seaweed_client
from app.database import get_db
from app.settings_service import get_setting_int
from app.logging_config import get_logger
from app.routes.sse import sse_endpoint, publish_stats
from app.middleware.auth_middleware import require_permission, get_current_user

router = APIRouter(prefix="/dashboard", tags=["dashboard"])
logger = get_logger("dashboard")

REPLICATION_FACTOR = 2


@router.get("/stats")
async def dashboard_stats():
    client = get_seaweed_client()
    volume_size_mb = await get_setting_int("volume_size_mb", 30000)
    per_node_disk_gb = await get_setting_int("per_node_disk_gb", 1800)

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
        "totalDiskGB": 0,
        "totalUsableGB": 0,
        "physicalRawGB": 0,
        "physicalUsableGB": 0,
    }

    try:
        resp = await client.master_get("/dir/status?pretty=y")
        data = resp.json()
        topology = data.get("Topology", {})
        stats["freeSpace"] = topology.get("Free", 0)
        stats["maxSpace"] = topology.get("Max", 0)
        stats["version"] = data.get("Version", "")

        total_max = 0
        for dc in topology.get("DataCenters", []):
            for rack in dc.get("Racks", []):
                for node in rack.get("DataNodes", []):
                    total_max += node.get("Max", 0)
                    stats["volumeServers"] += 1
                    stats["totalVolumes"] += node.get("Volumes", 0)
                    stats["healthyNodes"] += 1

        stats["totalDiskGB"] = round((total_max * volume_size_mb) / 1024, 1)
        stats["totalUsableGB"] = round(stats["totalDiskGB"] / REPLICATION_FACTOR, 1)

        physical_raw = stats["volumeServers"] * per_node_disk_gb
        stats["physicalRawGB"] = round(physical_raw, 1)
        stats["physicalUsableGB"] = round(physical_raw / REPLICATION_FACTOR, 1)
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
async def dashboard_sse(request: Request, user: dict = Depends(get_current_user)):
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
async def acknowledge_alert(alert_id: int, _: bool = Depends(require_permission("alerts:write"))):
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
async def update_alert_config(config: list[dict], _: bool = Depends(require_permission("alerts:write"))):
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


@router.get("/disk-usage")
async def disk_usage():
    db = await get_db()
    cursor = await db.execute(
        "SELECT node, value, timestamp FROM metrics_history WHERE metric_type = 'disk_usage_pct' AND rowid IN (SELECT MAX(rowid) FROM metrics_history WHERE metric_type = 'disk_usage_pct' GROUP BY node)"
    )
    rows = await cursor.fetchall()
    nodes = []
    for r in rows:
        nodes.append({"node": r["node"], "usage_pct": round(r["value"], 2), "timestamp": r["timestamp"]})
    return {"nodes": nodes}


@router.get("/kpi-extras")
async def kpi_extras():
    db = await get_db()
    ALLOWED_TABLES = {"webhooks", "acl_policies", "tier_configs", "lifecycle_policies"}
    extras = {}
    for table in ALLOWED_TABLES:
        cursor = await db.execute(f"SELECT COUNT(*) as cnt FROM {table}")
        row = await cursor.fetchone()
        extras[table] = row["cnt"] if row else 0

    cursor = await db.execute("SELECT COUNT(*) as cnt FROM alerts WHERE status = 'new'")
    row = await cursor.fetchone()
    extras["active_alerts"] = row["cnt"] if row else 0

    return extras


@router.get("/features")
async def feature_toggles():
    from app.settings_service import get_setting
    toggles = [
        "feature_loki_enabled", "feature_webhooks_enabled", "feature_gateways_enabled",
        "feature_nfs_enabled", "feature_acl_enabled", "feature_lifecycle_enabled",
        "feature_tiers_enabled", "feature_hardening_enabled",
    ]
    result = {}
    for key in toggles:
        val = await get_setting(key, "false")
        result[key] = val == "true"
    return result
