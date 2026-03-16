from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    yield
    # Shutdown


def create_app() -> FastAPI:
    application = FastAPI(
        title="FloorEye v2.0 API",
        description="Enterprise AI Wet Floor & Spill Detection Platform",
        version="2.0.0",
        docs_url="/api/v1/docs",
        openapi_url="/api/v1/openapi.json",
        lifespan=lifespan,
    )

    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @application.get("/api/v1/health", tags=["health"])
    async def health_check():
        return {
            "status": "healthy",
            "version": "2.0.0",
            "environment": settings.ENVIRONMENT,
        }

    return application


app = create_app()
