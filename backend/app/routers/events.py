"""
POWERPATH Events Router
Public Active Event API and Admin Event CRUD/Lifecycle.
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Event, Question, Socket, AdminUser
from app.schemas import (
    EventPublic,
    EventAdmin,
    EventCreate,
    EventUpdate,
)
from app.utils.auth import get_current_admin
from app.constants import EventStatus

router = APIRouter(tags=["Events"])


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
    event = db.query(Event).filter((Event.id == event_id) | (Event.custom_id == event_id)).first()
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
    event = db.query(Event).filter((Event.id == event_id) | (Event.custom_id == event_id)).first()
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
    event = db.query(Event).filter((Event.id == event_id) | (Event.custom_id == event_id)).first()
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
    event = db.query(Event).filter((Event.id == event_id) | (Event.custom_id == event_id)).first()
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found."
        )

    event.status = EventStatus.INACTIVE.value
    db.commit()
    db.refresh(event)
    return EventAdmin.model_validate(event)
