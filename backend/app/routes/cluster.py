from fastapi import APIRouter

from app.services.seaweed_client import get_seaweed_client
from app.settings_service import get_setting_int
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


@router.get("/health")
async def cluster_health():
    client = get_seaweed_client()
    try:
        resp = await client.master_get("/dir/status?pretty=y")
        data = resp.json()
        max_vols = await get_setting_int("max_volume_per_node", 9999)
        nodes = []
        topology = data.get("Topology", {})
        for dc in topology.get("DataCenters", []):
            for rack in dc.get("Racks", []):
                for node in rack.get("DataNodes", []):
                    native_max = node.get("Max", 0)
                    nodes.append({
                         "url": node.get("Url", ""),
                         "volumes": node.get("Volumes", 0),
                         "max_native": native_max,
                         "max_configured": max_vols,
                         "free": node.get("Free", native_max - node.get("Volumes", 0)),
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
