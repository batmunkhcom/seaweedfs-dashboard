from fastapi import APIRouter, Depends, Request
import json

from app.services.seaweed_client import get_seaweed_client
from app.middleware.auth_middleware import require_permission
from app.settings_service import get_setting, get_setting_int, update_setting
from app.logging_config import get_logger

from app.middleware.rate_limit import limiter

router = APIRouter(prefix="/volumes", tags=["volumes"])

@router.post("/grow")
@limiter.limit("5/minute")
async def grow_volumes(request: Request, body: dict, _: bool = Depends(require_permission("volumes:write"))):
    client = get_seaweed_client()
    count = body.get("count", 1)
    try:
        resp = await client.master_get("/dir/status?pretty=y")
        data = resp.json()
        topology = data.get("Topology", {})
        raw_limits = await get_setting("node_volume_limits", "{}")
        node_limits: dict[str, int] = {}
        if raw_limits and raw_limits.strip() != '{}':
            try:
                node_limits = json.loads(raw_limits)
            except Exception:
                pass
        current_counts = {}
        for dc in topology.get("DataCenters", []):
            for rack in dc.get("Racks", []):
                for node in rack.get("DataNodes", []):
                    url = node.get("Url", "")
                    native_max = node.get("Max", 0)
                    configured = node_limits.get(url, 9999)
                    effective_max = min(native_max, configured) if native_max > 0 else configured
                    current_counts[url] = (node.get("Volumes", 0), effective_max)
        for url, (vols, max_v) in current_counts.items():
            if vols >= max_v:
                return {"error": f"Volume limit reached on {url} ({vols}/{max_v}). Cannot grow further."}
    except Exception:
        logger.error("volume_limit_check_failed", exc_info=True)
    params = {
          "count": count,
          "replication": body.get("replication", "001"),
          "dataCenter": body.get("dataCenter", ""),
          "rack": body.get("rack", ""),
          "collection": body.get("collection", ""),
      }
    query = "&".join(f"{k}={v}" for k, v in params.items() if v)
    try:
        resp = await client.master_get(f"/vol/grow?{query}")
        return resp.json()
    except Exception:
        logger.error("volume_grow_failed", exc_info=True)
        return {"error": "grow failed"}


@router.post("/vacuum")
@limiter.limit("3/minute")
async def vacuum_volumes(request: Request, body: dict, _: bool = Depends(require_permission("volumes:write"))):
    client = get_seaweed_client()
    threshold = body.get("garbageThreshold", 0.3)
    try:
        resp = await client.master_get(f"/vol/vacuum?garbageThreshold={threshold}")
        return resp.json()
    except Exception:
        logger.error("volume_vacuum_failed", exc_info=True)
        return {"error": "vacuum failed"}
