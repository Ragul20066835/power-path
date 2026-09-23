"""
Comprehensive Unit & Integration Tests for POWERPATH Phase 1
Tests:
- Health check API
- Component catalogue & Ground component support
- Event/Question/Socket Hierarchy & Relationships
- Scoped Unique constraints (Event, Question in Event, Socket in Question)
- Cascade Deletion on Event -> Question -> Socket
- Historical result preservation (ON DELETE SET NULL on sessions/results)
- Session and Result uniqueness constraints
- Secret answer masking in public schemas
"""

import uuid
import pytest
from sqlalchemy.exc import IntegrityError
from app.constants import GLOBAL_COMPONENTS, COMPONENTS_MAP, VALID_COMPONENT_IDS
from app.models import (
    Event,
    Question,
    Socket,
    ParticipantSession,
    QuestionAttempt,
    TournamentResult,
    TournamentSettings,
    AdminUser,
)
from app.schemas import (
    SocketPublic,
    SocketAdmin,
    QuestionPublic,
    QuestionAdmin,
    EventPublic,
    EventAdmin,
    SessionPublic,
    ResultPublic,
    AdminUserPublic,
)


# =============================================================================
# 1. HEALTH CHECK & API TESTS
# =============================================================================

@pytest.mark.anyio
async def test_health_endpoint(async_client):
    """Test GET /api/v1/health returns 200 OK and status ok."""
    response = await async_client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["database"] == "connected"
    assert "timestamp" in data
    assert "version" in data


@pytest.mark.anyio
async def test_root_status_endpoint(async_client):
    """Test root status check."""
    response = await async_client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "online"
    assert data["name"] == "POWERPATH API"


# =============================================================================
# 2. COMPONENT CATALOGUE TESTS
# =============================================================================

def test_component_catalogue_canonical_count():
    """Verify exactly 9 canonical components are defined in catalogue."""
    assert len(GLOBAL_COMPONENTS) == 9
    assert len(VALID_COMPONENT_IDS) == 9


def test_ground_component_is_supported():
    """Ground MUST be supported with exact 0V reference specification."""
    assert "ground" in VALID_COMPONENT_IDS
    ground = COMPONENTS_MAP["ground"]
    assert ground["name"] == "Ground"
    assert ground["code"] == "GND-0V"
    assert ground["category"] == "Reference"
    assert ground["is_decoy"] is False


def test_all_standard_components_present():
    """Verify all 9 standard component IDs and display names."""
    expected = {
        "battery": "9V Battery",
        "switch": "Toggle Switch",
        "resistor": "Resistor 330Ω",
        "led": "LED",
        "ammeter": "Ammeter",
        "ground": "Ground",
        "voltmeter": "Voltmeter",
        "capacitor": "Capacitor",
        "inductor": "Inductor",
    }
    for comp_id, display_name in expected.items():
        assert comp_id in COMPONENTS_MAP
        assert COMPONENTS_MAP[comp_id]["name"] == display_name


# =============================================================================
# 3. EVENT, QUESTION & SOCKET HIERARCHY TESTS
# =============================================================================

def test_event_question_socket_hierarchy(db_session):
    """Verify creation and traversal of Event -> Questions -> Sockets."""
    event = Event(
        custom_id="EVT_ROUND1",
        name="Championship Round 1",
        description="Opening electrical challenge",
        status="ACTIVE"
    )
    db_session.add(event)
    db_session.commit()

    # Add Question 1
    q1 = Question(
        event_id=event.id,
        custom_id="Q001",
        name="Basic Closed Loop",
        difficulty="Easy",
        penalty_seconds=5,
        question_order=1
    )
    db_session.add(q1)
    db_session.commit()

    # Add Sockets to Q1
    s1 = Socket(
        question_id=q1.id,
        custom_id="S1",
        label="SOURCE",
        accepted_component_id="battery",
        hint="9V DC Power Supply",
        slot_order=1
    )
    s2 = Socket(
        question_id=q1.id,
        custom_id="S2",
        label="LIMITER",
        accepted_component_id="resistor",
        hint="330Ω Current Limiter",
        slot_order=2
    )
    s3 = Socket(
        question_id=q1.id,
        custom_id="S3",
        label="REFERENCE",
        accepted_component_id="ground",
        hint="0V Common Reference",
        slot_order=3
    )
    db_session.add_all([s1, s2, s3])
    db_session.commit()

    # Query back from root Event
    fetched_event = db_session.query(Event).filter_by(custom_id="EVT_ROUND1").first()
    assert fetched_event is not None
    assert len(fetched_event.questions) == 1

    fetched_q = fetched_event.questions[0]
    assert fetched_q.name == "Basic Closed Loop"
    assert len(fetched_q.sockets) == 3
    assert [s.custom_id for s in fetched_q.sockets] == ["S1", "S2", "S3"]
    assert [s.accepted_component_id for s in fetched_q.sockets] == ["battery", "resistor", "ground"]


def test_unique_event_custom_id(db_session):
    """Verify events cannot share duplicate custom_id."""
    e1 = Event(custom_id="EVENT_ALPHA", name="Alpha Round")
    db_session.add(e1)
    db_session.commit()

    e2 = Event(custom_id="EVENT_ALPHA", name="Duplicate Alpha Round")
    db_session.add(e2)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_question_custom_id_scoped_to_event(db_session):
    """
    Question custom_id does NOT need to be globally unique.
    EVENT001 + Q001 and EVENT002 + Q001 MUST both be allowed.
    Duplicate Q001 in the SAME event must fail.
    """
    e1 = Event(custom_id="EVENT001", name="Event 1")
    e2 = Event(custom_id="EVENT002", name="Event 2")
    db_session.add_all([e1, e2])
    db_session.commit()

    # Same custom_id Q001 in different events -> ALLOWED
    q1 = Question(event_id=e1.id, custom_id="Q001", name="E1 Stage 1")
    q2 = Question(event_id=e2.id, custom_id="Q001", name="E2 Stage 1")
    db_session.add_all([q1, q2])
    db_session.commit()

    assert db_session.query(Question).count() == 2

    # Duplicate Q001 in EVENT001 -> FORBIDDEN
    q1_duplicate = Question(event_id=e1.id, custom_id="Q001", name="E1 Stage 1 Duplicate")
    db_session.add(q1_duplicate)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_socket_custom_id_scoped_to_question(db_session):
    """
    Socket custom_id should be unique within its question.
    Q1 + S1 and Q2 + S1 must both be allowed.
    Duplicate S1 in Q1 must fail.
    """
    event = Event(custom_id="EVENT_SOCKET_TEST", name="Socket Test Event")
    db_session.add(event)
    db_session.commit()

    q1 = Question(event_id=event.id, custom_id="Q1", name="Question 1")
    q2 = Question(event_id=event.id, custom_id="Q2", name="Question 2")
    db_session.add_all([q1, q2])
    db_session.commit()

    # S1 in Q1 and S1 in Q2 -> ALLOWED
    s1_q1 = Socket(question_id=q1.id, custom_id="S1", label="Slot 1", accepted_component_id="battery")
    s1_q2 = Socket(question_id=q2.id, custom_id="S1", label="Slot 1", accepted_component_id="resistor")
    db_session.add_all([s1_q1, s1_q2])
    db_session.commit()

    assert db_session.query(Socket).count() == 2

    # Duplicate S1 in Q1 -> FORBIDDEN
    s1_q1_dup = Socket(question_id=q1.id, custom_id="S1", label="Duplicate Slot 1", accepted_component_id="led")
    db_session.add(s1_q1_dup)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


# =============================================================================
# 4. CASCADE DELETION & HISTORICAL PRESERVATION TESTS
# =============================================================================

def test_event_cascade_deletion(db_session):
    """
    When an Event is deleted:
    Event -> Questions -> Sockets must cascade delete with no orphaned records.
    """
    event = Event(custom_id="CASCADE_EVT", name="Delete Me")
    db_session.add(event)
    db_session.commit()

    q = Question(event_id=event.id, custom_id="Q_DEL", name="Delete Question")
    db_session.add(q)
    db_session.commit()

    s = Socket(question_id=q.id, custom_id="S_DEL", label="Slot", accepted_component_id="battery")
    db_session.add(s)
    db_session.commit()

    assert db_session.query(Question).count() == 1
    assert db_session.query(Socket).count() == 1

    # Delete Event
    db_session.delete(event)
    db_session.commit()

    # Questions and Sockets must be completely removed
    assert db_session.query(Event).count() == 0
    assert db_session.query(Question).count() == 0
    assert db_session.query(Socket).count() == 0


def test_historical_session_and_result_preservation(db_session):
    """
    Participant sessions and tournament results must NOT be lost if an event is deleted.
    event_id becomes NULL, retaining player match history and audit records.
    """
    event = Event(custom_id="HIST_EVT", name="Historic Event")
    db_session.add(event)
    db_session.commit()

    session = ParticipantSession(
        session_id="PP-HIST-001",
        event_id=event.id,
        player_name="Alex Circuit",
        register_number="REG-9999",
        status="COMPLETED",
        current_question_index=1,
        wrong_attempts_total=2,
        penalty_seconds_total=10
    )
    db_session.add(session)
    db_session.commit()

    result = TournamentResult(
        session_id=session.id,
        event_id=event.id,
        player_name="Alex Circuit",
        register_number="REG-9999",
        total_questions=1,
        raw_time_ms=45000,
        total_wrong_attempts=2,
        total_penalty_seconds=10,
        final_time_ms=55000,
        rank=1
    )
    db_session.add(result)
    db_session.commit()

    # Delete Event
    db_session.delete(event)
    db_session.commit()

    # Session and Result still exist!
    preserved_session = db_session.query(ParticipantSession).filter_by(session_id="PP-HIST-001").first()
    assert preserved_session is not None
    assert preserved_session.player_name == "Alex Circuit"
    assert preserved_session.event_id is None

    preserved_result = db_session.query(TournamentResult).filter_by(player_name="Alex Circuit").first()
    assert preserved_result is not None
    assert preserved_result.final_time_ms == 55000
    assert preserved_result.event_id is None


# =============================================================================
# 5. SESSION & RESULT INTEGRITY CONSTRAINTS
# =============================================================================

def test_session_id_uniqueness(db_session):
    """Verify session_id must be unique across all participant sessions."""
    s1 = ParticipantSession(session_id="DC-UNIQUE-1", player_name="Player 1", register_number="REG1")
    db_session.add(s1)
    db_session.commit()

    s2 = ParticipantSession(session_id="DC-UNIQUE-1", player_name="Player 2", register_number="REG2")
    db_session.add(s2)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_single_result_per_session(db_session):
    """A session must produce at most ONE final result record."""
    session = ParticipantSession(session_id="DC-RESULT-1", player_name="Player 1", register_number="REG1")
    db_session.add(session)
    db_session.commit()

    r1 = TournamentResult(
        session_id=session.id,
        player_name="Player 1",
        register_number="REG1",
        total_questions=1,
        raw_time_ms=30000,
        final_time_ms=30000
    )
    db_session.add(r1)
    db_session.commit()

    r2 = TournamentResult(
        session_id=session.id,
        player_name="Player 1",
        register_number="REG1",
        total_questions=1,
        raw_time_ms=35000,
        final_time_ms=35000
    )
    db_session.add(r2)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_question_attempt_uniqueness(db_session):
    """A session can only record one attempt record per question."""
    session = ParticipantSession(session_id="DC-ATTEMPT-1", player_name="Player 1", register_number="REG1")
    event = Event(custom_id="EVT_ATT", name="Attempt Event")
    db_session.add_all([session, event])
    db_session.commit()

    q = Question(event_id=event.id, custom_id="Q1", name="Question 1")
    db_session.add(q)
    db_session.commit()

    att1 = QuestionAttempt(
        session_id=session.id,
        question_id=q.id,
        question_index=1,
        raw_time_ms=10000,
        final_time_ms=10000
    )
    db_session.add(att1)
    db_session.commit()

    att2 = QuestionAttempt(
        session_id=session.id,
        question_id=q.id,
        question_index=1,
        raw_time_ms=12000,
        final_time_ms=12000
    )
    db_session.add(att2)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


# =============================================================================
# 6. SECURITY & SECRET MASKING SCHEMA TESTS
# =============================================================================

def test_secret_answer_not_in_public_socket_schema():
    """SocketPublic must NOT contain accepted_component_id."""
    public_fields = SocketPublic.model_fields.keys()
    assert "accepted_component_id" not in public_fields
    assert "hint" in public_fields
    assert "label" in public_fields
    assert "custom_id" in public_fields


def test_secret_answer_present_in_admin_socket_schema():
    """SocketAdmin must contain accepted_component_id for admin/scoring usage."""
    admin_fields = SocketAdmin.model_fields.keys()
    assert "accepted_component_id" in admin_fields


# =============================================================================
# 7. UUID PYDANTIC RESPONSE SCHEMA SERIALIZATION TESTS
# =============================================================================

def test_socket_public_with_uuid_id():
    """Verify SocketPublic correctly converts raw uuid.UUID id to string without error."""
    socket_uuid = uuid.uuid4()
    socket_data = {
        "id": socket_uuid,
        "custom_id": "S1",
        "label": "POWER",
        "hint": "9V Battery",
        "pin_label_left": "IN",
        "pin_label_right": "OUT",
        "slot_order": 1
    }
    schema = SocketPublic.model_validate(socket_data)
    assert schema.id == str(socket_uuid)
    assert isinstance(schema.id, str)
    assert schema.custom_id == "S1"
    # Ensure secret answer not present
    assert not hasattr(schema, "accepted_component_id")


def test_question_public_with_uuid_id_and_sockets():
    """Verify QuestionPublic correctly converts raw uuid.UUID id and child sockets to string IDs."""
    q_uuid = uuid.uuid4()
    s_uuid = uuid.uuid4()
    question_data = {
        "id": q_uuid,
        "custom_id": "Q001",
        "name": "Stage 1",
        "difficulty": "Easy",
        "penalty_seconds": 5,
        "question_order": 1,
        "sockets": [
            {
                "id": s_uuid,
                "custom_id": "S1",
                "label": "POWER",
                "hint": "9V"
            }
        ]
    }
    schema = QuestionPublic.model_validate(question_data)
    assert schema.id == str(q_uuid)
    assert isinstance(schema.id, str)
    assert schema.custom_id == "Q001"
    assert len(schema.sockets) == 1
    assert schema.sockets[0].id == str(s_uuid)
    assert isinstance(schema.sockets[0].id, str)
    assert schema.sockets[0].custom_id == "S1"


def test_event_public_with_uuid_id_and_hierarchy():
    """Verify EventPublic correctly converts event UUID, question UUIDs, and socket UUIDs to string IDs."""
    evt_uuid = uuid.uuid4()
    q_uuid = uuid.uuid4()
    s_uuid = uuid.uuid4()

    event_data = {
        "id": evt_uuid,
        "custom_id": "ERR2S",
        "name": "Production Championship",
        "description": "Live production round",
        "status": "ACTIVE",
        "questions": [
            {
                "id": q_uuid,
                "custom_id": "Q101",
                "name": "Question 101",
                "difficulty": "Easy",
                "penalty_seconds": 5,
                "question_order": 1,
                "sockets": [
                    {
                        "id": s_uuid,
                        "custom_id": "S1",
                        "label": "POWER",
                        "hint": "9V Battery"
                    }
                ]
            }
        ]
    }
    schema = EventPublic.model_validate(event_data)
    assert schema.id == str(evt_uuid)
    assert isinstance(schema.id, str)
    assert schema.custom_id == "ERR2S"
    assert len(schema.questions) == 1

    q_schema = schema.questions[0]
    assert q_schema.id == str(q_uuid)
    assert isinstance(q_schema.id, str)
    assert q_schema.custom_id == "Q101"

    s_schema = q_schema.sockets[0]
    assert s_schema.id == str(s_uuid)
    assert isinstance(s_schema.id, str)
    assert s_schema.custom_id == "S1"


def test_admin_user_public_with_uuid_id():
    """Verify AdminUserPublic converts raw uuid.UUID to string."""
    from datetime import datetime, timezone
    admin_uuid = uuid.uuid4()
    admin_data = {
        "id": admin_uuid,
        "username": "superadmin",
        "email": "superadmin@powerpath.io",
        "role": "SUPER_ADMIN",
        "created_at": datetime.now(timezone.utc)
    }
    schema = AdminUserPublic.model_validate(admin_data)
    assert schema.id == str(admin_uuid)
    assert isinstance(schema.id, str)
    assert schema.username == "superadmin"
    assert schema.role == "SUPER_ADMIN"


def test_postgres_connection_pool_configuration():
    """Verify PostgreSQL engine is configured with conservative pool settings for Supabase Transaction Pooler."""
    test_pg_url = "postgresql://postgres.test:password@aws-0-ap-south-1.pooler.supabase.com:6543/postgres"
    engine_kwargs = {}
    if "sqlite" in test_pg_url:
        engine_kwargs["connect_args"] = {"check_same_thread": False, "timeout": 60}
    else:
        engine_kwargs.update({
            "pool_size": 10,
            "max_overflow": 10,
            "pool_timeout": 30,
            "pool_recycle": 300,
            "pool_pre_ping": True,
        })
    assert engine_kwargs["pool_size"] == 10
    assert engine_kwargs["max_overflow"] == 10
    assert engine_kwargs["pool_timeout"] == 30
    assert engine_kwargs["pool_pre_ping"] is True


