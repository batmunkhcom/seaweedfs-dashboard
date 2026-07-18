import time
import json
import os
import re
from urllib.parse import urlencode

import httpx

from app.settings_service import get_setting, get_setting_int
from app.logging_config import get_logger

logger = get_logger("log_service")

LOG_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "logs")
LOG_GLOB = "dashboard*.jsonl"


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
        logger.info("loki_unreachable_falling_back", error=str(e)[:100])
        return _query_local_logs(query, start, end, limit, direction)


async def get_labels() -> list[str]:
    try:
        result = await _loki_request("/loki/api/v1/labels")
        return result.get("data", []) if isinstance(result, dict) else []
    except Exception:
        return ["level", "logger"]


async def get_label_values(label: str) -> list[str]:
    try:
        result = await _loki_request(f"/loki/api/v1/label/{label}/values")
        return result.get("data", []) if isinstance(result, dict) else []
    except Exception:
        local_vals = {"level": ["info", "warning", "error", "debug"], "logger": ["main", "seaweed_client", "alert_engine", "snapshot", "disk_health", "backup", "lifecycle"]}
        return local_vals.get(label, [])


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
        files = _list_log_files()
        return {"ok": False, "error": str(e), "local_logs_available": len(files) > 0, "local_files": [f["name"] for f in files[:5]]}


def _list_log_files() -> list[dict]:
    import glob as globmod
    result = []
    for pattern in [os.path.join(LOG_DIR, LOG_GLOB), os.path.join(LOG_DIR, "*.jsonl")]:
        for fp in sorted(globmod.glob(pattern), reverse=True):
            result.append({"name": os.path.basename(fp), "path": fp, "size": os.path.getsize(fp)})
    return result


def _parse_logql_basic(query: str) -> dict:
    filters = {"level": None, "logger": None, "keyword": None}
    braces = re.search(r"\{(.+?)\}", query)
    if braces:
        inside = braces.group(1)
        for part in inside.split(","):
            part = part.strip()
            if "=~" in part:
                pass
            elif "!=" in part:
                k, v = part.split("!=", 1)
                filters[k.strip()] = v.strip().strip('"')
            elif "=" in part:
                k, v = part.split("=", 1)
                filters[k.strip()] = v.strip().strip('"')
    post_brace = query[query.find("}") + 1:].strip() if "}" in query else query.strip()
    if post_brace:
        m = re.search(r'\|=\s*"(.+?)"', post_brace)
        if m:
            filters["keyword"] = m.group(1)
        elif not braces:
            filters["keyword"] = post_brace.strip().strip('"')
    return filters


def _query_local_logs(query: str, start: str | None = None, end: str | None = None,
                     limit: int = 500, direction: str = "backward") -> dict:
    files = _list_log_files()
    if not files:
        return {"result": [], "message": "No local log files found"}

    filters = _parse_logql_basic(query)

    def _parse_ts(ts_str):
        if not ts_str:
            return None
        try:
            return float(ts_str) / 1e9 if "e" in str(ts_str) or len(str(ts_str)) > 13 else float(ts_str)
        except Exception:
            return None

    start_ts = _parse_ts(start)
    end_ts = _parse_ts(end)

    entries = []
    for fmeta in files[:3]:
        try:
            with open(fmeta["path"]) as f:
                lines = f.readlines()
                if direction == "backward":
                    lines.reverse()
                for line in lines:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        entry = json.loads(line)
                    except json.JSONDecodeError:
                        continue

                    ts_str = entry.get("timestamp", "")
                    entry_ts = None
                    if ts_str:
                        try:
                            from datetime import datetime
                            dt = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
                            entry_ts = dt.timestamp()
                        except Exception:
                            pass

                    if start_ts and entry_ts and entry_ts < start_ts:
                        continue
                    if end_ts and entry_ts and entry_ts > end_ts:
                        continue

                    level = entry.get("level", "").lower()
                    event = entry.get("event", "")
                    logname = entry.get("logger", "")

                    if filters["level"] and filters["level"].lower() != level:
                        continue
                    if filters["logger"] and filters["logger"].lower() not in logname.lower():
                        continue
                    if filters["keyword"]:
                        kw = filters["keyword"].lower()
                        if kw not in json.dumps(entry).lower():
                            continue

                    ts_ns = str(int(entry_ts * 1e9)) if entry_ts else "0"
                    entries.append({
                        "stream": {"level": level, "logger": logname},
                        "values": [[ts_ns, json.dumps(entry, default=str)]],
                    })

                    if len(entries) >= limit:
                        break
        except Exception as e:
            logger.error("local_log_read_error", file=fmeta["name"], error=str(e))
            continue

        if len(entries) >= limit:
            break

    return {"result": entries, "local": True, "total_files_scanned": min(len(files), 3), "query": query}
