"""
POWERPATH Tournament Settings Router
Provides public tournament rules/status and admin rule management.
"""

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import TournamentSettings, AdminUser
from app.schemas import TournamentSettingsPublic, TournamentSettingsUpdate
from app.utils.auth import get_current_admin
from app.constants import TournamentGate
from app.utils.broadcaster import broadcaster

router = APIRouter(tags=["Tournament Settings"])


def get_or_create_settings(db: Session) -> TournamentSettings:
    settings = db.query(TournamentSettings).filter(TournamentSettings.key == "global").first()
    if not settings:
        settings = TournamentSettings(
            key="global",
            event_status=TournamentGate.OPEN.value,
            default_penalty_seconds=5,
            allow_replay=True,
            audio_enabled=True
        )
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


@router.get("/settings", response_model=TournamentSettingsPublic)
def get_public_settings(db: Session = Depends(get_db)):
    """Public tournament gate and settings configuration."""
    settings = get_or_create_settings(db)
    return TournamentSettingsPublic.model_validate(settings)


@router.post("/admin/settings", response_model=TournamentSettingsPublic)
def update_admin_settings(
    update_data: TournamentSettingsUpdate,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Admin-only update for tournament gate and settings."""
    settings = get_or_create_settings(db)

    if update_data.event_status is not None:
        settings.event_status = update_data.event_status
    if update_data.default_penalty_seconds is not None:
        settings.default_penalty_seconds = update_data.default_penalty_seconds
    if update_data.allow_replay is not None:
        settings.allow_replay = update_data.allow_replay
    if update_data.audio_enabled is not None:
        settings.audio_enabled = update_data.audio_enabled

    db.commit()
    db.refresh(settings)

    broadcaster.broadcast_sync("settings_updated", {
        "event_status": settings.event_status,
        "default_penalty_seconds": settings.default_penalty_seconds,
        "allow_replay": settings.allow_replay,
        "audio_enabled": settings.audio_enabled
    })

    return TournamentSettingsPublic.model_validate(settings)
