from fastapi import APIRouter, Depends, HTTPException

from app.middleware.auth_middleware import require_admin
from app.services.acl_service import (
    get_policies, create_policy, update_policy, delete_policy,
    reorder_policies, test_permission, get_audit_log, PERMISSIONS, PERMISSION_LABELS,
    push_acl_to_filer, get_sync_status, auto_sync_on_change,
)
from app.logging_config import get_logger

router = APIRouter(prefix="/acl", tags=["acl"])
logger = get_logger("acl")


@router.get("/policies")
async def list_policies():
    return await get_policies()


@router.post("/policies")
async def new_policy(body: dict, _: bool = Depends(require_admin)):
    result = await create_policy(
        name=body.get("name", ""),
        path=body.get("path", "/"),
        user_pattern=body.get("user_pattern", "*"),
        permissions=body.get("permissions", "R"),
        description=body.get("description", ""),
        priority=body.get("priority", 0),
    )
    await auto_sync_on_change()
    return result


@router.put("/policies/{policy_id}")
async def edit_policy(policy_id: int, body: dict, _: bool = Depends(require_admin)):
    result = await update_policy(policy_id, **body)
    await auto_sync_on_change()
    return result


@router.delete("/policies/{policy_id}")
async def remove_policy(policy_id: int, _: bool = Depends(require_admin)):
    result = await delete_policy(policy_id)
    await auto_sync_on_change()
    return result


@router.put("/policies/reorder")
async def reorder(body: dict, _: bool = Depends(require_admin)):
    order = body.get("order", [])
    result = await reorder_policies(order)
    await auto_sync_on_change()
    return result


@router.post("/policies/test")
async def test(body: dict, _: bool = Depends(require_admin)):
    user = body.get("user", "")
    path = body.get("path", "/")
    action = body.get("action", "R")
    if not user:
        raise HTTPException(400, "user required")
    return await test_permission(user, path, action)


@router.get("/audit")
async def audit_log(user: str | None = None, limit: int = 50):
    return await get_audit_log(user, limit)


@router.get("/permissions")
async def available_permissions():
    return {"permissions": [{"code": k, "label": v} for k, v in PERMISSION_LABELS.items()]}


@router.post("/sync")
async def sync_acl(_: bool = Depends(require_admin)):
    result = await push_acl_to_filer()
    return result


@router.get("/sync-status")
async def acl_sync_status():
    return await get_sync_status()
