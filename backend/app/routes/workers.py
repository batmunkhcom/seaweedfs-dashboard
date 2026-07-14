from fastapi import APIRouter, Depends

from app.middleware.auth_middleware import require_admin
from app.logging_config import get_logger

router = APIRouter(prefix="/workers", tags=["workers"])
logger = get_logger("workers")


@router.get("/status")
async def worker_status():
    return []


@router.get("/jobs")
async def list_jobs():
    return []


@router.get("/jobs/{job_id}")
async def get_job(job_id: str):
    return {"id": job_id, "type": "unknown", "status": "pending", "durationMs": None, "error": None, "createdAt": ""}


@router.post("/jobs/detect")
async def trigger_detect(_: bool = Depends(require_admin)):
    return {"ok": True}


@router.post("/jobs/execute")
async def trigger_execute(body: dict, _: bool = Depends(require_admin)):
    return {"ok": True}
