from fastapi import APIRouter, Depends, HTTPException, Request

from app.middleware.auth_middleware import require_permission
from app.middleware.rate_limit import limiter
from app.services.backup_service import (
     get_backup_status,
    create_backup,
    list_backups,
    delete_backup as svc_delete,
    restore_backup as svc_restore,
)
from app.logging_config import get_logger

router = APIRouter(prefix="/backup", tags=["backup"])
logger = get_logger("backup")


@router.get("/status")
async def backup_status():
    return await get_backup_status()


@router.post("/sync")
@limiter.limit("2/minute")
async def trigger_sync(request: Request, body: dict | None = None, _: bool = Depends(require_permission("backup:write"))):
    try:
        s3_bucket = (body or {}).get("s3_bucket", "")
        s3_endpoint = (body or {}).get("s3_endpoint", "")
        result = await create_backup(upload_s3=bool(s3_bucket), s3_bucket=s3_bucket, s3_endpoint=s3_endpoint)
        logger.info("backup_sync_result", ok=result["ok"], sync_id=result.get("syncId"), bytes_synced=result.get("bytesSynced", 0))
        try:
            from app.services.webhook_service import publish_webhook_event
            await publish_webhook_event("backup_completed", result)
        except Exception:
            pass
        return result
    except Exception as e:
        logger.error("backup_sync_error", exc_info=True)
        try:
            from app.services.webhook_service import publish_webhook_event
            await publish_webhook_event("backup_failed", {"error": str(e)})
        except Exception:
            pass
        raise HTTPException(500, str(e))


@router.get("/snapshots")
async def list_snapshots():
    return await list_backups()


@router.post("/snapshots")
async def create_snapshot(body: dict, _: bool = Depends(require_permission("backup:write"))):
    name = body.get("name")
    try:
        result = await create_backup(name)
        logger.info("backup_snapshot_created", name=result["name"], ok=result["ok"])
        return result
    except Exception as e:
        logger.error("backup_snapshot_error", exc_info=True)
        raise HTTPException(500, str(e))


@router.delete("/snapshots/{name}")
async def delete_backup_route(name: str, _: bool = Depends(require_permission("backup:write"))):
    try:
        deleted = await svc_delete(name)
        if not deleted:
            raise HTTPException(404, "Backup not found")
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("backup_delete_error", exc_info=True)
        raise HTTPException(500, str(e))


@router.post("/restore/{name}")
async def restore_backup_route(name: str, _: bool = Depends(require_permission("backup:write"))):
    try:
        result = await svc_restore(name)
        logger.info("backup_restore_result", name=name, ok=result["ok"])
        return result
    except FileNotFoundError as e:
        raise HTTPException(404, str(e))
    except Exception as e:
        logger.error("backup_restore_error", exc_info=True)
        raise HTTPException(500, str(e))
