from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware

from app.core.config import settings

from app.db.database import connect_db, close_db
from app.db.indexes import ensure_indexes
from app.db.database import get_db
from app.routers import (
    audit_logs,
    auth,
    cameras,
    clips,
    dataset,
    detection,
    detection_control,
    devices,
    edge,
    edge_cameras,
    edge_devices,
    edge_proxy,
    inference_test,
    events,
    integrations,
    live_stream,
    logs,
    mobile,
    models,
    notifications,
    reports,
    roboflow,
    roboflow_test,
    storage,
    stores,
    validation,
    websockets,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await connect_db()
    await ensure_indexes(get_db())
    from app.utils.s3_utils import ensure_bucket
    try:
        await ensure_bucket()
    except Exception:
        pass
    from app.routers.websockets import start_redis_subscriber, stop_redis_subscriber
    await start_redis_subscriber()
    yield
    # Shutdown
    await stop_redis_subscriber()
    await close_db()


def create_app() -> FastAPI:
    application = FastAPI(
        title="FloorEye v2.0 API",
        description="Enterprise AI Wet Floor & Spill Detection Platform",
        version="3.1.0",
        docs_url="/api/v1/docs",
        openapi_url="/api/v1/openapi.json",
        lifespan=lifespan,
    )

    # Rate limiting
    from app.middleware.rate_limiter import RateLimitMiddleware
    application.add_middleware(RateLimitMiddleware)

    # CORS
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins_list,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )

    # Trusted hosts (production)
    if settings.ENVIRONMENT == "production":
        application.add_middleware(
            TrustedHostMiddleware,
            allowed_hosts=[settings.SUBDOMAIN, settings.DOMAIN, f"*.{settings.DOMAIN}", "localhost", "backend"],
        )

    @application.get("/api/v1/health", tags=["health"])
    async def health_check():
        checks = {"mongodb": "error", "redis": "error"}
        try:
            db = get_db()
            await db.command("ping")
            checks["mongodb"] = "ok"
        except Exception:
            pass
        try:
            import redis as r
            rc = r.from_url(settings.REDIS_URL, socket_connect_timeout=2)
            rc.ping()
            checks["redis"] = "ok"
            rc.close()
        except Exception:
            pass
        all_ok = all(v == "ok" for v in checks.values())
        return {
            "status": "healthy" if all_ok else "degraded",
            "version": "3.1.0",
            "environment": settings.ENVIRONMENT,
            "checks": checks,
        }

    # Register all routers
    application.include_router(auth.router)
    application.include_router(stores.router)
    application.include_router(cameras.router)
    application.include_router(detection.router)
    application.include_router(detection_control.router)
    application.include_router(live_stream.router)
    application.include_router(clips.router)
    application.include_router(dataset.router)
    application.include_router(roboflow.router)
    application.include_router(roboflow_test.router)
    application.include_router(inference_test.router)
    application.include_router(models.router)
    application.include_router(edge.router)
    application.include_router(edge_cameras.router)
    application.include_router(edge_devices.router)
    application.include_router(edge_proxy.router)
    application.include_router(integrations.router)
    application.include_router(mobile.router)
    application.include_router(events.router)
    application.include_router(notifications.router)
    application.include_router(audit_logs.router)
    application.include_router(devices.router)
    application.include_router(logs.router)
    application.include_router(storage.router)
    application.include_router(reports.router)
    application.include_router(validation.router)
    application.include_router(websockets.router)

    return application


app = create_app()
