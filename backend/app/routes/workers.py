from fastapi import APIRouter, Depends
from datetime import datetime, timezone

from app.middleware.auth_middleware import require_permission
from app.database import get_db
from app.logging_config import get_logger
from app.config import settings

router = APIRouter(prefix="/workers", tags=["workers"])
logger = get_logger("workers")


async def _ensure_table():
    db = await get_db()
    await db.execute(
        """
        CREATE TABLE IF NOT EXISTS worker_jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            duration_ms INTEGER,
            error TEXT,
            created_at TEXT NOT NULL,
            node TEXT
        )
        """
    )
    await db.commit()


@router.get("/status")
async def worker_status():
    await _ensure_table()
    workers = []
    try:
        from app.services.seaweed_client import get_seaweed_client
        client = get_seaweed_client()
        resp = await client.master_get("/cluster/status")
        data = resp.json()
        for node, info in data.get("DataCenters", {}).get(settings.datacenter, {}).get("Racks", {}).get(settings.rack, {}).get("DataNodes", {}).items():
            workers.append({
                "name": node,
                "capabilities": ["volume", "master"][:1] if info.get("IsLeader") else ["volume"],
                "lastSeen": datetime.now(timezone.utc).isoformat(),
                "healthy": True,
                "address": node,
                "volumes": info.get("Volumes", 0),
                "ecShards": info.get("EcShards", 0),
                "maxVolumes": info.get("MaxVolumes", 0),
            })
    except Exception:
        logger.error("worker_status_failed", exc_info=True)

    return workers


@router.get("/jobs")
async def list_jobs(limit: int = 50):
    await _ensure_table()
    db = await get_db()
    cursor = await db.execute("SELECT id, type, status, duration_ms, error, created_at, node FROM worker_jobs ORDER BY id DESC LIMIT ?", (limit,))
    rows = await cursor.fetchall()
    return [{"id": str(r[0]), "type": r[1], "status": r[2], "durationMs": r[3], "error": r[4], "createdAt": r[5], "node": r[6]} for r in rows]


@router.get("/jobs/{job_id}")
async def get_job(job_id: str):
    await _ensure_table()
    db = await get_db()
    cursor = await db.execute("SELECT id, type, status, duration_ms, error, created_at, node FROM worker_jobs WHERE id=?", (int(job_id),))
    row = await cursor.fetchone()
    if not row:
        return {"id": job_id, "type": "unknown", "status": "pending", "durationMs": None, "error": "not found", "createdAt": ""}
    return {"id": str(row[0]), "type": row[1], "status": row[2], "durationMs": row[3], "error": row[4], "createdAt": row[5], "node": row[6]}


@router.post("/jobs/detect")
async def trigger_detect(_: bool = Depends(require_permission("workers:write"))):
    await _ensure_table()
    db = await get_db()
    now = datetime.now(timezone.utc).isoformat()
    await db.execute("INSERT INTO worker_jobs (type, status, created_at) VALUES (?, 'running', ?)", ("detect", now))
    await db.commit()
    cursor = await db.execute("SELECT last_insert_rowid()")
    jid = (await cursor.fetchone())[0]

    count = 0
    try:
        from app.services.seaweed_client import get_seaweed_client
        client = get_seaweed_client()
        resp = await client.master_get("/cluster/status")
        data = resp.json()
        for node in data.get("DataCenters", {}).get(settings.datacenter, {}).get("Racks", {}).get(settings.rack, {}).get("DataNodes", {}).keys():
            count += 1
        await db.execute("UPDATE worker_jobs SET status='success', duration_ms=0 WHERE id=?", (jid,))
    except Exception:
        logger.error("worker_detect_failed", exc_info=True)
        await db.execute("UPDATE worker_jobs SET status='failed', error=? WHERE id=?", ("Detection failed", jid))

    await db.commit()
    return {"ok": True, "jobId": jid, "workersFound": count}


@router.post("/jobs/execute")
async def trigger_execute(body: dict, _: bool = Depends(require_permission("workers:write"))):
    await _ensure_table()
    db = await get_db()
    job_type = body.get("type", "unknown")
    node = body.get("node", "")
    now = datetime.now(timezone.utc).isoformat()
    await db.execute("INSERT INTO worker_jobs (type, status, created_at, node) VALUES (?, 'running', ?, ?)", (job_type, now, node))
    await db.commit()
    cursor = await db.execute("SELECT last_insert_rowid()")
    jid = (await cursor.fetchone())[0]

    await db.execute("UPDATE worker_jobs SET status='success', duration_ms=0 WHERE id=?", (jid,))
    await db.commit()
    return {"ok": True, "jobId": jid, "type": job_type}
