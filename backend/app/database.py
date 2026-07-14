import aiosqlite
import os
from structlog.stdlib import BoundLogger

from app.config import settings
from app.logging_config import get_logger

_db: aiosqlite.Connection | None = None


async def get_db() -> aiosqlite.Connection:
    global _db
    if _db is None:
        raise RuntimeError("Database not initialized")
    return _db


async def setup_database():
    global _db
    logger: BoundLogger = get_logger("database")

    db_path = settings.database_url.replace("sqlite:///", "")
    os.makedirs(os.path.dirname(db_path) if os.path.dirname(db_path) else "data", exist_ok=True)

    _db = await aiosqlite.connect(db_path)
    _db.row_factory = aiosqlite.Row
    await _db.execute("PRAGMA journal_mode=WAL")
    await _db.execute("PRAGMA foreign_keys=ON")

    await _run_migrations(_db, logger)
    logger.info("database_ready", path=db_path)


async def _run_migrations(db: aiosqlite.Connection, logger: BoundLogger):
    await db.execute(
        """
        CREATE TABLE IF NOT EXISTS _migrations (
            name TEXT PRIMARY KEY,
            applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )

    migrations_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "migrations")
    if not os.path.isdir(migrations_dir):
        return

    for fname in sorted(os.listdir(migrations_dir)):
        if not fname.endswith(".sql"):
            continue
        cursor = await db.execute("SELECT 1 FROM _migrations WHERE name = ?", (fname,))
        if await cursor.fetchone():
            continue

        path = os.path.join(migrations_dir, fname)
        with open(path) as f:
            sql = f.read()

        await db.executescript(sql)
        await db.execute("INSERT INTO _migrations (name) VALUES (?)", (fname,))
        await db.commit()
        logger.info("migration_applied", name=fname)


async def shutdown_database():
    global _db
    if _db:
        await _db.close()
        _db = None
