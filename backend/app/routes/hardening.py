from fastapi import APIRouter, Depends

from app.middleware.auth_middleware import require_admin
from app.settings_service import get_setting, get_setting_int, update_setting
from app.services.hardening_service import get_hardening_service
from app.logging_config import get_logger

router = APIRouter(prefix="/hardening", tags=["hardening"])
logger = get_logger("hardening")

SETTINGS = [
    {"key": "hardening_compression_algorithm", "label": "Compression Algorithm", "type": "select", "options": ["zstd", "gzip", "none"]},
    {"key": "hardening_compression_level", "label": "Compression Level", "type": "number", "min": 1, "max": 9},
    {"key": "hardening_encryption_mode", "label": "Encryption Mode", "type": "select", "options": ["none", "SSE-S3", "SSE-C"]},
    {"key": "hardening_encryption_key", "label": "Encryption Key", "type": "password"},
    {"key": "hardening_replication_factor", "label": "Replication Factor", "type": "select", "options": ["000", "001", "002", "010", "100", "011"]},
    {"key": "hardening_checksum_enabled", "label": "Checksum Verification", "type": "bool"},
    {"key": "hardening_checksum_interval_hours", "label": "Checksum Interval (hours)", "type": "number", "min": 1, "max": 720},
]


@router.get("/status")
async def hardening_status():
    result = []
    for s in SETTINGS:
        if s["type"] == "bool":
            val = await get_setting(s["key"], "false")
            result.append({**s, "value": val == "true"})
        elif s["type"] == "number":
            result.append({**s, "value": await get_setting_int(s["key"], 0)})
        elif s["type"] == "password":
            raw = await get_setting(s["key"], "")
            result.append({**s, "value": "••••" if raw else "", "has_value": bool(raw)})
        else:
            result.append({**s, "value": await get_setting(s["key"], s.get("options", [None])[0] if s.get("options") else "")})
    return {"settings": result}


@router.put("/config")
async def update_hardening(body: dict, _: bool = Depends(require_admin)):
    pairs = body.get("settings", {})
    for key, value in pairs.items():
        await update_setting(key, str(value))
    logger.info("hardening_config_updated", keys=list(pairs.keys()))
    return {"ok": True}


@router.post("/checksums/verify")
async def trigger_checksum(_: bool = Depends(require_admin)):
    svc = get_hardening_service()
    if not svc._running:
        await svc.start()
    result = await svc.verify_checksums_all()
    return result


@router.post("/compression/deploy")
async def deploy_compression(_: bool = Depends(require_admin)):
    svc = get_hardening_service()
    result = await svc.deploy_compression()
    if not result.get("ok"):
        logger.warning("compression_deploy_failed", error=result.get("error"))
    return result


@router.post("/encryption/deploy")
async def deploy_encryption(_: bool = Depends(require_admin)):
    svc = get_hardening_service()
    result = await svc.deploy_encryption()
    if not result.get("ok"):
        logger.warning("encryption_deploy_failed", error=result.get("error"))
    return result


@router.get("/replication/drift")
async def replication_drift():
    svc = get_hardening_service()
    return await svc.check_replication_drift()


@router.get("/checksums/history")
async def checksum_history(limit: int = 20):
    from app.database import get_db
    db = await get_db()
    cursor = await db.execute(
        "SELECT * FROM hardening_checksums ORDER BY created_at DESC LIMIT ?", (limit,),
    )
    rows = await cursor.fetchall()
    return [dict(r) for r in rows]
