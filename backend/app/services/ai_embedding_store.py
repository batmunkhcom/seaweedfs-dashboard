from abc import ABC, abstractmethod
from typing import Optional
import json

from app.logging_config import get_logger

logger = get_logger("ai_embedding_store")


class BaseVectorStore(ABC):
    @abstractmethod
    async def ensure_table(self): ...

    @abstractmethod
    async def upsert(self, content_hash: str, chunk_text: str, embedding: list[float],
                     source: str, chunk_index: int, created_at: str,
                     cluster_snapshot: str) -> bool: ...

    @abstractmethod
    async def exists(self, content_hash: str) -> bool: ...

    @abstractmethod
    async def fetch_all(self) -> list[dict]: ...

    @abstractmethod
    async def delete_by_source(self, source: str): ...

    @abstractmethod
    async def delete_older_than(self, age_days: int): ...

    @abstractmethod
    async def get_distinct_sources(self) -> list[str]: ...

    @abstractmethod
    async def stats(self) -> dict: ...

    @abstractmethod
    async def close(self): ...


class SqliteVectorStore(BaseVectorStore):
    async def ensure_table(self):
        from app.database import get_db
        db = await get_db()
        await db.execute(
            """CREATE TABLE IF NOT EXISTS ai_embeddings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                content_hash TEXT UNIQUE NOT NULL,
                chunk_text TEXT NOT NULL,
                embedding BLOB NOT NULL,
                source TEXT,
                chunk_index INTEGER DEFAULT 0,
                created_at TEXT NOT NULL,
                cluster_snapshot TEXT)"""
        )
        await db.execute("CREATE INDEX IF NOT EXISTS idx_ai_embeddings_hash ON ai_embeddings(content_hash)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_ai_embeddings_source ON ai_embeddings(source)")
        await db.commit()

    async def upsert(self, content_hash: str, chunk_text: str, embedding: list[float],
                     source: str, chunk_index: int, created_at: str,
                     cluster_snapshot: str) -> bool:
        from app.database import get_db
        db = await get_db()
        emb_bytes = json.dumps(embedding).encode()
        try:
            await db.execute(
                "INSERT INTO ai_embeddings (content_hash, chunk_text, embedding, source, chunk_index, created_at, cluster_snapshot) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (content_hash, chunk_text, emb_bytes, source, chunk_index, created_at, cluster_snapshot))
            await db.commit()
            return True
        except Exception:
            return False

    async def exists(self, content_hash: str) -> bool:
        from app.database import get_db
        db = await get_db()
        cursor = await db.execute("SELECT 1 FROM ai_embeddings WHERE content_hash=?", (content_hash,))
        return await cursor.fetchone() is not None

    async def fetch_all(self) -> list[dict]:
        from app.database import get_db
        db = await get_db()
        cursor = await db.execute(
            "SELECT content_hash, chunk_text, embedding, source, chunk_index, cluster_snapshot FROM ai_embeddings ORDER BY created_at DESC")
        rows = await cursor.fetchall()
        results = []
        for r in rows:
            try:
                emb = json.loads(r[2].decode())
            except Exception:
                emb = []
            results.append({"content_hash": r[0], "chunk_text": r[1], "embedding": emb,
                            "source": r[3], "chunk_index": r[4], "cluster_snapshot": r[5]})
        return results

    async def delete_by_source(self, source: str):
        from app.database import get_db
        db = await get_db()
        await db.execute("DELETE FROM ai_embeddings WHERE source=?", (source,))
        await db.commit()

    async def delete_older_than(self, age_days: int):
        from app.database import get_db
        from datetime import datetime, timezone, timedelta
        db = await get_db()
        await db.execute("DELETE FROM ai_embeddings WHERE created_at < ?",
                         ((datetime.now(timezone.utc) - timedelta(days=age_days)).isoformat(),))
        await db.commit()

    async def get_distinct_sources(self) -> list[str]:
        from app.database import get_db
        db = await get_db()
        cursor = await db.execute("SELECT DISTINCT source FROM ai_embeddings")
        rows = await cursor.fetchall()
        return [r[0] for r in rows if r[0]]

    async def stats(self) -> dict:
        from app.database import get_db
        db = await get_db()
        cursor = await db.execute("SELECT COUNT(*), SUM(LENGTH(embedding)), COUNT(DISTINCT source) FROM ai_embeddings")
        row = await cursor.fetchone()
        cursor = await db.execute("SELECT MAX(created_at) FROM ai_embeddings")
        last_row = await cursor.fetchone()
        return {"total_chunks": row[0] or 0, "total_bytes": row[1] or 0,
                "sources": row[2] or 0, "last_indexed_at": last_row[0] or ""}

    async def close(self):
        pass


class PgVectorStore(BaseVectorStore):
    def __init__(self, connstr: str, dimensions: int = 1536):
        self.connstr = connstr
        self.dimensions = dimensions
        self._pool = None

    async def _get_pool(self):
        if self._pool is None:
            import asyncpg
            self._pool = await asyncpg.create_pool(self.connstr, min_size=1, max_size=5)
        return self._pool

    async def ensure_table(self):
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            await conn.execute("CREATE EXTENSION IF NOT EXISTS vector")
            await conn.execute(f"""
                CREATE TABLE IF NOT EXISTS ai_embeddings (
                    id SERIAL PRIMARY KEY,
                    content_hash TEXT UNIQUE NOT NULL,
                    chunk_text TEXT NOT NULL,
                    embedding vector({self.dimensions}) NOT NULL,
                    source TEXT,
                    chunk_index INTEGER DEFAULT 0,
                    created_at TEXT NOT NULL,
                    cluster_snapshot TEXT
                )""")
            await conn.execute("CREATE INDEX IF NOT EXISTS idx_pg_embeddings_hash ON ai_embeddings(content_hash)")
            await conn.execute("CREATE INDEX IF NOT EXISTS idx_pg_embeddings_source ON ai_embeddings(source)")

    async def upsert(self, content_hash: str, chunk_text: str, embedding: list[float],
                     source: str, chunk_index: int, created_at: str,
                     cluster_snapshot: str) -> bool:
        pool = await self._get_pool()
        emb_str = "[" + ",".join(str(v) for v in embedding) + "]"
        try:
            async with pool.acquire() as conn:
                await conn.execute(
                    f"INSERT INTO ai_embeddings (content_hash, chunk_text, embedding, source, chunk_index, created_at, cluster_snapshot) VALUES ($1, $2, $3::vector({self.dimensions}), $4, $5, $6, $7)",
                    content_hash, chunk_text, emb_str, source, chunk_index, created_at, cluster_snapshot)
            return True
        except Exception:
            logger.error("pgvector_upsert_failed", exc_info=True)
            return False

    async def exists(self, content_hash: str) -> bool:
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow("SELECT 1 FROM ai_embeddings WHERE content_hash=$1", content_hash)
            return row is not None

    async def fetch_all(self) -> list[dict]:
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT content_hash, chunk_text, embedding, source, chunk_index, cluster_snapshot FROM ai_embeddings ORDER BY created_at DESC")
        results = []
        for r in rows:
            emb = list(r["embedding"]) if r["embedding"] else []
            results.append({"content_hash": r["content_hash"], "chunk_text": r["chunk_text"],
                            "embedding": emb, "source": r["source"],
                            "chunk_index": r["chunk_index"], "cluster_snapshot": r["cluster_snapshot"]})
        return results

    async def delete_by_source(self, source: str):
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            await conn.execute("DELETE FROM ai_embeddings WHERE source=$1", source)

    async def delete_older_than(self, age_days: int):
        from datetime import datetime, timezone, timedelta
        pool = await self._get_pool()
        cutoff = (datetime.now(timezone.utc) - timedelta(days=age_days)).isoformat()
        async with pool.acquire() as conn:
            await conn.execute("DELETE FROM ai_embeddings WHERE created_at < $1", cutoff)

    async def get_distinct_sources(self) -> list[str]:
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch("SELECT DISTINCT source FROM ai_embeddings")
            return [r["source"] for r in rows if r["source"]]

    async def stats(self) -> dict:
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow("SELECT COUNT(*), SUM(LENGTH(chunk_text)), COUNT(DISTINCT source) FROM ai_embeddings")
            last_row = await conn.fetchrow("SELECT MAX(created_at) FROM ai_embeddings")
            return {"total_chunks": row["count"] or 0, "total_bytes": row["sum"] or 0,
                    "sources": row["count_1"] or 0,
                    "last_indexed_at": last_row["max"] if last_row else ""}

    async def close(self):
        if self._pool:
            await self._pool.close()
            self._pool = None


_store: Optional[BaseVectorStore] = None
_store_type: Optional[str] = None


async def get_vector_store() -> BaseVectorStore:
    global _store, _store_type

    from app.services.chatbot_service import _get_setting
    store_type = await _get_setting("ai_embedding_store", "sqlite")

    if _store is not None and _store_type == store_type:
        return _store

    if _store is not None and _store_type != store_type:
        logger.info("vector_store_type_changed", from_=f"{_store_type}", to=f"{store_type}")
        await _store.close()
        _store = None

    if store_type == "pgvector":
        connstr = await _get_setting("ai_pgvector_connstr", "")
        if not connstr:
            logger.warning("pgvector_connstr_empty_falling_back_to_sqlite")
            _store = SqliteVectorStore()
            _store_type = "sqlite"
            return _store

        try:
            import asyncpg  # noqa: F401
        except ImportError:
            logger.warning("asyncpg_not_installed_falling_back_to_sqlite")
            _store = SqliteVectorStore()
            _store_type = "sqlite"
            return _store

        dimensions_raw = await _get_setting("ai_embedding_dimensions", "1536")
        try:
            dimensions = int(dimensions_raw)
        except ValueError:
            dimensions = 1536
        _store = PgVectorStore(connstr, dimensions)
        _store_type = "pgvector"
        logger.info("using_pgvector", dimensions=dimensions)
    else:
        _store = SqliteVectorStore()
        _store_type = "sqlite"
        logger.info("using_sqlite_vector")

    await _store.ensure_table()
    return _store


async def reset_vector_store():
    global _store
    if _store:
        await _store.close()
    _store = None
