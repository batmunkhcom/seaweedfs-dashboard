import json
import asyncio
import httpx
from typing import AsyncGenerator

from app.config import settings as app_settings
from app.database import get_db
from app.logging_config import get_logger
from app.services.seaweed_client import get_seaweed_client

logger = get_logger("chatbot")

_runtime_cache: dict[str, str] = {}


async def _load_settings():
    global _runtime_cache
    if _runtime_cache:
        return
    db = await get_db()
    cursor = await db.execute("SELECT key, value FROM runtime_settings")
    rows = await cursor.fetchall()
    _runtime_cache = {r[0]: r[1] for r in rows}


async def _get_setting(key: str, default: str = "") -> str:
    await _load_settings()
    return _runtime_cache.get(key, default)


async def _get_setting_int(key: str, default: int = 0) -> int:
    try:
        return int(await _get_setting(key, str(default)))
    except (ValueError, TypeError):
        return default


async def _get_setting_float(key: str, default: float = 0.0) -> float:
    try:
        return float(await _get_setting(key, str(default)))
    except (ValueError, TypeError):
        return default


async def is_ai_enabled() -> bool:
    return await _get_setting("ai_enabled", "false") == "true"


async def _build_context() -> str:
    lines = ["Current SeaweedFS cluster state:"]
    client = get_seaweed_client()
    try:
        resp = await client.master_get("/dir/status")
        topo = resp.json().get("Topology", {})
        lines.append(f"- Cluster: max={topo.get('Max', '?')} free={topo.get('Free', '?')} slots")

        for dc in topo.get("DataCenters", []):
            for rack in dc.get("Racks", []):
                nodes = rack.get("DataNodes", [])
                lines.append(f"- Datacenter {dc.get('Id')}, Rack {rack.get('Id')}: {len(nodes)} nodes")
                for dn in nodes:
                    url = dn.get("Url", "?").replace(":8080", "")
                    vols = dn.get("Volumes", 0)
                    vids = dn.get("VolumeIds", "").strip()
                    lines.append(f"  Node {url}: {vols} vols (max {dn.get('Max', '?')}), ids={vids}")
    except Exception:
        logger.warning("context_build_failed", exc_info=True)
        lines.append("- (cluster data unavailable)")

    try:
        resp = await client.master_get("/vol/status")
        data = resp.json()
        volumes = []
        for dc_v in data.get("Volumes", {}).get("DataCenters", {}).values():
            for rack_v in dc_v.values():
                for node_v, vol_list in rack_v.items():
                    for vol in vol_list:
                        volumes.append(vol)
        lines.append(f"- Total volumes: {len(volumes)}")
        readonly = [v["Id"] for v in volumes if v.get("ReadOnly")]
        if readonly:
            lines.append(f"- Read-only volumes: {readonly}")
        garbage_vols = [(v["Id"], v.get("DeletedByteCount", 0)) for v in volumes if v.get("DeletedByteCount", 0) > 0]
        if garbage_vols:
            lines.append(f"- Volumes with garbage: {[(v[0], v[1]) for v in garbage_vols[:5]]}")
    except Exception:
        pass

    try:
        resp = await client.master_get("/cluster/status")
        cs = resp.json()
        lines.append(f"- Raft leader: {cs.get('Leader', '?')}")
        lines.append(f"- Max Volume ID: {cs.get('MaxVolumeId', '?')}")
    except Exception:
        pass

    return "\n".join(lines)


async def chat_stream(prompt: str, history: list[dict]) -> AsyncGenerator[str, None]:
    provider = await _get_setting("ai_provider", "openai")
    api_base = (await _get_setting("ai_api_base_url", "https://api.openai.com/v1")).rstrip("/")
    api_key = await _get_setting("ai_api_key", "")
    model = await _get_setting("ai_model", "gpt-4o-mini")
    max_tokens = await _get_setting_int("ai_max_tokens", 4096)
    temperature = await _get_setting_float("ai_temperature", 0.7)
    system_prompt = await _get_setting("ai_system_prompt", "You are a helpful AI assistant for a SeaweedFS cluster.")

    context = await _build_context()
    full_system = f"{system_prompt}\n\n{context}"

    messages = [{"role": "system", "content": full_system}]
    for msg in history[-20:]:
        messages.append(msg)
    messages.append({"role": "user", "content": prompt})

    if provider == "ollama":
        url = f"{api_base}/api/chat"
        payload = {
            "model": model,
            "messages": messages,
            "stream": True,
            "options": {"temperature": temperature, "num_predict": max_tokens},
        }
    else:
        url = f"{api_base}/chat/completions"
        payload = {
            "model": model,
            "messages": messages,
            "stream": True,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }

    headers = {"Content-Type": "application/json"}
    if api_key and provider != "ollama":
        headers["Authorization"] = f"Bearer {api_key}"

    async with httpx.AsyncClient(timeout=120) as http_client:
        try:
            async with http_client.stream("POST", url, json=payload, headers=headers) as resp:
                if resp.status_code != 200:
                    body = await resp.aread()
                    yield f"data: [ERROR] API returned {resp.status_code}: {body[:200]}\n\n"
                    return

                async for line in resp.aiter_lines():
                    if not line or not line.startswith("data: "):
                        continue
                    data = line[6:]
                    if data == "[DONE]":
                        yield "data: [DONE]\n\n"
                        return
                    try:
                        chunk = json.loads(data)
                        if provider == "ollama":
                            content = chunk.get("message", {}).get("content", "")
                            if content:
                                yield f"data: {json.dumps({'content': content})}\n\n"
                        else:
                            delta = chunk.get("choices", [{}])[0].get("delta", {})
                            content = delta.get("content", "")
                            if content:
                                yield f"data: {json.dumps({'content': content})}\n\n"
                    except json.JSONDecodeError:
                        pass
        except Exception as e:
            logger.error("chat_stream_failed", exc_info=True)
            yield f"data: [ERROR] {str(e)[:200]}\n\n"
