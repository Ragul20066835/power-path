"""
CSV Import & Normalization Tests
Tests:
- Question-only CSV import to existing event
- Atomic rollback on unknown component in Question CSV
- Atomic rollback on duplicate socket in Question CSV
- Full Event CSV import
- Atomic rollback on full event CSV error
"""

import pytest
import io
from app.models import Event, Question, Socket


@pytest.fixture
def target_csv_event(db_session):
    event = Event(custom_id="EVT_CSV_TARGET", name="CSV Target Event", status="ACTIVE")
    db_session.add(event)
    db_session.commit()
    db_session.refresh(event)
    return event


@pytest.mark.anyio
async def test_valid_question_csv_upload(async_client, admin_headers, target_csv_event, db_session):
    """Test importing valid Question CSV into existing event."""
    csv_content = (
        "question_id,question_name,description,difficulty,penalty_seconds,socket_id,socket_label,correct_component,component_description\n"
        "Q501,Power Stage,Primary loop,Easy,5,S1,BATTERY_SLOT,9V Battery,Main DC Power\n"
        "Q501,Power Stage,Primary loop,Easy,5,S2,GROUND_SLOT,Ground,0V Return\n"
        "Q502,Control Stage,Switching,Medium,5,S1,SWITCH_SLOT,Toggle Switch,SPST Switch\n"
    )

    files = {"file": ("questions.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")}
    res = await async_client.post(
        f"/api/v1/admin/upload/questions?event_id={target_csv_event.id}",
        files=files,
        headers=admin_headers
    )
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert data["data"]["questions_imported"] == 2
    assert data["data"]["sockets_imported"] == 3

    # Check DB
    questions = db_session.query(Question).filter(Question.event_id == target_csv_event.id).all()
    assert len(questions) == 2


@pytest.mark.anyio
async def test_question_csv_rollback_on_unknown_component(async_client, admin_headers, target_csv_event, db_session):
    """Test atomic rollback when CSV contains an unknown/unsupported component."""
    csv_content = (
        "question_id,question_name,description,difficulty,penalty_seconds,socket_id,socket_label,correct_component,component_description\n"
        "Q601,Power Stage,Primary loop,Easy,5,S1,BATTERY_SLOT,9V Battery,Main DC Power\n"
        "Q601,Power Stage,Primary loop,Easy,5,S2,GROUND_SLOT,Quantum_Processor,Invalid component\n"
    )

    files = {"file": ("bad_questions.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")}
    res = await async_client.post(
        f"/api/v1/admin/upload/questions?event_id={target_csv_event.id}",
        files=files,
        headers=admin_headers
    )
    assert res.status_code == 400
    detail = res.json()["detail"]
    assert "validation failed" in detail["message"]
    assert any("Quantum_Processor" in err["value"] for err in detail["errors"])

    # Verify zero questions were inserted (atomic rollback)
    assert db_session.query(Question).filter(Question.event_id == target_csv_event.id).count() == 0


@pytest.mark.anyio
async def test_full_event_csv_upload_and_rollback(async_client, admin_headers, db_session):
    """Test full Event CSV import and transactional rollback on duplicate socket."""
    # Valid Full Event CSV
    valid_csv = (
        "event_id,event_name,event_description,question_id,question_name,description,difficulty,penalty_seconds,socket_id,socket_label,correct_component,component_description\n"
        "E_FULL_1,Championship A,Round 1,Q1,Stage 1,Loop,Easy,5,S1,BATTERY,9V Battery,DC Source\n"
        "E_FULL_1,Championship A,Round 1,Q1,Stage 1,Loop,Easy,5,S2,LIMITER,Resistor 330Ω,330 Limiter\n"
    )

    files = {"file": ("full_event.csv", io.BytesIO(valid_csv.encode("utf-8")), "text/csv")}
    res = await async_client.post(
        "/api/v1/admin/upload/events",
        files=files,
        headers=admin_headers
    )
    assert res.status_code == 200
    assert res.json()["data"]["events_imported"] == 1
    assert res.json()["data"]["questions_imported"] == 1
    assert res.json()["data"]["sockets_imported"] == 2

    # Invalid Full Event CSV with duplicate socket S1 in Q1
    bad_csv = (
        "event_id,event_name,event_description,question_id,question_name,description,difficulty,penalty_seconds,socket_id,socket_label,correct_component,component_description\n"
        "E_BAD,Bad Event,Round,Q1,Stage 1,Loop,Easy,5,S1,BATTERY,9V Battery,DC Source\n"
        "E_BAD,Bad Event,Round,Q1,Stage 1,Loop,Easy,5,S1,BATTERY_DUP,9V Battery,Duplicate S1\n"
    )

    bad_files = {"file": ("bad_full_event.csv", io.BytesIO(bad_csv.encode("utf-8")), "text/csv")}
    bad_res = await async_client.post(
        "/api/v1/admin/upload/events",
        files=bad_files,
        headers=admin_headers
    )
    assert bad_res.status_code == 400
    assert "Duplicate socket_id" in str(bad_res.json()["detail"])
    assert db_session.query(Event).filter(Event.custom_id == "E_BAD").count() == 0
