from fastapi import APIRouter, Depends

from app.middleware.auth_middleware import require_admin
from app.logging_config import get_logger

router = APIRouter(prefix="/backup", tags=["backup"])
logger = get_logger("backup")


@router.get("/status")
async def backup_status():
    return {"running": False, "lastSyncAt": None, "lastError": None}


@router.post("/sync")
async def trigger_sync(_: bool = Depends(require_admin)):
    return {"ok": True, "message": "Sync triggered"}


@router.get("/snapshots")
async def list_snapshots():
    return []


@router.post("/snapshots")
async def create_snapshot(body: dict, _: bool = Depends(require_admin)):
    return {"id": "new", "name": body.get("name", ""), "size": 0, "createdAt": ""}


@router.delete("/snapshots/{snapshot_id}")
async def delete_snapshot(snapshot_id: str, _: bool = Depends(require_admin)):
    return {"ok": True}
