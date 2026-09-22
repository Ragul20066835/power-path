"""
POWERPATH Results & Leaderboard Router
Provides official ranked standings and stage telemetry.
"""

import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import TournamentResult, Event, AdminUser
from app.schemas import ResultPublic, LeaderboardEntry
from app.utils.auth import get_current_admin
from app.constants import EventStatus

router = APIRouter(tags=["Results & Leaderboard"])


def find_event_by_id_or_custom_id(db: Session, event_id: str) -> Optional[Event]:
    """Safely lookup Event by UUID or custom_id without invalid UUID cast errors."""
    event_identifier = str(event_id).strip()
    try:
        event_uuid = uuid.UUID(event_identifier)
    except (ValueError, AttributeError):
        event_uuid = None

    if event_uuid is not None:
        event = db.query(Event).filter(Event.id == str(event_uuid)).first()
        if not event:
            event = db.query(Event).filter(Event.custom_id == event_identifier).first()
        return event
    return db.query(Event).filter(Event.custom_id == event_identifier).first()


@router.get("/admin/results", response_model=List[ResultPublic])
def list_admin_results(
    event_id: Optional[str] = Query(None, description="Optional Event UUID or custom_id filter"),
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Returns official tournament results with complete telemetry, sorted by rank/effective time.
    """
    query = db.query(TournamentResult)
    if event_id:
        target_event = find_event_by_id_or_custom_id(db, event_id)
        if target_event:
            query = query.filter(TournamentResult.event_id == target_event.id)
        else:
            try:
                valid_uuid = str(uuid.UUID(str(event_id).strip()))
                query = query.filter(TournamentResult.event_id == valid_uuid)
            except (ValueError, AttributeError):
                query = query.filter(False)

    results = query.order_by(
        TournamentResult.final_time_ms.asc(),
        TournamentResult.completed_at.asc()
    ).all()

    return [ResultPublic.model_validate(r) for r in results]


@router.get("/results/leaderboard", response_model=List[LeaderboardEntry])
def get_public_leaderboard(
    event_id: Optional[str] = Query(None, description="Optional Event UUID or custom_id"),
    db: Session = Depends(get_db)
):
    """
    Public leaderboard for the active or specified championship event.
    """
    query = db.query(TournamentResult)

    if event_id:
        target_event = find_event_by_id_or_custom_id(db, event_id)
        if target_event:
            query = query.filter(TournamentResult.event_id == target_event.id)
        else:
            try:
                valid_uuid = str(uuid.UUID(str(event_id).strip()))
                query = query.filter(TournamentResult.event_id == valid_uuid)
            except (ValueError, AttributeError):
                query = query.filter(False)
    else:
        # Default to active event
        active_event = db.query(Event).filter(Event.status == EventStatus.ACTIVE.value).first()
        if active_event:
            query = query.filter(TournamentResult.event_id == active_event.id)

    results = query.order_by(
        TournamentResult.final_time_ms.asc(),
        TournamentResult.completed_at.asc()
    ).all()

    entries = []
    for idx, r in enumerate(results, start=1):
        entries.append(
            LeaderboardEntry(
                rank=r.rank or idx,
                player_name=r.player_name,
                register_number=r.register_number,
                raw_time_ms=r.raw_time_ms,
                total_penalty_seconds=r.total_penalty_seconds,
                final_time_ms=r.final_time_ms,
                completed_at=r.completed_at
            )
        )
    return entries
