from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from app.config import settings
from app.logging_config import setup_logging, get_logger
from app.database import setup_database, shutdown_database, get_db
from app.services.seaweed_client import startup_seaweed_client, shutdown_seaweed_client
from app.middleware.rate_limit import limiter
from app.middleware.csrf_middleware import CsrfMiddleware
from slowapi import _rate_limit_exceeded_handler

setup_logging()
logger = get_logger("main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("startup")
    await setup_database()
    await startup_seaweed_client()
    yield
    logger.info("shutdown")
    await shutdown_seaweed_client()
    await shutdown_database()


app = FastAPI(title="SeaweedFS Dashboard", version="0.1.0", lifespan=lifespan)

app.state.limiter = limiter
app.add_exception_handler(429, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(SessionMiddleware, secret_key=settings.session_secret)
app.add_middleware(CsrfMiddleware)


@app.get("/api/health")
async def health():
    db_ok = False
    try:
        db = await get_db()
        await db.execute("SELECT 1")
        db_ok = True
    except Exception:
        pass

    components = []
    try:
        db = await get_db()
        cursor = await db.execute("SELECT name, last_heartbeat, ttl_seconds FROM services_health")
        rows = await cursor.fetchall()
        for row in rows:
            components.append(dict(row))
    except Exception:
        pass

    return {"status": "healthy" if db_ok else "degraded", "database": db_ok, "components": components}
