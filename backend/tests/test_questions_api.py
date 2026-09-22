"""
Questions & Sockets Management API Tests
Tests:
- Admin create question with valid sockets
- Validation on duplicate question custom_id in event
- Validation on duplicate socket custom_id in question
- Validation on invalid component in socket
- Ground component support
- Update and delete question
"""

import pytest
from app.models import Event, Question, Socket


@pytest.fixture
def test_event(db_session):
    event = Event(custom_id="EVT_Q_TEST", name="Question Test Event", status="ACTIVE")
    db_session.add(event)
    db_session.commit()
    db_session.refresh(event)
    return event


@pytest.mark.anyio
async def test_admin_create_question_with_sockets(async_client, admin_headers, test_event):
    """Test creating a question with multiple sockets including Ground."""
    payload = {
        "custom_id": "Q_STAGE_1",
        "name": "DC Series Loop",
        "description": "Basic electrical path",
        "difficulty": "Easy",
        "penalty_seconds": 5,
        "sockets": [
            {
                "custom_id": "S1",
                "label": "BATTERY_SLOT",
                "accepted_component_id": "battery",
                "hint": "9V Power Supply"
            },
            {
                "custom_id": "S2",
                "label": "GROUND_SLOT",
                "accepted_component_id": "ground",
                "hint": "0V Reference"
            }
        ]
    }

    res = await async_client.post(
        f"/api/v1/admin/events/{test_event.id}/questions",
        json=payload,
        headers=admin_headers
    )
    assert res.status_code == 201
    data = res.json()
    assert data["custom_id"] == "Q_STAGE_1"
    assert len(data["sockets"]) == 2
    # Admin API SHOULD have accepted_component_id
    assert data["sockets"][0]["accepted_component_id"] == "battery"
    assert data["sockets"][1]["accepted_component_id"] == "ground"


@pytest.mark.anyio
async def test_duplicate_question_custom_id_in_same_event_rejected(async_client, admin_headers, test_event):
    """Test duplicate question custom_id in the same event is rejected with 400."""
    payload = {
        "custom_id": "Q_DUP",
        "name": "Question 1",
        "sockets": [{"custom_id": "S1", "label": "Slot", "accepted_component_id": "battery"}]
    }

    res1 = await async_client.post(f"/api/v1/admin/events/{test_event.id}/questions", json=payload, headers=admin_headers)
    assert res1.status_code == 201

    res2 = await async_client.post(f"/api/v1/admin/events/{test_event.id}/questions", json=payload, headers=admin_headers)
    assert res2.status_code == 400
    assert "already exists" in res2.json()["detail"]


@pytest.mark.anyio
async def test_duplicate_socket_in_question_rejected(async_client, admin_headers, test_event):
    """Test duplicate socket custom_id in the same question payload is rejected."""
    payload = {
        "custom_id": "Q_BAD_SOCKETS",
        "name": "Bad Sockets Question",
        "sockets": [
            {"custom_id": "S1", "label": "Slot 1", "accepted_component_id": "battery"},
            {"custom_id": "S1", "label": "Duplicate Slot 1", "accepted_component_id": "resistor"}
        ]
    }

    res = await async_client.post(f"/api/v1/admin/events/{test_event.id}/questions", json=payload, headers=admin_headers)
    assert res.status_code == 400
    assert "Duplicate socket" in res.json()["detail"]


@pytest.mark.anyio
async def test_invalid_component_in_socket_rejected(async_client, admin_headers, test_event):
    """Test unknown component in socket payload is rejected."""
    payload = {
        "custom_id": "Q_UNKNOWN_COMP",
        "name": "Unknown Component Question",
        "sockets": [
            {"custom_id": "S1", "label": "Slot 1", "accepted_component_id": "flux_capacitor"}
        ]
    }

    res = await async_client.post(f"/api/v1/admin/events/{test_event.id}/questions", json=payload, headers=admin_headers)
    assert res.status_code == 400
    assert "Invalid component" in res.json()["detail"]
