"""
Settings & Results Leaderboard API Tests
Tests:
- GET /api/v1/settings
- POST /api/v1/admin/settings
- GET /api/v1/admin/results
- GET /api/v1/results/leaderboard
"""

import pytest
from app.models import Event, ParticipantSession, TournamentResult


@pytest.mark.anyio
async def test_tournament_settings_flow(async_client, admin_headers):
    """Test retrieving public settings and updating them via admin endpoint."""
    # 1. Get initial public settings
    res = await async_client.get("/api/v1/settings")
    assert res.status_code == 200
    data = res.json()
    assert data["event_status"] in ("OPEN", "PAUSED", "CLOSED")
    assert data["default_penalty_seconds"] == 5

    # 2. Update settings via Admin API
    update_payload = {
        "event_status": "PAUSED",
        "default_penalty_seconds": 10,
        "allow_replay": False
    }
    admin_res = await async_client.post("/api/v1/admin/settings", json=update_payload, headers=admin_headers)
    assert admin_res.status_code == 200
    admin_data = admin_res.json()
    assert admin_data["event_status"] == "PAUSED"
    assert admin_data["default_penalty_seconds"] == 10
    assert admin_data["allow_replay"] is False

    # 3. Verify public view reflects update
    res2 = await async_client.get("/api/v1/settings")
    assert res2.json()["event_status"] == "PAUSED"


@pytest.mark.anyio
async def test_leaderboard_and_admin_results(async_client, admin_headers, db_session):
    """Test leaderboard ordering by final_time_ms ascending."""
    event = Event(custom_id="EVT_LEADERBOARD", name="Leaderboard Event", status="ACTIVE")
    db_session.add(event)
    db_session.commit()

    # Contestant 1: final_time = 45000ms
    s1 = ParticipantSession(session_id="PP-LEAD-1", event_id=event.id, player_name="Runner Up", register_number="REG-10", status="COMPLETED")
    # Contestant 2: final_time = 25000ms (Fastest)
    s2 = ParticipantSession(session_id="PP-LEAD-2", event_id=event.id, player_name="Speed Master", register_number="REG-20", status="COMPLETED")
    db_session.add_all([s1, s2])
    db_session.flush()

    r1 = TournamentResult(session_id=s1.id, event_id=event.id, player_name="Runner Up", register_number="REG-10", total_questions=2, raw_time_ms=40000, total_penalty_seconds=5, final_time_ms=45000, rank=2)
    r2 = TournamentResult(session_id=s2.id, event_id=event.id, player_name="Speed Master", register_number="REG-20", total_questions=2, raw_time_ms=25000, total_penalty_seconds=0, final_time_ms=25000, rank=1)

    db_session.add_all([r1, r2])
    db_session.commit()

    # Admin Results
    admin_res = await async_client.get(f"/api/v1/admin/results?event_id={event.id}", headers=admin_headers)
    assert admin_res.status_code == 200
    results = admin_res.json()
    assert len(results) == 2
    assert results[0]["player_name"] == "Speed Master"
    assert results[0]["final_time_ms"] == 25000
    assert results[1]["player_name"] == "Runner Up"
    assert results[1]["final_time_ms"] == 45000

    # Public Leaderboard
    public_res = await async_client.get(f"/api/v1/results/leaderboard?event_id={event.id}")
    assert public_res.status_code == 200
    lead_entries = public_res.json()
    assert len(lead_entries) == 2
    assert lead_entries[0]["rank"] == 1
    assert lead_entries[0]["player_name"] == "Speed Master"


@pytest.mark.anyio
async def test_result_public_uuid_session_id_serialization(async_client, admin_headers, db_session, monkeypatch):
    """
    Regression Test: Ensure ResultPublic and /admin/results serialize uuid.UUID session_id
    and event_id objects without Pydantic validation errors (pydantic_core.ValidationError).
    """
    import uuid
    from unittest.mock import MagicMock
    from datetime import datetime, timezone
    from app.schemas import ResultPublic, AttemptPublic, SessionPublic

    res_uuid = uuid.uuid4()
    sess_uuid = uuid.uuid4()
    evt_uuid = uuid.uuid4()

    # 1. Direct Model Validation with uuid.UUID session_id and event_id
    raw_dict = {
        "id": res_uuid,
        "session_id": sess_uuid,
        "event_id": evt_uuid,
        "player_name": "UUID Tester",
        "register_number": "REG-UUID-1",
        "total_questions": 20,
        "raw_time_ms": 120000,
        "total_wrong_attempts": 2,
        "total_penalty_seconds": 10,
        "final_time_ms": 130000,
        "rank": 1,
        "question_breakdowns": [],
        "completed_at": datetime.now(timezone.utc)
    }

    validated = ResultPublic.model_validate(raw_dict)
    assert validated.id == str(res_uuid)
    assert validated.session_id == str(sess_uuid)
    assert validated.event_id == str(evt_uuid)
    assert isinstance(validated.session_id, str)

    # 2. Direct AttemptPublic Validation with uuid.UUID session_id
    att_validated = AttemptPublic.model_validate({
        "id": res_uuid,
        "session_id": sess_uuid,
        "question_id": evt_uuid,
        "question_index": 1,
        "raw_time_ms": 5000,
        "wrong_attempts": 0,
        "penalty_seconds": 0,
        "final_time_ms": 5000,
        "completed_at": datetime.now(timezone.utc)
    })
    assert att_validated.session_id == str(sess_uuid)

    # 3. Direct SessionPublic Validation with uuid.UUID session_id
    sess_validated = SessionPublic.model_validate({
        "id": sess_uuid,
        "session_id": sess_uuid,
        "event_id": evt_uuid,
        "player_name": "Sess Tester",
        "register_number": "REG-SESS-1",
        "status": "PLAYING",
        "current_question_index": 0,
        "wrong_attempts_total": 0,
        "penalty_seconds_total": 0,
        "started_at": datetime.now(timezone.utc),
        "last_heartbeat": datetime.now(timezone.utc)
    })
    assert sess_validated.session_id == str(sess_uuid)

    # 4. Mock query returning TournamentResult with native UUID session_id attribute
    mock_result = MagicMock()
    mock_result.id = res_uuid
    mock_result.session_id = sess_uuid
    mock_result.event_id = evt_uuid
    mock_result.player_name = "Mock Player"
    mock_result.register_number = "REG-MOCK"
    mock_result.total_questions = 20
    mock_result.raw_time_ms = 45000
    mock_result.total_wrong_attempts = 0
    mock_result.total_penalty_seconds = 0
    mock_result.final_time_ms = 45000
    mock_result.rank = 1
    mock_result.question_breakdowns = []
    mock_result.completed_at = datetime.now(timezone.utc)

    orig_query = db_session.query

    class MockResultQuery:
        def filter(self, *args, **kwargs):
            return self
        def order_by(self, *args, **kwargs):
            return self
        def all(self):
            return [mock_result]

    def mock_query(model):
        if model == TournamentResult:
            return MockResultQuery()
        return orig_query(model)

    monkeypatch.setattr(db_session, "query", mock_query)

    res = await async_client.get("/api/v1/admin/results", headers=admin_headers)
    assert res.status_code == 200
    data = res.json()
    assert len(data) == 1
    assert data[0]["session_id"] == str(sess_uuid)
    assert data[0]["event_id"] == str(evt_uuid)
    assert data[0]["id"] == str(res_uuid)

