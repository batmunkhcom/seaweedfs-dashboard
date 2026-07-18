from fastapi import APIRouter, Depends, HTTPException

from app.middleware.auth_middleware import require_admin
from app.services.nfs_service import get_exports, add_export, update_export, delete_export, get_clients, sync_all_exports
from app.logging_config import get_logger

router = APIRouter(prefix="/nfs", tags=["nfs"])
logger = get_logger("nfs")


@router.get("/exports")
async def list_exports():
    return await get_exports()


@router.post("/exports")
async def create_export(body: dict, _: bool = Depends(require_admin)):
    node = body.get("node", "")
    path = body.get("path", "")
    options = body.get("options", "*(rw,sync,no_subtree_check)")
    if not node or not path:
        raise HTTPException(400, "node and path required")
    return await add_export(node, path, options)


@router.put("/exports/{export_id}")
async def edit_export(export_id: int, body: dict, _: bool = Depends(require_admin)):
    options = body.get("options", "")
    if not options:
        raise HTTPException(400, "options required")
    return await update_export(export_id, options)


@router.delete("/exports/{export_id}")
async def remove_export(export_id: int, _: bool = Depends(require_admin)):
    return await delete_export(export_id)


@router.get("/clients")
async def nfs_clients(node: str = ""):
    if not node:
        return {"clients": [], "error": "node parameter required"}
    return await get_clients(node)


@router.post("/sync")
async def sync_exports(_: bool = Depends(require_admin)):
    return await sync_all_exports()
