"""
Regression & Authoritative Session Recovery Tests
Specifically tests:
- Session recovery across refresh
- Question desync prevention: Q2 placement rejected when session is at Q1
- Correct stage completion advancing server state to Q2
- Session recovery after stage advancement returns Q2
- Non-existent session recovery returns HTTP 404
- Event completion and ranking calculation
"""

import pytest
from app.models import Event, Question, Socket, TournamentSettings


@pytest.fixture
def multi_stage_event(db_session):
    """Sets up a 2-stage event with custom IDs for authoritative progression tests."""
    settings = TournamentSettings(key="global", event_status="OPEN", default_penalty_seconds=5)
    db_session.merge(settings)

    event = Event(
        custom_id="ERR2S",
        name="electrox",
        description="Production Event Reproduction",
        status="ACTIVE"
    )
    db_session.add(event)
    db_session.flush()

    # Question 1: Stage 1 (LED Current Protection) -> 2 sockets
    q1 = Question(
        event_id=event.id,
        custom_id="Q1",
        name="LED Current Protection",
        difficulty="Easy",
        penalty_seconds=5,
        question_order=1
    )
    db_session.add(q1)
    db_session.flush()

    s1_q1 = Socket(question_id=q1.id, custom_id="S1", label="LED", accepted_component_id="led", hint="Red LED")
    s2_q1 = Socket(question_id=q1.id, custom_id="S2", label="RESISTOR", accepted_component_id="resistor", hint="330 Ohm")
    db_session.add_all([s1_q1, s2_q1])

    # Question 2: Stage 2 (Current Measurement) -> 1 socket
    q2 = Question(
        event_id=event.id,
        custom_id="Q2",
        name="Current Measurement",
        difficulty="Medium",
        penalty_seconds=5,
        question_order=2
    )
    db_session.add(q2)
    db_session.flush()

    s1_q2 = Socket(question_id=q2.id, custom_id="S1", label="AMMETER", accepted_component_id="ammeter", hint="Series Ammeter")
    db_session.add(s1_q2)

    db_session.commit()
    return event, q1, q2


@pytest.mark.anyio
async def test_session_recovery_and_question_progression_authoritative(async_client, multi_stage_event):
    """
    Verifies that:
    1. Started session is at Q1.
    2. Attempting placement for Q2 is REJECTED while session is at Q1.
    3. Session recovery GET returns Q1.
    4. Placing Q1 correctly and completing Q1 updates session to Q2.
    5. Session recovery GET returns Q2.
    6. Attempting placement for Q1 is REJECTED while session is at Q2.
    7. Placing Q2 correctly and completing Q2 marks event complete.
    8. Finishing session returns valid score and rank.
    """
    event, q1, q2 = multi_stage_event

    # 1. Start Session
    start_res = await async_client.post(
        "/api/v1/game/session/start",
        json={"player_name": "Test Player", "register_number": "REG-2026", "event_id": event.id}
    )
    assert start_res.status_code == 201
    start_data = start_res.json()
    session_id = start_data["session_id"]
    assert start_data["current_question"]["id"] == q1.id
    assert start_data["current_question"]["name"] == "LED Current Protection"

    # 2. Bug 1 Regression Test: Attempt placement on Question 2 while active is Question 1
    # Backend MUST reject with 400
    q2_placement_res = await async_client.post(
        "/api/v1/game/placement/attempt",
        json={
            "session_id": session_id,
            "question_id": q2.id,
            "socket_id": "S1",
            "component_id": "ammeter"
        }
    )
    assert q2_placement_res.status_code == 400
    err_detail = q2_placement_res.json()["detail"]
    assert "Active question is stage 1" in err_detail

    # 3. Session Recovery at Q1 (Bug 2 Regression Test)
    rec_res = await async_client.get(f"/api/v1/game/session/{session_id}")
    assert rec_res.status_code == 200
    rec_data = rec_res.json()
    assert rec_data["status"] == "PLAYING"
    assert rec_data["current_question"]["id"] == q1.id
    assert rec_data["current_question_index"] == 0
    assert rec_data["current_question"]["name"] == "LED Current Protection"

    # 4. Perform wrong placement on Q1 -> penalty added
    wrong_drop_res = await async_client.post(
        "/api/v1/game/placement/attempt",
        json={
            "session_id": session_id,
            "question_id": q1.id,
            "socket_id": "S1",
            "component_id": "voltmeter"
        }
    )
    assert wrong_drop_res.status_code == 200
    assert wrong_drop_res.json()["correct"] is False
    assert wrong_drop_res.json()["wrong_attempts_total"] == 1
    assert wrong_drop_res.json()["penalty_seconds_total"] == 5

    # 5. Perform correct placements on Q1
    p1_res = await async_client.post(
        "/api/v1/game/placement/attempt",
        json={
            "session_id": session_id,
            "question_id": q1.id,
            "socket_id": "S1",
            "component_id": "led"
        }
    )
    assert p1_res.status_code == 200
    assert p1_res.json()["correct"] is True

    p2_res = await async_client.post(
        "/api/v1/game/placement/attempt",
        json={
            "session_id": session_id,
            "question_id": q1.id,
            "socket_id": "S2",
            "component_id": "resistor"
        }
    )
    assert p2_res.status_code == 200
    assert p2_res.json()["correct"] is True

    # 6. Complete Question 1 Stage
    comp_q1_res = await async_client.post(
        "/api/v1/game/question/complete",
        json={"session_id": session_id, "question_id": q1.id}
    )
    assert comp_q1_res.status_code == 200
    comp_q1_data = comp_q1_res.json()
    assert comp_q1_data["has_next_question"] is True
    assert comp_q1_data["event_completed"] is False
    assert comp_q1_data["next_question"]["id"] == q2.id
    assert comp_q1_data["next_question"]["name"] == "Current Measurement"
    assert comp_q1_data["wrong_attempts_total"] == 1
    assert comp_q1_data["penalty_seconds_total"] == 5

    # 7. Session Recovery at Q2 (Page reload after Q1 completed)
    rec2_res = await async_client.get(f"/api/v1/game/session/{session_id}")
    assert rec2_res.status_code == 200
    rec2_data = rec2_res.json()
    assert rec2_data["current_question_index"] == 1
    assert rec2_data["current_question"]["id"] == q2.id
    assert rec2_data["current_question"]["name"] == "Current Measurement"
    assert rec2_data["wrong_attempts_total"] == 1
    assert rec2_data["penalty_seconds_total"] == 5

    # 8. Attempt placement on old Question 1 while active is Question 2 -> MUST fail with 400
    old_q1_placement = await async_client.post(
        "/api/v1/game/placement/attempt",
        json={
            "session_id": session_id,
            "question_id": q1.id,
            "socket_id": "S1",
            "component_id": "led"
        }
    )
    assert old_q1_placement.status_code == 400
    assert "Active question is stage 2" in old_q1_placement.json()["detail"]

    # 9. Perform correct placement on Question 2
    p3_res = await async_client.post(
        "/api/v1/game/placement/attempt",
        json={
            "session_id": session_id,
            "question_id": q2.id,
            "socket_id": "S1",
            "component_id": "ammeter"
        }
    )
    assert p3_res.status_code == 200
    assert p3_res.json()["correct"] is True

    # 10. Complete Question 2 Stage (Final Question)
    comp_q2_res = await async_client.post(
        "/api/v1/game/question/complete",
        json={"session_id": session_id, "question_id": q2.id}
    )
    assert comp_q2_res.status_code == 200
    comp_q2_data = comp_q2_res.json()
    assert comp_q2_data["has_next_question"] is False
    assert comp_q2_data["event_completed"] is True
    assert comp_q2_data["next_question"] is None

    # 11. Finish Session
    finish_res = await async_client.post(
        "/api/v1/game/session/finish",
        json={"session_id": session_id}
    )
    assert finish_res.status_code == 200
    finish_data = finish_res.json()
    assert finish_data["player_name"] == "Test Player"
    assert finish_data["register_number"] == "REG-2026"
    assert finish_data["total_wrong_attempts"] == 1
    assert finish_data["total_penalty_seconds"] == 5
    assert finish_data["final_time_ms"] > 0
    assert finish_data["rank"] == 1

    # 12. Subsequent Session Recovery after completion returns COMPLETED
    rec3_res = await async_client.get(f"/api/v1/game/session/{session_id}")
    assert rec3_res.status_code == 200
    assert rec3_res.json()["status"] == "COMPLETED"


@pytest.mark.anyio
async def test_session_recovery_non_existent_id(async_client):
    """Test that requesting an invalid or non-existent session ID cleanly returns 404."""
    res = await async_client.get("/api/v1/game/session/PP-NONEXISTENT-UUID")
    assert res.status_code == 404
    assert "not found" in res.json()["detail"].lower()
