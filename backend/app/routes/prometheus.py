from fastapi import APIRouter
from app.metrics.prometheus import get_prometheus_response

router = APIRouter(tags=["prometheus"])


@router.get("/prometheus")
async def prometheus_metrics():
    return get_prometheus_response()
