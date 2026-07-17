import json
import hashlib
import os
import asyncio
from datetime import datetime, timezone, timedelta
from typing import Optional

import httpx

from app.logging_config import get_logger
from app.services.ai_embedding_store import get_vector_store, reset_vector_store

logger = get_logger("ai_embedding")

EMBEDDING_DIM = 1536
WIKI_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))), "wiki")
INDEX_INTERVAL_HOURS = 6

_index_task: Optional[asyncio.Task] = None


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


def _chunk_text(text: str, max_chars: int = 800) -> list[str]:
    paragraphs = text.split("\n\n")
    chunks = []
    current = ""
    for p in paragraphs:
        p = p.strip()
        if not p:
            continue
        if len(current) + len(p) > max_chars and current:
            chunks.append(current.strip())
            current = p
        else:
            current = (current + "\n\n" + p).strip() if current else p
    if current:
        chunks.append(current.strip())
    return chunks


def _cosine_similarity(vec_a: list[float], vec_b: list[float]) -> float:
    dot = sum(a * b for a, b in zip(vec_a, vec_b))
    norm_a = sum(a * a for a in vec_a) ** 0.5
    norm_b = sum(b * b for b in vec_b) ** 0.5
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


async def _get_cluster_snapshot() -> str:
    try:
        from app.services.seaweed_client import get_seaweed_client
        client = get_seaweed_client()
        resp = await client.master_get("/dir/status")
        topo = resp.json().get("Topology", {})
        nodes = []
        for dc in topo.get("DataCenters", []):
            for rack in dc.get("Racks", []):
                for dn in rack.get("DataNodes", []):
                    nodes.append(f"{dn.get('Url','?')}: {dn.get('Volumes',0)}/{dn.get('Max',0)} vols")
        return f"Cluster at {datetime.now(timezone.utc).isoformat()}: {len(nodes)} nodes, {topo.get('Free','?')} free slots. " + "; ".join(nodes[:5])
    except Exception:
        return f"Snapshot at {datetime.now(timezone.utc).isoformat()} (cluster unavailable)"


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
    store = await get_vector_store()
    indexed = 0
    now = datetime.now(timezone.utc).isoformat()
    snapshot = await _get_cluster_snapshot()

    for i, chunk in enumerate(texts):
        content_hash = hashlib.sha256(chunk.encode()).hexdigest()
        if await store.exists(content_hash):
            continue

        embedding = await embed_text(chunk)
        if not embedding:
            continue

        ok = await store.upsert(content_hash, chunk, embedding, source, i, now, snapshot)
        if ok:
            indexed += 1

    logger.info("indexed_documents", source=source, indexed=indexed, total_chunks=len(texts))
    return indexed


async def index_wiki_files() -> dict:
    if not os.path.isdir(WIKI_DIR):
        return {"ok": False, "error": f"Wiki directory not found: {WIKI_DIR}", "indexed": 0, "total": 0}

    total_chunks = 0
    indexed = 0
    files = []
    for root, _, filenames in os.walk(WIKI_DIR):
        for fn in filenames:
            if fn.endswith(".md") or fn.endswith(".html"):
                files.append(os.path.join(root, fn))

    for fpath in sorted(files):
        fn = os.path.basename(fpath)
        try:
            with open(fpath) as f:
                content = f.read()
        except Exception:
            continue

        rel = os.path.relpath(fpath, WIKI_DIR)
        if fn.endswith(".html"):
            from html.parser import HTMLParser
            class TextExtractor(HTMLParser):
                def __init__(self):
                    super().__init__()
                    self.text = []
                def handle_data(self, data):
                    self.text.append(data.strip())
            extractor = TextExtractor()
            extractor.feed(content)
            content = "\n".join(t for t in extractor.text if t)

        if not content.strip():
            continue

        chunks = _chunk_text(content)
        total_chunks += len(chunks)
        idx = await index_documents(chunks, rel)
        indexed += idx

    await _cleanup_orphans(files)
    return {"ok": True, "total_chunks": total_chunks, "indexed": indexed, "files": len(files)}


async def _cleanup_orphans(current_files: list[str]) -> int:
    store = await get_vector_store()
    current_rel = set(os.path.relpath(f, WIKI_DIR) for f in current_files)

    sources = await store.get_distinct_sources()
    removed = 0
    for source in sources:
        if source and source not in current_rel:
            await store.delete_by_source(source)
            removed += 1

    await store.delete_older_than(90)

    if removed:
        logger.info("cleaned_orphan_embeddings", removed=removed)
    return removed


async def search_similar(query: str, top_k: int = 5) -> tuple[str, list[dict]]:
    store = await get_vector_store()
    rows = await store.fetch_all()

    if not rows:
        return "", []

    query_embedding = await embed_text(query)
    if not query_embedding:
        chunks = [r["chunk_text"] for r in rows[:top_k]]
        sources = list(set(r["source"] for r in rows[:top_k] if r["source"]))
        citations = [{"source": s, "snippet": ""} for s in sources]
        return "Relevant documentation:\n" + "\n---\n".join(chunks) + ("\n\nSources: " + ", ".join(sources) if sources else ""), citations

    scored = []
    for row in rows:
        emb = row["embedding"]
        if not emb:
            continue
        sim = _cosine_similarity(query_embedding, emb)
        scored.append((sim, row["chunk_text"], row["source"], row.get("cluster_snapshot", "")))

    scored.sort(key=lambda x: x[0], reverse=True)
    results = []
    citations = []
    seen_sources = set()
    for i, (sim, chunk, src, snapshot) in enumerate(scored[:top_k]):
        results.append(chunk)
        if src and src not in seen_sources:
            citations.append({"index": i + 1, "source": src, "snippet": chunk[:120]})
            seen_sources.add(src)

    context = "Relevant documentation:\n" + "\n---\n".join(results)
    if citations:
        src_list = [f"[{c['index']}] {c['source']}" for c in citations]
        context += "\n\nSources: " + ", ".join(src_list)
    return context, citations


async def embedding_stats() -> dict:
    store = await get_vector_store()
    stats = await store.stats()
    stats["dimension"] = EMBEDDING_DIM
    return stats


async def start_index_scheduler():
    global _index_task
    if _index_task and not _index_task.done():
        return

    async def _loop():
        while True:
            try:
                from app.services.chatbot_service import _get_setting
                enabled = await _get_setting("ai_enabled", "false") == "true"
                if enabled:
                    logger.info("auto_index_start")
                    result = await index_wiki_files()
                    logger.info("auto_index_done", result=result)
                else:
                    logger.info("auto_index_skipped", reason="ai_disabled")
            except Exception:
                logger.error("auto_index_failed", exc_info=True)
            await asyncio.sleep(INDEX_INTERVAL_HOURS * 3600)

    _index_task = asyncio.create_task(_loop())
    logger.info("index_scheduler_started", interval_hours=INDEX_INTERVAL_HOURS)


async def stop_index_scheduler():
    global _index_task
    if _index_task and not _index_task.done():
        _index_task.cancel()
        try:
            await _index_task
        except asyncio.CancelledError:
            pass
        _index_task = None
    await reset_vector_store()
