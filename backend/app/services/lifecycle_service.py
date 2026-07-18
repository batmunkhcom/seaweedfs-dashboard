import time

from app.database import get_db
from app.services.seaweed_client import get_seaweed_client
from app.logging_config import get_logger

logger = get_logger("lifecycle_service")

LIFECYCLE_TEMPLATES = {
    "expire_7d": {"rules": [{"id": "expire-7d", "status": "Enabled", "filter": {"prefix": ""}, "expiration": {"days": 7}}]},
    "expire_30d": {"rules": [{"id": "expire-30d", "status": "Enabled", "filter": {"prefix": ""}, "expiration": {"days": 30}}]},
    "expire_90d": {"rules": [{"id": "expire-90d", "status": "Enabled", "filter": {"prefix": ""}, "expiration": {"days": 90}}]},
    "transition_30d": {"rules": [{"id": "transition-30d", "status": "Enabled", "filter": {"prefix": ""}, "transitions": [{"days": 30, "storageClass": "GLACIER"}]}]},
    "expire_deleted_1d": {"rules": [{"id": "cleanup-deleted", "status": "Enabled", "filter": {"prefix": ""}, "expiration": {"expiredObjectDeleteMarker": True}}, {"id": "abort-incomplete", "status": "Enabled", "filter": {"prefix": ""}, "abortIncompleteMultipartUpload": {"daysAfterInitiation": 1}}]},
}


async def get_policies() -> list[dict]:
    db = await get_db()
    cursor = await db.execute("SELECT * FROM lifecycle_policies ORDER BY bucket")
    rows = await cursor.fetchall()
    return [dict(r) for r in rows]


async def get_policy(bucket: str) -> dict | None:
    db = await get_db()
    cursor = await db.execute("SELECT * FROM lifecycle_policies WHERE bucket=?", (bucket,))
    row = await cursor.fetchone()
    return dict(row) if row else None


async def save_policy(bucket: str, policy: dict, enabled: bool = True) -> dict:
    import json
    policy_json = json.dumps(policy)

    db = await get_db()
    await db.execute(
        "INSERT OR REPLACE INTO lifecycle_policies (bucket, policy_json, enabled, updated_at) VALUES (?, ?, ?, datetime('now'))",
        (bucket, policy_json, int(enabled)),
    )
    await db.commit()

    try:
        client = get_seaweed_client()
        xml = _build_lifecycle_xml(policy)
        filer = await client.get_filer()
        url = f"http://{filer}/{bucket}?lifecycle"
        resp = await client.client.put(url, content=xml.encode(), headers={"Content-Type": "application/xml"})
        logger.info("lifecycle_applied", bucket=bucket, status=resp.status_code)
    except Exception:
        logger.warning("lifecycle_apply_failed", bucket=bucket, exc_info=True)

    return {"ok": True, "bucket": bucket}


async def delete_policy(bucket: str) -> dict:
    db = await get_db()
    await db.execute("DELETE FROM lifecycle_policies WHERE bucket=?", (bucket,))
    await db.commit()
    return {"ok": True}


async def get_policy_status(bucket: str) -> dict:
    db = await get_db()
    cursor = await db.execute("SELECT * FROM lifecycle_policies WHERE bucket=?", (bucket,))
    row = await cursor.fetchone()
    if not row:
        return {"bucket": bucket, "configured": False}
    return {
        "bucket": bucket, "configured": True,
        "enabled": bool(row["enabled"]),
        "last_run_at": row["last_run_at"], "next_run_at": row["next_run_at"],
    }


async def get_collections_ttl() -> list[dict]:
    client = get_seaweed_client()
    try:
        resp = await client.master_get("/collections")
        collections = resp.json()
        result = []
        for name in (collections.get("collections", []) or []):
            ttl_resp = await client.master_get(f"/collections/{name}/ttl")
            ttl_data = ttl_resp.json() if ttl_resp.text else {}
            result.append({"name": name, "ttl": ttl_data.get("ttl", ""), "ttl_seconds": _parse_ttl(ttl_data.get("ttl", ""))})
        return result
    except Exception:
        logger.error("collections_ttl_fetch_failed", exc_info=True)
        return []


async def set_collection_ttl(name: str, ttl: str) -> dict:
    client = get_seaweed_client()
    try:
        resp = await client.client.put(
            f"http://{await client.get_master()}/collections/{name}/ttl?ttl={ttl}",
        )
        return {"ok": resp.status_code == 200, "name": name, "ttl": ttl}
    except Exception as e:
        return {"ok": False, "error": str(e)}


async def get_transitions(bucket: str | None = None, limit: int = 50) -> list[dict]:
    db = await get_db()
    if bucket:
        cursor = await db.execute(
            "SELECT * FROM lifecycle_transitions WHERE bucket=? ORDER BY created_at DESC LIMIT ?",
            (bucket, limit),
        )
    else:
        cursor = await db.execute("SELECT * FROM lifecycle_transitions ORDER BY created_at DESC LIMIT ?", (limit,))
    rows = await cursor.fetchall()
    return [dict(r) for r in rows]


def _parse_ttl(ttl: str) -> int:
    if not ttl:
        return 0
    import re
    match = re.match(r'(\d+)([dhms])', ttl.lower())
    if not match:
        return 0
    val, unit = int(match.group(1)), match.group(2)
    multipliers = {'s': 1, 'm': 60, 'h': 3600, 'd': 86400}
    return val * multipliers.get(unit, 0)


def _build_lifecycle_xml(policy: dict) -> str:
    rules = policy.get("rules", [])
    parts = ['<?xml version="1.0" encoding="UTF-8"?>', '<LifecycleConfiguration>']
    for rule in rules:
        parts.append('<Rule>')
        parts.append(f'<ID>{rule.get("id", "rule")}</ID>')
        parts.append(f'<Status>{rule.get("status", "Enabled")}</Status>')
        filt = rule.get("filter", {})
        prefix = filt.get("prefix", "")
        if prefix:
            parts.append(f'<Filter><Prefix>{prefix}</Prefix></Filter>')
        if "expiration" in rule:
            exp = rule["expiration"]
            parts.append('<Expiration>')
            if "days" in exp:
                parts.append(f'<Days>{exp["days"]}</Days>')
            if exp.get("expiredObjectDeleteMarker"):
                parts.append('<ExpiredObjectDeleteMarker>true</ExpiredObjectDeleteMarker>')
            parts.append('</Expiration>')
        if "transitions" in rule:
            for tr in rule["transitions"]:
                parts.append('<Transition>')
                parts.append(f'<Days>{tr["days"]}</Days>')
                parts.append(f'<StorageClass>{tr.get("storageClass", "GLACIER")}</StorageClass>')
                parts.append('</Transition>')
        if "abortIncompleteMultipartUpload" in rule:
            a = rule["abortIncompleteMultipartUpload"]
            parts.append('<AbortIncompleteMultipartUpload>')
            parts.append(f'<DaysAfterInitiation>{a.get("daysAfterInitiation", 7)}</DaysAfterInitiation>')
            parts.append('</AbortIncompleteMultipartUpload>')
        parts.append('</Rule>')
    parts.append('</LifecycleConfiguration>')
    return '\n'.join(parts)
