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
