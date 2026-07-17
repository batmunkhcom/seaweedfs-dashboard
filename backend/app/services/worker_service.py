import time
import asyncio
from datetime import datetime, timezone
from typing import Optional

import httpx

from app.config import settings
from app.database import get_db
from app.logging_config import get_logger
from app.services.seaweed_client import get_seaweed_client

logger = get_logger("worker_service")

JOB_TYPES = {
    "vacuum": "Run garbage collection on all volumes above threshold",
    "compact": "Compact specific volume IDs (comma-separated)",
    "rebalance": "Check and rebalance volume distribution across nodes",
    "health_check": "Scan all nodes for disk health and connectivity",
}

ALLOWED_JOB_TYPES = set(JOB_TYPES.keys())


async def _ensure_table():
    db = await get_db()
    await db.execute(
        """
        CREATE TABLE IF NOT EXISTS worker_jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            duration_ms INTEGER,
            error TEXT,
            result TEXT,
            created_at TEXT NOT NULL,
            node TEXT
        )
        """
    )
    try:
        await db.execute("ALTER TABLE worker_jobs ADD COLUMN result TEXT")
    except Exception:
        pass
    await db.commit()


async def _record_job(job_type: str, node: str = "") -> int:
    await _ensure_table()
    db = await get_db()
    now = datetime.now(timezone.utc).isoformat()
    cursor = await db.execute(
        "INSERT INTO worker_jobs (type, status, created_at, node) VALUES (?, 'running', ?, ?)",
        (job_type, now, node),
    )
    await db.commit()
    cursor = await db.execute("SELECT last_insert_rowid()")
    return (await cursor.fetchone())[0]


async def _finish_job(job_id: int, start_time: float, status: str = "success", error: str = "", result: str = ""):
    db = await get_db()
    duration_ms = int((time.monotonic() - start_time) * 1000)
    await db.execute(
        "UPDATE worker_jobs SET status=?, duration_ms=?, error=?, result=? WHERE id=?",
        (status, duration_ms, error, result, job_id),
    )
    await db.commit()


async def _probe_node(client: httpx.AsyncClient, host: str, port: int = 8080) -> dict:
    url = f"http://{host}:{port}"
    try:
        resp = await client.get(f"{url}/status", timeout=10)
        resp.raise_for_status()
        data = resp.json()
    except Exception:
        return {"healthy": False, "address": f"{host}:{port}"}

    disks = data.get("DiskStatuses", [])
    disk_info = None
    if disks:
        d = disks[0]
        disk_info = {
            "dir": d.get("dir", ""),
            "total_bytes": d.get("all", 0),
            "used_bytes": d.get("used", 0),
            "free_bytes": d.get("free", 0),
            "percent_free": d.get("percent_free", 0),
            "percent_used": d.get("percent_used", 0),
        }

    volumes = data.get("Volumes") or []
    capabilities = ["volume"]
    version = data.get("Version", "")

    return {
        "healthy": True,
        "address": f"{host}:{port}",
        "version": version,
        "volumes": len(volumes),
        "disk": disk_info,
        "capabilities": capabilities,
    }


async def detect_workers() -> dict:
    client = get_seaweed_client()
    nodes = []

    try:
        resp = await client.master_get("/dir/status")
        topology = resp.json().get("Topology", {})
        dc = topology.get("DataCenters", [{}])[0]
        rack = dc.get("Racks", [{}])[0]
        data_nodes = rack.get("DataNodes", [])

        async with httpx.AsyncClient(timeout=10) as probe_client:
            tasks = []
            for dn in data_nodes:
                url = dn.get("Url", "")
                host = url.split(":")[0] if ":" in url else url
                tasks.append(_probe_node(probe_client, host))

            for i, result in enumerate(await asyncio.gather(*tasks, return_exceptions=True)):
                dn = data_nodes[i]
                url = dn.get("Url", "")
                vid_str = dn.get("VolumeIds", "").strip()
                volume_ids = _parse_volume_ids(vid_str)
                if isinstance(result, Exception):
                    nodes.append({
                        "name": url,
                        "address": url,
                        "capabilities": [],
                        "healthy": False,
                        "version": "",
                        "volumes": dn.get("Volumes", 0),
                        "volume_ids": volume_ids,
                        "ec_shards": dn.get("EcShards", 0),
                        "max_volumes": dn.get("Max", 0),
                        "disk": None,
                        "last_seen": datetime.now(timezone.utc).isoformat(),
                    })
                else:
                    nodes.append({
                        "name": url,
                        "address": result["address"],
                        "capabilities": result["capabilities"],
                        "healthy": result["healthy"],
                        "version": result["version"],
                        "volumes": dn.get("Volumes", 0),
                        "volume_ids": volume_ids,
                        "ec_shards": dn.get("EcShards", 0),
                        "max_volumes": dn.get("Max", 0),
                        "disk": result["disk"],
                        "last_seen": datetime.now(timezone.utc).isoformat(),
                    })

        healthy = sum(1 for n in nodes if n["healthy"])
        return {
            "total": len(nodes),
            "healthy": healthy,
            "nodes": nodes,
        }
    except Exception:
        logger.error("detect_workers_failed", exc_info=True)
        return {"total": 0, "healthy": 0, "nodes": []}


async def execute_job(job_type: str, node: str = "", volume_param: str = "") -> dict:
    if job_type not in ALLOWED_JOB_TYPES:
        return {"ok": False, "job_id": "", "type": job_type, "node": node, "message": f"Unknown job type: {job_type}. Allowed: {', '.join(sorted(ALLOWED_JOB_TYPES))}"}

    job_id = await _record_job(job_type, node)
    start_time = time.monotonic()
    client = get_seaweed_client()

    try:
        if job_type == "vacuum":
            threshold = 0.3
            if volume_param:
                try:
                    threshold = max(0.01, min(1.0, float(volume_param)))
                except ValueError:
                    await _finish_job(job_id, start_time, "failed", "Invalid garbage threshold")
                    return {"ok": False, "job_id": str(job_id), "type": job_type, "node": node, "message": "Invalid garbage threshold"}
            resp = await client.master_get(f"/vol/vacuum?garbageThreshold={threshold}")
            data = resp.json()
            topology_text = str(data.get("Topology", {}).get("Free", "?")) + " free slots"
            await _finish_job(job_id, start_time, "success", result=topology_text)
            return {"ok": True, "job_id": str(job_id), "type": job_type, "node": node, "message": f"Vacuum triggered at {threshold:.0%} threshold. {topology_text}"}

        elif job_type == "compact":
            if not volume_param:
                await _finish_job(job_id, start_time, "failed", "Volume IDs required for compact")
                return {"ok": False, "job_id": str(job_id), "type": job_type, "node": node, "message": "Volume IDs required (comma-separated)"}
            volume_ids = [int(v.strip()) for v in volume_param.split(",") if v.strip().isdigit()]
            if not volume_ids:
                await _finish_job(job_id, start_time, "failed", "No valid volume IDs")
                return {"ok": False, "job_id": str(job_id), "type": job_type, "node": node, "message": "No valid volume IDs"}

            results = []
            async with httpx.AsyncClient(timeout=30) as c:
                for vid in volume_ids:
                    try:
                        target = node or await _find_volume_host(vid)
                        if not target:
                            results.append(f"vol.{vid}: host not found")
                            continue
                        r = await c.get(f"http://{target}/admin/compact?volume={vid}")
                        results.append(f"vol.{vid}: ok" if r.status_code == 200 else f"vol.{vid}: {r.status_code}")
                    except Exception as e:
                        results.append(f"vol.{vid}: {str(e)[:60]}")

            result_text = "; ".join(results)
            await _finish_job(job_id, start_time, "success", result=result_text)
            return {"ok": True, "job_id": str(job_id), "type": job_type, "node": node, "message": f"Compacted volumes: {result_text}"}

        elif job_type == "rebalance":
            resp = await client.master_get("/dir/status")
            topology = resp.json().get("Topology", {})
            dc = topology.get("DataCenters", [{}])[0]
            rack = dc.get("Racks", [{}])[0]
            data_nodes = rack.get("DataNodes", [])

            vol_counts = [dn.get("Volumes", 0) for dn in data_nodes]
            max_count = max(vol_counts) if vol_counts else 0
            min_count = min(vol_counts) if vol_counts else 0
            avg_count = sum(vol_counts) / len(vol_counts) if vol_counts else 0
            imbalance = max_count - min_count

            if imbalance > 2:
                result_text = f"Imbalance detected: max={max_count} min={min_count} avg={avg_count:.1f} diff={imbalance}"
                await _finish_job(job_id, start_time, "success", result=result_text)
                return {"ok": True, "job_id": str(job_id), "type": job_type, "node": node, "message": f"Imbalance: {imbalance} vols. Manual rebalance recommended."}
            else:
                result_text = f"Balanced: max={max_count} min={min_count} avg={avg_count:.1f} diff={imbalance}"
                await _finish_job(job_id, start_time, "success", result=result_text)
                return {"ok": True, "job_id": str(job_id), "type": job_type, "node": node, "message": "Cluster is balanced."}

        elif job_type == "health_check":
            detection = await detect_workers()
            nodes = detection["nodes"]
            healthy = [n["name"] for n in nodes if n["healthy"]]
            unhealthy = [n["name"] for n in nodes if not n["healthy"]]
            summary = f"Healthy: {len(healthy)}/{len(nodes)}"
            if unhealthy:
                summary += f", Unhealthy: {', '.join(unhealthy)}"
            await _finish_job(job_id, start_time, "failed" if unhealthy else "success", result=summary)
            return {"ok": len(unhealthy) == 0, "job_id": str(job_id), "type": job_type, "node": node, "message": summary}

    except Exception as e:
        logger.error("execute_job_failed", job_type=job_type, exc_info=True)
        await _finish_job(job_id, start_time, "failed", str(e)[:200])
        return {"ok": False, "job_id": str(job_id), "type": job_type, "node": node, "message": f"Job failed: {str(e)[:100]}"}


async def _find_volume_host(volume_id: int) -> Optional[str]:
    client = get_seaweed_client()
    try:
        resp = await client.master_get(f"/vol/lookup?volumeId={volume_id}")
        data = resp.json()
        locations = data.get("Locations", [])
        if locations:
            return locations[0].get("Url", "")
    except Exception:
        logger.warning("volume_lookup_failed", volume_id=volume_id, exc_info=True)
    return None


async def list_jobs(limit: int = 50) -> list:
    await _ensure_table()
    db = await get_db()
    cursor = await db.execute(
        "SELECT id, type, status, duration_ms, error, result, created_at, node FROM worker_jobs ORDER BY id DESC LIMIT ?",
        (limit,),
    )
    rows = await cursor.fetchall()
    return [
        {
            "id": str(r[0]), "type": r[1], "status": r[2], "durationMs": r[3],
            "error": r[4], "result": r[5], "createdAt": r[6], "node": r[7],
        }
        for r in rows
    ]


async def get_job(job_id: int) -> dict | None:
    await _ensure_table()
    db = await get_db()
    cursor = await db.execute(
        "SELECT id, type, status, duration_ms, error, result, created_at, node FROM worker_jobs WHERE id=?",
        (job_id,),
    )
    row = await cursor.fetchone()
    if not row:
        return None
    return {
        "id": str(row[0]), "type": row[1], "status": row[2], "durationMs": row[3],
        "error": row[4], "result": row[5], "createdAt": row[6], "node": row[7],
    }


def _parse_volume_ids(volume_ids_str: str) -> list[int]:
    if not volume_ids_str:
        return []
    ids = []
    for part in volume_ids_str.strip().split():
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            try:
                lo, hi = part.split("-", 1)
                ids.extend(range(int(lo), int(hi) + 1))
            except ValueError:
                pass
        else:
            try:
                ids.append(int(part))
            except ValueError:
                pass
    return sorted(ids)


async def get_node_volumes(node_addr: str) -> list[int]:
    client = get_seaweed_client()
    try:
        resp = await client.master_get("/dir/status")
        topology = resp.json().get("Topology", {})
        for dc in topology.get("DataCenters", []):
            for rack in dc.get("Racks", []):
                for dn in rack.get("DataNodes", []):
                    if dn.get("Url") == node_addr:
                        return _parse_volume_ids(dn.get("VolumeIds", ""))
    except Exception:
        logger.error("get_node_volumes_failed", node=node_addr, exc_info=True)
    return []
