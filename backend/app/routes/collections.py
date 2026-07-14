from fastapi import APIRouter, Depends

from app.services.seaweed_client import get_seaweed_client
from app.middleware.auth_middleware import require_admin
from app.logging_config import get_logger

router = APIRouter(prefix="/collections", tags=["collections"])
logger = get_logger("collections")


@router.get("")
async def list_collections():
    client = get_seaweed_client()
    try:
        resp = await client.master_get("/col/status")
        data = resp.json()
        collections = []
        for name, info in data.items():
            if isinstance(info, dict):
                collections.append({
                    "name": name,
                    "volumeCount": info.get("volumeCount", 0),
                    "totalSize": info.get("totalSize", 0),
                })
        return collections
    except Exception:
        logger.error("collections_list_failed", exc_info=True)
        return []


@router.delete("/{name}")
async def delete_collection(name: str, _: bool = Depends(require_admin)):
    client = get_seaweed_client()
    try:
        resp = await client.request("DELETE", f"/col/delete?collection={name}", master=True)
        return {"ok": True}
    except Exception:
        logger.error("collection_delete_failed", name=name, exc_info=True)
        return {"error": "delete failed"}
