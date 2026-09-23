"""
Unit and Integration Tests for Focused CLEAR TEST DATA Admin Action
Covers:
1. Non-admin / unauthenticated requests are rejected (401)
2. Authenticated admin is allowed (200)
3. Preview returns accurate test record counts without deleting
4. Clearing removes matching test sessions, attempts, placements, results, and load-test events
5. Real/non-test participants and events remain completely untouched
6. Repeated cleanup is safe and idempotent (returns 200 with 0 deleted)
7. Active event protection works (aborts with 400 when load-test event is active)
"""

import pytest
from app.models import (
    Event,
    Question,
    Socket,
    ParticipantSession,
    QuestionAttempt,
    SocketPlacement,
    TournamentResult,
)
from app.constants import EventStatus, SessionStatus


def _seed_test_and_real_data(db_session):
    """
    Seeds a combination of:
    - Real production event + real participants (must be preserved)
    - Synthetic load-test event (LOAD_TEST_EVT_*) + sessions (must be cleared)
    - Participants with 'RaceTester' name or 'RACE-' reg number (must be cleared)
    """
    # 1. Real Event & Real Contestants (DO NOT TOUCH)
    real_event = Event(
        custom_id="EVT_PRODUCTION_FINALS_2026",
        name="Official Championship Finals",
        status=EventStatus.INACTIVE.value
    )
    db_session.add(real_event)
    db_session.flush()

    real_q = Question(
        event_id=real_event.id,
        custom_id="Q_REAL_01",
        name="Main Power Stage",
        difficulty="Easy",
        penalty_seconds=5,
        question_order=1
    )
    db_session.add(real_q)
    db_session.flush()

    real_socket = Socket(question_id=real_q.id, custom_id="S1", label="VCC", accepted_component_id="battery")
    db_session.add(real_socket)
    db_session.flush()

    # Real participant 1: Normal student
    real_session1 = ParticipantSession(
        session_id="PP-REAL-001",
        event_id=real_event.id,
        player_name="John Doe",
        register_number="21ECE101",
        status=SessionStatus.COMPLETED.value
    )
    # Real participant 2: Another contestant
    real_session2 = ParticipantSession(
        session_id="PP-REAL-002",
        event_id=real_event.id,
        player_name="Jane Smith",
        register_number="21ECE102",
        status=SessionStatus.PLAYING.value
    )
    db_session.add_all([real_session1, real_session2])
    db_session.flush()

    real_attempt1 = QuestionAttempt(
        session_id=real_session1.id,
        question_id=real_q.id,
        question_index=1,
        raw_time_ms=12000,
        final_time_ms=12000
    )
    real_result1 = TournamentResult(
        session_id=real_session1.id,
        event_id=real_event.id,
        player_name="John Doe",
        register_number="21ECE101",
        total_questions=1,
        raw_time_ms=12000,
        final_time_ms=12000
    )
    db_session.add_all([real_attempt1, real_result1])

    # 2. Test Data Type A: Session with 'RaceTester' in player name
    test_session_name = ParticipantSession(
        session_id="PP-TEST-NAME-01",
        event_id=real_event.id,
        player_name="RaceTester",
        register_number="DEV-001",
        status=SessionStatus.COMPLETED.value
    )
    db_session.add(test_session_name)
    db_session.flush()

    test_attempt_name = QuestionAttempt(
        session_id=test_session_name.id,
        question_id=real_q.id,
        question_index=1,
        raw_time_ms=3000,
        final_time_ms=3000
    )
    test_result_name = TournamentResult(
        session_id=test_session_name.id,
        event_id=real_event.id,
        player_name="RaceTester",
        register_number="DEV-001",
        total_questions=1,
        raw_time_ms=3000,
        final_time_ms=3000
    )
    db_session.add_all([test_attempt_name, test_result_name])

    # 3. Test Data Type B: Session with 'RACE-' register number
    test_session_reg = ParticipantSession(
        session_id="PP-TEST-REG-01",
        event_id=real_event.id,
        player_name="SpeedBot",
        register_number="RACE-005",
        status=SessionStatus.COMPLETED.value
    )
    db_session.add(test_session_reg)
    db_session.flush()

    test_attempt_reg = QuestionAttempt(
        session_id=test_session_reg.id,
        question_id=real_q.id,
        question_index=1,
        raw_time_ms=4000,
        final_time_ms=4000
    )
    test_result_reg = TournamentResult(
        session_id=test_session_reg.id,
        event_id=real_event.id,
        player_name="SpeedBot",
        register_number="RACE-005",
        total_questions=1,
        raw_time_ms=4000,
        final_time_ms=4000
    )
    db_session.add_all([test_attempt_reg, test_result_reg])

    # 4. Test Data Type C: Synthetic Load-Test Event (LOAD_TEST_EVT_*)
    lt_event = Event(
        custom_id="LOAD_TEST_EVT_9999",
        name="Concurrency Load Test Arena",
        status=EventStatus.INACTIVE.value
    )
    db_session.add(lt_event)
    db_session.flush()

    lt_q = Question(
        event_id=lt_event.id,
        custom_id="Q_LT_01",
        name="LT Stage",
        difficulty="Easy",
        penalty_seconds=5,
        question_order=1
    )
    db_session.add(lt_q)
    db_session.flush()

    lt_socket = Socket(question_id=lt_q.id, custom_id="S1", label="LT_SRC", accepted_component_id="battery")
    db_session.add(lt_socket)
    db_session.flush()

    lt_session = ParticipantSession(
        session_id="PP-LT-9999",
        event_id=lt_event.id,
        player_name="Contestant_B50_01",
        register_number="REG-B50-001",
        status=SessionStatus.COMPLETED.value
    )
    db_session.add(lt_session)
    db_session.flush()

    lt_attempt = QuestionAttempt(
        session_id=lt_session.id,
        question_id=lt_q.id,
        question_index=1,
        raw_time_ms=2500,
        final_time_ms=2500
    )
    lt_result = TournamentResult(
        session_id=lt_session.id,
        event_id=lt_event.id,
        player_name="Contestant_B50_01",
        register_number="REG-B50-001",
        total_questions=1,
        raw_time_ms=2500,
        final_time_ms=2500
    )
    db_session.add_all([lt_attempt, lt_result])

    db_session.commit()

    return {
        "real_event_id": real_event.id,
        "lt_event_id": lt_event.id,
    }


# =============================================================================
# 1. AUTHENTICATION & ACCESS CONTROL
# =============================================================================

@pytest.mark.anyio
async def test_clear_test_data_unauthenticated_rejected(async_client, db_session):
    """Test that requests without valid admin credentials return 401."""
    res_preview = await async_client.post("/api/v1/admin/test-data/preview")
    assert res_preview.status_code == 401

    res_delete = await async_client.delete("/api/v1/admin/test-data")
    assert res_delete.status_code == 401


@pytest.mark.anyio
async def test_clear_test_data_authenticated_admin_allowed(async_client, admin_headers, db_session):
    """Test that authenticated admin can invoke preview and deletion."""
    res_preview = await async_client.post("/api/v1/admin/test-data/preview", headers=admin_headers)
    assert res_preview.status_code == 200

    res_delete = await async_client.delete("/api/v1/admin/test-data", headers=admin_headers)
    assert res_delete.status_code == 200


# =============================================================================
# 2. PREVIEW ENDPOINT
# =============================================================================

@pytest.mark.anyio
async def test_preview_returns_exact_test_counts_without_deleting(async_client, admin_headers, db_session):
    """Test that preview accurately counts test sessions, attempts, and results without deletion."""
    _seed_test_and_real_data(db_session)

    res = await async_client.post("/api/v1/admin/test-data/preview", headers=admin_headers)
    assert res.status_code == 200
    data = res.json()

    # We seeded 3 test sessions:
    # 1. RaceTester
    # 2. RACE-005
    # 3. Contestant_B50_01 in LOAD_TEST_EVT_9999
    assert data["test_sessions"] == 3
    assert data["test_attempts"] == 3
    assert data["test_results"] == 3
    assert data["load_test_events"] == 1

    # Verify no records deleted
    assert db_session.query(ParticipantSession).count() == 5  # 2 real + 3 test
    assert db_session.query(TournamentResult).count() == 4  # 1 real + 3 test


# =============================================================================
# 3. DELETION & TARGETING VERIFICATION
# =============================================================================

@pytest.mark.anyio
async def test_clear_test_data_deletes_only_test_records(async_client, admin_headers, db_session):
    """
    Test that clear_test_data removes ONLY test/load-test data and strictly preserves
    real participants, real attempts, real results, and real events.
    """
    ids = _seed_test_and_real_data(db_session)

    del_res = await async_client.delete("/api/v1/admin/test-data", headers=admin_headers)
    assert del_res.status_code == 200
    del_data = del_res.json()

    assert del_data["deleted_sessions"] == 3
    assert del_data["deleted_attempts"] == 3
    assert del_data["deleted_results"] == 3
    assert del_data["deleted_events"] == 1

    # 1. Verify test records are gone
    assert db_session.query(ParticipantSession).filter(ParticipantSession.player_name.ilike("RaceTester%")).count() == 0
    assert db_session.query(ParticipantSession).filter(ParticipantSession.register_number.ilike("RACE-%")).count() == 0
    assert db_session.query(Event).filter(Event.custom_id.startswith("LOAD_TEST_EVT_")).count() == 0

    # 2. Verify REAL event, questions, and sockets remain completely intact
    real_evt = db_session.query(Event).filter(Event.id == ids["real_event_id"]).first()
    assert real_evt is not None
    assert real_evt.custom_id == "EVT_PRODUCTION_FINALS_2026"
    assert len(real_evt.questions) == 1
    assert real_evt.total_sockets == 1

    # 3. Verify REAL participants, attempts, and results remain completely intact
    real_sessions = db_session.query(ParticipantSession).filter(ParticipantSession.event_id == ids["real_event_id"]).all()
    assert len(real_sessions) == 2

    real_names = {s.player_name for s in real_sessions}
    assert "John Doe" in real_names
    assert "Jane Smith" in real_names

    real_results = db_session.query(TournamentResult).filter(TournamentResult.event_id == ids["real_event_id"]).all()
    assert len(real_results) == 1
    assert real_results[0].player_name == "John Doe"


# =============================================================================
# 4. ACTIVE EVENT PROTECTION
# =============================================================================

@pytest.mark.anyio
async def test_active_event_protection(async_client, admin_headers, db_session):
    """Test that if a load-test event is currently ACTIVE, cleanup is blocked with HTTP 400."""
    active_lt_event = Event(
        custom_id="LOAD_TEST_EVT_ACTIVE",
        name="Active Load Test Round",
        status=EventStatus.ACTIVE.value
    )
    db_session.add(active_lt_event)
    db_session.commit()

    # Preview blocked
    preview_res = await async_client.post("/api/v1/admin/test-data/preview", headers=admin_headers)
    assert preview_res.status_code == 400
    assert "ACTIVE" in preview_res.json()["detail"]

    # Delete blocked
    del_res = await async_client.delete("/api/v1/admin/test-data", headers=admin_headers)
    assert del_res.status_code == 400
    assert "ACTIVE" in del_res.json()["detail"]

    # Record not deleted
    db_session.expire_all()
    assert db_session.query(Event).filter(Event.custom_id == "LOAD_TEST_EVT_ACTIVE").first() is not None


# =============================================================================
# 5. IDEMPOTENCY
# =============================================================================

@pytest.mark.anyio
async def test_cleanup_is_idempotent(async_client, admin_headers, db_session):
    """Test that running cleanup multiple times consecutively produces 200 with 0 deleted records."""
    _seed_test_and_real_data(db_session)

    # First run: deletes 3 sessions
    res1 = await async_client.delete("/api/v1/admin/test-data", headers=admin_headers)
    assert res1.status_code == 200
    assert res1.json()["deleted_sessions"] == 3

    # Second run immediately after: returns 0 deleted, no error
    res2 = await async_client.delete("/api/v1/admin/test-data", headers=admin_headers)
    assert res2.status_code == 200
    assert res2.json()["deleted_sessions"] == 0
    assert res2.json()["deleted_attempts"] == 0
    assert res2.json()["deleted_results"] == 0
    assert res2.json()["deleted_events"] == 0
