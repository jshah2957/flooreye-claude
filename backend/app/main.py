import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import settings


class TimeoutMiddleware(BaseHTTPMiddleware):
    """Return 504 if any request takes longer than 30 seconds."""

    async def dispatch(self, request: Request, call_next):
        try:
            return await asyncio.wait_for(call_next(request), timeout=30.0)
        except asyncio.TimeoutError:
            return JSONResponse(
                {"detail": "Request timeout"}, status_code=504
            )


from app.db.database import connect_db, close_db
from app.db.indexes import ensure_indexes
from app.db.database import get_db
from app.routers import (
    active_learning,
    annotations,
    auth,
    cameras,
    clips,
    dataset,
    detection,
    detection_control,
    devices,
    edge,
    events,
    integrations,
    live_stream,
    logs,
    mobile,
    models,
    notifications,
    roboflow,
    storage,
    stores,
    training,
    validation,
    websockets,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await connect_db()
    await ensure_indexes(get_db())
    yield
    # Shutdown
    await close_db()


def create_app() -> FastAPI:
    application = FastAPI(
        title="FloorEye v2.0 API",
        description="Enterprise AI Wet Floor & Spill Detection Platform",
        version="2.0.0",
        docs_url="/api/v1/docs",
        openapi_url="/api/v1/openapi.json",
        lifespan=lifespan,
    )

    # Request timeout (outermost — must be added first so it wraps everything)
    application.add_middleware(TimeoutMiddleware)

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
        return {
            "status": "healthy",
            "version": "2.0.0",
            "environment": settings.ENVIRONMENT,
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
    application.include_router(annotations.router)
    application.include_router(roboflow.router)
    application.include_router(models.router)
    application.include_router(training.router)
    application.include_router(active_learning.router)
    application.include_router(edge.router)
    application.include_router(integrations.router)
    application.include_router(mobile.router)
    application.include_router(events.router)
    application.include_router(notifications.router)
    application.include_router(devices.router)
    application.include_router(logs.router)
    application.include_router(storage.router)
    application.include_router(validation.router)
    application.include_router(websockets.router)

    return application


app = create_app()
