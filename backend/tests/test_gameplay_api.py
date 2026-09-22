"""
Authoritative Gameplay & Scoring Engine Tests
Tests:
- Session registration with server timestamp and secret answer exclusion
- Session recovery on page reload
- Authoritative placement validation (correct vs incorrect)
- Server-side penalty enforcement (+5s on wrong drop)
- Idempotency on repeated/double-click drop
- Inactive stage protection
- Question stage completion verification
- Multi-stage game progression
- Final session completion and immutable result calculation
- Duplicate finish idempotency
- Leaderboard ranking calculation
"""

import pytest
from app.models import Event, Question, Socket, TournamentSettings
from app.constants import TournamentGate


@pytest.fixture
def active_gameplay_event(db_session):
    """Sets up a complete 2-question event with sockets for gameplay testing."""
    # Ensure tournament is OPEN
    settings = TournamentSettings(key="global", event_status="OPEN", default_penalty_seconds=5)
    db_session.merge(settings)

    event = Event(
        custom_id="EVT_GAME_01",
        name="Championship Match",
        description="Live match",
        status="ACTIVE"
    )
    db_session.add(event)
    db_session.flush()

    # Question 1: 2 sockets (Battery in S1, Ground in S2)
    q1 = Question(
        event_id=event.id,
        custom_id="Q001",
        name="Stage 1 - Power Foundation",
        difficulty="Easy",
        penalty_seconds=5,
        question_order=1
    )
    db_session.add(q1)
    db_session.flush()

    s1_q1 = Socket(question_id=q1.id, custom_id="S1", label="POWER", accepted_component_id="battery", hint="9V Source")
    s2_q1 = Socket(question_id=q1.id, custom_id="S2", label="GROUND", accepted_component_id="ground", hint="0V Reference")
    db_session.add_all([s1_q1, s2_q1])

    # Question 2: 1 socket (Resistor in S1)
    q2 = Question(
        event_id=event.id,
        custom_id="Q002",
        name="Stage 2 - Current Limiting",
        difficulty="Medium",
        penalty_seconds=5,
        question_order=2
    )
    db_session.add(q2)
    db_session.flush()

    s1_q2 = Socket(question_id=q2.id, custom_id="S1", label="RESISTOR", accepted_component_id="resistor", hint="330Ω Limiter")
    db_session.add(s1_q2)

    db_session.commit()
    return event


@pytest.mark.anyio
async def test_game_session_start_and_recovery(async_client, active_gameplay_event):
    """Test player session initialization and authoritative state recovery."""
    payload = {
        "player_name": "Sarah Connor",
        "register_number": "REG-1001",
        "event_id": active_gameplay_event.id
    }

    # 1. Start Session
    start_res = await async_client.post("/api/v1/game/session/start", json=payload)
    assert start_res.status_code == 201
    start_data = start_res.json()

    assert start_data["player_name"] == "Sarah Connor"
    assert start_data["register_number"] == "REG-1001"
    assert start_data["status"] == "PLAYING"
    assert start_data["current_question_index"] == 0
    assert start_data["total_questions"] == 2
    assert start_data["penalty_seconds_total"] == 0
    assert start_data["wrong_attempts_total"] == 0
    assert start_data["session_id"].startswith("PP-")

    # CRITICAL: Verify secret answer accepted_component_id is NOT exposed in start response
    current_q = start_data["current_question"]
    assert current_q["custom_id"] == "Q001"
    for sock in current_q["sockets"]:
        assert "accepted_component_id" not in sock

    session_id = start_data["session_id"]

    # 2. Recover Session (Simulating browser refresh)
    rec_res = await async_client.get(f"/api/v1/game/session/{session_id}")
    assert rec_res.status_code == 200
    rec_data = rec_res.json()
    assert rec_data["session_id"] == session_id
    assert rec_data["player_name"] == "Sarah Connor"
    assert rec_data["current_question"]["custom_id"] == "Q001"
    assert rec_data["placed_socket_ids"] == []


@pytest.mark.anyio
async def test_tournament_closed_blocks_session_start(async_client, active_gameplay_event, db_session):
    """Test that tournament status CLOSED rejects new registrations."""
    settings = db_session.query(TournamentSettings).filter(TournamentSettings.key == "global").first()
    settings.event_status = TournamentGate.CLOSED.value
    db_session.commit()

    res = await async_client.post(
        "/api/v1/game/session/start",
        json={"player_name": "Blocked Player", "register_number": "REG-999"}
    )
    assert res.status_code == 403
    assert "CLOSED" in res.json()["detail"]


@pytest.mark.anyio
async def test_placement_validation_and_penalty_calculation(async_client, active_gameplay_event):
    """
    Test correct and incorrect placement attempts.
    Verifies:
    - Incorrect placement adds +5s penalty and increments wrong count
    - Correct placement records placement without penalty
    - Idempotent repeated placement on already completed socket adds 0 penalty
    """
    start_res = await async_client.post(
        "/api/v1/game/session/start",
        json={"player_name": "Circuit Hero", "register_number": "REG-2002"}
    )
    session_id = start_res.json()["session_id"]
    q1 = start_res.json()["current_question"]
    s1_id = q1["sockets"][0]["id"]
    s2_id = q1["sockets"][1]["id"]

    # 1. WRONG PLACEMENT (Voltmeter into S1 - Battery slot)
    wrong_res = await async_client.post(
        "/api/v1/game/placement/attempt",
        json={
            "session_id": session_id,
            "question_id": q1["id"],
            "socket_id": s1_id,
            "component_id": "voltmeter"
        }
    )
    assert wrong_res.status_code == 200
    wrong_data = wrong_res.json()
    assert wrong_data["correct"] is False
    assert wrong_data["penalty_applied"] == 5
    assert wrong_data["wrong_attempts_total"] == 1
    assert wrong_data["penalty_seconds_total"] == 5

    # 2. SECOND WRONG PLACEMENT (Resistor into S1)
    wrong_res_2 = await async_client.post(
        "/api/v1/game/placement/attempt",
        json={
            "session_id": session_id,
            "question_id": q1["id"],
            "socket_id": s1_id,
            "component_id": "resistor"
        }
    )
    assert wrong_res_2.status_code == 200
    wrong_data_2 = wrong_res_2.json()
    assert wrong_data_2["correct"] is False
    assert wrong_data_2["penalty_applied"] == 5
    assert wrong_data_2["wrong_attempts_total"] == 2
    assert wrong_data_2["penalty_seconds_total"] == 10

    # 3. CORRECT PLACEMENT (9V Battery into S1)
    correct_res = await async_client.post(
        "/api/v1/game/placement/attempt",
        json={
            "session_id": session_id,
            "question_id": q1["id"],
            "socket_id": s1_id,
            "component_id": "9V Battery"  # Test normalization
        }
    )
    assert correct_res.status_code == 200
    correct_data = correct_res.json()
    assert correct_data["correct"] is True
    assert correct_data["penalty_applied"] == 0
    assert correct_data["penalty_seconds_total"] == 10
    assert correct_data["wrong_attempts_total"] == 2

    # 4. IDEMPOTENT REPEATED PLACEMENT (Battery into S1 again)
    repeat_res = await async_client.post(
        "/api/v1/game/placement/attempt",
        json={
            "session_id": session_id,
            "question_id": q1["id"],
            "socket_id": s1_id,
            "component_id": "battery"
        }
    )
    assert repeat_res.status_code == 200
    repeat_data = repeat_res.json()
    assert repeat_data["correct"] is True
    assert repeat_data["already_completed"] is True
    assert repeat_data["penalty_applied"] == 0
    assert repeat_data["penalty_seconds_total"] == 10  # NO extra penalty added!

    # 5. CORRECT PLACEMENT FOR S2 (Ground component)
    gnd_res = await async_client.post(
        "/api/v1/game/placement/attempt",
        json={
            "session_id": session_id,
            "question_id": q1["id"],
            "socket_id": s2_id,
            "component_id": "Earth 0V"  # Test Ground normalization
        }
    )
    assert gnd_res.status_code == 200
    assert gnd_res.json()["correct"] is True


@pytest.mark.anyio
async def test_full_game_lifecycle_to_finish(async_client, active_gameplay_event):
    """
    Test complete end-to-end player match:
    - Stage 1 solve -> Stage 1 complete
    - Stage 2 solve -> Stage 2 complete
    - Finish match -> Immutable Result -> Idempotency verification
    """
    start_res = await async_client.post(
        "/api/v1/game/session/start",
        json={"player_name": "Master Champion", "register_number": "REG-3003"}
    )
    session_id = start_res.json()["session_id"]
    q1 = start_res.json()["current_question"]

    # Try to complete Q1 prematurely before solving sockets -> must fail
    premature_res = await async_client.post(
        "/api/v1/game/question/complete",
        json={"session_id": session_id, "question_id": q1["id"]}
    )
    assert premature_res.status_code == 400
    assert "not solved yet" in premature_res.json()["detail"]

    # Solve Q1 sockets
    await async_client.post(
        "/api/v1/game/placement/attempt",
        json={"session_id": session_id, "question_id": q1["id"], "socket_id": q1["sockets"][0]["id"], "component_id": "battery"}
    )
    await async_client.post(
        "/api/v1/game/placement/attempt",
        json={"session_id": session_id, "question_id": q1["id"], "socket_id": q1["sockets"][1]["id"], "component_id": "ground"}
    )

    # Complete Stage 1
    q1_comp_res = await async_client.post(
        "/api/v1/game/question/complete",
        json={"session_id": session_id, "question_id": q1["id"]}
    )
    assert q1_comp_res.status_code == 200
    q1_comp_data = q1_comp_res.json()
    assert q1_comp_data["has_next_question"] is True
    assert q1_comp_data["next_question"]["custom_id"] == "Q002"

    q2 = q1_comp_data["next_question"]

    # Solve Stage 2 socket
    await async_client.post(
        "/api/v1/game/placement/attempt",
        json={"session_id": session_id, "question_id": q2["id"], "socket_id": q2["sockets"][0]["id"], "component_id": "resistor"}
    )

    # Complete Stage 2
    q2_comp_res = await async_client.post(
        "/api/v1/game/question/complete",
        json={"session_id": session_id, "question_id": q2["id"]}
    )
    assert q2_comp_res.status_code == 200
    assert q2_comp_res.json()["has_next_question"] is False
    assert q2_comp_res.json()["event_completed"] is True

    # Finish Session
    finish_res = await async_client.post(
        "/api/v1/game/session/finish",
        json={"session_id": session_id}
    )
    assert finish_res.status_code == 200
    result_data = finish_res.json()
    assert result_data["player_name"] == "Master Champion"
    assert result_data["register_number"] == "REG-3003"
    assert result_data["total_questions"] == 2
    assert result_data["raw_time_ms"] >= 0
    assert result_data["final_time_ms"] == result_data["raw_time_ms"] + (result_data["total_penalty_seconds"] * 1000)
    assert result_data["rank"] == 1

    # Idempotent Finish Call: Must return same result without error or duplicate records
    finish_res_2 = await async_client.post(
        "/api/v1/game/session/finish",
        json={"session_id": session_id}
    )
    assert finish_res_2.status_code == 200
    assert finish_res_2.json()["id"] == result_data["id"]


@pytest.mark.anyio
async def test_start_session_with_custom_event_id_err2s(async_client, db_session):
    """Regression test 6a: start session using a valid custom event ID such as 'ERR2S'."""
    settings = TournamentSettings(key="global", event_status="OPEN", default_penalty_seconds=5)
    db_session.merge(settings)

    event = Event(
        custom_id="ERR2S",
        name="Production Active Event",
        description="Event with custom_id ERR2S",
        status="ACTIVE"
    )
    db_session.add(event)
    db_session.flush()

    q1 = Question(
        event_id=event.id,
        custom_id="Q1",
        name="Question 1",
        difficulty="Easy",
        penalty_seconds=5,
        question_order=1
    )
    db_session.add(q1)
    db_session.flush()

    s1 = Socket(question_id=q1.id, custom_id="S1", label="POWER", accepted_component_id="battery", hint="9V Source")
    db_session.add(s1)
    db_session.commit()

    res = await async_client.post(
        "/api/v1/game/session/start",
        json={"player_name": "Alex Vance", "register_number": "REG-ERR2S", "event_id": "ERR2S"}
    )
    assert res.status_code == 201
    data = res.json()
    assert data["player_name"] == "Alex Vance"
    assert data["status"] == "PLAYING"
    assert data["current_question"]["custom_id"] == "Q1"


@pytest.mark.anyio
async def test_start_session_with_uuid_event_id(async_client, db_session):
    """Regression test 6b: start session using a UUID event ID."""
    settings = TournamentSettings(key="global", event_status="OPEN", default_penalty_seconds=5)
    db_session.merge(settings)

    event = Event(
        custom_id="EVT_UUID_TEST",
        name="UUID Test Event",
        description="Event lookup by UUID",
        status="ACTIVE"
    )
    db_session.add(event)
    db_session.flush()

    q1 = Question(
        event_id=event.id,
        custom_id="Q100",
        name="Question 100",
        difficulty="Easy",
        penalty_seconds=5,
        question_order=1
    )
    db_session.add(q1)
    db_session.flush()

    s1 = Socket(question_id=q1.id, custom_id="S1", label="POWER", accepted_component_id="battery", hint="9V Source")
    db_session.add(s1)
    db_session.commit()

    res = await async_client.post(
        "/api/v1/game/session/start",
        json={"player_name": "Gordon Freeman", "register_number": "REG-UUID", "event_id": event.id}
    )
    assert res.status_code == 201
    data = res.json()
    assert data["player_name"] == "Gordon Freeman"
    assert data["status"] == "PLAYING"


@pytest.mark.anyio
async def test_start_session_non_uuid_custom_id_never_queries_event_id(async_client, db_session, monkeypatch):
    """Regression test 7: prove that a non-UUID custom_id ('ERR2S') never reaches Event.id comparison."""
    settings = TournamentSettings(key="global", event_status="OPEN", default_penalty_seconds=5)
    db_session.merge(settings)

    event = Event(
        custom_id="ERR2S",
        name="Custom ID Test Event",
        description="Ensures Event.id is never compared against non-UUID",
        status="ACTIVE"
    )
    db_session.add(event)
    db_session.flush()

    q1 = Question(
        event_id=event.id,
        custom_id="Q1",
        name="Stage 1",
        difficulty="Easy",
        penalty_seconds=5,
        question_order=1
    )
    db_session.add(q1)
    db_session.flush()
    db_session.add(Socket(question_id=q1.id, custom_id="S1", label="POWER", accepted_component_id="battery"))
    db_session.commit()

    queried_expressions = []
    from sqlalchemy.orm import Query
    orig_query_filter = Query.filter

    def tracking_filter(self, *criterion):
        for crit in criterion:
            crit_str = str(crit)
            queried_expressions.append(crit_str)
            if "events.id" in crit_str and "events.custom_id" in crit_str:
                raise AssertionError(f"Unsafe combined OR query detected on Event: {crit_str}")
        return orig_query_filter(self, *criterion)

    monkeypatch.setattr(Query, "filter", tracking_filter)

    res = await async_client.post(
        "/api/v1/game/session/start",
        json={"player_name": "Alyx Vance", "register_number": "REG-TEST", "event_id": "ERR2S"}
    )
    assert res.status_code == 201

    event_custom_id_queried = any("events.custom_id" in expr for expr in queried_expressions)
    assert event_custom_id_queried is True

    for expr in queried_expressions:
        if "events.custom_id" in expr:
            assert "events.id" not in expr, f"Unsafe combined OR query detected: {expr}"

