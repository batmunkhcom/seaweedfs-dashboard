from fastapi import APIRouter, Depends
import json

from app.services.seaweed_client import get_seaweed_client
from app.settings_service import get_setting_int, update_setting
from app.middleware.auth_middleware import require_permission
from app.logging_config import get_logger

router = APIRouter(prefix="/cluster", tags=["cluster"])
logger = get_logger("cluster")


@router.get("/status")
async def cluster_status():
    client = get_seaweed_client()
    try:
        resp = await client.master_get("/cluster/status")
        return resp.json()
    except Exception:
        logger.error("cluster_status_failed", exc_info=True)
        return {"Leader": "", "Peers": [], "IsLeader": False, "Version": ""}


@router.get("/node-limits")
async def get_node_limits():
    try:
        raw = await get_setting("node_volume_limits", "{}")
        data = {}
        if raw and raw.strip() != '{}':
            try:
                data = json.loads(raw)
            except Exception:
                pass
        return {"limits": data}
    except Exception:
        logger.error("node_limits_fetch_failed", exc_info=True)
        return {"limits": {}}


@router.put("/node-limits")
async def set_node_limits(body: dict, _: bool = Depends(require_permission("settings:write"))):
    try:
        limits = body.get("limits", {})
        raw = json.dumps(limits)
        await update_setting("node_volume_limits", raw)
        return {"ok": True}
    except Exception:
        logger.error("node_limits_update_failed", exc_info=True)
        return {"error": "Failed to save"}


@router.get("/health")
async def cluster_health():
    client = get_seaweed_client()
    try:
        resp = await client.master_get("/dir/status?pretty=y")
        data = resp.json()
        raw_limits = await get_setting("node_volume_limits", "{}")
        node_limits: dict[str, int] = {}
        if raw_limits and raw_limits.strip() != '{}':
            try:
                node_limits = json.loads(raw_limits)
            except Exception:
                pass
        nodes = []
        topology = data.get("Topology", {})
        for dc in topology.get("DataCenters", []):
            for rack in dc.get("Racks", []):
                for node in rack.get("DataNodes", []):
                    url = node.get("Url", "")
                    native_max = node.get("Max", 0)
                    configured = node_limits.get(url, 9999)
                    effective_max = min(native_max, configured) if native_max > 0 else configured
                    nodes.append({
                          "url": url,
                          "volumes": node.get("Volumes", 0),
                          "max_native": native_max,
                          "max_configured": configured,
                          "free": node_limits.get(url, native_max - node.get("Volumes", 0)),
                          "status": "healthy",
                          "dc": dc.get("Id", ""),
                          "rack": rack.get("Id", ""),
                        })
        return {"nodes": nodes, "total": len(nodes)}
    except Exception:
        logger.error("cluster_health_failed", exc_info=True)
        return {"nodes": [], "total": 0}


@router.get("/topology")
async def cluster_topology():
    client = get_seaweed_client()
    try:
        resp = await client.master_get("/dir/status?pretty=y")
        data = resp.json()
        return data.get("Topology", {})
    except Exception:
        logger.error("topology_fetch_failed", exc_info=True)
        return {"DataCenters": [], "Free": 0, "Max": 0}
