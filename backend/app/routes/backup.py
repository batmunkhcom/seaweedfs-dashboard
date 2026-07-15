from fastapi import APIRouter, Depends
from datetime import datetime, timezone
import json

from app.middleware.auth_middleware import require_permission
from app.database import get_db
from app.logging_config import get_logger

router = APIRouter(prefix="/backup", tags=["backup"])
logger = get_logger("backup")


async def _ensure_table():
    db = await get_db()
    await db.execute(
        """
        CREATE TABLE IF NOT EXISTS backup_syncs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            started_at TEXT NOT NULL,
            finished_at TEXT,
            status TEXT DEFAULT 'running',
            error TEXT,
            bytes_synced INTEGER DEFAULT 0
        )
        """
    )
    await db.execute(
        """
        CREATE TABLE IF NOT EXISTS backup_snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            path TEXT NOT NULL,
            size_bytes INTEGER DEFAULT 0,
            created_at TEXT NOT NULL
        )
        """
    )
    await db.commit()


@router.get("/status")
async def backup_status():
    await _ensure_table()
    db = await get_db()
    cursor = await db.execute("SELECT * FROM backup_syncs ORDER BY id DESC LIMIT 1")
    row = await cursor.fetchone()
    if not row:
        return {"running": False, "lastSyncAt": None, "lastError": None, "bytesSynced": 0}

    return {
        "running": row[3] == "running",
        "lastSyncAt": row[2] or row[1],
        "lastError": row[4],
        "bytesSynced": row[5],
    }


@router.post("/sync")
async def trigger_sync(_: bool = Depends(require_permission("backup:write"))):
    await _ensure_table()
    db = await get_db()
    now = datetime.now(timezone.utc).isoformat()
    await db.execute("INSERT INTO backup_syncs (started_at, status) VALUES (?, 'running')", (now,))
    await db.commit()

    cursor = await db.execute("SELECT last_insert_rowid()")
    sync_id = (await cursor.fetchone())[0]

    success = False
    error_msg = None
    bytes_synced = 0
    try:
        from app.services.seaweed_client import get_seaweed_client
        client = get_seaweed_client()
        resp = await client.filer_get("/")
        data = resp.json()
        bytes_synced = sum(e.get("FileSize", 0) or e.get("TotalSize", 0) for e in (data.get("Entries", []) or []))
        success = True
    except Exception:
        logger.error("backup_sync_failed", exc_info=True)
        error_msg = "Sync failed"

    finished = datetime.now(timezone.utc).isoformat()
    status = "success" if success else "failed"
    await db.execute(
        "UPDATE backup_syncs SET finished_at=?, status=?, error=?, bytes_synced=? WHERE id=?",
        (finished, status, error_msg, bytes_synced, sync_id),
    )
    await db.commit()
    return {"ok": success, "syncId": sync_id, "bytesSynced": bytes_synced, "error": error_msg}


@router.get("/snapshots")
async def list_snapshots():
    await _ensure_table()
    db = await get_db()
    cursor = await db.execute("SELECT id, name, size_bytes, created_at FROM backup_snapshots ORDER BY id DESC")
    rows = await cursor.fetchall()
    return [{"id": str(r[0]), "name": r[1], "size": r[2], "createdAt": r[3]} for r in rows]


@router.post("/snapshots")
async def create_snapshot(body: dict, _: bool = Depends(require_permission("backup:write"))):
    await _ensure_table()
    db = await get_db()
    name = body.get("name", "")
    path = body.get("path", "/")
    now = datetime.now(timezone.utc).isoformat()
    await db.execute(
        "INSERT INTO backup_snapshots (name, path, created_at) VALUES (?, ?, ?)",
        (name, path, now),
    )
    await db.commit()
    cursor = await db.execute("SELECT last_insert_rowid()")
    sid = (await cursor.fetchone())[0]
    return {"id": str(sid), "name": name, "size": 0, "createdAt": now}


@router.delete("/snapshots/{snapshot_id}")
async def delete_snapshot(snapshot_id: str, _: bool = Depends(require_permission("backup:write"))):
    await _ensure_table()
    db = await get_db()
    await db.execute("DELETE FROM backup_snapshots WHERE id=?", (int(snapshot_id),))
    await db.commit()
    return {"ok": True}
