from fastapi import APIRouter, Depends, HTTPException, Request

from app.middleware.auth_middleware import get_current_user, require_admin
from app.middleware.rate_limit import limiter
from app.services.api_key_service import create_api_key, list_api_keys, revoke_api_key, get_api_key_detail, reveal_api_key
from app.logging_config import get_logger

router = APIRouter(prefix="/api-keys", tags=["api-keys"])
logger = get_logger("api_keys")


@router.post("/create")
@limiter.limit("10/minute")
async def api_key_create(request: Request, body: dict, _: bool = Depends(require_admin), current_user: dict = Depends(get_current_user)):
    name = body.get("name", "API Key")
    permissions = body.get("permissions", "backup:read,backup:write")

    try:
        result = await create_api_key(name, permissions, current_user["username"])
        return result
    except Exception as e:
        logger.error("api_key_create_error", exc_info=True)
        raise HTTPException(500, str(e))


@router.get("/list")
async def api_key_list():
    return await list_api_keys()


@router.get("/{key_id}/detail")
async def api_key_detail(key_id: int):
    detail = await get_api_key_detail(key_id)
    if not detail:
        raise HTTPException(404, "API key not found")
    return detail


@router.post("/reveal")
@limiter.limit("5/minute")
async def api_key_reveal(request: Request, body: dict, current_user: dict = Depends(get_current_user)):
    key_id = body.get("key_id")
    admin_password = body.get("admin_password", "")
    if not key_id:
        raise HTTPException(400, "key_id is required")

    result = await reveal_api_key(key_id, admin_password, current_user["username"])
    if result is None:
        raise HTTPException(403, "Invalid admin password or key not found")
    return {"key": result}


@router.post("/revoke/{key_id}")
async def api_key_revoke(key_id: int, _: bool = Depends(require_admin)):
    try:
        success = await revoke_api_key(key_id)
        if not success:
            raise HTTPException(404, "API key not found")
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("api_key_revoke_error", exc_info=True)
        raise HTTPException(500, str(e))
