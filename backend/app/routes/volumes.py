from fastapi import APIRouter, Depends
import json

from app.services.seaweed_client import get_seaweed_client
from app.middleware.auth_middleware import require_permission
from app.settings_service import get_setting, get_setting_int, update_setting
from app.logging_config import get_logger

router = APIRouter(prefix="/volumes", tags=["volumes"])
logger = get_logger("volumes")


@router.get("/stats")
async def volume_stats():
    client = get_seaweed_client()
    try:
        resp = await client.master_get("/vol/status?pretty=y")
        data = resp.json()
        volumes = []
        node_map: dict[str, dict] = {}
        for dc_name, dc in data.get("Volumes", {}).get("DataCenters", {}).items():
            for rack_name, rack in dc.items():
                for node_url, node_vols in rack.items():
                    if isinstance(node_vols, list):
                        node_map[node_url] = {"url": node_url, "dc": dc_name, "rack": rack_name, "count": len(node_vols), "volumes": []}
                        for v in node_vols:
                            v["ServerUrl"] = node_url
                            v["Collection"] = v.get("Collection", "")
                            volumes.append(v)
                            node_map[node_url]["volumes"].append(v)
        raw_limits = await get_setting("node_volume_limits", "{}")
        node_limits: dict[str, int] = {}
        if raw_limits and raw_limits.strip() != '{}':
            try:
                node_limits = json.loads(raw_limits)
            except Exception:
                pass
        resp2 = await client.master_get("/dir/status?pretty=y")
        topo = resp2.json().get("Topology", {})
        node_details = []
        total_volumes = 0
        total_native_max = 0
        for dc in topo.get("DataCenters", []):
            for rack in dc.get("Racks", []):
                for node in rack.get("DataNodes", []):
                    url = node.get("Url", "")
                    native_max = node.get("Max", 0)
                    configured = node_limits.get(url, 9999)
                    effective_max = min(native_max, configured) if native_max > 0 else configured
                    count = node_map.get(url, {}).get("count", 0)
                    total_volumes += count
                    total_native_max += native_max
                    pct = round((count / effective_max) * 100) if effective_max > 0 else 0
                    status = "critical" if pct > 85 else "warning" if pct > 60 else "healthy"
                    node_details.append({
                        "url": url,
                        "dc": dc.get("Id", ""),
                        "rack": rack.get("Id", ""),
                        "used": count,
                        "effective_max": effective_max,
                        "native_max": native_max,
                        "configured_limit": configured,
                        "pct": pct,
                        "status": status,
                    })
        return {
            "total_volumes": len(volumes),
            "total_native_max": total_native_max,
            "node_count": len(node_details),
            "nodes": node_details,
            "volumes": volumes,
        }
    except Exception:
        logger.error("volume_stats_failed", exc_info=True)
        return {"total_volumes": 0, "total_native_max": 0, "node_count": 0, "nodes": [], "volumes": []}


@router.get("")
async def list_volumes():
    client = get_seaweed_client()
    try:
        resp = await client.master_get("/vol/status")
        data = resp.json()
        volumes = []
        for dc_name, dc in data.get("Volumes", {}).get("DataCenters", {}).items():
            for rack_name, rack in dc.items():
                for node_url, node_vols in rack.items():
                    if isinstance(node_vols, list):
                        for v in node_vols:
                            v["ServerUrl"] = node_url
                            v["Collection"] = v.get("Collection", "")
                            volumes.append(v)
        return {"volumes": volumes, "total": len(volumes)}
    except Exception:
        logger.error("volumes_list_failed", exc_info=True)
        return {"volumes": [], "total": 0}


@router.get("/{volume_id}")
async def get_volume(volume_id: int):
    client = get_seaweed_client()
    try:
        resp = await client.master_get("/vol/status")
        data = resp.json()
        for dc_name, dc in data.get("Volumes", {}).get("DataCenters", {}).items():
            for rack_name, rack in dc.items():
                for node_url, node_vols in rack.items():
                    if isinstance(node_vols, list):
                        for v in node_vols:
                            if v.get("Id") == volume_id:
                                v["ServerUrl"] = node_url
                                return v
        return {}
    except Exception:
        logger.error("volume_get_failed", volume_id=volume_id, exc_info=True)
        return {}


@router.post("/grow")
async def grow_volumes(body: dict, _: bool = Depends(require_permission("volumes:write"))):
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
async def vacuum_volumes(body: dict, _: bool = Depends(require_permission("volumes:write"))):
    client = get_seaweed_client()
    threshold = body.get("garbageThreshold", 0.3)
    try:
        resp = await client.master_get(f"/vol/vacuum?garbageThreshold={threshold}")
        return resp.json()
    except Exception:
        logger.error("volume_vacuum_failed", exc_info=True)
        return {"error": "vacuum failed"}
