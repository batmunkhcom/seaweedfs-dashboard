from fastapi import APIRouter, Depends, HTTPException

from app.middleware.auth_middleware import require_admin
from app.services.lifecycle_service import (
    get_policies, get_policy, save_policy, delete_policy, get_policy_status,
    get_collections_ttl, set_collection_ttl, get_transitions,
    LIFECYCLE_TEMPLATES,
)
from app.logging_config import get_logger

router = APIRouter(prefix="/lifecycle", tags=["lifecycle"])
logger = get_logger("lifecycle")


@router.get("/policies")
async def list_policies():
    return await get_policies()


@router.get("/policies/{bucket}")
async def get_bucket_policy(bucket: str):
    policy = await get_policy(bucket)
    if not policy:
        raise HTTPException(404, "Policy not found")
    return policy


@router.put("/policies/{bucket}")
async def upsert_policy(bucket: str, body: dict, _: bool = Depends(require_admin)):
    policy = body.get("policy", {})
    enabled = body.get("enabled", True)
    if not policy:
        raise HTTPException(400, "policy required")
    return await save_policy(bucket, policy, enabled)


@router.delete("/policies/{bucket}")
async def remove_policy(bucket: str, _: bool = Depends(require_admin)):
    return await delete_policy(bucket)


@router.get("/policies/{bucket}/status")
async def policy_status(bucket: str):
    return await get_policy_status(bucket)


@router.get("/collections/ttl")
async def list_collections_ttl():
    return await get_collections_ttl()


@router.put("/collections/{name}/ttl")
async def update_collection_ttl(name: str, body: dict, _: bool = Depends(require_admin)):
    ttl = body.get("ttl", "")
    return await set_collection_ttl(name, ttl)


@router.get("/transitions")
async def list_transitions(bucket: str | None = None, limit: int = 50):
    return await get_transitions(bucket, limit)


@router.get("/templates")
async def get_templates():
    return {"templates": LIFECYCLE_TEMPLATES}
