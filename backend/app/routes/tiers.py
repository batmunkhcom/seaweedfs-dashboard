from fastapi import APIRouter, Depends

from app.middleware.auth_middleware import require_admin
from app.services.tier_service import (
    get_tiers, save_tier, delete_tier, get_tier_stats,
    test_tier_connection, test_tier_connection_full, configure_tier_on_cluster, sync_all_tiers, get_tier_usage_per_node,
    TIER_TYPES, PROVIDERS,
)

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


@router.post("/test-connection")
async def test_provider_connection(body: dict, _: bool = Depends(require_admin)):
    provider = body.get("provider", "s3")
    config = body.get("config", {})
    return await test_tier_connection_full(provider, config)


@router.post("/configure")
async def deploy_tier_to_cluster(body: dict, _: bool = Depends(require_admin)):
    return await configure_tier_on_cluster(
        body["name"], body.get("tier_type", "hot"), body.get("provider", "local"), body.get("config", {}),
    )


@router.post("/sync")
async def sync_tiers(_: bool = Depends(require_admin)):
    return await sync_all_tiers()


@router.get("/usage")
async def tier_usage_per_node():
    return await get_tier_usage_per_node()
