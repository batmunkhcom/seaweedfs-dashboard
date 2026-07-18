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
    try:
        from app.services.ai_embedding import start_index_scheduler
        await start_index_scheduler()
    except Exception:
        logger.warning("index_scheduler_start_failed", exc_info=True)
    from app.services.disk_health import start_disk_health
    await start_disk_health()
    from app.services.metrics_service import start_metrics_service
    await start_metrics_service()
    from app.services.webhook_service import start_webhook_service
    await start_webhook_service()
    yield
    logger.info("shutdown")
    from app.services.webhook_service import stop_webhook_service
    await stop_webhook_service()
    from app.services.metrics_service import stop_metrics_service
    await stop_metrics_service()
    from app.services.disk_health import stop_disk_health
    await stop_disk_health()
    await shutdown_seaweed_client()
    try:
        from app.services.ai_embedding import stop_index_scheduler
        await stop_index_scheduler()
    except Exception:
        pass
    await shutdown_database()


app = FastAPI(title="SeaweedFS Dashboard", version="0.1.0", lifespan=lifespan)

app.state.limiter = limiter
app.add_exception_handler(429, _rate_limit_exceeded_handler)

app.add_middleware(SlowAPIMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?|https?://10\.10\.0\.80(:\d+)?|https://seaweed\.mbm\.mn",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-CSRF-Token", "X-API-Key", "Accept", "X-Requested-With"],
)
app.add_middleware(CsrfMiddleware)
app.add_middleware(AuthMiddleware)
app.add_middleware(SessionMiddleware, secret_key=settings.session_secret, https_only=False)

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
from app.routes.users import router as users_router
from app.routes.info import router as info_router
from app.routes.api_keys import router as api_keys_router
from app.routes.chatbot import router as chatbot_router
from app.routes.tools import router as tools_router
from app.routes.webhooks import router as webhooks_router
from app.routes.logs import router as logs_router
from app.routes.gateways import router as gateways_router
from app.routes.nfs import router as nfs_router
from app.routes.lifecycle import router as lifecycle_router
from app.routes.acl import router as acl_router
from app.routes.tiers import router as tiers_router
from app.routes.hardening import router as hardening_router
from app.routes.feedback import router as feedback_router

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
app.include_router(users_router, prefix="/api")
app.include_router(info_router, prefix="/api")
app.include_router(api_keys_router, prefix="/api")
app.include_router(chatbot_router, prefix="/api")
app.include_router(tools_router, prefix="/api")
app.include_router(webhooks_router, prefix="/api")
app.include_router(logs_router, prefix="/api")
app.include_router(gateways_router, prefix="/api")
app.include_router(nfs_router, prefix="/api")
app.include_router(lifecycle_router, prefix="/api")
app.include_router(acl_router, prefix="/api")
app.include_router(tiers_router, prefix="/api")
app.include_router(hardening_router, prefix="/api")
app.include_router(feedback_router, prefix="/api")


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
