from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse

from app.services.seaweed_client import get_seaweed_client
from app.middleware.auth_middleware import require_permission
from app.database import get_db
from app.logging_config import get_logger

router = APIRouter(prefix="/s3", tags=["s3"])
logger = get_logger("s3")


@router.get("/buckets")
async def list_buckets():
    client = get_seaweed_client()
    try:
        resp = await client.filer_get("/buckets/")
        data = resp.json()
        buckets = []
        if isinstance(data, dict) and "Entries" in data:
            for e in data["Entries"]:
                if e.get("Mode", 0) & 0x80000000 != 0:
                    buckets.append({
                        "name": e.get("FullPath", "").split("/")[-1] or e.get("Name", "").rstrip("/"),
                        "fileCount": e.get("FileCount", 0),
                        "totalSize": e.get("TotalSize", 0),
                        "quota": e.get("Quota", None),
                        "createdAt": e.get("Mtime", ""),
                    })
        return buckets
    except Exception:
        logger.error("s3_buckets_failed", exc_info=True)
        return []


@router.post("/buckets")
async def create_bucket(body: dict, _: bool = Depends(require_permission("s3:write"))):
    client = get_seaweed_client()
    name = body.get("name", "").strip()
    if not name:
        raise HTTPException(400, "Bucket name is required")
    try:
        await client.request("POST", f"/buckets/{name}?op=mkdir", master=False)
        return {"ok": True, "name": name}
    except Exception:
        logger.error("s3_bucket_create_failed", name=name, exc_info=True)
        raise HTTPException(500, "Failed to create bucket")


@router.delete("/buckets/{name}")
async def delete_bucket(name: str, _: bool = Depends(require_permission("s3:write"))):
    client = get_seaweed_client()
    try:
        await client.request("DELETE", f"/buckets/{name}?recursive=true", master=False)
        return {"ok": True}
    except Exception:
        logger.error("s3_bucket_delete_failed", name=name, exc_info=True)
        raise HTTPException(500, "Failed to delete bucket")


@router.put("/buckets/{name}/quota")
async def set_bucket_quota(name: str, body: dict, _: bool = Depends(require_permission("s3:write"))):
    client = get_seaweed_client()
    quota_bytes = body.get("quota", 0)
    try:
        await client.request("POST", f"/buckets/{name}/configure?hardQuota={quota_bytes}", master=False)
        return {"ok": True, "quota": quota_bytes}
    except Exception:
        logger.error("s3_bucket_quota_failed", name=name, exc_info=True)
        raise HTTPException(500, "Failed to set quota")


@router.get("/users")
async def list_s3_users():
    db = await get_db()
    cursor = await db.execute(
        "SELECT id, username, email, role, enabled, s3_access_key, s3_secret_key, created_at FROM users WHERE s3_access_key != '' ORDER BY username"
    )
    rows = await cursor.fetchall()
    return [dict(r) for r in rows]


@router.post("/users/{user_id}/credentials")
async def regenerate_credentials(user_id: int, _: bool = Depends(require_permission("s3:write"))):
    import secrets
    access_key = f"AK{secrets.token_hex(10)}"
    secret_key = secrets.token_hex(20)
    db = await get_db()
    await db.execute(
        "UPDATE users SET s3_access_key = ?, s3_secret_key = ? WHERE id = ?",
        (access_key, secret_key, user_id),
    )
    await db.commit()
    return {"ok": True, "access_key": access_key, "secret_key": secret_key}


@router.get("/policies")
async def list_policies():
    db = await get_db()
    cursor = await db.execute(
        "SELECT username, s3_access_key FROM users WHERE s3_access_key != '' AND enabled = 1 ORDER BY username"
    )
    rows = await cursor.fetchall()
    policies = []
    for row in rows:
        username = row["username"]
        policies.append({
            "name": f"user-{username}",
            "description": f"Access policy for {username} — restricts to user-{username} bucket",
            "effect": "Allow",
            "actions": ["s3:*"],
            "resources": [f"arn:aws:s3:::user-{username}/*", f"arn:aws:s3:::user-{username}"],
            "principal": username,
        })
    return policies


@router.put("/policies/{name}")
async def update_policy(name: str, body: dict, _: bool = Depends(require_permission("s3:write"))):
    return {"ok": True, "name": name}


@router.get("/config")
async def get_s3_config():
    return {
        "endpoint": "https://s3.mbm.mn",
        "region": "dc03",
        "internal_gateways": [
            "http://172.16.0.2:8333",
            "http://172.16.0.4:8333",
            "http://172.16.0.6:8333",
            "http://172.16.0.7:8333",
        ],
    }
