"""
POWERPATH Authoritative Game Engine Router
Handles player session creation, state recovery, secret placement validation,
penalty calculations, server-authoritative timer, and final result generation.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from pydantic import BaseModel, Field

from app.database import get_db
from app.models import (
    Event,
    Question,
    Socket,
    ParticipantSession,
    SocketPlacement,
    QuestionAttempt,
    TournamentResult,
    TournamentSettings,
)
from app.schemas import (
    StrId,
    OptionalStrId,
    SessionCreate,
    SessionPublic,
    QuestionPublic,
    SocketPublic,
    ResultPublic,
)
from app.constants import SessionStatus, TournamentGate, EventStatus
from app.utils.csv_importer import normalize_component_name
from app.utils.broadcaster import broadcaster
from app.utils.event_resolver import resolve_event_identifier

router = APIRouter(prefix="/game", tags=["Game Engine"])


def calculate_elapsed_ms(start_dt: datetime, end_dt: Optional[datetime] = None) -> int:
    """Calculates elapsed milliseconds safely across timezone-aware and naive datetimes."""
    if end_dt is None:
        end_dt = datetime.now(timezone.utc)
    if start_dt.tzinfo is not None and end_dt.tzinfo is None:
        end_dt = end_dt.replace(tzinfo=timezone.utc)
    elif start_dt.tzinfo is None and end_dt.tzinfo is not None:
        start_dt = start_dt.replace(tzinfo=timezone.utc)
    diff = (end_dt - start_dt).total_seconds() * 1000
    return max(0, int(diff))


# -----------------------------------------------------------------------------
# Request & Response Models for Game Flow
# -----------------------------------------------------------------------------

class PlacementAttemptRequest(BaseModel):
    session_id: str
    question_id: str
    socket_id: str
    component_id: str


class PlacementAttemptResponse(BaseModel):
    correct: bool
    socket_id: StrId
    socket_custom_id: str
    already_completed: bool = False
    penalty_applied: int = 0
    wrong_attempts_total: int
    penalty_seconds_total: int
    message: str


class QuestionCompleteRequest(BaseModel):
    session_id: str
    question_id: str


class QuestionCompleteResponse(BaseModel):
    session_id: str
    question_index: int
    has_next_question: bool
    next_question: Optional[QuestionPublic] = None
    event_completed: bool = False
    wrong_attempts_total: int = 0
    penalty_seconds_total: int = 0
    message: str


class SessionFinishRequest(BaseModel):
    session_id: str


class SessionStateResponse(BaseModel):
    session_id: str
    player_name: str
    register_number: str
    status: str
    current_question_index: int
    total_questions: int
    wrong_attempts_total: int
    penalty_seconds_total: int
    started_at: datetime
    completed_at: Optional[datetime] = None
    event: Dict[str, Any]
    current_question: Optional[QuestionPublic] = None
    placed_socket_ids: List[StrId] = Field(default_factory=list)
    completed_questions_count: int = 0


# -----------------------------------------------------------------------------
# 1. PLAYER SESSION REGISTRATION / GAME START
# -----------------------------------------------------------------------------

@router.post("/session/start", response_model=SessionStateResponse, status_code=status.HTTP_201_CREATED)
def start_game_session(
    session_in: SessionCreate,
    db: Session = Depends(get_db)
):
    """
    Registers a contestant and initializes an authoritative server game session.
    Server records started_at timestamp; secret answers are excluded from response.
    """
    # 1. Verify tournament settings gate
    settings = db.query(TournamentSettings).filter(TournamentSettings.key == "global").first()
    if settings:
        if settings.event_status == TournamentGate.CLOSED.value:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="The tournament is currently CLOSED. Registrations are not allowed."
            )
        if settings.event_status == TournamentGate.PAUSED.value:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="The tournament is currently PAUSED. New registrations are temporarily blocked."
            )

    # 2. Find target active event
    if session_in.event_id:
        event = resolve_event_identifier(db, session_in.event_id)
    else:
        event = db.query(Event).filter(Event.status == EventStatus.ACTIVE.value).first()

    if not event:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active tournament round currently available."
        )

    # 3. Retrieve event questions
    questions = db.query(Question).filter(Question.event_id == event.id).order_by(Question.question_order.asc()).all()
    if not questions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The active tournament round contains no configured questions."
        )

    # 4. Generate secure session identifier & server timestamp
    server_started_at = datetime.now(timezone.utc)
    secure_session_id = f"PP-{uuid.uuid4().hex[:8].upper()}"

    session = ParticipantSession(
        session_id=secure_session_id,
        event_id=str(event.id) if event and event.id else None,
        player_name=session_in.player_name.strip(),
        register_number=session_in.register_number.strip().upper(),
        status=SessionStatus.PLAYING.value,
        current_question_index=0,
        wrong_attempts_total=0,
        penalty_seconds_total=0,
        started_at=server_started_at,
        last_heartbeat=server_started_at
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    # Broadcast live session_started event to Admin Monitors
    broadcaster.broadcast_sync("session_started", {
        "session_id": session.session_id,
        "player_name": session.player_name,
        "register_number": session.register_number,
        "event_id": event.id,
        "event_name": event.name,
        "started_at": session.started_at.isoformat()
    })

    first_q = questions[0]
    return SessionStateResponse(
        session_id=session.session_id,
        player_name=session.player_name,
        register_number=session.register_number,
        status=session.status,
        current_question_index=session.current_question_index,
        total_questions=len(questions),
        wrong_attempts_total=session.wrong_attempts_total,
        penalty_seconds_total=session.penalty_seconds_total,
        started_at=session.started_at,
        completed_at=session.completed_at,
        event={
            "id": str(event.id) if event and event.id else None,
            "custom_id": event.custom_id if event else "UNKNOWN",
            "name": event.name if event else "Tournament Event",
            "description": event.description if event else "",
            "total_questions": len(questions)
        },
        current_question=QuestionPublic.model_validate(first_q),
        placed_socket_ids=[],
        completed_questions_count=0
    )


# -----------------------------------------------------------------------------
# 2. SESSION RECOVERY (BROWSER REFRESH / RECONNECT)
# -----------------------------------------------------------------------------

@router.get("/session/{session_id}", response_model=SessionStateResponse)
def recover_game_session(
    session_id: str,
    db: Session = Depends(get_db)
):
    """
    Authoritative state recovery for page reloads, browser refreshes, or network reconnects.
    Returns safe question and socket data with secret answers omitted.
    """
    session = db.query(ParticipantSession).filter(ParticipantSession.session_id == session_id).first()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session '{session_id}' not found."
        )

    # Fetch event and questions
    event = session.event
    if not event and session.event_id:
        event = db.query(Event).filter(Event.id == session.event_id).first()

    questions = db.query(Question).filter(Question.event_id == session.event_id).order_by(Question.question_order.asc()).all() if session.event_id else []
    total_q = len(questions)

    # Determine current question
    current_q = None
    placed_socket_ids = []

    if session.current_question_index < total_q:
        current_q = questions[session.current_question_index]
        placements = db.query(SocketPlacement).filter(
            SocketPlacement.session_id == session.id,
            SocketPlacement.question_id == current_q.id
        ).all()
        placed_socket_ids = [str(p.socket_id) for p in placements]

    return SessionStateResponse(
        session_id=session.session_id,
        player_name=session.player_name,
        register_number=session.register_number,
        status=session.status,
        current_question_index=session.current_question_index,
        total_questions=total_q,
        wrong_attempts_total=session.wrong_attempts_total,
        penalty_seconds_total=session.penalty_seconds_total,
        started_at=session.started_at,
        completed_at=session.completed_at,
        event={
            "id": str(event.id) if event and event.id else None,
            "custom_id": event.custom_id if event else "UNKNOWN",
            "name": event.name if event else "Archived Event",
            "description": event.description if event else "",
            "total_questions": total_q
        },
        current_question=QuestionPublic.model_validate(current_q) if current_q else None,
        placed_socket_ids=placed_socket_ids,
        completed_questions_count=session.current_question_index
    )


# -----------------------------------------------------------------------------
# 3. AUTHORITATIVE PLACEMENT VALIDATION
# -----------------------------------------------------------------------------

@router.post("/placement/attempt", response_model=PlacementAttemptResponse)
def validate_component_placement(
    attempt: PlacementAttemptRequest,
    db: Session = Depends(get_db)
):
    """
    Validates a player's component placement against the secret server answer.
    Enforces server-calculated penalties (+5s on wrong) and duplicate request idempotency.
    """
    # 1. Fetch and validate session
    session = db.query(ParticipantSession).filter(ParticipantSession.session_id == attempt.session_id).first()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid game session."
        )

    if session.status != SessionStatus.PLAYING.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot place component. Session is currently {session.status}."
        )

    # 2. Fetch and validate question
    q_identifier = str(attempt.question_id).strip()
    try:
        q_uuid = uuid.UUID(q_identifier)
    except (ValueError, AttributeError):
        q_uuid = None

    if q_uuid is not None:
        question = db.query(Question).filter(Question.id == str(q_uuid)).first()
        if not question:
            question = db.query(Question).filter(Question.custom_id == q_identifier).first()
    else:
        question = db.query(Question).filter(Question.custom_id == q_identifier).first()

    if not question or question.event_id != session.event_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Question does not belong to the active event."
        )

    # Check if this is the player's active stage
    questions_in_event = db.query(Question).filter(Question.event_id == session.event_id).order_by(Question.question_order.asc()).all()
    if session.current_question_index >= len(questions_in_event):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="All tournament questions have already been completed."
        )

    active_stage_question = questions_in_event[session.current_question_index]
    if question.id != active_stage_question.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Placement rejected. Active question is stage {session.current_question_index + 1} ({active_stage_question.name})."
        )

    # 3. Fetch and validate socket
    s_identifier = str(attempt.socket_id).strip()
    try:
        s_uuid = uuid.UUID(s_identifier)
    except (ValueError, AttributeError):
        s_uuid = None

    if s_uuid is not None:
        socket = db.query(Socket).filter(
            Socket.question_id == question.id,
            Socket.id == str(s_uuid)
        ).first()
        if not socket:
            socket = db.query(Socket).filter(
                Socket.question_id == question.id,
                Socket.custom_id == s_identifier
            ).first()
    else:
        socket = db.query(Socket).filter(
            Socket.question_id == question.id,
            Socket.custom_id == s_identifier
        ).first()
    if not socket:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Socket does not belong to the current question."
        )

    # 4. Normalize component ID
    norm_comp = normalize_component_name(attempt.component_id)
    if not norm_comp:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown component '{attempt.component_id}'."
        )

    # 5. IDEMPOTENCY / ALREADY COMPLETED CHECK:
    # If this socket has already been correctly placed for this session, return idempotent success
    existing_placement = db.query(SocketPlacement).filter(
        SocketPlacement.session_id == session.id,
        SocketPlacement.socket_id == socket.id
    ).first()

    if existing_placement:
        return PlacementAttemptResponse(
            correct=True,
            socket_id=socket.id,
            socket_custom_id=socket.custom_id,
            already_completed=True,
            penalty_applied=0,
            wrong_attempts_total=session.wrong_attempts_total,
            penalty_seconds_total=session.penalty_seconds_total,
            message="Socket has already been successfully solved."
        )

    # 6. SECRET ANSWER VALIDATION
    is_correct = (norm_comp == socket.accepted_component_id)

    if is_correct:
        placement = SocketPlacement(
            session_id=session.id,
            question_id=question.id,
            socket_id=socket.id,
            component_id=norm_comp
        )
        db.add(placement)
        session.last_heartbeat = datetime.now(timezone.utc)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            return PlacementAttemptResponse(
                correct=True,
                socket_id=socket.id,
                socket_custom_id=socket.custom_id,
                already_completed=True,
                penalty_applied=0,
                wrong_attempts_total=session.wrong_attempts_total,
                penalty_seconds_total=session.penalty_seconds_total,
                message="Socket has already been successfully solved."
            )

        broadcaster.broadcast_sync("placement_attempt", {
            "session_id": session.session_id,
            "player_name": session.player_name,
            "correct": True,
            "socket_id": socket.id,
            "socket_custom_id": socket.custom_id,
            "wrong_attempts_total": session.wrong_attempts_total,
            "penalty_seconds_total": session.penalty_seconds_total
        })

        return PlacementAttemptResponse(
            correct=True,
            socket_id=socket.id,
            socket_custom_id=socket.custom_id,
            already_completed=False,
            penalty_applied=0,
            wrong_attempts_total=session.wrong_attempts_total,
            penalty_seconds_total=session.penalty_seconds_total,
            message="Correct component placed!"
        )
    else:
        penalty = question.penalty_seconds or 5
        session.wrong_attempts_total += 1
        session.penalty_seconds_total += penalty
        session.last_heartbeat = datetime.now(timezone.utc)
        db.commit()

        broadcaster.broadcast_sync("placement_attempt", {
            "session_id": session.session_id,
            "player_name": session.player_name,
            "correct": False,
            "socket_id": socket.id,
            "socket_custom_id": socket.custom_id,
            "wrong_attempts_total": session.wrong_attempts_total,
            "penalty_seconds_total": session.penalty_seconds_total
        })

        return PlacementAttemptResponse(
            correct=False,
            socket_id=socket.id,
            socket_custom_id=socket.custom_id,
            already_completed=False,
            penalty_applied=penalty,
            wrong_attempts_total=session.wrong_attempts_total,
            penalty_seconds_total=session.penalty_seconds_total,
            message=f"Incorrect component placed. +{penalty}s penalty applied."
        )


# -----------------------------------------------------------------------------
# 4. QUESTION COMPLETION & ADVANCEMENT
# -----------------------------------------------------------------------------

@router.post("/question/complete", response_model=QuestionCompleteResponse)
def complete_question_stage(
    req: QuestionCompleteRequest,
    db: Session = Depends(get_db)
):
    """
    Validates that ALL required sockets for the current stage are solved.
    Records stage attempt telemetry and advances to the next question.
    """
    session = db.query(ParticipantSession).filter(ParticipantSession.session_id == req.session_id).first()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found.")

    if session.status != SessionStatus.PLAYING.value:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Session is not in PLAYING state.")

    questions = db.query(Question).filter(Question.event_id == session.event_id).order_by(Question.question_order.asc()).all()

    # Check if question has already been completed in an earlier step (idempotent duplicate request)
    completed_q_ids = {str(q.id).strip() for q in questions[:session.current_question_index]} | {str(q.custom_id).strip() for q in questions[:session.current_question_index]}
    req_q_id = str(req.question_id).strip()
    if req_q_id in completed_q_ids:
        has_next = session.current_question_index < len(questions)
        next_q = questions[session.current_question_index] if has_next else None
        return QuestionCompleteResponse(
            session_id=session.session_id,
            question_index=session.current_question_index,
            has_next_question=has_next,
            next_question=QuestionPublic.model_validate(next_q) if next_q else None,
            event_completed=not has_next,
            wrong_attempts_total=session.wrong_attempts_total,
            penalty_seconds_total=session.penalty_seconds_total,
            message="Stage already completed."
        )

    if session.current_question_index >= len(questions):
        return QuestionCompleteResponse(
            session_id=session.session_id,
            question_index=session.current_question_index,
            has_next_question=False,
            next_question=None,
            event_completed=True,
            wrong_attempts_total=session.wrong_attempts_total,
            penalty_seconds_total=session.penalty_seconds_total,
            message="All questions already completed."
        )

    current_q = questions[session.current_question_index]
    valid_ids = {str(current_q.id).strip(), str(current_q.custom_id).strip()}
    try:
        curr_uuid = str(uuid.UUID(str(current_q.id).strip()))
        valid_ids.add(curr_uuid)
    except (ValueError, AttributeError):
        pass

    if req_q_id not in valid_ids and str(current_q.id).strip() != req_q_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Question ID does not match active stage.")

    # Verify all sockets for current_q have been solved
    required_sockets = db.query(Socket).filter(Socket.question_id == current_q.id).all()
    placements = db.query(SocketPlacement).filter(
        SocketPlacement.session_id == session.id,
        SocketPlacement.question_id == current_q.id
    ).all()

    placed_socket_ids = {p.socket_id for p in placements}
    for s in required_sockets:
        if s.id not in placed_socket_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Socket '{s.custom_id}' ({s.label}) is not solved yet."
            )

    # Record QuestionAttempt record (idempotent)
    existing_attempt = db.query(QuestionAttempt).filter(
        QuestionAttempt.session_id == session.id,
        QuestionAttempt.question_id == current_q.id
    ).first()

    if not existing_attempt:
        now = datetime.now(timezone.utc)
        raw_time_ms = calculate_elapsed_ms(session.started_at, now)
        attempt = QuestionAttempt(
            session_id=session.id,
            question_id=current_q.id,
            question_index=session.current_question_index + 1,
            raw_time_ms=raw_time_ms,
            wrong_attempts=session.wrong_attempts_total,
            penalty_seconds=session.penalty_seconds_total,
            final_time_ms=raw_time_ms + (session.penalty_seconds_total * 1000),
            completed_at=now
        )
        db.add(attempt)

    # Advance stage
    session.current_question_index += 1
    session.last_heartbeat = datetime.now(timezone.utc)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        # Concurrently advanced; fetch fresh session
        db.refresh(session)

    has_next = session.current_question_index < len(questions)
    next_q = questions[session.current_question_index] if has_next else None

    broadcaster.broadcast_sync("question_completed", {
        "session_id": session.session_id,
        "player_name": session.player_name,
        "completed_question_index": session.current_question_index,
        "total_questions": len(questions),
        "has_next_question": has_next
    })

    return QuestionCompleteResponse(
        session_id=session.session_id,
        question_index=session.current_question_index,
        has_next_question=has_next,
        next_question=QuestionPublic.model_validate(next_q) if next_q else None,
        event_completed=not has_next,
        wrong_attempts_total=session.wrong_attempts_total,
        penalty_seconds_total=session.penalty_seconds_total,
        message="Stage completed successfully." if has_next else "All stages completed! Proceed to finish."
    )


# -----------------------------------------------------------------------------
# 5. FINAL SESSION FINISH & OFFICIAL RESULT CREATION
# -----------------------------------------------------------------------------

@router.post("/session/finish", response_model=ResultPublic)
def finish_game_session(
    req: SessionFinishRequest,
    db: Session = Depends(get_db)
):
    """
    Finalizes a tournament run, calculates raw and penalty-adjusted times,
    and produces the immutable TournamentResult record.
    Idempotent: Multiple calls return the same result without duplicate records.
    """
    session = db.query(ParticipantSession).filter(ParticipantSession.session_id == req.session_id).first()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found.")

    # Idempotent return if already finished
    existing_result = db.query(TournamentResult).filter(TournamentResult.session_id == session.id).first()
    if existing_result:
        return ResultPublic.model_validate(existing_result)

    questions = db.query(Question).filter(Question.event_id == session.event_id).all() if session.event_id else []
    total_q = len(questions)

    if session.current_question_index < total_q:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot finish session. Contestant has only completed {session.current_question_index}/{total_q} stages."
        )

    # Calculate authoritative server time
    server_completed_at = datetime.now(timezone.utc)
    raw_time_ms = calculate_elapsed_ms(session.started_at, server_completed_at)
    final_time_ms = raw_time_ms + (session.penalty_seconds_total * 1000)

    session.status = SessionStatus.COMPLETED.value
    session.completed_at = server_completed_at

    result = TournamentResult(
        session_id=session.id,
        event_id=session.event_id,
        player_name=session.player_name,
        register_number=session.register_number,
        total_questions=total_q,
        raw_time_ms=raw_time_ms,
        total_wrong_attempts=session.wrong_attempts_total,
        total_penalty_seconds=session.penalty_seconds_total,
        final_time_ms=final_time_ms,
        completed_at=server_completed_at
    )
    try:
        db.add(result)
        db.flush()
        # Recompute ranks for this event
        if session.event_id:
            all_results = db.query(TournamentResult).filter(
                TournamentResult.event_id == session.event_id
            ).order_by(
                TournamentResult.final_time_ms.asc(),
                TournamentResult.completed_at.asc()
            ).all()

            for rank_idx, r in enumerate(all_results, start=1):
                r.rank = rank_idx

        db.commit()
        db.refresh(result)
    except IntegrityError:
        db.rollback()
        existing_result = db.query(TournamentResult).filter(TournamentResult.session_id == session.id).first()
        if existing_result:
            return ResultPublic.model_validate(existing_result)
        raise

    broadcaster.broadcast_sync("session_finished", {
        "session_id": session.session_id,
        "player_name": session.player_name,
        "register_number": session.register_number,
        "raw_time_ms": result.raw_time_ms,
        "total_penalty_seconds": result.total_penalty_seconds,
        "final_time_ms": result.final_time_ms,
        "rank": result.rank
    })

    return ResultPublic.model_validate(result)
