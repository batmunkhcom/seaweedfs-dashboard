from fastapi import APIRouter

router = APIRouter(prefix="/metrics", tags=["metrics"])


@router.get("/all")
async def metrics_all():
    return {"nodes": [], "message": "Prometheus metrics integration — Phase 12 (future)"}
