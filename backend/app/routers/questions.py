"""
POWERPATH Questions & Sockets Management Router (Admin)
Handles Question stages and socket PCB layouts within Events.
"""

import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Event, Question, Socket, AdminUser
from app.schemas import (
    QuestionAdmin,
    QuestionCreate,
    QuestionUpdate,
)
from app.utils.auth import get_current_admin
from app.constants import VALID_COMPONENT_IDS
from app.utils.csv_importer import normalize_component_name

router = APIRouter(prefix="/admin/events/{event_id}/questions", tags=["Admin Questions"])


def get_target_event(event_id: str, db: Session) -> Event:
    event_identifier = str(event_id).strip()
    try:
        event_uuid = uuid.UUID(event_identifier)
    except (ValueError, AttributeError):
        event_uuid = None

    if event_uuid is not None:
        event = db.query(Event).filter(Event.id == str(event_uuid)).first()
        if not event:
            event = db.query(Event).filter(Event.custom_id == event_identifier).first()
    else:
        event = db.query(Event).filter(Event.custom_id == event_identifier).first()

    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Event '{event_id}' not found."
        )
    return event


@router.get("", response_model=List[QuestionAdmin])
def list_questions(
    event_id: str,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """List all questions and socket configurations for an event."""
    event = get_target_event(event_id, db)
    questions = db.query(Question).filter(Question.event_id == event.id).order_by(Question.question_order.asc()).all()
    return [QuestionAdmin.model_validate(q) for q in questions]


@router.post("", response_model=QuestionAdmin, status_code=status.HTTP_201_CREATED)
def create_question(
    event_id: str,
    q_in: QuestionCreate,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Create a new question with sockets inside the specified event."""
    event = get_target_event(event_id, db)

    # Validate question custom_id uniqueness within event
    existing_q = db.query(Question).filter(
        Question.event_id == event.id,
        Question.custom_id == q_in.custom_id
    ).first()
    if existing_q:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Question custom_id '{q_in.custom_id}' already exists in this event."
        )

    # Validate sockets inside this question
    seen_sockets = set()
    for s in q_in.sockets:
        if s.custom_id in seen_sockets:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Duplicate socket custom_id '{s.custom_id}' in question payload."
            )
        seen_sockets.add(s.custom_id)

        normalized_comp = normalize_component_name(s.accepted_component_id)
        if not normalized_comp:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid component '{s.accepted_component_id}'. Must be one of the canonical components (e.g. battery, switch, resistor, led, ammeter, ground, voltmeter, capacitor, inductor)."
            )

    # Determine order if not specified
    q_order = q_in.question_order
    if q_order is None or q_order <= 0:
        max_order = db.query(Question).filter(Question.event_id == event.id).count()
        q_order = max_order + 1

    question = Question(
        event_id=event.id,
        custom_id=q_in.custom_id,
        name=q_in.name,
        description=q_in.description,
        difficulty=q_in.difficulty,
        penalty_seconds=q_in.penalty_seconds,
        question_order=q_order
    )
    db.add(question)
    db.flush()

    for s_idx, s_in in enumerate(q_in.sockets, start=1):
        norm_comp = normalize_component_name(s_in.accepted_component_id)
        sock = Socket(
            question_id=question.id,
            custom_id=s_in.custom_id,
            label=s_in.label,
            accepted_component_id=norm_comp,
            hint=s_in.hint,
            pin_label_left=s_in.pin_label_left or "IN",
            pin_label_right=s_in.pin_label_right or "OUT",
            slot_order=s_in.slot_order or s_idx
        )
        db.add(sock)

    db.commit()
    db.refresh(question)
    return QuestionAdmin.model_validate(question)


@router.put("/{question_id}", response_model=QuestionAdmin)
def update_question(
    event_id: str,
    question_id: str,
    q_in: QuestionUpdate,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Update question metadata."""
    event = get_target_event(event_id, db)
    q_identifier = str(question_id).strip()
    try:
        q_uuid = uuid.UUID(q_identifier)
    except (ValueError, AttributeError):
        q_uuid = None

    if q_uuid is not None:
        question = db.query(Question).filter(
            Question.event_id == event.id,
            Question.id == str(q_uuid)
        ).first()
        if not question:
            question = db.query(Question).filter(
                Question.event_id == event.id,
                Question.custom_id == q_identifier
            ).first()
    else:
        question = db.query(Question).filter(
            Question.event_id == event.id,
            Question.custom_id == q_identifier
        ).first()

    if not question:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Question not found in specified event."
        )

    if q_in.custom_id and q_in.custom_id != question.custom_id:
        existing = db.query(Question).filter(
            Question.event_id == event.id,
            Question.custom_id == q_in.custom_id
        ).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Question custom_id '{q_in.custom_id}' is already in use in this event."
            )
        question.custom_id = q_in.custom_id

    if q_in.name is not None:
        question.name = q_in.name
    if q_in.description is not None:
        question.description = q_in.description
    if q_in.difficulty is not None:
        question.difficulty = q_in.difficulty
    if q_in.penalty_seconds is not None:
        question.penalty_seconds = q_in.penalty_seconds
    if q_in.question_order is not None:
        question.question_order = q_in.question_order

    db.commit()
    db.refresh(question)
    return QuestionAdmin.model_validate(question)


@router.delete("/{question_id}")
def delete_question(
    event_id: str,
    question_id: str,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Delete a question and its child sockets."""
    event = get_target_event(event_id, db)
    q_identifier = str(question_id).strip()
    try:
        q_uuid = uuid.UUID(q_identifier)
    except (ValueError, AttributeError):
        q_uuid = None

    if q_uuid is not None:
        question = db.query(Question).filter(
            Question.event_id == event.id,
            Question.id == str(q_uuid)
        ).first()
        if not question:
            question = db.query(Question).filter(
                Question.event_id == event.id,
                Question.custom_id == q_identifier
            ).first()
    else:
        question = db.query(Question).filter(
            Question.event_id == event.id,
            Question.custom_id == q_identifier
        ).first()

    if not question:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Question not found."
        )

    db.delete(question)
    db.commit()
    return {"detail": "Question deleted successfully"}
