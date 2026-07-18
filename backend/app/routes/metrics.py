import asyncio
import time

import httpx
from fastapi import APIRouter

from app.database import get_db
from app.logging_config import get_logger

router = APIRouter(prefix="/metrics", tags=["metrics"])
logger = get_logger("metrics")


async def _get_latest_metrics(metric: str) -> list[dict]:
    db = await get_db()
    cursor = await db.execute(
        """
        SELECT m.node, m.value, m.timestamp
        FROM metrics_history m
        INNER JOIN (
            SELECT node, MAX(timestamp) as max_ts
            FROM metrics_history
            WHERE metric_type = ?
            GROUP BY node
        ) latest ON m.node = latest.node AND m.timestamp = latest.max_ts AND m.metric_type = ?
        """,
        (metric, metric),
    )
    rows = await cursor.fetchall()
    return [{"node": r["node"], "value": r["value"]} for r in rows]


@router.get("/overview")
async def metrics_overview():
    db = await get_db()

    latest_ts = time.time() - 120
    cursor = await db.execute(
        "SELECT COUNT(DISTINCT node) as cnt FROM metrics_history WHERE timestamp > ? AND metric_type = 'disk_usage_pct'",
        (latest_ts,),
    )
    row = await cursor.fetchone()
    nodes_healthy = row["cnt"] if row else 0

    disk = await _get_latest_metrics("disk_usage_pct")
    volumes_rows = await _get_latest_metrics("volumes")
    free_slots = await _get_latest_metrics("free_slots")
    max_slots = await _get_latest_metrics("max_slots")
    disk_total = await _get_latest_metrics("disk_total_gb")
    disk_free = await _get_latest_metrics("disk_free_gb")

    total_volumes = sum(r["value"] for r in volumes_rows)
    total_free = sum(r["value"] for r in free_slots)
    total_max = sum(r["value"] for r in max_slots)
    total_disk_gb = sum(r["value"] for r in disk_total)
    total_disk_free = sum(r["value"] for r in disk_free)

    cluster_usage = round(sum(r["value"] for r in disk) / max(len(disk), 1), 2) if disk else 0.0

    return {
        "total_volumes": total_volumes,
        "total_free_slots": total_free,
        "total_max_slots": total_max,
        "total_disk_gb": round(total_disk_gb, 1),
        "total_disk_free_gb": round(total_disk_free, 1),
        "cluster_disk_usage_pct": cluster_usage,
        "nodes_total": len(disk),
        "nodes_healthy": nodes_healthy,
        "last_updated": time.time(),
    }


@router.get("/node/{ip}")
async def metrics_node(ip: str):
    db = await get_db()
    metrics = ["volumes", "free_slots", "max_slots", "disk_usage_pct", "ec_shards", "disk_total_gb", "disk_free_gb"]
    result = {"node": ip, "alive": False, "last_seen": 0}

    for m in metrics:
        cursor = await db.execute(
            "SELECT value, timestamp FROM metrics_history WHERE node = ? AND metric_type = ? ORDER BY timestamp DESC LIMIT 1",
            (ip, m),
        )
        row = await cursor.fetchone()
        result[m] = row["value"] if row else 0
        if m == "disk_usage_pct" and row:
            result["last_seen"] = row["timestamp"]

    cursor = await db.execute(
        "SELECT COUNT(*) as cnt FROM metrics_history WHERE node = ? AND timestamp > ?",
        (ip, time.time() - 120),
    )
    row = await cursor.fetchone()
    result["alive"] = (row["cnt"] if row else 0) > 0

    return result


@router.get("/history")
async def metrics_history(node: str | None = None, metric: str = "disk_usage_pct", hours: int = 24, all_nodes: bool = False):
    db = await get_db()
    cutoff = time.time() - (hours * 3600)

    if all_nodes:
        cursor = await db.execute(
            "SELECT timestamp, value, node FROM metrics_history WHERE metric_type = ? AND timestamp >= ? ORDER BY node, timestamp ASC",
            (metric, cutoff),
        )
        rows = await cursor.fetchall()
        return [{"timestamp": r["timestamp"], "value": r["value"], "node": r["node"]} for r in rows]

    if node:
        cursor = await db.execute(
            "SELECT timestamp, value FROM metrics_history WHERE node = ? AND metric_type = ? AND timestamp >= ? ORDER BY timestamp ASC",
            (node, metric, cutoff),
        )
    else:
        cursor = await db.execute(
            "SELECT timestamp, AVG(value) as value FROM metrics_history WHERE metric_type = ? AND timestamp >= ? GROUP BY CAST(timestamp / 300 AS INTEGER) ORDER BY timestamp ASC",
            (metric, cutoff),
        )

    rows = await cursor.fetchall()
    return [{"timestamp": r["timestamp"], "value": r["value"]} for r in rows]


@router.get("/nodes")
async def metrics_nodes():
    disk = await _get_latest_metrics("disk_usage_pct")
    volumes = {r["node"]: r["value"] for r in await _get_latest_metrics("volumes")}
    free_s = {r["node"]: r["value"] for r in await _get_latest_metrics("free_slots")}
    max_s = {r["node"]: r["value"] for r in await _get_latest_metrics("max_slots")}
    ec = {r["node"]: r["value"] for r in await _get_latest_metrics("ec_shards")}
    disk_total = {r["node"]: r["value"] for r in await _get_latest_metrics("disk_total_gb")}
    disk_free = {r["node"]: r["value"] for r in await _get_latest_metrics("disk_free_gb")}

    result = []
    for d in disk:
        node = d["node"]
        result.append({
            "node": node,
            "volumes": int(volumes.get(node, 0)),
            "free_slots": int(free_s.get(node, 0)),
            "max_slots": int(max_s.get(node, 0)),
            "ec_shards": int(ec.get(node, 0)),
            "disk_usage_pct": d["value"],
            "disk_total_gb": disk_total.get(node, 0),
            "disk_free_gb": disk_free.get(node, 0),
        })
    return result


@router.get("/alive")
async def metrics_alive():
    nodes_rows = await _get_latest_metrics("disk_usage_pct")
    if not nodes_rows:
        return []

    node_ips = [r["node"] for r in nodes_rows]
    timeout = httpx.Timeout(5.0, connect=3.0)

    async with httpx.AsyncClient(timeout=timeout) as hc:
        async def check_one(ip):
            status = {"node": ip, "alive": False, "latency_ms": None, "error": None}
            try:
                t0 = time.monotonic()
                r = await hc.get(f"http://{ip}:8080/status", timeout=5.0)
                latency = round((time.monotonic() - t0) * 1000, 1)
                status["alive"] = r.status_code == 200
                status["latency_ms"] = latency
            except Exception as e:
                status["error"] = str(e)[:200]
            return status

        return await asyncio.gather(*[check_one(ip) for ip in node_ips])
