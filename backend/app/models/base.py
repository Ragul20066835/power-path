"""
SQLAlchemy Models for POWERPATH
"""

import uuid
from sqlalchemy import (
    Column,
    String,
    Text,
    Integer,
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    UniqueConstraint,
    Index,
    JSON
)
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base
from app.constants import AdminRole, EventStatus, TournamentGate, SessionStatus


def generate_uuid() -> str:
    return str(uuid.uuid4())


class AdminUser(Base):
    __tablename__ = "admin_users"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    username = Column(String(64), unique=True, nullable=False, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(32), nullable=False, default=AdminRole.EVENT_ADMIN.value)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    def __repr__(self):
        return f"<AdminUser {self.username} ({self.role})>"


class TournamentSettings(Base):
    __tablename__ = "tournament_settings"

    key = Column(String(32), primary_key=True, default="global")
    event_status = Column(String(32), nullable=False, default=TournamentGate.OPEN.value)
    default_penalty_seconds = Column(Integer, nullable=False, default=5)
    allow_replay = Column(Boolean, nullable=False, default=True)
    audio_enabled = Column(Boolean, nullable=False, default=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    def __repr__(self):
        return f"<TournamentSettings status={self.event_status}>"


class Event(Base):
    __tablename__ = "events"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    custom_id = Column(String(64), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String(32), nullable=False, default=EventStatus.INACTIVE.value, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # Hierarchical Relationship: Event -> Questions (Cascade delete on removal)
    questions = relationship(
        "Question",
        back_populates="event",
        cascade="all, delete-orphan",
        order_by="Question.question_order"
    )

    # Historical Telemetry Preservation: Sessions & Results retain match history (SET NULL)
    sessions = relationship("ParticipantSession", back_populates="event")
    results = relationship("TournamentResult", back_populates="event")

    def __repr__(self):
        return f"<Event {self.custom_id}: {self.name} [{self.status}]>"


class Question(Base):
    __tablename__ = "questions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    event_id = Column(String(36), ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)
    custom_id = Column(String(64), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    difficulty = Column(String(32), nullable=False, default="Easy")
    penalty_seconds = Column(Integer, nullable=False, default=5)
    question_order = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        # custom_id must be unique within an event (e.g., E1+Q1 and E2+Q1 are both valid)
        UniqueConstraint("event_id", "custom_id", name="uq_event_question_custom_id"),
        Index("idx_questions_order", "event_id", "question_order"),
    )

    # Hierarchical Relationships
    event = relationship("Event", back_populates="questions")
    sockets = relationship(
        "Socket",
        back_populates="question",
        cascade="all, delete-orphan",
        order_by="Socket.slot_order"
    )
    attempts = relationship("QuestionAttempt", back_populates="question")

    def __repr__(self):
        return f"<Question {self.custom_id}: {self.name}>"


class Socket(Base):
    __tablename__ = "sockets"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    question_id = Column(String(36), ForeignKey("questions.id", ondelete="CASCADE"), nullable=False, index=True)
    custom_id = Column(String(64), nullable=False)
    label = Column(String(64), nullable=False)
    accepted_component_id = Column(String(64), nullable=False)  # Secret answer (battery, resistor, ground, etc.)
    hint = Column(String(255), nullable=True)
    pin_label_left = Column(String(32), nullable=True, default="IN")
    pin_label_right = Column(String(32), nullable=True, default="OUT")
    slot_order = Column(Integer, nullable=False, default=1)

    __table_args__ = (
        # custom_id must be unique within a question (e.g., Q1+S1 and Q1+S2)
        UniqueConstraint("question_id", "custom_id", name="uq_question_socket_custom_id"),
        Index("idx_sockets_order", "question_id", "slot_order"),
    )

    # Hierarchical Relationship
    question = relationship("Question", back_populates="sockets")

    def __repr__(self):
        return f"<Socket {self.custom_id}: {self.label} -> {self.accepted_component_id}>"


class ParticipantSession(Base):
    __tablename__ = "participant_sessions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    session_id = Column(String(64), unique=True, nullable=False, index=True)
    event_id = Column(String(36), ForeignKey("events.id", ondelete="SET NULL"), nullable=True, index=True)
    player_name = Column(String(128), nullable=False)
    register_number = Column(String(64), nullable=False, index=True)
    status = Column(String(32), nullable=False, default=SessionStatus.PLAYING.value, index=True)
    current_question_index = Column(Integer, nullable=False, default=0)
    wrong_attempts_total = Column(Integer, nullable=False, default=0)
    penalty_seconds_total = Column(Integer, nullable=False, default=0)
    started_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    last_heartbeat = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    event = relationship("Event", back_populates="sessions")
    attempts = relationship("QuestionAttempt", back_populates="session", cascade="all, delete-orphan")
    placements = relationship("SocketPlacement", back_populates="session", cascade="all, delete-orphan")
    result = relationship("TournamentResult", back_populates="session", uselist=False, cascade="all, delete-orphan")

    def __repr__(self):
        return f"<ParticipantSession {self.session_id} ({self.player_name}) [{self.status}]>"


class SocketPlacement(Base):
    __tablename__ = "socket_placements"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    session_id = Column(String(36), ForeignKey("participant_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    question_id = Column(String(36), ForeignKey("questions.id", ondelete="CASCADE"), nullable=False, index=True)
    socket_id = Column(String(36), ForeignKey("sockets.id", ondelete="CASCADE"), nullable=False, index=True)
    component_id = Column(String(64), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("session_id", "socket_id", name="uq_session_socket_placement"),
    )

    session = relationship("ParticipantSession", back_populates="placements")
    socket = relationship("Socket")

    def __repr__(self):
        return f"<SocketPlacement session={self.session_id} socket={self.socket_id} comp={self.component_id}>"


class QuestionAttempt(Base):
    __tablename__ = "question_attempts"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    session_id = Column(String(36), ForeignKey("participant_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    question_id = Column(String(36), ForeignKey("questions.id", ondelete="SET NULL"), nullable=True, index=True)
    question_index = Column(Integer, nullable=False, default=1)
    raw_time_ms = Column(BigInteger, nullable=False, default=0)
    wrong_attempts = Column(Integer, nullable=False, default=0)
    penalty_seconds = Column(Integer, nullable=False, default=0)
    final_time_ms = Column(BigInteger, nullable=False, default=0)
    completed_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        # A session can only record one attempt record per question
        UniqueConstraint("session_id", "question_id", name="uq_session_question_attempt"),
    )

    session = relationship("ParticipantSession", back_populates="attempts")
    question = relationship("Question", back_populates="attempts")

    def __repr__(self):
        return f"<QuestionAttempt session={self.session_id} question={self.question_id} time={self.final_time_ms}ms>"


class TournamentResult(Base):
    __tablename__ = "tournament_results"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    session_id = Column(String(36), ForeignKey("participant_sessions.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    event_id = Column(String(36), ForeignKey("events.id", ondelete="SET NULL"), nullable=True, index=True)
    player_name = Column(String(128), nullable=False)
    register_number = Column(String(64), nullable=False, index=True)
    total_questions = Column(Integer, nullable=False, default=1)
    raw_time_ms = Column(BigInteger, nullable=False)
    total_wrong_attempts = Column(Integer, nullable=False, default=0)
    total_penalty_seconds = Column(Integer, nullable=False, default=0)
    final_time_ms = Column(BigInteger, nullable=False, index=True)
    rank = Column(Integer, nullable=True)
    question_breakdowns = Column(JSON, nullable=True, default=list)
    completed_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    session = relationship("ParticipantSession", back_populates="result")
    event = relationship("Event", back_populates="results")

    def __repr__(self):
        return f"<TournamentResult {self.player_name} ({self.register_number}) Time: {self.final_time_ms}ms Rank: {self.rank}>"
