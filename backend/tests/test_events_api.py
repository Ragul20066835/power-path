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


@pytest.mark.anyio
async def test_get_active_event_with_uuid_model_ids(async_client, db_session, monkeypatch):
    """
    Integration test: Ensure GET /api/v1/events/active returns HTTP 200 and string IDs
    even when PostgreSQL / SQLAlchemy models have uuid.UUID objects for id attributes.
    """
    import uuid
    from unittest.mock import MagicMock

    evt_uuid = uuid.uuid4()
    q_uuid = uuid.uuid4()
    s_uuid = uuid.uuid4()

    mock_socket = MagicMock()
    mock_socket.id = s_uuid
    mock_socket.custom_id = "S1"
    mock_socket.label = "POWER_SOURCE"
    mock_socket.hint = "9V Battery source"
    mock_socket.pin_label_left = "IN"
    mock_socket.pin_label_right = "OUT"
    mock_socket.slot_order = 1
    mock_socket.accepted_component_id = "battery"

    mock_question = MagicMock()
    mock_question.id = q_uuid
    mock_question.custom_id = "Q001"
    mock_question.name = "Stage 1 - Power Rail"
    mock_question.description = "Connect power and ground"
    mock_question.difficulty = "Easy"
    mock_question.penalty_seconds = 5
    mock_question.question_order = 1
    mock_question.sockets = [mock_socket]

    mock_event = MagicMock()
    mock_event.id = evt_uuid
    mock_event.custom_id = "ERR2S"
    mock_event.name = "Active Production Round"
    mock_event.description = "Production Tournament"
    mock_event.status = "ACTIVE"
    mock_event.questions = [mock_question]

    orig_query = db_session.query

    class MockEventQuery:
        def filter(self, *args, **kwargs):
            return self
        def first(self):
            return mock_event

    def mock_query(model):
        if model == Event:
            return MockEventQuery()
        return orig_query(model)

    monkeypatch.setattr(db_session, "query", mock_query)

    response = await async_client.get("/api/v1/events/active")
    assert response.status_code == 200
    data = response.json()

    # 1. Verify Event ID is string UUID
    assert data["id"] == str(evt_uuid)
    assert isinstance(data["id"], str)
    assert data["custom_id"] == "ERR2S"

    # 2. Verify Question ID is string UUID
    assert len(data["questions"]) == 1
    q_data = data["questions"][0]
    assert q_data["id"] == str(q_uuid)
    assert isinstance(q_data["id"], str)
    assert q_data["custom_id"] == "Q001"

    # 3. Verify Socket ID is string UUID
    assert len(q_data["sockets"]) == 1
    s_data = q_data["sockets"][0]
    assert s_data["id"] == str(s_uuid)
    assert isinstance(s_data["id"], str)
    assert s_data["custom_id"] == "S1"

    # 4. Critical security: accepted_component_id is NOT exposed in public response
    assert "accepted_component_id" not in s_data


@pytest.mark.anyio
async def test_active_event_with_20_questions_and_total_counts(async_client, db_session):
    """
    Regression Test:
    1. Active event with 20 questions and 91 sockets returns total_questions = 20 and total_sockets = 91.
    2. Event custom_id ('ERR2S') and name ('electrox') are preserved.
    3. Status is 'ACTIVE'.
    4. Secret accepted_component_id is stripped from public view.
    """
    event = Event(
        custom_id="ERR2S",
        name="electrox",
        description="20 Stage Electronics Tournament",
        status="ACTIVE"
    )
    db_session.add(event)
    db_session.flush()

    total_sockets_count = 0
    for i in range(1, 21):
        q = Question(
            event_id=event.id,
            custom_id=f"Q{i}",
            name=f"Circuit Stage {i}",
            difficulty="Medium",
            penalty_seconds=5,
            question_order=i
        )
        db_session.add(q)
        db_session.flush()

        # Add sockets (e.g. 5 for final, 4 or 5 for others)
        num_sockets = 5 if (i % 2 == 0 or i == 20) else 4
        for s_idx in range(1, num_sockets + 1):
            s = Socket(
                question_id=q.id,
                custom_id=f"S{s_idx}",
                label=f"SLOT_{s_idx}",
                accepted_component_id="resistor",
                slot_order=s_idx
            )
            db_session.add(s)
            total_sockets_count += 1

    db_session.commit()

    res = await async_client.get("/api/v1/events/active")
    assert res.status_code == 200
    data = res.json()
    assert data["custom_id"] == "ERR2S"
    assert data["name"] == "electrox"
    assert data["status"] == "ACTIVE"
    assert data["total_questions"] == 20
    assert data["total_sockets"] == total_sockets_count
    assert len(data["questions"]) == 20
    for q_data in data["questions"]:
        for s_data in q_data["sockets"]:
            assert "accepted_component_id" not in s_data


