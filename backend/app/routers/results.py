"""
POWERPATH Results & Leaderboard Router
Provides official ranked standings and stage telemetry.
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import TournamentResult, Event, AdminUser
from app.schemas import ResultPublic, LeaderboardEntry
from app.utils.auth import get_current_admin
from app.constants import EventStatus

router = APIRouter(tags=["Results & Leaderboard"])


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
        target_event = db.query(Event).filter(
            (Event.id == event_id) | (Event.custom_id == event_id)
        ).first()
        if target_event:
            query = query.filter(TournamentResult.event_id == target_event.id)
        else:
            query = query.filter(TournamentResult.event_id == event_id)

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
        target_event = db.query(Event).filter(
            (Event.id == event_id) | (Event.custom_id == event_id)
        ).first()
        if target_event:
            query = query.filter(TournamentResult.event_id == target_event.id)
        else:
            query = query.filter(TournamentResult.event_id == event_id)
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
