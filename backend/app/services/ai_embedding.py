import json
import hashlib
import sqlite3
from typing import Optional

import httpx

from app.database import get_db
from app.logging_config import get_logger

logger = get_logger("ai_embedding")

EMBEDDING_DIM = 1536


async def _get_provider_config():
    from app.services.chatbot_service import _get_setting
    chat_provider = await _get_setting("ai_provider", "openai")
    chat_api_base = (await _get_setting("ai_api_base_url", "https://api.openai.com/v1")).rstrip("/")
    chat_api_key = await _get_setting("ai_api_key", "")

    emb_provider = await _get_setting("ai_embedding_provider", "same")
    if emb_provider == "same":
        emb_provider = chat_provider
    emb_api_base = (await _get_setting("ai_embedding_api_base_url", "")).rstrip("/")
    if not emb_api_base:
        emb_api_base = chat_api_base
    emb_api_key = await _get_setting("ai_embedding_api_key", "")
    if not emb_api_key:
        emb_api_key = chat_api_key
    emb_model = await _get_setting("ai_embedding_model", "text-embedding-3-small")

    return emb_provider, emb_api_base, emb_api_key, emb_model


async def _ensure_table():
    db = await get_db()
    await db.execute(
        """
        CREATE TABLE IF NOT EXISTS ai_embeddings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            content_hash TEXT UNIQUE NOT NULL,
            chunk_text TEXT NOT NULL,
            embedding BLOB NOT NULL,
            source TEXT,
            created_at TEXT NOT NULL
        )
        """
    )
    await db.execute("CREATE INDEX IF NOT EXISTS idx_ai_embeddings_hash ON ai_embeddings(content_hash)")
    await db.commit()


def _cosine_similarity(vec_a: list[float], vec_b: list[float]) -> float:
    dot = sum(a * b for a, b in zip(vec_a, vec_b))
    norm_a = sum(a * a for a in vec_a) ** 0.5
    norm_b = sum(b * b for b in vec_b) ** 0.5
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


async def embed_text(text: str) -> Optional[list[float]]:
    provider, api_base, api_key, model = await _get_provider_config()
    if not api_key and provider != "ollama":
        return None

    try:
        if provider == "ollama":
            url = f"{api_base}/api/embeddings"
            payload = {"model": model, "prompt": text}
            headers = {"Content-Type": "application/json"}
        else:
            url = f"{api_base}/embeddings"
            payload = {"model": model, "input": text}
            headers = {"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"}

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(url, json=payload, headers=headers)
            resp.raise_for_status()
            data = resp.json()

        if provider == "ollama":
            return data.get("embedding")
        else:
            return data.get("data", [{}])[0].get("embedding")
    except Exception:
        logger.error("embed_failed", exc_info=True)
        return None


async def index_documents(texts: list[str], source: str = "unknown") -> int:
    await _ensure_table()
    db = await get_db()
    indexed = 0
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()

    for chunk in texts:
        content_hash = hashlib.sha256(chunk.encode()).hexdigest()
        cursor = await db.execute("SELECT 1 FROM ai_embeddings WHERE content_hash=?", (content_hash,))
        if await cursor.fetchone():
            continue

        embedding = await embed_text(chunk)
        if not embedding:
            continue

        emb_bytes = json.dumps(embedding).encode()
        try:
            await db.execute(
                "INSERT INTO ai_embeddings (content_hash, chunk_text, embedding, source, created_at) VALUES (?, ?, ?, ?, ?)",
                (content_hash, chunk, emb_bytes, source, now),
            )
            indexed += 1
        except Exception:
            pass

    await db.commit()
    return indexed


async def search_similar(query: str, top_k: int = 5) -> list[str]:
    await _ensure_table()
    db = await get_db()
    cursor = await db.execute("SELECT content_hash, chunk_text, embedding FROM ai_embeddings")
    rows = await cursor.fetchall()

    if not rows:
        return []

    query_embedding = await embed_text(query)
    if not query_embedding:
        return [r[1] for r in rows[:top_k]]

    scored = []
    for row in rows:
        try:
            emb = json.loads(row[2].decode())
            sim = _cosine_similarity(query_embedding, emb)
            scored.append((sim, row[1]))
        except Exception:
            continue

    scored.sort(key=lambda x: x[0], reverse=True)
    return [chunk for _, chunk in scored[:top_k]]


async def embedding_stats() -> dict:
    await _ensure_table()
    db = await get_db()
    cursor = await db.execute("SELECT COUNT(*), SUM(LENGTH(embedding)) FROM ai_embeddings")
    row = await cursor.fetchone()
    return {
        "total_chunks": row[0] or 0,
        "total_bytes": row[1] or 0,
        "dimension": EMBEDDING_DIM,
    }
