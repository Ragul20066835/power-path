"""
POWERPATH Pydantic Validation & Serialization Schemas
"""

from datetime import datetime
from typing import List, Optional, Any, Dict
from pydantic import BaseModel, ConfigDict, Field, field_validator


# -----------------------------------------------------------------------------
# 1. HEALTH SCHEMA
# -----------------------------------------------------------------------------
class HealthResponse(BaseModel):
    status: str = "ok"
    database: str = "connected"
    timestamp: str
    environment: str = "development"
    version: str = "1.0.0"


# -----------------------------------------------------------------------------
# 2. COMPONENT CATALOGUE SCHEMAS
# -----------------------------------------------------------------------------
class ComponentPublic(BaseModel):
    id: str
    name: str
    code: str
    category: str
    is_decoy: bool
    rating: str
    description: str


class ComponentValidationRequest(BaseModel):
    socket_id: str
    component_id: str


class ComponentValidationResponse(BaseModel):
    correct: bool
    penalty_applied: int = 0
    message: str


# -----------------------------------------------------------------------------
# 3. TOURNAMENT SETTINGS SCHEMAS
# -----------------------------------------------------------------------------
class TournamentSettingsBase(BaseModel):
    event_status: str = "OPEN"
    default_penalty_seconds: int = 5
    allow_replay: bool = True
    audio_enabled: bool = True


class TournamentSettingsUpdate(BaseModel):
    event_status: Optional[str] = None
    default_penalty_seconds: Optional[int] = None
    allow_replay: Optional[bool] = None
    audio_enabled: Optional[bool] = None


class TournamentSettingsPublic(TournamentSettingsBase):
    key: str = "global"
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


# -----------------------------------------------------------------------------
# 4. SOCKET SCHEMAS
# -----------------------------------------------------------------------------
class SocketBase(BaseModel):
    custom_id: str
    label: str
    hint: Optional[str] = None
    pin_label_left: Optional[str] = "IN"
    pin_label_right: Optional[str] = "OUT"
    slot_order: int = 1


class SocketCreate(SocketBase):
    accepted_component_id: str  # Required when creating/administering socket


class SocketUpdate(BaseModel):
    custom_id: Optional[str] = None
    label: Optional[str] = None
    accepted_component_id: Optional[str] = None
    hint: Optional[str] = None
    pin_label_left: Optional[str] = None
    pin_label_right: Optional[str] = None
    slot_order: Optional[int] = None


class SocketPublic(SocketBase):
    """Public socket view for contestants — SECRET ANSWER IS EXCLUDED!"""
    id: str

    model_config = ConfigDict(from_attributes=True)


class SocketAdmin(SocketBase):
    """Admin socket view — includes secret answer for configuration & inspection"""
    id: str
    accepted_component_id: str

    model_config = ConfigDict(from_attributes=True)


# -----------------------------------------------------------------------------
# 5. QUESTION SCHEMAS
# -----------------------------------------------------------------------------
class QuestionBase(BaseModel):
    custom_id: str
    name: str
    description: Optional[str] = None
    difficulty: str = "Easy"
    penalty_seconds: int = 5
    question_order: int = 1


class QuestionCreate(QuestionBase):
    sockets: List[SocketCreate] = Field(default_factory=list)


class QuestionUpdate(BaseModel):
    custom_id: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    difficulty: Optional[str] = None
    penalty_seconds: Optional[int] = None
    question_order: Optional[int] = None


class QuestionPublic(QuestionBase):
    id: str
    sockets: List[SocketPublic] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class QuestionAdmin(QuestionBase):
    id: str
    sockets: List[SocketAdmin] = Field(default_factory=list)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


# -----------------------------------------------------------------------------
# 6. EVENT SCHEMAS
# -----------------------------------------------------------------------------
class EventBase(BaseModel):
    custom_id: str
    name: str
    description: Optional[str] = None
    status: str = "INACTIVE"


class EventCreate(EventBase):
    questions: List[QuestionCreate] = Field(default_factory=list)


class EventUpdate(BaseModel):
    custom_id: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None


class EventPublic(EventBase):
    id: str
    questions: List[QuestionPublic] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class EventAdmin(EventBase):
    id: str
    questions: List[QuestionAdmin] = Field(default_factory=list)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


# -----------------------------------------------------------------------------
# 7. PARTICIPANT SESSION SCHEMAS
# -----------------------------------------------------------------------------
class SessionCreate(BaseModel):
    player_name: str
    register_number: str
    event_id: Optional[str] = None


class SessionPublic(BaseModel):
    id: str
    session_id: str
    event_id: Optional[str] = None
    player_name: str
    register_number: str
    status: str
    current_question_index: int
    wrong_attempts_total: int
    penalty_seconds_total: int
    started_at: datetime
    completed_at: Optional[datetime] = None
    last_heartbeat: datetime

    model_config = ConfigDict(from_attributes=True)


# -----------------------------------------------------------------------------
# 8. QUESTION ATTEMPT SCHEMAS
# -----------------------------------------------------------------------------
class AttemptCreate(BaseModel):
    session_id: str
    question_id: str
    question_index: int
    raw_time_ms: int
    wrong_attempts: int = 0
    penalty_seconds: int = 0
    final_time_ms: int


class AttemptPublic(BaseModel):
    id: str
    session_id: str
    question_id: Optional[str] = None
    question_index: int
    raw_time_ms: int
    wrong_attempts: int
    penalty_seconds: int
    final_time_ms: int
    completed_at: datetime

    model_config = ConfigDict(from_attributes=True)


# -----------------------------------------------------------------------------
# 9. TOURNAMENT RESULT SCHEMAS
# -----------------------------------------------------------------------------
class ResultPublic(BaseModel):
    id: str
    session_id: str
    event_id: Optional[str] = None
    player_name: str
    register_number: str
    total_questions: int
    raw_time_ms: int
    total_wrong_attempts: int
    total_penalty_seconds: int
    final_time_ms: int
    rank: Optional[int] = None
    question_breakdowns: Optional[List[Dict[str, Any]]] = None
    completed_at: datetime

    model_config = ConfigDict(from_attributes=True)


class LeaderboardEntry(BaseModel):
    rank: int
    player_name: str
    register_number: str
    raw_time_ms: int
    total_penalty_seconds: int
    final_time_ms: int
    completed_at: datetime

    model_config = ConfigDict(from_attributes=True)


# -----------------------------------------------------------------------------
# 10. ADMIN USER & AUTH SCHEMAS
# -----------------------------------------------------------------------------
class AdminUserCreate(BaseModel):
    username: str
    email: str
    password: str
    role: str = "EVENT_ADMIN"


class AdminUserPublic(BaseModel):
    id: str
    username: str
    email: str
    role: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @field_validator("id", mode="before")
    @classmethod
    def ensure_id_str(cls, v: Any) -> str:
        if v is not None:
            return str(v)
        return v


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: AdminUserPublic
