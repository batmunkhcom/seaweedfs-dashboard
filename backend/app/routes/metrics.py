import asyncio
import time

import httpx
from fastapi import APIRouter

from app.config import settings
from app.database import get_db
from app.services.seaweed_client import get_seaweed_client
from app.logging_config import get_logger

router = APIRouter(prefix="/metrics", tags=["metrics"])
logger = get_logger("metrics")


@router.get("/overview")
async def metrics_overview():
    client = get_seaweed_client()
    try:
        resp = await client.master_get("/dir/status?pretty=y")
        data = resp.json()
    except Exception:
        logger.error("metrics_overview_fetch_failed", exc_info=True)
        return {
            "total_volumes": 0, "total_free_slots": 0, "total_max_slots": 0,
            "cluster_disk_usage_pct": 0, "nodes_total": 0, "nodes_healthy": 0, "last_updated": time.time(),
        }

    topology = data.get("Topology", {})
    total_volumes = 0
    total_free = 0
    total_max = 0
    nodes_total = 0

    for dc in topology.get("DataCenters", []):
        for rack in dc.get("Racks", []):
            for node in rack.get("DataNodes", []):
                nodes_total += 1
                total_volumes += node.get("Volumes", 0)
                total_free += node.get("Free", 0)
                total_max += node.get("Max", 0)

    cluster_usage_pct = 0.0
    if total_max > 0:
        cluster_usage_pct = round(((total_max - total_free) / total_max) * 100, 2)

    nodes_healthy = nodes_total
    try:
        db = await get_db()
        latest_ts = time.time() - 120
        cursor = await db.execute(
            "SELECT COUNT(DISTINCT node) as cnt FROM metrics_history WHERE timestamp > ? AND metric_type = 'volumes'",
            (latest_ts,),
        )
        row = await cursor.fetchone()
        nodes_healthy = row["cnt"] if row else 0
    except Exception:
        pass

    return {
        "total_volumes": total_volumes,
        "total_free_slots": total_free,
        "total_max_slots": total_max,
        "cluster_disk_usage_pct": cluster_usage_pct,
        "nodes_total": nodes_total,
        "nodes_healthy": nodes_healthy,
        "last_updated": time.time(),
    }


@router.get("/node/{ip}")
async def metrics_node(ip: str):
    client = get_seaweed_client()
    try:
        resp = await client.master_get("/dir/status?pretty=y")
        data = resp.json()
    except Exception:
        logger.error("metrics_node_fetch_failed", exc_info=True)
        return {"node": ip, "volumes": 0, "free_slots": 0, "max_slots": 0, "disk_usage_pct": 0, "ec_shards": 0, "alive": False, "last_seen": 0}

    node_data = {"node": ip, "volumes": 0, "free_slots": 0, "max_slots": 0, "disk_usage_pct": 0, "ec_shards": 0, "alive": False, "last_seen": 0}

    topology = data.get("Topology", {})
    for dc in topology.get("DataCenters", []):
        for rack in dc.get("Racks", []):
            for node in rack.get("DataNodes", []):
                node_url = node.get("Url", "")
                node_ip = node_url.split(":")[0] if node_url else ""
                if node_ip == ip:
                    free = node.get("Free", 0)
                    max_slots = node.get("Max", 0)
                    node_data["volumes"] = node.get("Volumes", 0)
                    node_data["free_slots"] = free
                    node_data["max_slots"] = max_slots
                    node_data["ec_shards"] = node.get("EcShards", 0)
                    if max_slots > 0:
                        node_data["disk_usage_pct"] = round(((max_slots - free) / max_slots) * 100, 2)
                    node_data["alive"] = True
                    node_data["last_seen"] = time.time()
                    break

    return node_data


@router.get("/history")
async def metrics_history(node: str | None = None, metric: str = "disk_usage_pct", hours: int = 24):
    db = await get_db()
    cutoff = time.time() - (hours * 3600)

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
    client = get_seaweed_client()
    try:
        resp = await client.master_get("/dir/status?pretty=y")
        data = resp.json()
    except Exception:
        logger.error("metrics_nodes_fetch_failed", exc_info=True)
        return []

    nodes = []
    topology = data.get("Topology", {})
    for dc in topology.get("DataCenters", []):
        for rack in dc.get("Racks", []):
            for node in rack.get("DataNodes", []):
                node_url = node.get("Url", "")
                node_ip = node_url.split(":")[0] if node_url else "unknown"
                free = node.get("Free", 0)
                max_slots = node.get("Max", 0)
                nodes.append({
                    "node": node_ip,
                    "volumes": node.get("Volumes", 0),
                    "free_slots": free,
                    "max_slots": max_slots,
                    "ec_shards": node.get("EcShards", 0),
                    "disk_usage_pct": round(((max_slots - free) / max_slots) * 100, 2) if max_slots > 0 else 0,
                })

    return nodes


@router.get("/alive")
async def metrics_alive():
    client = get_seaweed_client()
    try:
        resp = await client.master_get("/dir/status?pretty=y")
        data = resp.json()
    except Exception:
        logger.error("metrics_alive_fetch_failed", exc_info=True)
        return []

    nodes_status = []
    topology = data.get("Topology", {})
    timeout = httpx.Timeout(5.0, connect=3.0)

    async with httpx.AsyncClient(timeout=timeout) as hc:
        for dc in topology.get("DataCenters", []):
            for rack in dc.get("Racks", []):
                for node in rack.get("DataNodes", []):
                    node_url = node.get("Url", "")
                    node_ip = node_url.split(":")[0] if node_url else "unknown"
                    status = {"node": node_ip, "alive": False, "latency_ms": None, "error": None}

                    try:
                        t0 = time.monotonic()
                        r = await hc.get(f"http://{node_ip}:8080/status", timeout=5.0)
                        latency = round((time.monotonic() - t0) * 1000, 1)
                        status["alive"] = r.status_code == 200
                        status["latency_ms"] = latency
                    except Exception as e:
                        status["error"] = str(e)[:200]

                    nodes_status.append(status)

    return nodes_status
