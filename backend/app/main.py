"""
POWERPATH FastAPI Application Entry Point
Production-ready backend for circuit tournament engine.
Compatible with Render: uvicorn app.main:app --host 0.0.0.0 --port $PORT
"""

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import get_settings
from app.database import Base, engine
from app.routers import (
    health_router,
    auth_router,
    settings_router,
    events_router,
    questions_router,
    game_router,
    results_router,
    upload_router,
    telemetry_router,
)

# Configure structured logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("powerpath.main")
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan manager.
    Initializes database tables in development/testing environments and bootstraps configured admin user.
    """
    logger.info(f"Starting {settings.PROJECT_NAME} v{settings.VERSION} [{settings.ENVIRONMENT}]")
    logger.info(f"CORS Allowed Origins: {settings.cors_origins_list}")

    # Auto-create tables if running in SQLite / development mode
    if "sqlite" in settings.DATABASE_URL or settings.ENVIRONMENT in ("development", "test"):
        logger.info("Initializing database schema...")
        Base.metadata.create_all(bind=engine)
        logger.info("Database schema initialized successfully.")

    # Seed or synchronize admin account based on environment configuration
    try:
        from app.database import SessionLocal
        from app.utils.auth import seed_initial_admin
        with SessionLocal() as db:
            if settings.ENVIRONMENT == "production":
                # In production, bootstrap ONLY if explicit password provided via environment variable
                if settings.ADMIN_BOOTSTRAP_PASSWORD:
                    seed_initial_admin(
                        db,
                        username=settings.ADMIN_BOOTSTRAP_USERNAME or "admin",
                        email=settings.ADMIN_BOOTSTRAP_EMAIL or "admin@powerpath.io",
                        password=settings.ADMIN_BOOTSTRAP_PASSWORD,
                        role="SUPER_ADMIN"
                    )
                    logger.info(f"Production admin user '{settings.ADMIN_BOOTSTRAP_USERNAME or 'admin'}' initialized/synchronized via environment.")
                else:
                    logger.info("Production mode: No ADMIN_BOOTSTRAP_PASSWORD set; skipping auto-bootstrap.")
            else:
                # In development/test, seed default admin for seamless local testing
                dev_pw = settings.ADMIN_BOOTSTRAP_PASSWORD or "admin123"
                seed_initial_admin(db, username="admin", email="admin@powerpath.io", password=dev_pw)
                logger.info("Development admin user 'admin' verified.")
    except Exception as e:
        logger.warning(f"Could not bootstrap admin user: {e}")

    yield

    logger.info("Shutting down POWERPATH backend...")


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="High-concurrency circuit tournament backend engine for POWERPATH.",
    docs_url="/docs" if settings.ENVIRONMENT != "production" else None,
    redoc_url="/redoc" if settings.ENVIRONMENT != "production" else None,
    lifespan=lifespan
)

# Configure CORS for local React dev server and production Vercel frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API v1 Routers
app.include_router(health_router, prefix="/api/v1")
app.include_router(auth_router, prefix="/api/v1")
app.include_router(settings_router, prefix="/api/v1")
app.include_router(events_router, prefix="/api/v1")
app.include_router(questions_router, prefix="/api/v1")
app.include_router(game_router, prefix="/api/v1")
app.include_router(results_router, prefix="/api/v1")
app.include_router(upload_router, prefix="/api/v1")
app.include_router(telemetry_router, prefix="/api/v1")


@app.get("/", tags=["System"])
def root_status():
    """Root status endpoint for lightweight platform health checks."""
    return {
        "name": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "status": "online"
    }
