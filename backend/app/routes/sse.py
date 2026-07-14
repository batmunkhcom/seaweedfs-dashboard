import asyncio
import json
import time

import structlog
from sse_starlette.sse import EventSourceResponse

from app.services.seaweed_client import get_seaweed_client
from app.logging_config import get_logger


logger = get_logger("sse")
_subscribers: list[asyncio.Queue] = []


def register_subscriber() -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue(maxsize=64)
    _subscribers.append(q)
    return q


def unregister_subscriber(q: asyncio.Queue):
    if q in _subscribers:
        _subscribers.remove(q)


async def broadcast(event_type: str, data: dict):
    payload = {"event": event_type, "data": json.dumps(data)}
    dead: list[asyncio.Queue] = []
    for q in _subscribers:
        try:
            q.put_nowait(payload)
        except asyncio.QueueFull:
            dead.append(q)
    for q in dead:
        unregister_subscriber(q)


async def sse_endpoint(request):
    q = register_subscriber()

    async def event_generator():
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    payload = await asyncio.wait_for(q.get(), timeout=15.0)
                    yield payload
                except asyncio.TimeoutError:
                    yield {"comment": "keepalive"}
        finally:
            unregister_subscriber(q)

    return EventSourceResponse(event_generator())


async def publish_stats(stats: dict):
    await broadcast("stats_update", stats)


async def publish_alert(alert: dict):
    await broadcast("alert_new", alert)
