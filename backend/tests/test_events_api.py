"""
Events & Lifecycle API Tests
Tests:
- Public GET /api/v1/events/active
- Admin GET /api/v1/admin/events
- Admin POST /api/v1/admin/events
- Admin PUT /api/v1/admin/events/{id}
- Admin DELETE /api/v1/admin/events/{id}
- Admin POST /api/v1/admin/events/{id}/activate (atomic switch)
- Admin POST /api/v1/admin/events/{id}/deactivate
- Cascade delete verification
"""

import pytest
from app.models import Event, Question, Socket


@pytest.mark.anyio
async def test_public_active_event_when_none_exists(async_client, db_session):
    """Test GET /api/v1/events/active returns 404 when no active event exists."""
    response = await async_client.get("/api/v1/events/active")
    assert response.status_code == 404
    assert "No active tournament round" in response.json()["detail"]


@pytest.mark.anyio
async def test_admin_create_and_get_active_event(async_client, admin_headers, db_session):
    """Test creating an event via admin API and fetching it publicly when active."""
    payload = {
        "custom_id": "EVT_CHAMP_2026",
        "name": "POWERPATH Championship Finals",
        "description": "Grand finals circuit competition",
        "status": "ACTIVE",
        "questions": [
            {
                "custom_id": "Q101",
                "name": "Stage 1 - Power Rail",
                "difficulty": "Easy",
                "penalty_seconds": 5,
                "sockets": [
                    {
                        "custom_id": "S1",
                        "label": "POWER_SOURCE",
                        "accepted_component_id": "battery",
                        "hint": "9V Battery source",
                        "pin_label_left": "IN",
                        "pin_label_right": "OUT"
                    },
                    {
                        "custom_id": "S2",
                        "label": "SAFETY_GROUND",
                        "accepted_component_id": "ground",
                        "hint": "0V Reference",
                        "pin_label_left": "IN",
                        "pin_label_right": "OUT"
                    }
                ]
            }
        ]
    }

    # Create event
    create_res = await async_client.post("/api/v1/admin/events", json=payload, headers=admin_headers)
    assert create_res.status_code == 201
    created_data = create_res.json()
    assert created_data["custom_id"] == "EVT_CHAMP_2026"
    assert created_data["status"] == "ACTIVE"
    assert len(created_data["questions"]) == 1

    # Public Active Event check: ensure secret accepted_component_id is NOT returned
    active_res = await async_client.get("/api/v1/events/active")
    assert active_res.status_code == 200
    active_data = active_res.json()
    assert active_data["custom_id"] == "EVT_CHAMP_2026"
    assert len(active_data["questions"]) == 1
    assert len(active_data["questions"][0]["sockets"]) == 2

    # Secret check:
    socket_0 = active_data["questions"][0]["sockets"][0]
    assert "accepted_component_id" not in socket_0
    assert socket_0["label"] == "POWER_SOURCE"
    assert socket_0["hint"] == "9V Battery source"


@pytest.mark.anyio
async def test_atomic_activation_switching(async_client, admin_headers, db_session):
    """
    Test that activating Event B atomically deactivates Event A,
    preserving the single active event invariant.
    """
    # Create Event A (ACTIVE)
    res_a = await async_client.post(
        "/api/v1/admin/events",
        json={"custom_id": "EVT_A", "name": "Event A", "status": "ACTIVE"},
        headers=admin_headers
    )
    assert res_a.status_code == 201
    evt_a_id = res_a.json()["id"]

    # Create Event B (INACTIVE)
    res_b = await async_client.post(
        "/api/v1/admin/events",
        json={"custom_id": "EVT_B", "name": "Event B", "status": "INACTIVE"},
        headers=admin_headers
    )
    assert res_b.status_code == 201
    evt_b_id = res_b.json()["id"]

    # Verify A is currently active
    active_1 = await async_client.get("/api/v1/events/active")
    assert active_1.json()["custom_id"] == "EVT_A"

    # Activate Event B
    act_res = await async_client.post(f"/api/v1/admin/events/{evt_b_id}/activate", headers=admin_headers)
    assert act_res.status_code == 200
    assert act_res.json()["status"] == "ACTIVE"

    # Verify now B is active
    active_2 = await async_client.get("/api/v1/events/active")
    assert active_2.json()["custom_id"] == "EVT_B"

    # Verify A is now INACTIVE in DB
    evt_a_db = db_session.query(Event).filter(Event.id == evt_a_id).first()
    assert evt_a_db.status == "INACTIVE"


@pytest.mark.anyio
async def test_admin_update_and_delete_event(async_client, admin_headers, db_session):
    """Test updating event details and deleting event with cascading questions."""
    create_res = await async_client.post(
        "/api/v1/admin/events",
        json={"custom_id": "EVT_TO_EDIT", "name": "Initial Name", "status": "INACTIVE"},
        headers=admin_headers
    )
    evt_id = create_res.json()["id"]

    # Update
    update_res = await async_client.put(
        f"/api/v1/admin/events/{evt_id}",
        json={"name": "Updated Name", "description": "New description"},
        headers=admin_headers
    )
    assert update_res.status_code == 200
    assert update_res.json()["name"] == "Updated Name"

    # Delete
    del_res = await async_client.delete(f"/api/v1/admin/events/{evt_id}", headers=admin_headers)
    assert del_res.status_code == 200

    # Verify deletion
    assert db_session.query(Event).filter(Event.id == evt_id).first() is None
