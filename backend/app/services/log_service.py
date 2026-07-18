import time
from urllib.parse import urlencode

import httpx

from app.settings_service import get_setting, get_setting_int
from app.logging_config import get_logger

logger = get_logger("log_service")


async def _loki_headers() -> dict:
    org_id = await get_setting("loki_org_id", "")
    headers = {"Accept": "application/json"}
    if org_id:
        headers["X-Scope-OrgID"] = org_id
    return headers


async def _loki_request(path: str, params: dict | None = None) -> dict | list:
    base_url = await get_setting("loki_base_url", "http://loki:3100")
    timeout = await get_setting_int("loki_timeout_seconds", 15)
    headers = await _loki_headers()
    url = f"{base_url.rstrip('/')}{path}"
    t0 = time.monotonic()

    async with httpx.AsyncClient(timeout=timeout) as hc:
        r = await hc.get(url, params=params, headers=headers)
        r.raise_for_status()
        elapsed = round((time.monotonic() - t0) * 1000)
        logger.info("loki_request", path=path, status=r.status_code, elapsed_ms=elapsed)
        return r.json()


async def query_logs(query: str, start: str | None = None, end: str | None = None,
                     limit: int = 500, direction: str = "backward") -> dict:
    if not query or not query.strip():
        return {"streams": [], "message": "Empty query"}

    params: dict = {"query": query, "limit": str(min(limit, 5000)), "direction": direction}
    if start:
        params["start"] = start
    if end:
        params["end"] = end

    try:
        result = await _loki_request("/loki/api/v1/query_range", params)
        return result.get("data", {"result": []})
    except Exception as e:
        logger.error("loki_query_failed", error=str(e), exc_info=True)
        return {"error": str(e), "result": []}


async def get_labels() -> list[str]:
    try:
        result = await _loki_request("/loki/api/v1/labels")
        return result.get("data", []) if isinstance(result, dict) else []
    except Exception as e:
        logger.error("loki_labels_failed", error=str(e), exc_info=True)
        return []


async def get_label_values(label: str) -> list[str]:
    try:
        result = await _loki_request(f"/loki/api/v1/label/{label}/values")
        return result.get("data", []) if isinstance(result, dict) else []
    except Exception as e:
        logger.error("loki_label_values_failed", label=label, error=str(e), exc_info=True)
        return []


async def tail_logs(query: str, limit: int = 100) -> dict:
    return await query_logs(query, limit=limit, direction="backward")


async def check_loki_status() -> dict:
    try:
        base_url = await get_setting("loki_base_url", "http://loki:3100")
        timeout = await get_setting_int("loki_timeout_seconds", 15)
        async with httpx.AsyncClient(timeout=timeout) as hc:
            r = await hc.get(f"{base_url.rstrip('/')}/ready")
            return {"ok": r.status_code == 200, "status": r.status_code, "body": r.text[:200]}
    except Exception as e:
        return {"ok": False, "error": str(e)}
