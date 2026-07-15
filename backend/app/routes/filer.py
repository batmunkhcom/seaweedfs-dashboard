from fastapi import APIRouter, Depends, UploadFile, File

from app.services.seaweed_client import get_seaweed_client
from app.middleware.auth_middleware import require_permission
from app.settings_service import get_setting_int, get_setting_list
from app.logging_config import get_logger

router = APIRouter(prefix="/filer", tags=["filer"])
logger = get_logger("filer")


def _clean_path(p: str) -> str:
    return p.strip("/")


@router.get("/list/{path:path}")
async def list_filer(path: str, page: int = 1, pageSize: int = 50):
    client = get_seaweed_client()
    clean = _clean_path(path)
    try:
        resp = await client.filer_get(f"/{clean}?pretty=y")
        data = resp.json()
        entries = []
        if isinstance(data, dict) and "Entries" in data:
            raw = data["Entries"] or []
            for e in raw:
                entries.append({
                    "name": e.get("FullPath", "").split("/")[-1] or e.get("Name", "") or "/",
                    "isDirectory": e.get("Mode", 0) & 0x80000000 != 0,
                    "size": e.get("FileSize", 0) or e.get("TotalSize", 0),
                    "mtime": e.get("Mtime", ""),
                    "path": e.get("FullPath", ""),
                })
        elif isinstance(data, list):
            entries = data

        total = len(entries)
        start = (page - 1) * pageSize
        end = start + pageSize
        return {"entries": entries[start:end], "path": f"/{clean}", "total": total, "page": page, "pageSize": pageSize}
    except Exception:
        logger.error("filer_list_failed", path=path, exc_info=True)
        return {"entries": [], "path": f"/{clean}", "total": 0, "page": page, "pageSize": pageSize}


@router.post("/mkdir/{path:path}")
async def mkdir_filer(path: str, _: bool = Depends(require_permission("filer:write"))):
    client = get_seaweed_client()
    clean = _clean_path(path)
    try:
        await client.request("POST", f"/{clean}/?op=mkdir", master=False)
        return {"ok": True}
    except Exception:
        logger.error("filer_mkdir_failed", path=path, exc_info=True)
        return {"error": "mkdir failed"}


@router.delete("/delete/{path:path}")
async def delete_filer(path: str, _: bool = Depends(require_permission("filer:write"))):
    client = get_seaweed_client()
    clean = _clean_path(path)
    try:
        await client.request("DELETE", f"/{clean}", master=False)
        return {"ok": True}
    except Exception:
        logger.error("filer_delete_failed", path=path, exc_info=True)
        return {"error": "delete failed"}


@router.post("/upload/{path:path}")
async def upload_filer(path: str, files: list[UploadFile] = File(None), file: UploadFile | None = File(None), _: bool = Depends(require_permission("filer:write"))):
    import os as _os

    uploads = files if files else ([file] if file else [])
    if not uploads:
        return {"error": "No files provided"}

    max_files = await get_setting_int("max_files_per_upload", 10)
    max_size_mb = await get_setting_int("max_upload_size_mb", 500)
    max_bytes = max_size_mb * 1024 * 1024
    allowed = await get_setting_list("allowed_extensions", [])

    if len(uploads) > max_files:
        return {"error": f"Max {max_files} files per upload"}

    clean = _clean_path(path)
    client = get_seaweed_client()
    results = []
    for file in uploads:
        safe_name = _os.path.basename(file.filename or "upload")
        ext = "." + safe_name.rsplit(".", 1)[-1].lower() if "." in safe_name else ""

        if allowed and ext and ext not in allowed:
            results.append({"file": safe_name, "error": f"Extension {ext} not allowed"})
            continue

        accumulated = bytearray()
        total = 0
        while True:
            chunk = await file.read(65536)
            if not chunk:
                break
            total += len(chunk)
            if total > max_bytes:
                results.append({"file": safe_name, "error": f"File exceeds {max_size_mb}MB"})
                break
            accumulated.extend(chunk)
        else:
            try:
                upload_path = f"{clean}/{safe_name}"
                await client.request("PUT", f"/{upload_path}", master=False, content=bytes(accumulated))
                results.append({"file": safe_name, "ok": True})
            except Exception:
                logger.error("filer_upload_failed", file=safe_name, exc_info=True)
                results.append({"file": safe_name, "error": "Upload failed"})

    return {"results": results}
