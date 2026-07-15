from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.middleware import SlowAPIMiddleware

from app.config import settings
from app.logging_config import setup_logging, get_logger
from app.database import setup_database, shutdown_database, get_db
from app.services.seaweed_client import startup_seaweed_client, shutdown_seaweed_client
from app.middleware.rate_limit import limiter
from app.middleware.csrf_middleware import CsrfMiddleware
from app.middleware.auth_middleware import AuthMiddleware
from app.settings_service import load_runtime_settings

setup_logging()
logger = get_logger("main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("startup")
    await setup_database()
    await load_runtime_settings()
    await startup_seaweed_client()
    yield
    logger.info("shutdown")
    await shutdown_seaweed_client()
    await shutdown_database()


app = FastAPI(title="SeaweedFS Dashboard", version="0.1.0", lifespan=lifespan)

app.state.limiter = limiter
app.add_exception_handler(429, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1|10\.10\.\d+\.\d+|seaweed\.mbm\.mn)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(SessionMiddleware, secret_key=settings.session_secret, https_only=False)
app.add_middleware(AuthMiddleware)
app.add_middleware(CsrfMiddleware)

from app.routes.auth import router as auth_router
from app.routes.dashboard import router as dashboard_router
from app.routes.cluster import router as cluster_router
from app.routes.volumes import router as volumes_router
from app.routes.collections import router as collections_router
from app.routes.filer import router as filer_router
from app.routes.s3 import router as s3_router
from app.routes.backup import router as backup_router
from app.routes.workers import router as workers_router
from app.routes.disk_health import router as disk_health_router
from app.routes.metrics import router as metrics_router
from app.routes.settings import router as settings_router

app.include_router(auth_router, prefix="/api")
app.include_router(dashboard_router, prefix="/api")
app.include_router(cluster_router, prefix="/api")
app.include_router(volumes_router, prefix="/api")
app.include_router(collections_router, prefix="/api")
app.include_router(filer_router, prefix="/api")
app.include_router(s3_router, prefix="/api")
app.include_router(backup_router, prefix="/api")
app.include_router(workers_router, prefix="/api")
app.include_router(disk_health_router, prefix="/api")
app.include_router(metrics_router, prefix="/api")
app.include_router(settings_router, prefix="/api")


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
