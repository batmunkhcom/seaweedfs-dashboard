from fastapi import APIRouter, Depends

from app.services.seaweed_client import get_seaweed_client
from app.middleware.auth_middleware import require_admin
from app.logging_config import get_logger

router = APIRouter(prefix="/volumes", tags=["volumes"])
logger = get_logger("volumes")


@router.get("")
async def list_volumes():
    client = get_seaweed_client()
    try:
        resp = await client.master_get("/vol/status")
        data = resp.json()
        return {"volumes": data.get("Volumes", []), "total": len(data.get("Volumes", []))}
    except Exception:
        logger.error("volumes_list_failed", exc_info=True)
        return {"volumes": [], "total": 0}


@router.get("/{volume_id}")
async def get_volume(volume_id: int):
    client = get_seaweed_client()
    try:
        resp = await client.master_get(f"/vol/status?volume={volume_id}")
        return resp.json()
    except Exception:
        logger.error("volume_get_failed", volume_id=volume_id, exc_info=True)
        return {}


@router.post("/grow")
async def grow_volumes(body: dict, _: bool = Depends(require_admin)):
    client = get_seaweed_client()
    params = {
        "count": body.get("count", 1),
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
async def vacuum_volumes(body: dict, _: bool = Depends(require_admin)):
    client = get_seaweed_client()
    threshold = body.get("garbageThreshold", 0.3)
    try:
        resp = await client.master_get(f"/vol/vacuum?garbageThreshold={threshold}")
        return resp.json()
    except Exception:
        logger.error("volume_vacuum_failed", exc_info=True)
        return {"error": "vacuum failed"}
