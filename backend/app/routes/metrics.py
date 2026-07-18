import asyncio
import time

import httpx
from fastapi import APIRouter

from app.database import get_db
from app.services.seaweed_client import get_seaweed_client
from app.logging_config import get_logger

router = APIRouter(prefix="/metrics", tags=["metrics"])
logger = get_logger("metrics")


async def _fetch_real_disk_usage(node_ips: list[str]) -> dict[str, float]:
    result: dict[str, float] = {}
    timeout = httpx.Timeout(5.0, connect=3.0)
    async with httpx.AsyncClient(timeout=timeout) as hc:
        for ip in node_ips:
            percent_used = 0.0
            try:
                r = await hc.get(f"http://{ip}:8080/status")
                if r.status_code == 200:
                    status = r.json()
                    for ds in status.get("DiskStatuses", []):
                        pct = ds.get("percent_used", 0)
                        if pct > percent_used:
                            percent_used = pct
            except Exception:
                pass
            result[ip] = round(percent_used, 2)
    return result


async def _extract_nodes_from_topology():
    client = get_seaweed_client()
    try:
        resp = await client.master_get("/dir/status?pretty=y")
        data = resp.json()
    except Exception:
        return [], {}

    nodes: list[dict] = []
    topology = data.get("Topology", {})
    for dc in topology.get("DataCenters", []):
        for rack in dc.get("Racks", []):
            for node in rack.get("DataNodes", []):
                node_url = node.get("Url", "")
                node_ip = node_url.split(":")[0] if node_url else "unknown"
                nodes.append({"ip": node_ip, "node": node})
    return nodes, topology


@router.get("/overview")
async def metrics_overview():
    nodes, topology = await _extract_nodes_from_topology()
    if not nodes:
        return {
            "total_volumes": 0, "total_free_slots": 0, "total_max_slots": 0,
            "cluster_disk_usage_pct": 0, "nodes_total": 0, "nodes_healthy": 0, "last_updated": time.time(),
        }

    node_ips = [n["ip"] for n in nodes]
    disk_usage_map = await _fetch_real_disk_usage(node_ips)

    total_volumes = 0
    total_free = 0
    total_max = 0
    total_disk_usage = 0.0
    nodes_with_disk = 0

    for n in nodes:
        node = n["node"]
        total_volumes += node.get("Volumes", 0)
        total_free += node.get("Free", 0)
        total_max += node.get("Max", 0)
        usage = disk_usage_map.get(n["ip"], 0)
        total_disk_usage += usage
        if usage > 0:
            nodes_with_disk += 1

    cluster_usage_pct = round(total_disk_usage / max(nodes_with_disk, 1), 2) if nodes_with_disk > 0 else 0.0

    nodes_healthy = 0
    try:
        db = await get_db()
        latest_ts = time.time() - 120
        cursor = await db.execute(
            "SELECT COUNT(DISTINCT node) as cnt FROM metrics_history WHERE timestamp > ? AND metric_type = 'disk_usage_pct'",
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
        "nodes_total": len(nodes),
        "nodes_healthy": nodes_healthy,
        "last_updated": time.time(),
    }


@router.get("/node/{ip}")
async def metrics_node(ip: str):
    nodes, topology = await _extract_nodes_from_topology()
    disk_usage_map = await _fetch_real_disk_usage([ip])

    node_data = {"node": ip, "volumes": 0, "free_slots": 0, "max_slots": 0, "disk_usage_pct": 0, "ec_shards": 0, "alive": False, "last_seen": 0}

    for n in nodes:
        if n["ip"] == ip:
            node = n["node"]
            node_data["volumes"] = node.get("Volumes", 0)
            node_data["free_slots"] = node.get("Free", 0)
            node_data["max_slots"] = node.get("Max", 0)
            node_data["ec_shards"] = node.get("EcShards", 0)
            node_data["disk_usage_pct"] = disk_usage_map.get(ip, 0)
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
    nodes, topology = await _extract_nodes_from_topology()
    if not nodes:
        return []

    node_ips = [n["ip"] for n in nodes]
    disk_usage_map = await _fetch_real_disk_usage(node_ips)

    result = []
    for n in nodes:
        node = n["node"]
        result.append({
            "node": n["ip"],
            "volumes": node.get("Volumes", 0),
            "free_slots": node.get("Free", 0),
            "max_slots": node.get("Max", 0),
            "ec_shards": node.get("EcShards", 0),
            "disk_usage_pct": disk_usage_map.get(n["ip"], 0),
        })
    return result


@router.get("/alive")
async def metrics_alive():
    nodes, topology = await _extract_nodes_from_topology()
    if not nodes:
        return []

    timeout = httpx.Timeout(5.0, connect=3.0)
    async with httpx.AsyncClient(timeout=timeout) as hc:
        async def check_one(n):
            status = {"node": n["ip"], "alive": False, "latency_ms": None, "error": None}
            try:
                t0 = time.monotonic()
                r = await hc.get(f"http://{n['ip']}:8080/status", timeout=5.0)
                latency = round((time.monotonic() - t0) * 1000, 1)
                status["alive"] = r.status_code == 200
                status["latency_ms"] = latency
            except Exception as e:
                status["error"] = str(e)[:200]
            return status

        return await asyncio.gather(*[check_one(n) for n in nodes])
