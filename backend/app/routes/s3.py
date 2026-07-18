from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from datetime import datetime, timezone

from app.services.seaweed_client import get_seaweed_client
from app.services.s3_sync import S3_GATEWAY_HOSTS
from app.middleware.auth_middleware import require_permission, require_admin, get_current_user
from app.middleware.rate_limit import limiter
from app.database import get_db
from app.logging_config import get_logger
import bcrypt

router = APIRouter(prefix="/s3", tags=["s3"])
logger = get_logger("s3")


class RevealSecretRequest(BaseModel):
    admin_password: str


class GenerateKeyRequest(BaseModel):
    username: str
    email: str = ""
    permission: str = "readwrite"


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
        await client.request("POST", f"/buckets/{name}/?op=mkdir", master=False)
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
        "SELECT id, username, email, role, enabled, s3_access_key, s3_permission, created_at FROM users WHERE s3_access_key != '' ORDER BY username"
    )
    rows = await cursor.fetchall()
    result = []
    for r in rows:
        d = dict(r)
        d["s3_secret_key"] = "********" if d.get("s3_access_key") else ""
        result.append(d)
    return result


@router.post("/users/{user_id}/reveal-secret")
@limiter.limit("10/minute")
async def reveal_secret(request: Request, user_id: int, body: RevealSecretRequest, _: bool = Depends(require_admin), current_user: dict = Depends(get_current_user)):
    db = await get_db()
    cursor = await db.execute(
        "SELECT password_hash FROM users WHERE username = ? AND enabled = 1",
        (current_user["username"],),
    )
    row = await cursor.fetchone()
    if not row or not bcrypt.checkpw(body.admin_password.encode(), row["password_hash"].encode()):
        logger.warning("reveal_secret_failed", username=current_user["username"], reason="wrong_admin_password")
        raise HTTPException(403, "Invalid admin password")

    cursor = await db.execute(
        "SELECT s3_secret_key, s3_access_key FROM users WHERE id = ?",
        (user_id,),
    )
    user_row = await cursor.fetchone()
    if not user_row:
        raise HTTPException(404, "User not found")

    logger.info("secret_revealed", admin=current_user["username"], target_user_id=user_id)
    return {"s3_access_key": user_row["s3_access_key"], "s3_secret_key": user_row["s3_secret_key"]}


@router.post("/users/{user_id}/credentials")
@limiter.limit("10/minute")
async def regenerate_credentials(request: Request, user_id: int, _: bool = Depends(require_permission("s3:write"))):
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
        "SELECT username, s3_access_key, s3_permission FROM users WHERE s3_access_key != '' AND enabled = 1 ORDER BY username"
    )
    rows = await cursor.fetchall()
    policies = []
    for row in rows:
        username = row["username"]
        perm = row.get("s3_permission", "readwrite")
        actions = ["s3:Get*", "s3:List*"] if perm == "readonly" else ["s3:*"]
        policies.append({
            "name": f"user-{username}",
            "description": f"{'Read-only' if perm == 'readonly' else 'Read+Write'} access for {username}",
            "effect": "Allow",
            "actions": actions,
            "resources": [f"arn:aws:s3:::user-{username}/*", f"arn:aws:s3:::user-{username}"],
            "principal": username,
            "permission": perm,
        })
    return policies


@router.put("/policies/{name}")
async def update_policy(name: str, body: dict, _: bool = Depends(require_permission("s3:write"))):
    username = name.replace("user-", "")
    perm = body.get("permission", "readwrite")
    if perm not in ("readonly", "readwrite"):
        raise HTTPException(400, "Invalid permission. Must be 'readonly' or 'readwrite'")
    db = await get_db()
    cursor = await db.execute("SELECT id FROM users WHERE username = ?", (username,))
    user_row = await cursor.fetchone()
    if not user_row:
        raise HTTPException(404, f"User '{username}' not found")
    await db.execute("UPDATE users SET s3_permission = ? WHERE username = ?", (perm, username))
    await db.commit()
    logger.info("s3_policy_updated", username=username, permission=perm)
    return {"ok": True, "username": username, "permission": perm}


@router.get("/sync-status")
async def get_sync_status():
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    db = await get_db()
    cursor = await db.execute("SELECT value FROM runtime_settings WHERE key = 's3_last_sync'")
    row = await cursor.fetchone()
    last_sync = row["value"] if row else None
    return {"last_sync": last_sync, "gateways": S3_GATEWAY_HOSTS, "now": now}


@router.post("/sync-iam")
@limiter.limit("5/minute")
async def sync_iam_to_gateways(request: Request, _: bool = Depends(require_permission("s3:write"))):
    try:
        from app.services.s3_sync import sync_to_all_gateways
        results = await sync_to_all_gateways()
        ok = all(results.values()) if isinstance(results, dict) and not results.get("skipped") else results.get("skipped", False)
        now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        db = await get_db()
        await db.execute("INSERT OR REPLACE INTO runtime_settings (key, value) VALUES ('s3_last_sync', ?)", (now,))
        await db.commit()
        logger.info("s3_iam_sync_results", results=str(results), last_sync=now)
        return {"ok": ok, "results": results, "last_sync": now}
    except Exception as e:
        logger.error("s3_iam_sync_error", exc_info=True)
        return {"ok": False, "error": str(e)}


@router.post("/generate-key")
@limiter.limit("10/minute")
async def generate_s3_key(request: Request, body: GenerateKeyRequest, _: bool = Depends(require_permission("s3:write"))):
    import secrets
    username = body.username.strip().lower()
    if not username:
        raise HTTPException(400, "Username is required")
    db = await get_db()
    cursor = await db.execute("SELECT id FROM users WHERE username = ?", (username,))
    exists = await cursor.fetchone()
    if exists:
        access_key = f"AK{secrets.token_hex(10)}"
        secret_key = secrets.token_hex(20)
        await db.execute(
            "UPDATE users SET s3_access_key = ?, s3_secret_key = ?, s3_permission = ?, email = COALESCE(NULLIF(?, ''), email) WHERE username = ?",
            (access_key, secret_key, body.permission, body.email, username),
        )
        await db.commit()
        logger.info("s3_key_regenerated", username=username)
        return {"ok": True, "username": username, "access_key": access_key, "secret_key": secret_key, "regenerated": True}
    password_hash = bcrypt.hashpw(secrets.token_hex(16).encode(), bcrypt.gensalt()).decode()
    access_key = f"AK{secrets.token_hex(10)}"
    secret_key = secrets.token_hex(20)
    await db.execute(
        "INSERT INTO users (username, password_hash, firstname, lastname, email, role, enabled, s3_access_key, s3_secret_key, s3_permission) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (username, password_hash, username, "", body.email or f"{username}@mbm.mn", "viewer", 1, access_key, secret_key, body.permission),
    )
    await db.commit()
    logger.info("s3_key_created", username=username, permission=body.permission)
    return {"ok": True, "username": username, "access_key": access_key, "secret_key": secret_key, "created": True}
