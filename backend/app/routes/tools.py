import asyncio
import os
import subprocess
import time
import re

import httpx
from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.config import settings
from app.logging_config import get_logger
from app.middleware.auth_middleware import require_permission

router = APIRouter(prefix="/tools", tags=["tools"])
logger = get_logger("tools")

ALLOWED_HOSTNAME = re.compile(r'^[a-zA-Z0-9.\-_]{1,253}$')


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

NODE_SERVICES = {
    "172.16.0.1": [(9333, "master"), (8080, "volume")],
    "172.16.0.2": [(8080, "volume"), (8888, "filer"), (8333, "s3")],
    "172.16.0.3": [(9333, "master"), (8080, "volume")],
    "172.16.0.4": [(8080, "volume"), (8888, "filer"), (8333, "s3")],
    "172.16.0.5": [(9333, "master"), (8080, "volume")],
    "172.16.0.6": [(8080, "volume"), (8333, "s3")],
    "172.16.0.7": [(8080, "volume"), (8333, "s3")],
}

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

class ToolStatusResponse(BaseModel):
    ok: bool
    node_count: int
    master_count: int
    volume_count: int
    filer_count: int
    s3_count: int
    version: str
    leader: str
    ai_enabled: bool
    embedding_stats: dict


async def _tcp_ping(host: str, port: int, timeout: float = 3.0) -> tuple[bool, float]:
    try:
        t0 = time.monotonic()
        _, writer = await asyncio.wait_for(
            asyncio.open_connection(host, port), timeout=timeout
        )
        elapsed = (time.monotonic() - t0) * 1000
        writer.close()
        await writer.wait_closed()
        return True, round(elapsed, 1)
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


@router.get("/ping", response_model=PingResponse, dependencies=[Depends(require_permission("tools:read"))])
async def ping_nodes():
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

    for (host, port, svc), (reachable, lat) in zip(
        [(h, p, s) for h in hosts for p, s in SERVICE_PORTS], results
    ):
        nodes[host]["services"].append({
            "port": port, "service": svc, "reachable": reachable, "latency_ms": lat,
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


@router.get("/service-check", response_model=ServiceCheckResponse, dependencies=[Depends(require_permission("tools:read"))])
async def service_check():
    t0 = time.monotonic()

    checks = []
    for host, svc_list in NODE_SERVICES.items():
        if host not in settings.all_node_hosts:
            continue
        for port, svc in svc_list:
            path = SERVICE_CHECK_PATHS.get(svc, "/")
            checks.append((host, port, svc, path))

    tasks = [_http_check(h, p, path) for h, p, svc, path in checks]
    results = await asyncio.gather(*tasks)

    nodes = {}
    for host, svc_list in NODE_SERVICES.items():
        if host not in settings.all_node_hosts:
            continue
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


@router.get("/status")
async def tool_status():
    from app.services.chatbot_service import is_ai_enabled
    from app.services.seaweed_client import get_seaweed_client

    ai_on = await is_ai_enabled()

    emb_stats = {"total_chunks": 0, "sources": 0, "dimension": 0}
    try:
        from app.services.ai_embedding import embedding_stats
        emb_stats = await embedding_stats()
    except Exception:
        pass

    leader = "?"
    version = "?"
    try:
        client = get_seaweed_client()
        resp = await client.master_get("/cluster/status")
        cs = resp.json()
        leader = cs.get("Leader", "?")
        version = cs.get("Version", "?")
    except Exception:
        pass

    master_count = sum(1 for _, svcs in NODE_SERVICES.items() for _, s in svcs if s == "master")
    volume_count = sum(1 for _, svcs in NODE_SERVICES.items() for _, s in svcs if s == "volume")
    filer_count = sum(1 for _, svcs in NODE_SERVICES.items() for _, s in svcs if s == "filer")
    s3_count = sum(1 for _, svcs in NODE_SERVICES.items() for _, s in svcs if s == "s3")

    return {
        "ok": True,
        "node_count": len(settings.all_node_hosts),
        "master_count": master_count,
        "volume_count": volume_count,
        "filer_count": filer_count,
        "s3_count": s3_count,
        "version": version,
        "leader": leader,
        "ai_enabled": ai_on,
        "embedding_stats": emb_stats,
    }


class HostRequest(BaseModel):
    host: str

class PingHostResponse(BaseModel):
    ok: bool
    host: str
    reachable: bool
    latency_ms: float
    output: str

class TracerouteResponse(BaseModel):
    ok: bool
    host: str
    hops: int
    output: str
    elapsed_ms: float


def _validate_host(host: str) -> str | None:
    host = host.strip()
    if len(host) > 253:
        return None
    if not ALLOWED_HOSTNAME.match(host):
        return None
    bad = re.findall(r'[;&|$`\\\'"<>]', host)
    if bad:
        return None
    return host


async def _ping_host_async(host: str, count: int = 3) -> dict:
    try:
        proc = await asyncio.create_subprocess_exec(
            "ping", "-c", str(count), "-W", "2", host,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=10)
        out = stdout.decode(errors="replace")
        err = stderr.decode(errors="replace")

        ms_match = re.search(r'avg[ /]*([\d.]+)', out)
        latency = float(ms_match.group(1)) if ms_match else 0

        reachable = proc.returncode == 0
        lines = out.strip().split("\n")
        summary = "\n".join(lines[-4:]) if len(lines) >= 4 else out[:500]

        return {"ok": True, "host": host, "reachable": reachable, "latency_ms": latency, "output": summary}
    except asyncio.TimeoutError:
        return {"ok": False, "host": host, "reachable": False, "latency_ms": 0, "output": "timeout"}
    except Exception as e:
        return {"ok": False, "host": host, "reachable": False, "latency_ms": 0, "output": str(e)[:300]}


async def _traceroute_async(host: str) -> dict:
    try:
        t0 = time.monotonic()
        proc = await asyncio.create_subprocess_exec(
            "traceroute", "-n", "-w", "2", "-q", "1", "-m", "20", host,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=30)
        elapsed = (time.monotonic() - t0) * 1000
        out = stdout.decode(errors="replace")

        hop_count = len([l for l in out.split("\n") if l.strip() and l[0].isdigit()])
        return {"ok": True, "host": host, "hops": hop_count, "output": out[:2000],
                "elapsed_ms": round(elapsed, 1), "reachable": True, "latency_ms": round(elapsed, 1)}
    except asyncio.TimeoutError:
        return {"ok": False, "host": host, "hops": 0, "output": "traceroute timed out", "elapsed_ms": 0, "reachable": False, "latency_ms": 0}
    except Exception as e:
        return {"ok": False, "host": host, "hops": 0, "output": str(e)[:300], "elapsed_ms": 0, "reachable": False, "latency_ms": 0}


@router.post("/ping-host", dependencies=[Depends(require_permission("tools:write"))])
async def ping_host(body: HostRequest):
    host = _validate_host(body.host)
    if not host:
        return JSONResponse({"ok": False, "error": "Invalid hostname"}, status_code=400)
    return await _ping_host_async(host)


@router.post("/ping-internet", dependencies=[Depends(require_permission("tools:write"))])
async def ping_internet():
    return await _ping_host_async("8.8.8.8")


@router.post("/traceroute", dependencies=[Depends(require_permission("tools:write"))])
async def traceroute_host(body: HostRequest):
    host = _validate_host(body.host)
    if not host:
        return JSONResponse({"ok": False, "error": "Invalid hostname"}, status_code=400)
    return await _traceroute_async(host)


@router.post("/dns-resolve", dependencies=[Depends(require_permission("tools:write"))])
async def dns_resolve(body: HostRequest):
    host = _validate_host(body.host)
    if not host:
        return JSONResponse({"ok": False, "error": "Invalid hostname"}, status_code=400)
    try:
        proc = await asyncio.create_subprocess_exec("dig", "+short", host, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=5)
        out = stdout.decode(errors="replace").strip()
        return {"ok": True, "host": host, "output": out if out else f"No records found for {host}"}
    except asyncio.TimeoutError:
        return {"ok": False, "host": host, "output": "DNS query timed out"}
    except Exception as e:
        return {"ok": False, "host": host, "output": str(e)[:300]}


class PortCheckRequest(BaseModel):
    host: str
    port: int


@router.post("/port-check", dependencies=[Depends(require_permission("tools:write"))])
async def port_check(body: PortCheckRequest):
    host = _validate_host(body.host)
    if not host:
        return JSONResponse({"ok": False, "error": "Invalid hostname"}, status_code=400)
    if body.port < 1 or body.port > 65535:
        return JSONResponse({"ok": False, "error": "Port must be 1–65535"}, status_code=400)
    try:
        t0 = time.monotonic()
        _, writer = await asyncio.wait_for(asyncio.open_connection(host, body.port), timeout=3)
        lat = round((time.monotonic() - t0) * 1000, 1)
        writer.close()
        await writer.wait_closed()
        return {"ok": True, "host": host, "port": body.port, "open": True, "latency_ms": lat}
    except Exception:
        return {"ok": True, "host": host, "port": body.port, "open": False, "latency_ms": 0}


class HttpCheckRequest(BaseModel):
    url: str


@router.post("/http-head", dependencies=[Depends(require_permission("tools:write"))])
async def http_head(body: HttpCheckRequest):
    url = body.url.strip()
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    try:
        async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
            t0 = time.monotonic()
            resp = await client.head(url)
            lat = round((time.monotonic() - t0) * 1000, 1)
            headers = {k: v for k, v in resp.headers.items() if k.lower() in ("server", "content-type", "content-length", "location", "x-")}
            return {"ok": True, "url": url, "status": resp.status_code, "latency_ms": lat, "headers": headers}
    except httpx.TimeoutException:
        return {"ok": False, "url": url, "error": "Request timed out"}
    except httpx.ConnectError:
        return {"ok": False, "url": url, "error": "Connection refused"}
    except Exception as e:
        return {"ok": False, "url": url, "error": str(e)[:200]}


class SslCheckRequest(BaseModel):
    host: str
    port: int = 443


@router.post("/ssl-check", dependencies=[Depends(require_permission("tools:write"))])
async def ssl_check(body: SslCheckRequest):
    host = _validate_host(body.host)
    if not host:
        return JSONResponse({"ok": False, "error": "Invalid hostname"}, status_code=400)
    try:
        proc = await asyncio.create_subprocess_exec(
            "openssl", "s_client", "-connect", f"{host}:{body.port}", "-servername", host,
            stdin=asyncio.subprocess.DEVNULL, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=10)
        out = stdout.decode(errors="replace")
        cn_match = re.search(r'CN\s*=\s*([^\n]+)', out)
        expire_match = re.search(r'notAfter=([^\n]+)', out)
        verify = "Verify return code: 0" in out
        return {
            "ok": verify,
            "host": host, "port": body.port,
            "cn": cn_match.group(1).strip() if cn_match else "",
            "expires": expire_match.group(1).strip() if expire_match else "",
            "verified": verify,
            "output": out[:1500],
        }
    except asyncio.TimeoutError:
        return {"ok": False, "host": host, "error": "SSL check timed out"}
    except Exception as e:
        return {"ok": False, "host": host, "error": str(e)[:200]}


class SshRequest(BaseModel):
    host: str


def _ssh_exec(host: str, cmd: str, timeout: int = 10) -> str:
    import paramiko
    from app.config import settings as app_settings
    key_path = app_settings.disk_health_ssh_key_path or "~/.ssh/id_rsa"
    key_path = os.path.expanduser(key_path) if hasattr(os, "expanduser") else key_path
    user = app_settings.disk_health_ssh_user or "root"
    try:
        key = paramiko.RSAKey.from_private_key_file(key_path)
    except Exception:
        try:
            key = paramiko.Ed25519Key.from_private_key_file(key_path)
        except Exception:
            key = None
    client = paramiko.SSHClient()
    client.load_system_host_keys()
    client.set_missing_host_key_policy(paramiko.WarningPolicy())
    try:
        client.connect(host, username=user, pkey=key, timeout=timeout, banner_timeout=5, auth_timeout=5)
        _, stdout, stderr = client.exec_command(cmd, timeout=timeout)
        out = stdout.read().decode(errors="replace")[:4000]
        err = stderr.read().decode(errors="replace")[:500]
        return out if out else (err if err else "(no output)")
    except Exception as e:
        return f"SSH failed: {str(e)[:200]}"
    finally:
        client.close()


@router.post("/system-info", dependencies=[Depends(require_permission("tools:write"))])
async def system_info(body: SshRequest):
    if not _validate_host(body.host):
        return JSONResponse({"ok": False, "error": "Invalid hostname"}, status_code=400)
    cmd = "echo '=== CPU ===' && top -bn1 | head -5 && echo && echo '=== MEMORY ===' && free -h && echo && echo '=== DISK ===' && df -h /data* 2>/dev/null || df -h /"
    loop = asyncio.get_event_loop()
    output = await loop.run_in_executor(None, _ssh_exec, body.host, cmd, 15)
    return {"ok": not output.startswith("SSH failed"), "host": body.host, "output": output}


@router.post("/service-uptime", dependencies=[Depends(require_permission("tools:write"))])
async def service_uptime(body: SshRequest):
    if not _validate_host(body.host):
        return JSONResponse({"ok": False, "error": "Invalid hostname"}, status_code=400)
    cmd = "echo '=== SERVICE UPTIME ===' && ps -eo pid,etime,args | grep -E 'weed (master|volume|filer|s3)' | grep -v grep"
    loop = asyncio.get_event_loop()
    output = await loop.run_in_executor(None, _ssh_exec, body.host, cmd, 10)
    return {"ok": not output.startswith("SSH failed"), "host": body.host, "output": output}


@router.post("/logs-tail", dependencies=[Depends(require_permission("tools:write"))])
async def logs_tail(body: SshRequest):
    if not _validate_host(body.host):
        return JSONResponse({"ok": False, "error": "Invalid hostname"}, status_code=400)
    cmd = "journalctl -u seaweed-master -u seaweed-volume -u seaweed-filer -u seaweed-s3 --no-pager -n 30 2>/dev/null || dmesg | tail -20"
    loop = asyncio.get_event_loop()
    output = await loop.run_in_executor(None, _ssh_exec, body.host, cmd, 10)
    return {"ok": not output.startswith("SSH failed"), "host": body.host, "output": output}
