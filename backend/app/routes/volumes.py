from fastapi import APIRouter, Depends, Request, Query
import json

from app.services.seaweed_client import get_seaweed_client
from app.middleware.auth_middleware import require_permission
from app.settings_service import get_setting
from app.logging_config import get_logger

from app.middleware.rate_limit import limiter

router = APIRouter(prefix="/volumes", tags=["volumes"])
logger = get_logger("volumes")


def _calc_node_status(pct: float) -> str:
    if pct >= 90:
        return "critical"
    if pct >= 75:
        return "warning"
    return "healthy"


def _worst_status(a: str, b: str) -> str:
    order = {"healthy": 0, "warning": 1, "critical": 2}
    return a if order.get(a, 0) >= order.get(b, 0) else b


async def _fetch_disk_health(db) -> dict[str, dict]:
    result: dict[str, dict] = {}
    try:
        cursor = await db.execute(
            "SELECT node, device, smart_json FROM disk_health "
            "WHERE rowid IN (SELECT MAX(rowid) FROM disk_health GROUP BY node, device)"
        )
        rows = await cursor.fetchall()
        temp_warn = float((await get_setting("disk_health_temp_warn_c", "55")))
        temp_crit = float((await get_setting("disk_health_temp_crit_c", "65")))
        wear_warn = float((await get_setting("disk_health_wear_warn_pct", "85")))
        for row in rows:
            node = row["node"]
            try:
                s = json.loads(row["smart_json"])
            except Exception:
                continue
            temp = s.get("temperature", {}).get("current")
            attrs = s.get("ata_smart_attributes", {}).get("table", [])
            wear = None
            for attr in attrs:
                if attr.get("name") in ("Percentage_Used", "Wear_Leveling_Count"):
                    wear = attr.get("value")
                    break
            dh_status = "healthy"
            if temp is not None and temp > temp_crit:
                dh_status = "critical"
            elif temp is not None and temp > temp_warn:
                dh_status = "warning"
            elif wear is not None and wear >= 95:
                dh_status = "critical"
            elif wear is not None and wear >= wear_warn:
                dh_status = "warning"
            result[node] = {
                "device": row["device"],
                "temp": temp,
                "wear": wear,
                "status": dh_status,
            }
    except Exception:
        logger.error("disk_health_fetch_failed", exc_info=True)
    return result


async def _fetch_volume_stats(client):
    from app.database import get_db

    resp = await client.master_get("/dir/status?pretty=y")
    topology = resp.json().get("Topology", {})

    raw_limits = await get_setting("node_volume_limits", "{}")
    node_limits: dict[str, int] = {}
    if raw_limits and raw_limits.strip() not in ("", "{}"):
        try:
            node_limits = json.loads(raw_limits)
        except Exception:
            pass

    db = await get_db()
    disk_health = await _fetch_disk_health(db)

    nodes_stat = []
    for dc in topology.get("DataCenters", []):
        dc_name = dc.get("Id", "")
        for rack in dc.get("Racks", []):
            rack_name = rack.get("Id", "")
            for node in rack.get("DataNodes", []):
                url = node.get("Url", "")
                used = node.get("Volumes", 0)
                native_max = node.get("Max", 0)
                configured = node_limits.get(url, 9999)
                effective_max = min(native_max, configured) if native_max > 0 else configured
                pct = round((used / effective_max) * 100, 1) if effective_max > 0 else 0
                vol_status = _calc_node_status(pct)
                node_ip = url.split(":")[0] if ":" in url else url
                dh = disk_health.get(url) or disk_health.get(node_ip, {})
                dh_status = dh.get("status", "healthy")
                overall = _worst_status(vol_status, dh_status)
                nodes_stat.append({
                    "url": url,
                    "dc": dc_name,
                    "rack": rack_name,
                    "used": used,
                    "effective_max": effective_max,
                    "native_max": native_max,
                    "configured_limit": configured if configured != 9999 else 0,
                    "pct": pct,
                    "status": overall,
                    "disk_health": {
                        "device": dh.get("device"),
                        "temp": dh.get("temp"),
                        "wear": dh.get("wear"),
                        "status": dh_status,
                    } if dh else None,
                })

    volumes = []
    try:
        vol_resp = await client.master_get("/vol/status")
        vol_data = vol_resp.json()
        for dc in vol_data.get("Volumes", {}).get("DataCenters", {}).values():
            for rack in dc.values():
                for node_url, vol_list in rack.items():
                    if vol_list:
                        for v in vol_list:
                            volumes.append({
                                "Id": v.get("Id"),
                                "Collection": v.get("Collection", ""),
                                "ServerUrl": node_url,
                                "Size": v.get("Size", 0),
                                "FileCount": v.get("FileCount", 0),
                                "ReplicaPlacement": v.get("ReplicaPlacement"),
                            })
    except Exception:
        logger.error("volume_status_fetch_failed", exc_info=True)

    return {
        "total_volumes": sum(n["used"] for n in nodes_stat),
        "node_count": len(nodes_stat),
        "nodes": nodes_stat,
        "volumes": volumes,
    }


@router.get("/stats")
async def get_volumes_stats():
    client = get_seaweed_client()
    try:
        return await _fetch_volume_stats(client)
    except Exception:
        logger.error("volumes_stats_failed", exc_info=True)
        return {"total_volumes": 0, "node_count": 0, "nodes": [], "volumes": []}


@router.get("")
async def list_volumes(
    collection: str | None = Query(None),
    node: str | None = Query(None),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
):
    data = await _fetch_volume_stats(get_seaweed_client())
    vols = data["volumes"]
    if collection:
        vols = [v for v in vols if v["Collection"] == collection]
    if node:
        vols = [v for v in vols if v["ServerUrl"] == node]
    total = len(vols)
    paged = vols[offset:offset + limit]
    return {"volumes": paged, "total": total}


@router.get("/{volume_id}")
async def get_volume(volume_id: int):
    client = get_seaweed_client()
    data = await _fetch_volume_stats(client)
    for v in data["volumes"]:
        if v["Id"] == volume_id:
            v["locateUrl"] = f"/dir/lookup?volumeId={volume_id}"
            return v
    return {"error": "volume not found"}

@router.post("/grow")
@limiter.limit("5/minute")
async def grow_volumes(request: Request, body: dict, _: bool = Depends(require_permission("volumes:write"))):
    client = get_seaweed_client()
    count = body.get("count", 1)
    try:
        resp = await client.master_get("/dir/status?pretty=y")
        data = resp.json()
        topology = data.get("Topology", {})
        raw_limits = await get_setting("node_volume_limits", "{}")
        node_limits: dict[str, int] = {}
        if raw_limits and raw_limits.strip() != '{}':
            try:
                node_limits = json.loads(raw_limits)
            except Exception:
                pass
        current_counts = {}
        for dc in topology.get("DataCenters", []):
            for rack in dc.get("Racks", []):
                for node in rack.get("DataNodes", []):
                    url = node.get("Url", "")
                    native_max = node.get("Max", 0)
                    configured = node_limits.get(url, 9999)
                    effective_max = min(native_max, configured) if native_max > 0 else configured
                    current_counts[url] = (node.get("Volumes", 0), effective_max)
        for url, (vols, max_v) in current_counts.items():
            if vols >= max_v:
                return {"error": f"Volume limit reached on {url} ({vols}/{max_v}). Cannot grow further."}
    except Exception:
        logger.error("volume_limit_check_failed", exc_info=True)
    params = {
          "count": count,
          "replication": body.get("replication", "001"),
          "dataCenter": body.get("dataCenter", ""),
          "rack": body.get("rack", ""),
          "collection": body.get("collection", ""),
      }
    query = "&".join(f"{k}={v}" for k, v in params.items() if v)
    try:
        resp = await client.master_get(f"/vol/grow?{query}")
        return resp.json()
    except Exception:
        logger.error("volume_grow_failed", exc_info=True)
        return {"error": "grow failed"}


@router.post("/vacuum")
@limiter.limit("3/minute")
async def vacuum_volumes(request: Request, body: dict, _: bool = Depends(require_permission("volumes:write"))):
    client = get_seaweed_client()
    threshold = body.get("garbageThreshold", 0.3)
    try:
        resp = await client.master_get(f"/vol/vacuum?garbageThreshold={threshold}")
        return resp.json()
    except Exception:
        logger.error("volume_vacuum_failed", exc_info=True)
        return {"error": "vacuum failed"}
