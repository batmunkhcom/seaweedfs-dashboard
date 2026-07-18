import asyncio
import json
import time

from fastapi import APIRouter, Query, Depends, Request
from sse_starlette.sse import EventSourceResponse

from app.services.log_service import query_logs, get_labels, get_label_values, tail_logs, check_loki_status
from app.middleware.auth_middleware import get_current_user
from app.settings_service import get_setting, get_setting_int
from app.logging_config import get_logger

router = APIRouter(prefix="/logs", tags=["logs"])
logger = get_logger("logs")


@router.get("/status")
async def logs_status():
    return await check_loki_status()


@router.get("/query")
async def logs_query(
    query: str = Query(..., min_length=1),
    start: str | None = None,
    end: str | None = None,
    limit: int = 500,
    direction: str = "backward",
):
    return await query_logs(query, start, end, limit, direction)


@router.get("/labels")
async def logs_labels():
    return await get_labels()


@router.get("/labels/{name}/values")
async def logs_label_values(name: str):
    return await get_label_values(name)


@router.get("/stream")
async def logs_stream(
    request: Request,
    query: str = Query(..., min_length=1),
    user: dict = Depends(get_current_user),
):
    async def event_generator():
        interval = await get_setting_int("loki_tail_interval_seconds", 3)
        last_ids: set[str] = set()
        while True:
            if await request.is_disconnected():
                break
            try:
                data = await tail_logs(query, limit=200)
                results = data.get("result", []) if isinstance(data, dict) else []
                for stream in results:
                    for entry in stream.get("values", []):
                        entry_id = f"{stream.get('stream', {})}-{entry[0]}"
                        if entry_id not in last_ids:
                            last_ids.add(entry_id)
                            yield {
                                "event": "log_entry",
                                "data": json.dumps({
                                    "timestamp": entry[0],
                                    "line": entry[1],
                                    "labels": stream.get("stream", {}),
                                }),
                            }
                if len(last_ids) > 2000:
                    last_ids = set(list(last_ids)[-1000:])
            except Exception as e:
                logger.error("log_stream_error", exc_info=True)
                yield {"event": "error", "data": json.dumps({"error": str(e)})}
            await asyncio.sleep(interval)

    return EventSourceResponse(event_generator())
