import asyncio
import time

import httpx
from fastapi import APIRouter, Request
from pydantic import BaseModel

from app.config import settings
from app.logging_config import get_logger
from app.middleware.auth_middleware import require_permission

router = APIRouter(prefix="/tools", tags=["tools"])
logger = get_logger("tools")

SERVICE_PORTS = [
    (9333, "master"),
    (8080, "volume"),
    (8888, "filer"),
    (8333, "s3"),
]

SERVICE_CHECK_PATHS = {
    "master": "/cluster/status",
    "volume": "/status",
    "filer": "/",
    "s3": "/",
}


class PingNode(BaseModel):
    host: str
    services: list[dict]


class PingResponse(BaseModel):
    ok: bool
    nodes: list[dict]
    total: int
    reachable: int
    elapsed_ms: float


class ServiceCheckResponse(BaseModel):
    ok: bool
    nodes: list[dict]
    total_checks: int
    passed: int
    failed: int
    elapsed_ms: float


def _extract_host(hostport: str) -> str:
    return hostport.split(":")[0]


async def _tcp_ping(host: str, port: int, timeout: float = 3.0) -> tuple[bool, float]:
    try:
        _, writer = await asyncio.wait_for(
            asyncio.open_connection(host, port), timeout=timeout
        )
        writer.close()
        await writer.wait_closed()
        return True, 0
    except Exception:
        return False, 0


async def _http_check(host: str, port: int, path: str, timeout: float = 5.0) -> dict:
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            t0 = time.monotonic()
            resp = await client.get(f"http://{host}:{port}{path}")
            elapsed = (time.monotonic() - t0) * 1000
            body = resp.text[:200]
            return {"reachable": True, "status": resp.status_code, "latency_ms": round(elapsed, 1), "body_preview": body}
    except httpx.TimeoutException:
        return {"reachable": False, "error": "timeout"}
    except httpx.ConnectError:
        return {"reachable": False, "error": "connection refused"}
    except Exception as e:
        return {"reachable": False, "error": str(e)[:120]}


@router.get("/ping", response_model=PingResponse)
async def ping_nodes(request: Request):
    require_permission(request, "tools:read")
    hosts = settings.all_node_hosts
    t0 = time.monotonic()

    ping_tasks = []
    for host in hosts:
        for port, svc in SERVICE_PORTS:
            ping_tasks.append(_tcp_ping(host, port))

    results = await asyncio.gather(*ping_tasks)

    nodes = {}
    for host in hosts:
        nodes[host] = {"host": host, "services": []}

    for (host, port, svc), (reachable, _) in zip(
        [(h, p, s) for h in hosts for p, s in SERVICE_PORTS], results
    ):
        nodes[host]["services"].append({
            "port": port, "service": svc, "reachable": reachable,
        })

    node_list = list(nodes.values())
    reachable_ports = sum(1 for n in node_list for s in n["services"] if s["reachable"])
    total_ports = sum(len(n["services"]) for n in node_list)

    return {
        "ok": True,
        "nodes": node_list,
        "total": total_ports,
        "reachable": reachable_ports,
        "elapsed_ms": round((time.monotonic() - t0) * 1000, 1),
    }


@router.get("/service-check", response_model=ServiceCheckResponse)
async def service_check(request: Request):
    require_permission(request, "tools:read")
    hosts = settings.all_node_hosts
    t0 = time.monotonic()

    checks = []
    for host in hosts:
        for port, svc in SERVICE_PORTS:
            path = SERVICE_CHECK_PATHS.get(svc, "/")
            checks.append((host, port, svc, path))

    tasks = [_http_check(h, p, path) for h, p, svc, path in checks]
    results = await asyncio.gather(*tasks)

    nodes = {}
    for host in hosts:
        nodes[host] = {"host": host, "checks": []}

    for (host, port, svc, path), result in zip(checks, results):
        entry = {"port": port, "service": svc, "path": path, **result}
        nodes[host]["checks"].append(entry)

    node_list = list(nodes.values())
    passed = sum(1 for n in node_list for c in n["checks"] if c.get("reachable"))
    total = sum(len(n["checks"]) for n in node_list)

    return {
        "ok": True,
        "nodes": node_list,
        "total_checks": total,
        "passed": passed,
        "failed": total - passed,
        "elapsed_ms": round((time.monotonic() - t0) * 1000, 1),
    }
