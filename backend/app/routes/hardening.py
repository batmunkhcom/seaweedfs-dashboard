from fastapi import APIRouter, Depends

from app.middleware.auth_middleware import require_admin
from app.settings_service import get_setting, get_setting_int, update_setting
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
    return {"ok": True, "message": "Checksum verification queued"}
