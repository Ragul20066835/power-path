"""
POWERPATH Realtime Telemetry & Live Monitor Router
Provides lightweight player telemetry streaming, heartbeat tracking,
abandoned session detection, and WebSocket broadcasting.
"""

import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from sqlalchemy import func
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.models import (
    ParticipantSession,
    Event,
    Question,
    Socket,
    SocketPlacement,
    TournamentResult,
    AdminUser,
)
from app.schemas import StrId, OptionalStrId
from app.utils.auth import get_current_admin
from app.utils.security import decode_access_token
from app.utils.broadcaster import broadcaster
from app.utils.event_resolver import resolve_event_identifier
from app.constants import SessionStatus

router = APIRouter(tags=["Live Monitor & Telemetry"])

# Timeout threshold: 5 minutes without heartbeat -> ABANDONED candidate
HEARTBEAT_TIMEOUT_SECONDS = 300
# Active freshness threshold: 45 seconds -> Green active indicator
HEARTBEAT_ACTIVE_FRESHNESS_SECONDS = 45


# -----------------------------------------------------------------------------
# Telemetry Schemas
# -----------------------------------------------------------------------------

class TelemetrySummary(BaseModel):
    active_count: int
    completed_count: int
    abandoned_count: int
    total_count: int


class ParticipantTelemetryItem(BaseModel):
    id: StrId
    session_id: str
    player_name: str
    register_number: str
    status: str
    event_id: OptionalStrId = None
    event_name: Optional[str] = None
    current_question_index: int
    total_questions: int
    current_question_name: Optional[str] = None
    placed_count: int
    total_slots_in_current_q: int
    wrong_attempts_total: int
    penalty_seconds_total: int
    started_at: datetime
    completed_at: Optional[datetime] = None
    last_heartbeat: datetime
    final_time_ms: Optional[int] = None
    is_active: bool


class TelemetryResponse(BaseModel):
    summary: TelemetrySummary
    sessions: List[ParticipantTelemetryItem]
    timestamp: str


class HeartbeatResponse(BaseModel):
    status: str
    last_heartbeat: datetime


# -----------------------------------------------------------------------------
# 1. PLAYER HEARTBEAT ENDPOINT
# -----------------------------------------------------------------------------

@router.post("/game/session/{session_id}/heartbeat", response_model=HeartbeatResponse)
def session_heartbeat(
    session_id: str,
    db: Session = Depends(get_db)
):
    """
    Lightweight periodic heartbeat sent by active contestants.
    Updates last_heartbeat timestamp. Does NOT modify official game timer or scoring.
    """
    session = db.query(ParticipantSession).filter(ParticipantSession.session_id == session_id).first()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found."
        )

    now = datetime.now(timezone.utc)
    session.last_heartbeat = now
    db.commit()

    return HeartbeatResponse(
        status=session.status,
        last_heartbeat=session.last_heartbeat
    )


# -----------------------------------------------------------------------------
# 2. ADMIN TELEMETRY & PARTICIPANTS ENDPOINTS
# -----------------------------------------------------------------------------

@router.get("/admin/monitor/telemetry", response_model=TelemetryResponse)
@router.get("/admin/participants", response_model=TelemetryResponse)
def get_live_telemetry(
    event_id: Optional[str] = Query(None, description="Filter by Event UUID or custom_id (e.g. 'ERR2S', 'ALL')"),
    session_status: Optional[str] = Query(None, alias="status", description="Filter by status (PLAYING, COMPLETED, ABANDONED)"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Returns player telemetry and session state for Admin Live Monitor and Participants list.
    Detects abandoned sessions (> 5 minutes inactivity) and returns summary counts.
    CRITICAL: Secret component answers are EXCLUDED.
    """
    now = datetime.now(timezone.utc)

    # 1. Automatic Abandoned Session Detection:
    # Any session in 'PLAYING' status with no heartbeat for > 5 minutes becomes ABANDONED
    cutoff_time = now - timedelta(seconds=HEARTBEAT_TIMEOUT_SECONDS)
    stale_sessions = db.query(ParticipantSession).filter(
        ParticipantSession.status == SessionStatus.PLAYING.value,
        ParticipantSession.last_heartbeat < cutoff_time
    ).all()

    if stale_sessions:
        for s in stale_sessions:
            s.status = SessionStatus.ABANDONED.value
        db.commit()

    # 2. Query sessions with optional filters
    query = db.query(ParticipantSession)

    if event_id and str(event_id).strip() and str(event_id).strip().upper() != "ALL":
        target_evt = resolve_event_identifier(db, str(event_id).strip())
        if target_evt:
            query = query.filter(ParticipantSession.event_id == target_evt.id)
        else:
            return TelemetryResponse(
                summary=TelemetrySummary(
                    active_count=0,
                    completed_count=0,
                    abandoned_count=0,
                    total_count=0
                ),
                sessions=[],
                timestamp=now.isoformat()
            )

    # Compute total counters
    all_sessions_for_counts = query.all()
    active_count = sum(1 for s in all_sessions_for_counts if s.status == SessionStatus.PLAYING.value)
    completed_count = sum(1 for s in all_sessions_for_counts if s.status == SessionStatus.COMPLETED.value)
    abandoned_count = sum(1 for s in all_sessions_for_counts if s.status == SessionStatus.ABANDONED.value)
    total_count = len(all_sessions_for_counts)

    # Apply status filter if requested
    if session_status:
        query = query.filter(ParticipantSession.status == session_status.upper())

    # Paginate results sorted by active/recent
    sessions = query.order_by(
        ParticipantSession.started_at.desc()
    ).offset(offset).limit(limit).all()

    # Pre-fetch events, questions, and placements efficiently
    event_ids = {s.event_id for s in sessions if s.event_id}
    events_map = {e.id: e for e in db.query(Event).filter(Event.id.in_(event_ids)).all()} if event_ids else {}

    questions_map: Dict[str, List[Question]] = {}
    if event_ids:
        all_qs = db.query(Question).filter(Question.event_id.in_(event_ids)).order_by(Question.question_order.asc()).all()
        for q in all_qs:
            questions_map.setdefault(q.event_id, []).append(q)

    # Pre-fetch results
    session_ids = [s.id for s in sessions]
    results_map = {r.session_id: r for r in db.query(TournamentResult).filter(TournamentResult.session_id.in_(session_ids)).all()} if session_ids else {}

    # Pre-fetch socket counts per question (O(1) batch query)
    all_q_ids = [q.id for qs in questions_map.values() for q in qs]
    socket_counts_map = dict(
        db.query(Socket.question_id, func.count(Socket.id)).filter(Socket.question_id.in_(all_q_ids)).group_by(Socket.question_id).all()
    ) if all_q_ids else {}

    # Pre-fetch placement counts per (session_id, question_id) (O(1) batch query)
    placement_counts_map = {
        (p[0], p[1]): p[2] for p in db.query(
            SocketPlacement.session_id,
            SocketPlacement.question_id,
            func.count(SocketPlacement.id)
        ).filter(SocketPlacement.session_id.in_(session_ids)).group_by(
            SocketPlacement.session_id,
            SocketPlacement.question_id
        ).all()
    } if session_ids else {}

    # Build response items
    items: List[ParticipantTelemetryItem] = []
    for s in sessions:
        evt = events_map.get(s.event_id)
        evt_qs = questions_map.get(s.event_id, [])
        total_q = len(evt_qs)

        current_q_name = None
        total_slots_current_q = 0
        placed_count = 0

        if s.current_question_index < total_q:
            cq = evt_qs[s.current_question_index]
            current_q_name = cq.name
            total_slots_current_q = socket_counts_map.get(cq.id, 0)
            placed_count = placement_counts_map.get((s.id, cq.id), 0)

        # Activity check: active if heartbeat received within last 45 seconds
        last_hb = s.last_heartbeat or s.started_at
        if last_hb.tzinfo is None:
            last_hb_aware = last_hb.replace(tzinfo=timezone.utc)
        else:
            last_hb_aware = last_hb

        is_active = (s.status == SessionStatus.PLAYING.value) and ((now - last_hb_aware).total_seconds() <= HEARTBEAT_ACTIVE_FRESHNESS_SECONDS)

        res = results_map.get(s.id)
        final_time = res.final_time_ms if res else None

        items.append(
            ParticipantTelemetryItem(
                id=s.id,
                session_id=s.session_id,
                player_name=s.player_name,
                register_number=s.register_number,
                status=s.status,
                event_id=s.event_id,
                event_name=evt.name if evt else "Archived Round",
                current_question_index=s.current_question_index,
                total_questions=total_q,
                current_question_name=current_q_name,
                placed_count=placed_count,
                total_slots_in_current_q=total_slots_current_q,
                wrong_attempts_total=s.wrong_attempts_total,
                penalty_seconds_total=s.penalty_seconds_total,
                started_at=s.started_at,
                completed_at=s.completed_at,
                last_heartbeat=last_hb,
                final_time_ms=final_time,
                is_active=is_active
            )
        )

    return TelemetryResponse(
        summary=TelemetrySummary(
            active_count=active_count,
            completed_count=completed_count,
            abandoned_count=abandoned_count,
            total_count=total_count
        ),
        sessions=items,
        timestamp=now.isoformat()
    )


# -----------------------------------------------------------------------------
# 3. WEBSOCKET REALTIME MONITOR
# -----------------------------------------------------------------------------

@router.websocket("/ws/monitor")
async def websocket_monitor_endpoint(
    websocket: WebSocket,
    token: Optional[str] = Query(None)
):
    """
    Realtime WebSocket stream for Admin Live Monitor.
    Authenticates staff via query parameter JWT token.
    Broadcasts live events on session start, placement, stage complete, and match finish.
    """
    # 1. Validate JWT Token
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    payload = decode_access_token(token)
    if not payload or not payload.get("sub"):
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    # 2. Connect to broadcaster
    await broadcaster.connect(websocket)

    try:
        # Send initial connected handshake
        await websocket.send_json({
            "type": "connection_established",
            "message": "Connected to POWERPATH Live Realtime Stream"
        })

        # Keep connection open listening for client pings
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        broadcaster.disconnect(websocket)
    except Exception:
        broadcaster.disconnect(websocket)
