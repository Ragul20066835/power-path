"""
POWERPATH Health Check Router
Provides system status and lightweight database ping.
"""

from datetime import datetime, timezone
from fastapi import APIRouter, status, HTTPException
from app.config import get_settings
from app.database import check_db_health
from app.schemas import HealthResponse

router = APIRouter(prefix="/health", tags=["System"])
settings = get_settings()


@router.get("", response_model=HealthResponse, status_code=status.HTTP_200_OK)
def get_health():
    """
    Production health check endpoint.
    Performs safe database connectivity check without leaking sensitive internal credentials.
    """
    db_ok = check_db_health()
    if not db_ok:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"status": "error", "database": "unreachable"}
        )

    return HealthResponse(
        status="ok",
        database="connected",
        timestamp=datetime.now(timezone.utc).isoformat(),
        environment=settings.ENVIRONMENT,
        version=settings.VERSION
    )
