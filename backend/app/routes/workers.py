import time
from fastapi import APIRouter, Depends, Query

from app.middleware.auth_middleware import require_permission
from app.logging_config import get_logger
from app.models.workers import (
    WorkerNode,
    WorkerStatusResponse,
    ExecuteRequest,
    DetectResponse,
    ExecuteResponse,
)
from app.services.worker_service import (
    detect_workers,
    execute_job,
    list_jobs,
    get_job,
    get_node_volumes,
    JOB_TYPES,
    _ensure_table,
    _record_job,
    _finish_job,
)

router = APIRouter(prefix="/workers", tags=["workers"])
logger = get_logger("workers")


@router.get("/status", response_model=WorkerStatusResponse)
async def worker_status():
    await _ensure_table()
    detection = await detect_workers()
    return WorkerStatusResponse(
        total=detection["total"],
        healthy=detection["healthy"],
        nodes=[WorkerNode(**n) for n in detection["nodes"]],
    )


@router.get("/jobs")
async def list_worker_jobs(limit: int = Query(50, ge=1, le=200)):
    await _ensure_table()
    return await list_jobs(limit)


@router.get("/jobs/{job_id}")
async def get_worker_job(job_id: str):
    await _ensure_table()
    job = await get_job(int(job_id))
    if not job:
        return {"id": job_id, "type": "unknown", "status": "missing", "durationMs": None, "error": "not found", "result": None, "createdAt": "", "node": ""}
    return job


@router.post("/jobs/detect", response_model=DetectResponse)
async def trigger_detect(_: bool = Depends(require_permission("workers:write"))):
    await _ensure_table()
    start_time = time.monotonic()
    job_id = await _record_job("detect")
    try:
        result = await detect_workers()
        await _finish_job(
            job_id, start_time, "success",
            result=f"Total: {result['total']}, Healthy: {result['healthy']}"
        )
        return DetectResponse(
            ok=True, job_id=str(job_id),
            workers_found=result["total"],
            healthy=result["healthy"],
            unhealthy=result["total"] - result["healthy"],
        )
    except Exception as e:
        logger.error("detect_trigger_failed", exc_info=True)
        await _finish_job(
            job_id, start_time, "failed", error=str(e)[:200]
        )
        return DetectResponse(ok=False, job_id=str(job_id), workers_found=0, healthy=0, unhealthy=0)


@router.post("/jobs/execute", response_model=ExecuteResponse)
async def trigger_execute(body: ExecuteRequest, _: bool = Depends(require_permission("workers:write"))):
    await _ensure_table()
    result = await execute_job(body.type, body.node, body.volume_param)
    return ExecuteResponse(**result)


@router.get("/job-types")
async def job_types():
    return [
        {"type": k, "description": v}
        for k, v in sorted(JOB_TYPES.items())
    ]


@router.get("/nodes/{node:path}/volumes")
async def node_volumes(node: str):
    ids = await get_node_volumes(node)
    return {"node": node, "volume_ids": ids, "count": len(ids)}
