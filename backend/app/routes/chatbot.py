from fastapi import APIRouter, Request, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import httpx
import json

from app.logging_config import get_logger
from app.services.chatbot_service import chat_stream, is_ai_enabled, _get_setting
from app.middleware.auth_middleware import require_admin
from app.middleware.rate_limit import limiter

router = APIRouter(prefix="/chatbot", tags=["chatbot"])
logger = get_logger("chatbot_routes")


class ChatRequest(BaseModel):
    prompt: str
    history: list[dict] = []


class TestConnectionRequest(BaseModel):
    provider: str
    api_base_url: str
    api_key: str = ""


@router.post("/test-connection")
@limiter.limit("5/minute")
async def test_connection(request: Request, body: TestConnectionRequest, _: bool = Depends(require_admin)):
    api_base = body.api_base_url.rstrip("/")
    api_key = body.api_key

    try:
        if body.provider == "ollama":
            url = f"{api_base}/api/tags"
            headers = {}
        else:
            url = f"{api_base}/models"
            headers = {"Authorization": f"Bearer {api_key}"}

        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(url, headers=headers)
            if resp.status_code != 200:
                return {"ok": False, "error": f"API returned {resp.status_code}", "models": []}

            data = resp.json()

        models = []
        if body.provider == "ollama":
            for m in data.get("models", []):
                models.append({"id": m.get("name", ""), "name": m.get("name", "")})
        else:
            for m in data.get("data", []):
                models.append({"id": m.get("id", ""), "name": m.get("id", "")})

        return {"ok": True, "models": models[:50]}
    except Exception as e:
        logger.error("test_connection_failed", exc_info=True)
        return {"ok": False, "error": str(e)[:200], "models": []}


@router.get("/stats")
async def ai_stats():
    from app.services.ai_embedding import embedding_stats
    emb_stats = await embedding_stats()

    from app.database import get_db
    db = await get_db()
    cursor = await db.execute(
        "SELECT COUNT(*), COALESCE(SUM(CASE WHEN status='success' THEN 1 ELSE 0 END),0), "
        "COALESCE(SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END),0) "
        "FROM worker_jobs WHERE type='ai_query'"
    )
    row = await cursor.fetchone()

    return {
        "enabled": await is_ai_enabled(),
        "provider": await _get_setting("ai_provider", "openai"),
        "model": await _get_setting("ai_model", "?"),
        "total_queries": row[0] or 0,
        "successful": row[1] or 0,
        "failed": row[2] or 0,
        "embeddings": emb_stats,
    }


@router.post("/chat")
@limiter.limit("30/minute")
async def chat(request: Request, body: ChatRequest, _: bool = Depends(require_admin)):
    if not await is_ai_enabled():
        from fastapi.responses import JSONResponse
        return JSONResponse({"error": "AI features are disabled"}, status_code=403)
    return StreamingResponse(
        chat_stream(body.prompt, body.history),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )


@router.get("/status")
async def chatbot_status():
    return {"enabled": await is_ai_enabled()}


@router.post("/embedding/index")
@limiter.limit("2/minute")
async def trigger_indexing(request: Request, _: bool = Depends(require_admin)):
    if not await is_ai_enabled():
        return {"ok": False, "error": "AI features are disabled"}
    from app.services.ai_embedding import index_wiki_files
    result = await index_wiki_files()
    return result
