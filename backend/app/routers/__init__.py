"""
POWERPATH Routers Package
"""

from app.routers.health import router as health_router
from app.routers.auth import router as auth_router
from app.routers.settings import router as settings_router
from app.routers.events import router as events_router
from app.routers.questions import router as questions_router
from app.routers.game import router as game_router
from app.routers.results import router as results_router
from app.routers.upload import router as upload_router
from app.routers.telemetry import router as telemetry_router

__all__ = [
    "health_router",
    "auth_router",
    "settings_router",
    "events_router",
    "questions_router",
    "game_router",
    "results_router",
    "upload_router",
    "telemetry_router",
]
