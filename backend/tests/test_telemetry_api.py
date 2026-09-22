"""
Live Telemetry, Heartbeat & Abandoned Session Tests
Tests:
- Player periodic heartbeat endpoint
- Admin live telemetry endpoint with counters
- Auto-detection and marking of abandoned sessions
- Secret answer protection in telemetry payloads
- Admin authorization requirements
"""

import pytest
from datetime import datetime, timezone, timedelta
from app.models import Event, Question, Socket, ParticipantSession


@pytest.fixture
def active_monitor_event(db_session):
    event = Event(custom_id="EVT_MONITOR_TEST", name="Monitor Test Event", status="ACTIVE")
    db_session.add(event)
    db_session.flush()

    q = Question(event_id=event.id, custom_id="Q1", name="Stage 1", question_order=1)
    db_session.add(q)
    db_session.flush()

    s = Socket(question_id=q.id, custom_id="S1", label="SLOT1", accepted_component_id="battery", hint="Hint")
    db_session.add(s)
    db_session.commit()
    return event


@pytest.mark.anyio
async def test_player_heartbeat_flow(async_client, active_monitor_event):
    """Test periodic heartbeat updates last_heartbeat timestamp."""
    start_res = await async_client.post(
        "/api/v1/game/session/start",
        json={"player_name": "Heartbeat User", "register_number": "REG-HB-1", "event_id": active_monitor_event.id}
    )
    assert start_res.status_code == 201
    session_id = start_res.json()["session_id"]

    # Send heartbeat
    hb_res = await async_client.post(f"/api/v1/game/session/{session_id}/heartbeat")
    assert hb_res.status_code == 200
    data = hb_res.json()
    assert data["status"] == "PLAYING"
    assert "last_heartbeat" in data


@pytest.mark.anyio
async def test_heartbeat_unknown_session(async_client):
    """Test heartbeat on invalid session returns 404."""
    res = await async_client.post("/api/v1/game/session/PP-NONEXISTENT/heartbeat")
    assert res.status_code == 404


@pytest.mark.anyio
async def test_admin_telemetry_endpoint(async_client, admin_headers, active_monitor_event, db_session):
    """
    Test GET /api/v1/admin/monitor/telemetry returns summary counters and session telemetry.
    Verifies secret component answer is excluded.
    """
    # Create 1 active session and 1 completed session
    s1 = ParticipantSession(
        session_id="PP-TEL-1",
        event_id=active_monitor_event.id,
        player_name="Live Contestant",
        register_number="REG-01",
        status="PLAYING",
        current_question_index=0,
        wrong_attempts_total=1,
        penalty_seconds_total=5,
        started_at=datetime.now(timezone.utc),
        last_heartbeat=datetime.now(timezone.utc)
    )
    s2 = ParticipantSession(
        session_id="PP-TEL-2",
        event_id=active_monitor_event.id,
        player_name="Finished Contestant",
        register_number="REG-02",
        status="COMPLETED",
        current_question_index=1,
        started_at=datetime.now(timezone.utc),
        completed_at=datetime.now(timezone.utc),
        last_heartbeat=datetime.now(timezone.utc)
    )
    db_session.add_all([s1, s2])
    db_session.commit()

    # Call Telemetry Endpoint
    res = await async_client.get(
        f"/api/v1/admin/monitor/telemetry?event_id={active_monitor_event.id}",
        headers=admin_headers
    )
    assert res.status_code == 200
    data = res.json()

    # Verify Summary Counters
    summary = data["summary"]
    assert summary["active_count"] >= 1
    assert summary["completed_count"] >= 1
    assert summary["total_count"] >= 2

    # Verify session items
    sessions = data["sessions"]
    live_s = next(s for s in sessions if s["session_id"] == "PP-TEL-1")
    assert live_s["player_name"] == "Live Contestant"
    assert live_s["status"] == "PLAYING"
    assert live_s["wrong_attempts_total"] == 1
    assert live_s["penalty_seconds_total"] == 5
    assert live_s["is_active"] is True
    assert "accepted_component_id" not in live_s


@pytest.mark.anyio
async def test_abandoned_session_detection(async_client, admin_headers, active_monitor_event, db_session):
    """
    Test that a session in PLAYING status with no heartbeat for > 5 minutes
    is automatically detected and marked as ABANDONED.
    """
    stale_time = datetime.now(timezone.utc) - timedelta(minutes=10)
    stale_session = ParticipantSession(
        session_id="PP-STALE-1",
        event_id=active_monitor_event.id,
        player_name="Ghost Player",
        register_number="REG-GHOST",
        status="PLAYING",
        started_at=stale_time,
        last_heartbeat=stale_time
    )
    db_session.add(stale_session)
    db_session.commit()

    # Query telemetry to trigger auto-detection
    res = await async_client.get(
        f"/api/v1/admin/monitor/telemetry?event_id={active_monitor_event.id}",
        headers=admin_headers
    )
    assert res.status_code == 200
    data = res.json()

    # Check that stale session was marked ABANDONED
    stale_item = next(s for s in data["sessions"] if s["session_id"] == "PP-STALE-1")
    assert stale_item["status"] == "ABANDONED"
    assert stale_item["is_active"] is False
    assert data["summary"]["abandoned_count"] >= 1


@pytest.mark.anyio
async def test_telemetry_requires_admin_auth(async_client):
    """Test accessing telemetry endpoint without admin token returns 401."""
    res = await async_client.get("/api/v1/admin/monitor/telemetry")
    assert res.status_code == 401
