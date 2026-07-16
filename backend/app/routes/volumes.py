from fastapi import APIRouter, Depends

from app.services.seaweed_client import get_seaweed_client
from app.middleware.auth_middleware import require_permission
from app.settings_service import get_setting_int
from app.logging_config import get_logger

router = APIRouter(prefix="/volumes", tags=["volumes"])
logger = get_logger("volumes")


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
    max_vols = await get_setting_int("max_volume_per_node", 9999)
    count = body.get("count", 1)
    try:
        resp = await client.master_get("/dir/status?pretty=y")
        data = resp.json()
        topology = data.get("Topology", {})
        current_counts = {}
        for dc in topology.get("DataCenters", []):
            for rack in dc.get("Racks", []):
                for node in rack.get("DataNodes", []):
                    url = node.get("Url", "")
                    current_counts[url] = node.get("Volumes", 0)
        for url, vols in current_counts.items():
            if vols >= max_vols:
                return {"error": f"Volume limit reached on {url} ({vols}/{max_vols}). Cannot grow further."}
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
