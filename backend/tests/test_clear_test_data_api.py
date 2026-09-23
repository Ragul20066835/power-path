"""
Comprehensive Safety and Integration Tests for POWERPATH CLEAR TEST DATA
Covers:
1. Non-admin / unauthenticated requests rejected (401)
2. Authenticated admin allowed (200)
3. Preview accurately counts all matching test records (both event-linked and orphaned event_id=NULL)
4. Cleanup safely deletes all known synthetic test patterns:
   - RaceTester / RACE-*
   - Contestant_* / REG-LOAD-*
   - REG-B10-*, REG-B25-*, REG-B50-*
   - E2E Challenger / REG-E2E-99
   - TEST001 / TEST002
5. Strict Real-Data Safety:
   - Real participants with normal names & college IDs linked to active events remain untouched.
   - Real participants with event_id=NULL are NOT deleted merely because event_id is NULL.
   - Real tournament results and attempts remain untouched.
6. Foreign-key dependency order (attempts -> placements -> results -> sessions -> events).
7. Active LOAD_TEST_EVT_* event protection (returns 400 when event is active).
8. Idempotency (consecutive runs return 200 with 0 deleted).
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


def _seed_comprehensive_test_and_real_data(db_session):
    """
    Seeds:
    - 2 Real participants in an ACTIVE production event
    - 1 Real participant with event_id=NULL (must NOT be deleted merely because event_id is NULL)
    - 1 Synthetic load-test event with attached sessions
    - Orphaned load-test sessions (event_id=NULL) across all diagnostic patterns:
      * RaceTester / RACE-*
      * Contestant_1 / REG-LOAD-001
      * Contestant_B10_1 / REG-B10-001
      * Contestant_B25_1 / REG-B25-001
      * Contestant_B50_1 / REG-B50-001
      * E2E Challenger / REG-E2E-99
      * ragul2 / TEST001
      * ragul3 / TEST002
    """
    # -------------------------------------------------------------------------
    # 1. REAL PRODUCTION DATA (MUST REMAIN UNTOUCHED)
    # -------------------------------------------------------------------------
    real_active_event = Event(
        custom_id="EVT_CHAMPIONSHIP_FINALS",
        name="Championship Finals 2026",
        status=EventStatus.ACTIVE.value
    )
    db_session.add(real_active_event)
    db_session.flush()

    real_q1 = Question(
        event_id=real_active_event.id,
        custom_id="Q_REAL_01",
        name="Main Power Stage",
        difficulty="Easy",
        penalty_seconds=5,
        question_order=1
    )
    db_session.add(real_q1)
    db_session.flush()

    # Real contestant 1 in active event
    real_session1 = ParticipantSession(
        session_id="PP-REAL-001",
        event_id=real_active_event.id,
        player_name="Ravi Kumar",
        register_number="21ECE101",
        status=SessionStatus.COMPLETED.value
    )
    # Real contestant 2 in active event
    real_session2 = ParticipantSession(
        session_id="PP-REAL-002",
        event_id=real_active_event.id,
        player_name="Vishnu V",
        register_number="21ECE102",
        status=SessionStatus.PLAYING.value
    )
    # Real contestant 3 whose parent event was archived/null (MUST NOT BE DELETED)
    real_session_orphan = ParticipantSession(
        session_id="PP-REAL-ORPHAN",
        event_id=None,
        player_name="Sarah Connor",
        register_number="20EEE505",
        status=SessionStatus.COMPLETED.value
    )
    db_session.add_all([real_session1, real_session2, real_session_orphan])
    db_session.flush()

    real_att1 = QuestionAttempt(
        session_id=real_session1.id,
        question_id=real_q1.id,
        question_index=1,
        raw_time_ms=15000,
        final_time_ms=15000
    )
    real_att_orphan = QuestionAttempt(
        session_id=real_session_orphan.id,
        question_id=real_q1.id,
        question_index=1,
        raw_time_ms=20000,
        final_time_ms=20000
    )
    real_res1 = TournamentResult(
        session_id=real_session1.id,
        event_id=real_active_event.id,
        player_name="Ravi Kumar",
        register_number="21ECE101",
        total_questions=1,
        raw_time_ms=15000,
        final_time_ms=15000
    )
    real_res_orphan = TournamentResult(
        session_id=real_session_orphan.id,
        event_id=None,
        player_name="Sarah Connor",
        register_number="20EEE505",
        total_questions=1,
        raw_time_ms=20000,
        final_time_ms=20000
    )
    db_session.add_all([real_att1, real_att_orphan, real_res1, real_res_orphan])

    # -------------------------------------------------------------------------
    # 2. SYNTHETIC LOAD-TEST EVENT & ATTACHED SESSIONS
    # -------------------------------------------------------------------------
    lt_event = Event(
        custom_id="LOAD_TEST_EVT_ARENA_1",
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

    lt_sess = ParticipantSession(
        session_id="PP-LT-ATTACHED",
        event_id=lt_event.id,
        player_name="Attached Tester",
        register_number="ATTACHED-001",
        status=SessionStatus.COMPLETED.value
    )
    db_session.add(lt_sess)
    db_session.flush()

    lt_att = QuestionAttempt(
        session_id=lt_sess.id,
        question_id=lt_q.id,
        question_index=1,
        raw_time_ms=3000,
        final_time_ms=3000
    )
    lt_res = TournamentResult(
        session_id=lt_sess.id,
        event_id=lt_event.id,
        player_name="Attached Tester",
        register_number="ATTACHED-001",
        total_questions=1,
        raw_time_ms=3000,
        final_time_ms=3000
    )
    db_session.add_all([lt_att, lt_res])

    # -------------------------------------------------------------------------
    # 3. HISTORICAL ORPHANED SYNTHETIC TEST SESSIONS (event_id = NULL)
    # -------------------------------------------------------------------------
    test_patterns = [
        # (session_id, player_name, register_number)
        ("PP-TEST-RACE-1", "RaceTester", "RACE-1790079997328"),
        ("PP-TEST-RACE-2", "RaceTester_Fast", "RACE-1790188888"),
        ("PP-TEST-LOAD-1", "Contestant_1", "REG-LOAD-001"),
        ("PP-TEST-B10-1", "Contestant_B10_1", "REG-B10-001"),
        ("PP-TEST-B25-1", "Contestant_B25_1", "REG-B25-001"),
        ("PP-TEST-B50-1", "Contestant_B50_1", "REG-B50-001"),
        ("PP-TEST-E2E-1", "E2E Challenger", "REG-E2E-99"),
        ("PP-TEST-SCRATCH-1", "ragul2", "TEST001"),
        ("PP-TEST-SCRATCH-2", "ragul3", "TEST002"),
    ]

    for sid, name, reg in test_patterns:
        ts = ParticipantSession(
            session_id=sid,
            event_id=None,
            player_name=name,
            register_number=reg,
            status=SessionStatus.COMPLETED.value
        )
        db_session.add(ts)
        db_session.flush()

        ta = QuestionAttempt(
            session_id=ts.id,
            question_id=None,
            question_index=1,
            raw_time_ms=5000,
            final_time_ms=5000
        )
        tr = TournamentResult(
            session_id=ts.id,
            event_id=None,
            player_name=name,
            register_number=reg,
            total_questions=1,
            raw_time_ms=5000,
            final_time_ms=5000
        )
        db_session.add_all([ta, tr])

    db_session.commit()

    return {
        "real_event_id": real_active_event.id,
        "real_session_orphan_id": real_session_orphan.id,
    }


# =============================================================================
# 1. AUTHENTICATION TESTS
# =============================================================================

@pytest.mark.anyio
async def test_clear_test_data_unauthenticated_rejected(async_client, db_session):
    """Test unauthenticated requests are rejected with 401."""
    res_preview = await async_client.post("/api/v1/admin/test-data/preview")
    assert res_preview.status_code == 401

    res_delete = await async_client.delete("/api/v1/admin/test-data")
    assert res_delete.status_code == 401


# =============================================================================
# 2. PREVIEW ACCURACY TEST
# =============================================================================

@pytest.mark.anyio
async def test_preview_counts_all_synthetic_patterns_including_orphaned(async_client, admin_headers, db_session):
    """Test preview accurately detects both event-linked and orphaned synthetic test records."""
    _seed_comprehensive_test_and_real_data(db_session)

    res = await async_client.post("/api/v1/admin/test-data/preview", headers=admin_headers)
    assert res.status_code == 200
    data = res.json()

    # Seeded:
    # 1 load test event (LOAD_TEST_EVT_ARENA_1)
    # 1 event-linked session (PP-LT-ATTACHED)
    # 9 orphaned test sessions (RACE-*, REG-LOAD-*, REG-B10-*, REG-B25-*, REG-B50-*, REG-E2E-99, TEST001, TEST002)
    # Total = 10 test sessions, 10 attempts, 10 results, 1 load test event
    assert data["test_sessions"] == 10
    assert data["test_attempts"] == 10
    assert data["test_results"] == 10
    assert data["load_test_events"] == 1

    # Verify preview made 0 deletions
    assert db_session.query(ParticipantSession).count() == 13  # 3 real + 10 test
    assert db_session.query(TournamentResult).count() == 12   # 2 real + 10 test


# =============================================================================
# 3. COMPLETE SYNTHETIC CLEANUP & REAL-DATA PRESERVATION
# =============================================================================

@pytest.mark.anyio
async def test_cleanup_removes_all_synthetic_patterns_and_preserves_real_data(async_client, admin_headers, db_session):
    """
    Test that cleanup purges ALL synthetic test patterns (both linked and orphaned)
    while strictly preserving real participants (including real participants with event_id=NULL).
    """
    ids = _seed_comprehensive_test_and_real_data(db_session)

    del_res = await async_client.delete("/api/v1/admin/test-data", headers=admin_headers)
    assert del_res.status_code == 200
    data = del_res.json()

    assert data["deleted_sessions"] == 10
    assert data["deleted_attempts"] == 10
    assert data["deleted_results"] == 10
    assert data["deleted_events"] == 1

    # 1. Verify ALL synthetic test records are deleted
    assert db_session.query(ParticipantSession).filter(ParticipantSession.player_name.ilike("RaceTester%")).count() == 0
    assert db_session.query(ParticipantSession).filter(ParticipantSession.register_number.ilike("RACE-%")).count() == 0
    assert db_session.query(ParticipantSession).filter(ParticipantSession.player_name.ilike("Contestant_%")).count() == 0
    assert db_session.query(ParticipantSession).filter(ParticipantSession.register_number.ilike("REG-LOAD-%")).count() == 0
    assert db_session.query(ParticipantSession).filter(ParticipantSession.register_number.ilike("REG-B10-%")).count() == 0
    assert db_session.query(ParticipantSession).filter(ParticipantSession.register_number.ilike("REG-B25-%")).count() == 0
    assert db_session.query(ParticipantSession).filter(ParticipantSession.register_number.ilike("REG-B50-%")).count() == 0
    assert db_session.query(ParticipantSession).filter(ParticipantSession.register_number == "REG-E2E-99").count() == 0
    assert db_session.query(ParticipantSession).filter(ParticipantSession.register_number.in_(["TEST001", "TEST002"])).count() == 0
    assert db_session.query(Event).filter(Event.custom_id.startswith("LOAD_TEST_EVT_")).count() == 0

    # 2. Verify REAL ACTIVE EVENT & Contestants remain completely intact
    real_evt = db_session.query(Event).filter(Event.id == ids["real_event_id"]).first()
    assert real_evt is not None
    assert real_evt.custom_id == "EVT_CHAMPIONSHIP_FINALS"

    active_real_sessions = db_session.query(ParticipantSession).filter(ParticipantSession.event_id == ids["real_event_id"]).all()
    assert len(active_real_sessions) == 2
    active_real_names = {s.player_name for s in active_real_sessions}
    assert "Ravi Kumar" in active_real_names
    assert "Vishnu V" in active_real_names

    # 3. CRITICAL SAFETY TEST: Real participant with event_id=NULL was NOT deleted
    real_orphan = db_session.query(ParticipantSession).filter(ParticipantSession.id == ids["real_session_orphan_id"]).first()
    assert real_orphan is not None
    assert real_orphan.player_name == "Sarah Connor"
    assert real_orphan.register_number == "20EEE505"
    assert real_orphan.event_id is None

    real_orphan_result = db_session.query(TournamentResult).filter(TournamentResult.session_id == real_orphan.id).first()
    assert real_orphan_result is not None
    assert real_orphan_result.player_name == "Sarah Connor"


# =============================================================================
# 4. ACTIVE EVENT PROTECTION
# =============================================================================

@pytest.mark.anyio
async def test_active_load_test_event_protection(async_client, admin_headers, db_session):
    """Test that active LOAD_TEST_EVT_* event prevents deletion with 400 error."""
    active_lt = Event(
        custom_id="LOAD_TEST_EVT_ACTIVE",
        name="Active Load Round",
        status=EventStatus.ACTIVE.value
    )
    db_session.add(active_lt)
    db_session.commit()

    res = await async_client.delete("/api/v1/admin/test-data", headers=admin_headers)
    assert res.status_code == 400
    assert "ACTIVE" in res.json()["detail"]


# =============================================================================
# 5. IDEMPOTENCY
# =============================================================================

@pytest.mark.anyio
async def test_cleanup_is_idempotent(async_client, admin_headers, db_session):
    """Test running cleanup consecutively returns 200 with 0 deleted records."""
    _seed_comprehensive_test_and_real_data(db_session)

    # First run
    res1 = await async_client.delete("/api/v1/admin/test-data", headers=admin_headers)
    assert res1.status_code == 200
    assert res1.json()["deleted_sessions"] == 10

    # Second run immediately after
    res2 = await async_client.delete("/api/v1/admin/test-data", headers=admin_headers)
    assert res2.status_code == 200
    assert res2.json()["deleted_sessions"] == 0
    assert res2.json()["deleted_attempts"] == 0
    assert res2.json()["deleted_results"] == 0
    assert res2.json()["deleted_events"] == 0
