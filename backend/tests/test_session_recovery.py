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


@pytest.mark.anyio
async def test_question_complete_id_validation_regression(async_client, multi_stage_event):
    """
    Comprehensive regression test for Question Completion ID Desync:
    1. Q1 completion with wrong ID is rejected with 400.
    2. Q2 completion while session is at Q1 is rejected with 400.
    3. Q1 completion with custom_id ('Q1') succeeds and advances to Q2.
    4. Response contains authoritative next question (Q2).
    5. Repeated Q1 completion is idempotent and returns 200.
    6. Q2 completion with UUID succeeds and finishes event.
    """
    event, q1, q2 = multi_stage_event

    # 1. Start Session
    start_res = await async_client.post(
        "/api/v1/game/session/start",
        json={"player_name": "Sync Tester", "register_number": "REG-SYNC-01", "event_id": event.id}
    )
    assert start_res.status_code == 201
    session_id = start_res.json()["session_id"]

    # 2. Complete placements on Q1
    for s_id, c_id in [("S1", "led"), ("S2", "resistor")]:
        p_res = await async_client.post(
            "/api/v1/game/placement/attempt",
            json={"session_id": session_id, "question_id": q1.id, "socket_id": s_id, "component_id": c_id}
        )
        assert p_res.status_code == 200
        assert p_res.json()["correct"] is True

    # 3. Attempt completion with WRONG ID (e.g. Q999 or stale defaultChallenges ID) -> MUST REJECT WITH 400
    wrong_comp_res = await async_client.post(
        "/api/v1/game/question/complete",
        json={"session_id": session_id, "question_id": "Q999_STALE_ID"}
    )
    assert wrong_comp_res.status_code == 400
    assert "Question ID does not match active stage" in wrong_comp_res.json()["detail"]

    # 4. Attempt completion with Q2 ID while session is on Q1 -> MUST REJECT WITH 400
    premature_q2_res = await async_client.post(
        "/api/v1/game/question/complete",
        json={"session_id": session_id, "question_id": q2.id}
    )
    assert premature_q2_res.status_code == 400
    assert "Question ID does not match active stage" in premature_q2_res.json()["detail"]

    # 5. Complete Q1 using custom_id ('Q1') -> MUST SUCCEED
    custom_comp_res = await async_client.post(
        "/api/v1/game/question/complete",
        json={"session_id": session_id, "question_id": q1.custom_id}
    )
    assert custom_comp_res.status_code == 200
    comp_data = custom_comp_res.json()
    assert comp_data["has_next_question"] is True
    assert comp_data["next_question"]["id"] == q2.id
    assert comp_data["next_question"]["custom_id"] == q2.custom_id

    # 6. Repeated completion for Q1 -> IDEMPOTENT (returns 200)
    repeat_res = await async_client.post(
        "/api/v1/game/question/complete",
        json={"session_id": session_id, "question_id": q1.id}
    )
    assert repeat_res.status_code == 200
    assert repeat_res.json()["message"] == "Stage already completed."

    # 7. Complete Q2 placements and complete using UUID
    p_q2 = await async_client.post(
        "/api/v1/game/placement/attempt",
        json={"session_id": session_id, "question_id": q2.id, "socket_id": "S1", "component_id": "ammeter"}
    )
    assert p_q2.status_code == 200

    q2_comp_res = await async_client.post(
        "/api/v1/game/question/complete",
        json={"session_id": session_id, "question_id": str(q2.id)}
    )
    assert q2_comp_res.status_code == 200
    assert q2_comp_res.json()["event_completed"] is True
    assert q2_comp_res.json()["has_next_question"] is False


@pytest.fixture
def twenty_stage_event(db_session):
    """Sets up a complete 20-stage tournament event."""
    settings = TournamentSettings(key="global", event_status="OPEN", default_penalty_seconds=5)
    db_session.merge(settings)

    event = Event(
        custom_id="TOURN20",
        name="PowerPath 20-Stage Championship",
        description="20 Stage Endurance Circuit Challenge",
        status="ACTIVE"
    )
    db_session.add(event)
    db_session.flush()

    questions = []
    for i in range(1, 21):
        is_final = (i == 20)
        q_name = "Final Circuit Rescue" if is_final else f"Circuit Stage {i}"
        q = Question(
            event_id=event.id,
            custom_id=f"Q{i}",
            name=q_name,
            difficulty="Hard" if is_final else ("Medium" if i > 10 else "Easy"),
            penalty_seconds=5,
            question_order=i
        )
        db_session.add(q)
        db_session.flush()
        questions.append(q)

        if is_final:
            # Q20: 5 sockets (Final Circuit Rescue)
            s1 = Socket(question_id=q.id, custom_id="S1", label="SOURCE", accepted_component_id="battery", hint="9V Battery", slot_order=1)
            s2 = Socket(question_id=q.id, custom_id="S2", label="SWITCH", accepted_component_id="switch", hint="Toggle Switch", slot_order=2)
            s3 = Socket(question_id=q.id, custom_id="S3", label="LIMITER", accepted_component_id="resistor", hint="330 Ohm", slot_order=3)
            s4 = Socket(question_id=q.id, custom_id="S4", label="INDICATOR", accepted_component_id="led", hint="LED", slot_order=4)
            s5 = Socket(question_id=q.id, custom_id="S5", label="GROUND", accepted_component_id="ground", hint="Ground", slot_order=5)
            db_session.add_all([s1, s2, s3, s4, s5])
        else:
            # Q1-Q19: 2 sockets
            s1 = Socket(question_id=q.id, custom_id="S1", label="SOURCE", accepted_component_id="battery", hint="9V Battery", slot_order=1)
            s2 = Socket(question_id=q.id, custom_id="S2", label="LOAD", accepted_component_id="resistor", hint="330 Ohm", slot_order=2)
            db_session.add_all([s1, s2])

    db_session.commit()
    return event, questions


@pytest.mark.anyio
async def test_twenty_stage_event_progression_and_q20_final_completion(async_client, twenty_stage_event):
    """
    Comprehensive regression test for 20-stage tournament:
    1. Event with 20 questions returns total_questions=20 at session start.
    2. Session starts at Q1 (index=0).
    3. Completing Q1 advances to Q2 (has_next_question=True).
    4. Progression through Q19 advances to Q20 (Final Circuit Rescue).
    5. Session recovery at Q20 restores index 19, total 20, and Q20 entity.
    6. Wrong Q20 ID or premature Q21 ID rejection (400).
    7. Q20 completion before sockets filled rejected (400).
    8. Q20 completion with 5/5 sockets solved succeeds:
       - has_next_question == False
       - next_question == None
       - event_completed == True
       - No Q21 is queried or fabricated.
    9. Duplicate Q20 completion remains idempotent (200).
    10. Session finish produces valid score, penalty, and rank.
    """
    event, questions = twenty_stage_event
    assert len(questions) == 20
    q1 = questions[0]
    q19 = questions[18]
    q20 = questions[19]

    # 1. Start Session
    start_res = await async_client.post(
        "/api/v1/game/session/start",
        json={"player_name": "Champion Player", "register_number": "REG-2026-CHAMP", "event_id": event.id}
    )
    assert start_res.status_code == 201
    start_data = start_res.json()
    session_id = start_data["session_id"]
    assert start_data["total_questions"] == 20
    assert start_data["current_question_index"] == 0
    assert start_data["current_question"]["id"] == q1.id

    # 2. Advance through Q1 to Q18
    for i in range(18):
        current_q = questions[i]
        next_expected_q = questions[i + 1]

        # Place S1 and S2
        p1 = await async_client.post(
            "/api/v1/game/placement/attempt",
            json={"session_id": session_id, "question_id": current_q.id, "socket_id": "S1", "component_id": "battery"}
        )
        assert p1.status_code == 200 and p1.json()["correct"] is True

        p2 = await async_client.post(
            "/api/v1/game/placement/attempt",
            json={"session_id": session_id, "question_id": current_q.id, "socket_id": "S2", "component_id": "resistor"}
        )
        assert p2.status_code == 200 and p2.json()["correct"] is True

        # Complete stage
        comp_res = await async_client.post(
            "/api/v1/game/question/complete",
            json={"session_id": session_id, "question_id": current_q.id}
        )
        assert comp_res.status_code == 200
        comp_data = comp_res.json()
        assert comp_data["has_next_question"] is True
        assert comp_data["event_completed"] is False
        assert comp_data["next_question"]["id"] == next_expected_q.id

    # 3. Complete Q19 -> Advances to Q20 (Final Circuit Rescue)
    for s_id, c_id in [("S1", "battery"), ("S2", "resistor")]:
        p = await async_client.post(
            "/api/v1/game/placement/attempt",
            json={"session_id": session_id, "question_id": q19.id, "socket_id": s_id, "component_id": c_id}
        )
        assert p.status_code == 200 and p.json()["correct"] is True

    comp_q19_res = await async_client.post(
        "/api/v1/game/question/complete",
        json={"session_id": session_id, "question_id": q19.id}
    )
    assert comp_q19_res.status_code == 200
    comp_q19_data = comp_q19_res.json()
    assert comp_q19_data["has_next_question"] is True
    assert comp_q19_data["next_question"]["id"] == q20.id
    assert comp_q19_data["next_question"]["name"] == "Final Circuit Rescue"
    assert len(comp_q19_data["next_question"]["sockets"]) == 5

    # 4. Session Recovery at Q20 (Player is on Stage 20 / 20)
    rec_q20 = await async_client.get(f"/api/v1/game/session/{session_id}")
    assert rec_q20.status_code == 200
    rec_q20_data = rec_q20.json()
    assert rec_q20_data["current_question_index"] == 19
    assert rec_q20_data["total_questions"] == 20
    assert rec_q20_data["current_question"]["id"] == q20.id
    assert rec_q20_data["current_question"]["name"] == "Final Circuit Rescue"
    assert len(rec_q20_data["current_question"]["sockets"]) == 5

    # 5. Premature / non-existent Q21 or wrong question ID rejected on Q20
    fake_q21_res = await async_client.post(
        "/api/v1/game/question/complete",
        json={"session_id": session_id, "question_id": "Q21_NON_EXISTENT"}
    )
    assert fake_q21_res.status_code == 400
    assert "Question ID does not match active stage" in fake_q21_res.json()["detail"]

    # 6. Complete Q20 before placing all 5 sockets -> Rejected with 400
    incomplete_q20 = await async_client.post(
        "/api/v1/game/question/complete",
        json={"session_id": session_id, "question_id": q20.id}
    )
    assert incomplete_q20.status_code == 400
    assert "is not solved yet" in incomplete_q20.json()["detail"]

    # 7. Solve all 5 sockets for Q20 (Final Circuit Rescue)
    q20_placements = [
        ("S1", "battery"),
        ("S2", "switch"),
        ("S3", "resistor"),
        ("S4", "led"),
        ("S5", "ground")
    ]
    for s_id, comp_id in q20_placements:
        p_res = await async_client.post(
            "/api/v1/game/placement/attempt",
            json={"session_id": session_id, "question_id": q20.id, "socket_id": s_id, "component_id": comp_id}
        )
        assert p_res.status_code == 200
        assert p_res.json()["correct"] is True

    # 8. Complete Q20 (Final Stage) -> MUST return has_next_question=False, next_question=None, event_completed=True
    comp_q20_res = await async_client.post(
        "/api/v1/game/question/complete",
        json={"session_id": session_id, "question_id": q20.id}
    )
    assert comp_q20_res.status_code == 200
    comp_q20_data = comp_q20_res.json()
    assert comp_q20_data["has_next_question"] is False
    assert comp_q20_data["next_question"] is None
    assert comp_q20_data["event_completed"] is True
    assert comp_q20_data["question_index"] == 20
    assert "All stages completed" in comp_q20_data["message"]

    # 9. Duplicate Q20 completion call is IDEMPOTENT (returns 200 without error)
    dup_q20_res = await async_client.post(
        "/api/v1/game/question/complete",
        json={"session_id": session_id, "question_id": q20.id}
    )
    assert dup_q20_res.status_code == 200
    assert dup_q20_res.json()["has_next_question"] is False
    assert dup_q20_res.json()["next_question"] is None
    assert dup_q20_res.json()["event_completed"] is True

    # 10. Finish Session
    finish_res = await async_client.post(
        "/api/v1/game/session/finish",
        json={"session_id": session_id}
    )
    assert finish_res.status_code == 200
    finish_data = finish_res.json()
    assert finish_data["player_name"] == "Champion Player"
    assert finish_data["total_questions"] == 20
    assert finish_data["final_time_ms"] > 0
    assert finish_data["rank"] >= 1

    # 11. Subsequent Session Recovery returns COMPLETED
    rec_final = await async_client.get(f"/api/v1/game/session/{session_id}")
    assert rec_final.status_code == 200
    assert rec_final.json()["status"] == "COMPLETED"
