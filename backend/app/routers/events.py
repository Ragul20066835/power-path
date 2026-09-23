"""
POWERPATH Events Router
Public Active Event API and Admin Event CRUD/Lifecycle.
"""

import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import (
    Event,
    Question,
    Socket,
    AdminUser,
    ParticipantSession,
    QuestionAttempt,
    SocketPlacement,
    TournamentResult,
)
from app.schemas import (
    EventPublic,
    EventAdmin,
    EventCreate,
    EventUpdate,
    ClearTestDataPreviewResponse,
    ClearTestDataResponse,
)
from app.utils.auth import get_current_admin
from app.utils.event_resolver import resolve_event_identifier
from app.constants import EventStatus

router = APIRouter(tags=["Events"])


def find_event_by_id_or_custom_id(db: Session, event_id: str) -> Optional[Event]:
    """Safely lookup Event by UUID or custom_id without invalid UUID cast errors."""
    return resolve_event_identifier(db, event_id)


# =============================================================================
# 1. PUBLIC ACTIVE EVENT ENDPOINT (CONTESTANTS)
# =============================================================================

@router.get("/events/active", response_model=EventPublic)
def get_active_event(db: Session = Depends(get_db)):
    """
    Returns the currently active tournament championship event.
    CRITICAL SECURITY: Secret 'accepted_component_id' is EXCLUDED from public payload.
    """
    event = db.query(Event).filter(Event.status == EventStatus.ACTIVE.value).first()
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active tournament round currently available."
        )

    # Sort questions by question_order
    return EventPublic.model_validate(event)


# =============================================================================
# 2. ADMIN EVENT MANAGEMENT & LIFECYCLE (STAFF)
# =============================================================================

@router.get("/admin/events", response_model=List[EventAdmin])
def list_admin_events(
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """List all tournament events with administrative question and socket metadata."""
    events = db.query(Event).order_by(Event.created_at.desc()).all()
    return [EventAdmin.model_validate(e) for e in events]


@router.post("/admin/events", response_model=EventAdmin, status_code=status.HTTP_201_CREATED)
def create_admin_event(
    event_in: EventCreate,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Create a new tournament event blueprint."""
    # Check duplicate custom_id
    existing = db.query(Event).filter(Event.custom_id == event_in.custom_id).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Event with custom_id '{event_in.custom_id}' already exists."
        )

    # If status is ACTIVE, deactivate existing active events
    if event_in.status == EventStatus.ACTIVE.value:
        db.query(Event).filter(Event.status == EventStatus.ACTIVE.value).update(
            {"status": EventStatus.INACTIVE.value}
        )

    event = Event(
        custom_id=event_in.custom_id,
        name=event_in.name,
        description=event_in.description,
        status=event_in.status
    )
    db.add(event)
    db.flush()

    # Handle nested questions & sockets if provided
    for q_idx, q_in in enumerate(event_in.questions, start=1):
        question = Question(
            event_id=event.id,
            custom_id=q_in.custom_id,
            name=q_in.name,
            description=q_in.description,
            difficulty=q_in.difficulty,
            penalty_seconds=q_in.penalty_seconds,
            question_order=q_in.question_order or q_idx
        )
        db.add(question)
        db.flush()

        for s_idx, s_in in enumerate(q_in.sockets, start=1):
            sock = Socket(
                question_id=question.id,
                custom_id=s_in.custom_id,
                label=s_in.label,
                accepted_component_id=s_in.accepted_component_id,
                hint=s_in.hint,
                pin_label_left=s_in.pin_label_left or "IN",
                pin_label_right=s_in.pin_label_right or "OUT",
                slot_order=s_in.slot_order or s_idx
            )
            db.add(sock)

    db.commit()
    db.refresh(event)
    return EventAdmin.model_validate(event)


@router.put("/admin/events/{event_id}", response_model=EventAdmin)
def update_admin_event(
    event_id: str,
    event_in: EventUpdate,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Update event metadata."""
    event = find_event_by_id_or_custom_id(db, event_id)
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found."
        )

    if event_in.custom_id and event_in.custom_id != event.custom_id:
        existing = db.query(Event).filter(Event.custom_id == event_in.custom_id).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Event custom_id '{event_in.custom_id}' is already in use."
            )
        event.custom_id = event_in.custom_id

    if event_in.name is not None:
        event.name = event_in.name
    if event_in.description is not None:
        event.description = event_in.description
    if event_in.status is not None:
        if event_in.status == EventStatus.ACTIVE.value:
            db.query(Event).filter(Event.id != event.id, Event.status == EventStatus.ACTIVE.value).update(
                {"status": EventStatus.INACTIVE.value}
            )
        event.status = event_in.status

    db.commit()
    db.refresh(event)
    return EventAdmin.model_validate(event)


@router.delete("/admin/events/{event_id}")
def delete_admin_event(
    event_id: str,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Delete an event blueprint.
    Cascades to questions and sockets. Preserves historical session and results records.
    """
    event = find_event_by_id_or_custom_id(db, event_id)
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found."
        )

    db.delete(event)
    db.commit()
    return {"detail": "Event deleted successfully"}


@router.post("/admin/events/{event_id}/activate", response_model=EventAdmin)
def activate_event(
    event_id: str,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Atomically activate target event.
    Deactivates any previously active event to enforce the single active event rule.
    """
    event = find_event_by_id_or_custom_id(db, event_id)
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found."
        )

    # Deactivate all other events
    db.query(Event).filter(Event.id != event.id).update({"status": EventStatus.INACTIVE.value})
    event.status = EventStatus.ACTIVE.value
    db.commit()
    db.refresh(event)
    return EventAdmin.model_validate(event)


@router.post("/admin/events/{event_id}/deactivate", response_model=EventAdmin)
def deactivate_event(
    event_id: str,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Deactivate target event."""
    event = find_event_by_id_or_custom_id(db, event_id)
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found."
        )

    event.status = EventStatus.INACTIVE.value
    db.commit()
    db.refresh(event)
    return EventAdmin.model_validate(event)


# =============================================================================
# 3. TEST & LOAD-TEST DATA CLEANUP (ADMIN MAINTENANCE)
# =============================================================================

@router.post("/admin/test-data/preview", response_model=ClearTestDataPreviewResponse)
@router.post("/admin/load-test-data/preview", response_model=ClearTestDataPreviewResponse)
def preview_test_data_cleanup(
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Preview matching synthetic test/load-test records targeted for cleanup.
    Does NOT delete any records.
    Identifies test records by:
    - LOAD_TEST_EVT_ event prefix
    - RACE- register number prefix
    - RaceTester player name
    """
    # 1. Identify load-test events
    load_test_events = db.query(Event).filter(Event.custom_id.startswith("LOAD_TEST_EVT_")).all()

    # Active event protection
    if any(e.status == EventStatus.ACTIVE.value for e in load_test_events):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot clear test data: a load-test event (LOAD_TEST_EVT_*) is currently ACTIVE. Please deactivate it first."
        )

    load_test_event_ids = [e.id for e in load_test_events]

    # 2. Identify test participant sessions
    session_filters = [
        ParticipantSession.register_number.ilike("RACE-%"),
        ParticipantSession.player_name.ilike("RaceTester%"),
    ]
    if load_test_event_ids:
        session_filters.append(ParticipantSession.event_id.in_(load_test_event_ids))

    test_sessions = db.query(ParticipantSession).filter(or_(*session_filters)).all()
    test_session_ids = [s.id for s in test_sessions]

    # 3. Identify test tournament results
    result_filters = [
        TournamentResult.register_number.ilike("RACE-%"),
        TournamentResult.player_name.ilike("RaceTester%"),
    ]
    if test_session_ids:
        result_filters.append(TournamentResult.session_id.in_(test_session_ids))
    if load_test_event_ids:
        result_filters.append(TournamentResult.event_id.in_(load_test_event_ids))

    test_results_count = db.query(TournamentResult).filter(or_(*result_filters)).count()

    # 4. Identify test question attempts
    test_attempts_count = db.query(QuestionAttempt).filter(
        QuestionAttempt.session_id.in_(test_session_ids)
    ).count() if test_session_ids else 0

    return ClearTestDataPreviewResponse(
        test_sessions=len(test_sessions),
        test_attempts=test_attempts_count,
        test_results=test_results_count,
        load_test_events=len(load_test_events),
    )


@router.delete("/admin/test-data", response_model=ClearTestDataResponse)
@router.delete("/admin/load-test-data", response_model=ClearTestDataResponse)
def clear_test_data(
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Permanently delete ONLY test and load-test participant records.
    Deletes in strict dependency order:
    1. Question attempts & Socket placements
    2. Tournament results
    3. Participant sessions
    4. Load-test events (and their questions/sockets)
    """
    # 1. Identify load-test events
    load_test_events = db.query(Event).filter(Event.custom_id.startswith("LOAD_TEST_EVT_")).all()

    # Active event protection
    if any(e.status == EventStatus.ACTIVE.value for e in load_test_events):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot clear test data: a load-test event (LOAD_TEST_EVT_*) is currently ACTIVE. Please deactivate it first."
        )

    load_test_event_ids = [e.id for e in load_test_events]

    # 2. Identify test participant sessions
    session_filters = [
        ParticipantSession.register_number.ilike("RACE-%"),
        ParticipantSession.player_name.ilike("RaceTester%"),
    ]
    if load_test_event_ids:
        session_filters.append(ParticipantSession.event_id.in_(load_test_event_ids))

    test_sessions = db.query(ParticipantSession).filter(or_(*session_filters)).all()
    test_session_ids = [s.id for s in test_sessions]

    # 3. Identify test tournament results
    result_filters = [
        TournamentResult.register_number.ilike("RACE-%"),
        TournamentResult.player_name.ilike("RaceTester%"),
    ]
    if test_session_ids:
        result_filters.append(TournamentResult.session_id.in_(test_session_ids))
    if load_test_event_ids:
        result_filters.append(TournamentResult.event_id.in_(load_test_event_ids))

    test_results = db.query(TournamentResult).filter(or_(*result_filters)).all()

    # 4. Identify dependent attempts and placements
    if test_session_ids:
        test_attempts = db.query(QuestionAttempt).filter(QuestionAttempt.session_id.in_(test_session_ids)).all()
        test_placements = db.query(SocketPlacement).filter(SocketPlacement.session_id.in_(test_session_ids)).all()
    else:
        test_attempts = []
        test_placements = []

    sessions_count = len(test_sessions)
    attempts_count = len(test_attempts)
    results_count = len(test_results)
    events_count = len(load_test_events)

    if sessions_count == 0 and results_count == 0 and attempts_count == 0 and events_count == 0:
        return ClearTestDataResponse(
            message="No matching test data found to clear.",
            deleted_sessions=0,
            deleted_attempts=0,
            deleted_results=0,
            deleted_events=0,
        )

    # Execute deletion in strict foreign-key order:
    # 1. Question Attempts
    for a in test_attempts:
        db.delete(a)

    # 2. Socket Placements
    for p in test_placements:
        db.delete(p)

    # 3. Tournament Results
    for r in test_results:
        db.delete(r)

    # 4. Participant Sessions
    for s in test_sessions:
        db.delete(s)

    # 5. Load-test Events (cascades to questions and sockets)
    for e in load_test_events:
        db.delete(e)

    db.commit()

    return ClearTestDataResponse(
        message="Test data cleared successfully.",
        deleted_sessions=sessions_count,
        deleted_attempts=attempts_count,
        deleted_results=results_count,
        deleted_events=events_count,
    )
