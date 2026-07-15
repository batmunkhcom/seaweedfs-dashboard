from fastapi import APIRouter, Depends

from app.services.seaweed_client import get_seaweed_client
from app.middleware.auth_middleware import require_permission
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
                if e.get("isDirectory"):
                    buckets.append({
                        "name": e.get("name", "").rstrip("/"),
                        "fileCount": 0,
                        "totalSize": 0,
                        "quota": None,
                        "createdAt": e.get("mtime", ""),
                    })
        return buckets
    except Exception:
        logger.error("s3_buckets_failed", exc_info=True)
        return []


@router.post("/buckets")
async def create_bucket(body: dict, _: bool = Depends(require_permission("s3:write"))):
    client = get_seaweed_client()
    try:
        resp = await client.request("POST", f"/{body['name']}?op=mkdir", master=False)
        return {"ok": True, "name": body["name"]}
    except Exception:
        logger.error("s3_bucket_create_failed", exc_info=True)
        return {"error": "create failed"}


@router.delete("/buckets/{name}")
async def delete_bucket(name: str, _: bool = Depends(require_permission("s3:write"))):
    client = get_seaweed_client()
    try:
        resp = await client.request("DELETE", f"/{name}?recursive=true", master=False)
        return {"ok": True}
    except Exception:
        logger.error("s3_bucket_delete_failed", name=name, exc_info=True)
        return {"error": "delete failed"}


@router.get("/users")
async def list_users():
    return []


@router.post("/users")
async def create_user(body: dict, _: bool = Depends(require_permission("s3:write"))):
    return {"id": "new", "name": body.get("name", ""), "accessKey": "generated-key", "createdAt": ""}


@router.delete("/users/{user_id}")
async def delete_user(user_id: str, _: bool = Depends(require_permission("s3:write"))):
    return {"ok": True}


@router.get("/policies")
async def list_policies():
    return []


@router.put("/policies/{name}")
async def update_policy(name: str, body: dict, _: bool = Depends(require_permission("s3:write"))):
    return {"ok": True, "name": name}
