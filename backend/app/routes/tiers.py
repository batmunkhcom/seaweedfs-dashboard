from fastapi import APIRouter, Depends

from app.middleware.auth_middleware import require_admin
from app.services.tier_service import get_tiers, save_tier, delete_tier, get_tier_stats, test_tier_connection, TIER_TYPES, PROVIDERS

router = APIRouter(prefix="/tiers", tags=["tiers"])


@router.get("")
async def list_tiers():
    return await get_tiers()


@router.get("/stats")
async def tier_stats():
    return await get_tier_stats()


@router.post("")
async def create_tier(body: dict, _: bool = Depends(require_admin)):
    return await save_tier(body)


@router.put("/{tier_id}")
async def update_tier(tier_id: int, body: dict, _: bool = Depends(require_admin)):
    body["name"] = body.get("name") or f"tier-{tier_id}"
    return await save_tier(body)


@router.delete("/{tier_id}")
async def remove_tier(tier_id: int, _: bool = Depends(require_admin)):
    return await delete_tier(tier_id)


@router.post("/test")
async def test_connection(body: dict, _: bool = Depends(require_admin)):
    return await test_tier_connection(body.get("provider", "s3"), body.get("config", {}))


@router.get("/types")
async def tier_types():
    return {"types": TIER_TYPES, "providers": PROVIDERS}
