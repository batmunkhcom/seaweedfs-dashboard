from fastapi import APIRouter, Depends

from app.services.seaweed_client import get_seaweed_client
from app.middleware.auth_middleware import require_permission
from app.logging_config import get_logger

router = APIRouter(prefix="/collections", tags=["collections"])
logger = get_logger("collections")


@router.get("")
async def list_collections():
    client = get_seaweed_client()
    try:
        resp = await client.master_get("/vol/status")
        data = resp.json()
        collection_map: dict[str, dict] = {}

        for dc_name, dc in data.get("Volumes", {}).get("DataCenters", {}).items():
            for rack_name, rack in dc.items():
                for node_url, node_vols in rack.items():
                    if not isinstance(node_vols, list):
                        continue
                    for v in node_vols:
                        coll = v.get("Collection", "") or "default"
                        if coll not in collection_map:
                            collection_map[coll] = {"name": coll, "volumeCount": 0, "totalSize": 0, "fileCount": 0}
                        collection_map[coll]["volumeCount"] += 1
                        collection_map[coll]["totalSize"] += v.get("Size", 0)
                        collection_map[coll]["fileCount"] += v.get("FileCount", 0)

        return sorted(collection_map.values(), key=lambda x: x["volumeCount"], reverse=True)
    except Exception:
        logger.error("collections_list_failed", exc_info=True)
        return []


@router.delete("/{name}")
async def delete_collection(name: str, _: bool = Depends(require_permission("collections:delete"))):
    client = get_seaweed_client()
    try:
        await client.request("DELETE", f"/col/delete?collection={name}&volume=yes", master=True)
        return {"ok": True}
    except Exception:
        logger.error("collection_delete_failed", name=name, exc_info=True)
        return {"error": "delete failed"}
