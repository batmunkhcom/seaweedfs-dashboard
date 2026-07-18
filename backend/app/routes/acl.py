from fastapi import APIRouter, Depends, HTTPException

from app.middleware.auth_middleware import require_admin
from app.services.acl_service import (
    get_policies, create_policy, update_policy, delete_policy,
    reorder_policies, test_permission, get_audit_log, PERMISSIONS, PERMISSION_LABELS,
)
from app.logging_config import get_logger

router = APIRouter(prefix="/acl", tags=["acl"])
logger = get_logger("acl")


@router.get("/policies")
async def list_policies():
    return await get_policies()


@router.post("/policies")
async def new_policy(body: dict, _: bool = Depends(require_admin)):
    return await create_policy(
        name=body.get("name", ""),
        path=body.get("path", "/"),
        user_pattern=body.get("user_pattern", "*"),
        permissions=body.get("permissions", "R"),
        description=body.get("description", ""),
        priority=body.get("priority", 0),
    )


@router.put("/policies/{policy_id}")
async def edit_policy(policy_id: int, body: dict, _: bool = Depends(require_admin)):
    return await update_policy(policy_id, **body)


@router.delete("/policies/{policy_id}")
async def remove_policy(policy_id: int, _: bool = Depends(require_admin)):
    return await delete_policy(policy_id)


@router.put("/policies/reorder")
async def reorder(body: dict, _: bool = Depends(require_admin)):
    order = body.get("order", [])
    return await reorder_policies(order)


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
