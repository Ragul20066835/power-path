"""
End-to-End Event Identifier Resolution & Questions CSV Upload Regression Tests

Covers:
1. Resolve event using UUID string (e.g. 3af75c45-336d-44e0-8d9f-e9a60eae1448)
2. Resolve event using custom_id (e.g. ERR2S)
3. Non-UUID custom ID never triggers PostgreSQL UUID type casting errors on Event.id
4. Questions CSV upload using UUID event ID succeeds
5. Questions CSV upload using custom event ID ERR2S succeeds
6. Stale/nonexistent event ID returns clean 404/400, never 500
7. Active event loaded from backend can immediately accept Questions CSV upload
8. Response validation: questions inserted into selected event, no new event created,
   hierarchy preserved: EVENT -> QUESTIONS -> SOCKETS
"""

import io
import uuid
import pytest
from unittest.mock import MagicMock
from app.models import Event, Question, Socket
from app.utils.event_resolver import resolve_event_identifier


@pytest.fixture
def sample_production_event(db_session):
    """
    Creates an event matching the production scenario:
    - custom_id: ERR2S
    - name: electrox
    - id: UUID primary key
    """
    event = Event(
        id=str(uuid.uuid4()),
        custom_id="ERR2S",
        name="electrox",
        description="Circuit championship round",
        status="ACTIVE"
    )
    db_session.add(event)
    db_session.commit()
    db_session.refresh(event)
    return event


# =============================================================================
# 1 & 2: RESOLVE BY UUID AND CUSTOM_ID
# =============================================================================

def test_resolve_event_using_uuid_string(db_session, sample_production_event):
    """Test 1: resolve event using valid UUID string (e.g. 3af75c45-336d-44e0-8d9f-e9a60eae1448)."""
    resolved = resolve_event_identifier(db_session, sample_production_event.id)
    assert resolved is not None
    assert resolved.id == sample_production_event.id
    assert resolved.custom_id == "ERR2S"
    assert resolved.name == "electrox"


def test_resolve_event_using_custom_id_err2s(db_session, sample_production_event):
    """Test 2: resolve event using custom_id ERR2S."""
    resolved = resolve_event_identifier(db_session, "ERR2S")
    assert resolved is not None
    assert resolved.id == sample_production_event.id
    assert resolved.custom_id == "ERR2S"
    assert resolved.name == "electrox"


def test_resolve_event_with_uuid_object(db_session, sample_production_event):
    """Test resolve event using uuid.UUID object instance."""
    uuid_obj = uuid.UUID(sample_production_event.id)
    resolved = resolve_event_identifier(db_session, uuid_obj)
    assert resolved is not None
    assert resolved.id == sample_production_event.id


# =============================================================================
# 3: NON-UUID NEVER QUERIES Event.id
# =============================================================================

def test_non_uuid_custom_id_never_reaches_event_id(db_session):
    """
    Test 3: verify non-UUID custom ID never triggers SQL queries against Event.id column.
    Simulates PostgreSQL behavior where comparing UUID column with 'ERR2S' throws DataError.
    """
    mock_db = MagicMock()
    mock_query = MagicMock()
    mock_db.query.return_value = mock_query
    mock_query.filter.return_value = mock_query
    mock_query.first.return_value = None

    # Resolve with non-UUID custom_id
    resolve_event_identifier(mock_db, "ERR2S")

    # Verify query was called with Event model
    mock_db.query.assert_called_once_with(Event)

    # Inspect filter binary expressions
    filter_args = mock_query.filter.call_args[0]
    assert len(filter_args) == 1
    binary_expr = filter_args[0]
    # The left side must be Event.custom_id, NOT Event.id
    assert binary_expr.left.key == "custom_id"
    assert binary_expr.right.value == "ERR2S"


# =============================================================================
# 4 & 5: QUESTIONS CSV UPLOAD VIA UUID AND CUSTOM_ID
# =============================================================================

@pytest.mark.anyio
async def test_questions_csv_upload_using_uuid_event_id(async_client, admin_headers, sample_production_event, db_session):
    """Test 4: Questions CSV upload using UUID event ID succeeds and preserves hierarchy."""
    csv_content = (
        "question_id,question_name,description,difficulty,penalty_seconds,socket_id,socket_label,correct_component,component_description\n"
        "Q_UUID_1,Power Supply Stage,DC voltage feed,Easy,5,S1,BATTERY_SLOT,9V Battery,9V DC Power\n"
        "Q_UUID_1,Power Supply Stage,DC voltage feed,Easy,5,S2,GND_SLOT,Ground,0V Reference\n"
        "Q_UUID_2,Switch Control Stage,SPST gate,Medium,5,S1,SWITCH_SLOT,Toggle Switch,Main switch\n"
    )

    files = {"file": ("questions_uuid.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")}
    res = await async_client.post(
        f"/api/v1/admin/upload/questions?event_id={sample_production_event.id}",
        files=files,
        headers=admin_headers
    )
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert data["data"]["event_id"] == sample_production_event.id
    assert data["data"]["event_custom_id"] == "ERR2S"
    assert data["data"]["questions_imported"] == 2
    assert data["data"]["sockets_imported"] == 3

    # Verify DB state: questions linked to event, hierarchy EVENT -> QUESTIONS -> SOCKETS
    questions = db_session.query(Question).filter(Question.event_id == sample_production_event.id).order_by(Question.question_order.asc()).all()
    assert len(questions) == 2
    assert questions[0].custom_id == "Q_UUID_1"
    assert len(questions[0].sockets) == 2
    assert questions[1].custom_id == "Q_UUID_2"
    assert len(questions[1].sockets) == 1


@pytest.mark.anyio
async def test_questions_csv_upload_using_custom_id_err2s(async_client, admin_headers, sample_production_event, db_session):
    """Test 5: Questions CSV upload using custom_id ERR2S succeeds and attaches to the same event."""
    csv_content = (
        "question_id,question_name,description,difficulty,penalty_seconds,socket_id,socket_label,correct_component,component_description\n"
        "Q_ERR2S_1,Indicator Loop,LED current loop,Easy,5,S1,LED_SLOT,LED,Red Indicator\n"
        "Q_ERR2S_1,Indicator Loop,LED current loop,Easy,5,S2,RESISTOR_SLOT,Resistor 330Ω,Current limiter\n"
    )

    files = {"file": ("questions_err2s.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")}
    res = await async_client.post(
        "/api/v1/admin/upload/questions?event_id=ERR2S",
        files=files,
        headers=admin_headers
    )
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert data["data"]["event_id"] == sample_production_event.id
    assert data["data"]["event_custom_id"] == "ERR2S"
    assert data["data"]["questions_imported"] == 1
    assert data["data"]["sockets_imported"] == 2


# =============================================================================
# 6: STALE/NONEXISTENT EVENT ID RETURNS CLEAN 404/400, NEVER 500
# =============================================================================

@pytest.mark.anyio
async def test_stale_or_nonexistent_event_id_returns_clean_404(async_client, admin_headers):
    """Test 6: stale/nonexistent event ID returns clean 404/400, never 500."""
    csv_content = (
        "question_id,question_name,description,difficulty,penalty_seconds,socket_id,socket_label,correct_component,component_description\n"
        "Q1,Stage 1,Loop,Easy,5,S1,SLOT1,9V Battery,Source\n"
    )

    # 1. Nonexistent UUID
    fake_uuid = str(uuid.uuid4())
    files = {"file": ("questions.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")}
    res_uuid = await async_client.post(
        f"/api/v1/admin/upload/questions?event_id={fake_uuid}",
        files=files,
        headers=admin_headers
    )
    assert res_uuid.status_code == 404
    assert f"Target Event '{fake_uuid}' not found." in res_uuid.json()["detail"]

    # 2. Nonexistent custom_id
    files2 = {"file": ("questions.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")}
    res_custom = await async_client.post(
        "/api/v1/admin/upload/questions?event_id=NONEXISTENT_EVENT_ID",
        files=files2,
        headers=admin_headers
    )
    assert res_custom.status_code == 404
    assert "Target Event 'NONEXISTENT_EVENT_ID' not found." in res_custom.json()["detail"]

    # 3. Missing event_id parameter
    files3 = {"file": ("questions.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")}
    res_missing = await async_client.post(
        "/api/v1/admin/upload/questions",
        files=files3,
        headers=admin_headers
    )
    assert res_missing.status_code == 400


# =============================================================================
# 7 & 8: ACTIVE EVENT LOADED FROM BACKEND ACCEPTS QUESTIONS CSV UPLOAD
# =============================================================================

@pytest.mark.anyio
async def test_active_event_from_backend_accepts_questions_csv_immediately(async_client, admin_headers, sample_production_event, db_session):
    """
    Test 7 & 8:
    - Active event loaded from backend public/admin API can immediately accept Questions CSV upload.
    - No new Event is created.
    - Hierarchy EVENT -> QUESTIONS -> SOCKETS is strictly maintained.
    """
    # Step A: Contestant / Admin fetches active event from backend
    active_res = await async_client.get("/api/v1/events/active")
    assert active_res.status_code == 200
    active_data = active_res.json()
    assert active_data["id"] == sample_production_event.id
    assert active_data["custom_id"] == "ERR2S"

    # Count events in DB before upload
    event_count_before = db_session.query(Event).count()

    # Step B: Admin uploads Questions CSV targeting the active event's id
    csv_content = (
        "question_id,question_name,description,difficulty,penalty_seconds,socket_id,socket_label,correct_component,component_description\n"
        "Q_ACT_1,Stage 1 - Power,Main feed,Easy,5,S1,PWR_SLOT,9V Battery,9V Battery\n"
        "Q_ACT_1,Stage 1 - Power,Main feed,Easy,5,S2,GND_SLOT,Ground,Ground 0V\n"
        "Q_ACT_2,Stage 2 - Limiter,Resistor limiter,Medium,5,S1,RES_SLOT,330Ω,330 Ohm Resistor\n"
        "Q_ACT_2,Stage 2 - Limiter,Resistor limiter,Medium,5,S2,AM_SLOT,Ammeter (mA),Current Meter\n"
    )

    files = {"file": ("active_questions.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")}
    upload_res = await async_client.post(
        f"/api/v1/admin/upload/questions?event_id={active_data['id']}",
        files=files,
        headers=admin_headers
    )
    assert upload_res.status_code == 200
    upload_data = upload_res.json()
    assert upload_data["success"] is True

    # Verify: No new Event created
    event_count_after = db_session.query(Event).count()
    assert event_count_after == event_count_before

    # Verify hierarchy in DB: EVENT -> QUESTIONS -> SOCKETS
    db_session.refresh(sample_production_event)
    assert len(sample_production_event.questions) >= 2
    for q in sample_production_event.questions:
        assert q.event_id == sample_production_event.id
        assert len(q.sockets) > 0
        for s in q.sockets:
            assert s.question_id == q.id
            assert s.accepted_component_id in ["battery", "ground", "resistor", "ammeter", "switch", "led", "voltmeter", "capacitor", "inductor"]
