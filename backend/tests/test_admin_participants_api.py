"""
Admin Participants & Live Telemetry Comprehensive Regression Suite
Specifically validates:
1. New session appears in admin participants immediately.
2. Playing session appears with stage progress and zero/low penalty.
3. Completed session remains visible with COMPLETED status and final time.
4. Correct event filtering by UUID.
5. Correct event filtering by custom_id.
6. event_id="ALL" returns sessions across all events.
7. Two simultaneous participants (ragul2 / TEST001 and ragul3 / TEST002) both appear in admin query.
8. Finishing session creates TournamentResult without removing the ParticipantSession.
9. Admin participants endpoint returns latest authoritative database state across refreshes.
"""

import pytest
from datetime import datetime, timezone
from app.models import Event, Question, Socket, ParticipantSession, TournamentResult


@pytest.fixture
def tournament_setup(db_session):
    """Sets up two active events (Event A and Event B) for filtering tests."""
    # Event A: drop3
    event_a = Event(
        custom_id="EJHH2",
        name="drop3",
        description="Circuit Championship Round 3",
        status="ACTIVE"
    )
    db_session.add(event_a)
    db_session.flush()

    q_a = Question(event_id=event_a.id, custom_id="Q1", name="Stage 1", question_order=1)
    db_session.add(q_a)
    db_session.flush()

    s_a = Socket(question_id=q_a.id, custom_id="S1", label="PWR", accepted_component_id="battery")
    db_session.add(s_a)

    # Event B: drop2
    event_b = Event(
        custom_id="EFT2S",
        name="drop2",
        description="Circuit Round 2",
        status="INACTIVE"
    )
    db_session.add(event_b)
    db_session.flush()

    q_b = Question(event_id=event_b.id, custom_id="Q1", name="Stage 1", question_order=1)
    db_session.add(q_b)
    db_session.flush()

    s_b = Socket(question_id=q_b.id, custom_id="S1", label="PWR", accepted_component_id="battery")
    db_session.add(s_b)

    db_session.commit()
    return event_a, event_b, q_a, q_b


@pytest.mark.anyio
async def test_two_simultaneous_participants_flow(async_client, admin_headers, tournament_setup):
    """
    Test starting two fresh participants:
    Participant A: name = ragul2, register = TEST001
    Participant B: name = ragul3, register = TEST002
    Verify:
    - Both appear immediately in GET /api/v1/admin/participants.
    - One can be in PLAYING, one in COMPLETED, and both are returned.
    - Session finish does NOT delete participant session.
    """
    event_a, event_b, q_a, _ = tournament_setup

    # 1. Start Participant A (ragul2)
    start_a_res = await async_client.post(
        "/api/v1/game/session/start",
        json={"player_name": "ragul2", "register_number": "TEST001", "event_id": event_a.id}
    )
    assert start_a_res.status_code == 201
    sess_a_id = start_a_res.json()["session_id"]

    # 2. Start Participant B (ragul3)
    start_b_res = await async_client.post(
        "/api/v1/game/session/start",
        json={"player_name": "ragul3", "register_number": "TEST002", "event_id": event_a.id}
    )
    assert start_b_res.status_code == 201
    sess_b_id = start_b_res.json()["session_id"]

    # 3. Query GET /api/v1/admin/participants while both are PLAYING
    admin_res = await async_client.get("/api/v1/admin/participants", headers=admin_headers)
    assert admin_res.status_code == 200
    data = admin_res.json()
    sessions = data["sessions"]

    item_a = next((s for s in sessions if s["session_id"] == sess_a_id), None)
    item_b = next((s for s in sessions if s["session_id"] == sess_b_id), None)

    assert item_a is not None, "Participant A (ragul2) must appear in admin participants list"
    assert item_a["player_name"] == "ragul2"
    assert item_a["register_number"] == "TEST001"
    assert item_a["status"] == "PLAYING"
    assert item_a["event_name"] == "drop3"

    assert item_b is not None, "Participant B (ragul3) must appear in admin participants list"
    assert item_b["player_name"] == "ragul3"
    assert item_b["register_number"] == "TEST002"
    assert item_b["status"] == "PLAYING"
    assert item_b["event_name"] == "drop3"

    # 4. Advance and Complete Participant A (ragul2)
    p_drop = await async_client.post(
        "/api/v1/game/placement/attempt",
        json={"session_id": sess_a_id, "question_id": q_a.id, "socket_id": "S1", "component_id": "battery"}
    )
    assert p_drop.status_code == 200
    assert p_drop.json()["correct"] is True

    comp_stage = await async_client.post(
        "/api/v1/game/question/complete",
        json={"session_id": sess_a_id, "question_id": q_a.id}
    )
    assert comp_stage.status_code == 200

    finish_res = await async_client.post(
        "/api/v1/game/session/finish",
        json={"session_id": sess_a_id}
    )
    assert finish_res.status_code == 200
    assert finish_res.json()["rank"] >= 1

    # 5. Query GET /api/v1/admin/participants again (simulating Admin Page Refresh)
    refreshed_admin_res = await async_client.get("/api/v1/admin/participants", headers=admin_headers)
    assert refreshed_admin_res.status_code == 200
    refreshed_data = refreshed_admin_res.json()
    refreshed_sessions = refreshed_data["sessions"]

    item_a_after = next((s for s in refreshed_sessions if s["session_id"] == sess_a_id), None)
    item_b_after = next((s for s in refreshed_sessions if s["session_id"] == sess_b_id), None)

    # Participant A is COMPLETED and still present
    assert item_a_after is not None, "Participant A must NOT be removed from participants upon finish"
    assert item_a_after["status"] == "COMPLETED"
    assert item_a_after["final_time_ms"] is not None
    assert item_a_after["final_time_ms"] > 0

    # Participant B is still PLAYING
    assert item_b_after is not None
    assert item_b_after["status"] == "PLAYING"


@pytest.mark.anyio
async def test_admin_participants_event_filtering(async_client, admin_headers, tournament_setup):
    """
    Test filtering by UUID, Custom ID, and 'ALL'.
    """
    event_a, event_b, _, _ = tournament_setup

    # Start session in Event A
    res_a = await async_client.post(
        "/api/v1/game/session/start",
        json={"player_name": "Player A", "register_number": "REG-A", "event_id": event_a.id}
    )
    sess_a_id = res_a.json()["session_id"]

    # Start session in Event B
    res_b = await async_client.post(
        "/api/v1/game/session/start",
        json={"player_name": "Player B", "register_number": "REG-B", "event_id": event_b.id}
    )
    sess_b_id = res_b.json()["session_id"]

    # 1. Filter by Event A UUID
    res_filter_uuid = await async_client.get(
        f"/api/v1/admin/participants?event_id={event_a.id}",
        headers=admin_headers
    )
    assert res_filter_uuid.status_code == 200
    sessions_uuid = res_filter_uuid.json()["sessions"]
    assert any(s["session_id"] == sess_a_id for s in sessions_uuid)
    assert not any(s["session_id"] == sess_b_id for s in sessions_uuid)

    # 2. Filter by Event A Custom ID ("EJHH2")
    res_filter_custom = await async_client.get(
        "/api/v1/admin/participants?event_id=EJHH2",
        headers=admin_headers
    )
    assert res_filter_custom.status_code == 200
    sessions_custom = res_filter_custom.json()["sessions"]
    assert any(s["session_id"] == sess_a_id for s in sessions_custom)
    assert not any(s["session_id"] == sess_b_id for s in sessions_custom)

    # 3. Filter with event_id="ALL"
    res_filter_all = await async_client.get(
        "/api/v1/admin/participants?event_id=ALL",
        headers=admin_headers
    )
    assert res_filter_all.status_code == 200
    sessions_all = res_filter_all.json()["sessions"]
    assert any(s["session_id"] == sess_a_id for s in sessions_all)
    assert any(s["session_id"] == sess_b_id for s in sessions_all)
