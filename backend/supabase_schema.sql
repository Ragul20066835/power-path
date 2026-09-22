-- ============================================================================
-- POWERPATH — PRODUCTION DATABASE SCHEMA (SUPABASE POSTGRESQL)
-- Architecture: EVENT -> QUESTIONS -> SOCKETS (Hierarchy)
-- Target: High-Concurrency (50+ simultaneous contestants), ACID Transactions
-- ============================================================================

-- Enable UUID extension if not already present
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. ENUM TYPES
-- ============================================================================

DO $$ BEGIN
    CREATE TYPE event_status_enum AS ENUM ('ACTIVE', 'INACTIVE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE tournament_gate_enum AS ENUM ('OPEN', 'PAUSED', 'CLOSED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE session_status_enum AS ENUM ('PLAYING', 'COMPLETED', 'ABANDONED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE admin_role_enum AS ENUM ('SUPER_ADMIN', 'EVENT_ADMIN');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- 2. TABLE DEFINITIONS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 2.1 ADMIN_USERS: Secure staff & judge authentication
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(64) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    hashed_password VARCHAR(255) NOT NULL,
    role admin_role_enum NOT NULL DEFAULT 'EVENT_ADMIN',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 2.2 TOURNAMENT_SETTINGS: Global gates & tournament rules
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tournament_settings (
    key VARCHAR(32) PRIMARY KEY DEFAULT 'global',
    event_status tournament_gate_enum NOT NULL DEFAULT 'OPEN',
    default_penalty_seconds INTEGER NOT NULL DEFAULT 5,
    allow_replay BOOLEAN NOT NULL DEFAULT TRUE,
    audio_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 2.3 EVENTS: Top-level tournament championship rounds
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    custom_id VARCHAR(64) NOT NULL UNIQUE, -- e.g. 'E001', 'E_CHAMPIONSHIP'
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status event_status_enum NOT NULL DEFAULT 'INACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Single Active Event Protection: Enforces database-level constraint that AT MOST ONE event can be 'ACTIVE'
CREATE UNIQUE INDEX IF NOT EXISTS idx_single_active_event 
ON events (status) 
WHERE status = 'ACTIVE';

-- ----------------------------------------------------------------------------
-- 2.4 QUESTIONS: Progressive circuit stages belonging to an Event
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    custom_id VARCHAR(64) NOT NULL, -- e.g. 'Q001' (unique within this event)
    name VARCHAR(255) NOT NULL,
    description TEXT,
    difficulty VARCHAR(32) NOT NULL DEFAULT 'Easy', -- 'Easy' | 'Medium' | 'Hard'
    penalty_seconds INTEGER NOT NULL DEFAULT 5,
    question_order INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_event_question_custom_id UNIQUE (event_id, custom_id)
);

-- ----------------------------------------------------------------------------
-- 2.5 SOCKETS: PCB component insertion points belonging to a Question
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sockets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    custom_id VARCHAR(64) NOT NULL, -- e.g. 'S1', 'S2' (unique within this question)
    label VARCHAR(64) NOT NULL,     -- e.g. 'SOURCE', 'SWITCH', 'LIMITER'
    accepted_component_id VARCHAR(64) NOT NULL, -- Secret answer: 'battery', 'switch', 'resistor', 'led', 'ammeter', 'ground', etc.
    hint VARCHAR(255),             -- Public clue: '9V DC Voltage Source'
    pin_label_left VARCHAR(32) DEFAULT 'IN',
    pin_label_right VARCHAR(32) DEFAULT 'OUT',
    slot_order INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT uq_question_socket_custom_id UNIQUE (question_id, custom_id)
);

-- ----------------------------------------------------------------------------
-- 2.6 PARTICIPANT_SESSIONS: Live contestant game sessions & telemetry
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS participant_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id VARCHAR(64) NOT NULL UNIQUE, -- e.g. 'DC-7F2A-9B01'
    event_id UUID REFERENCES events(id) ON DELETE SET NULL, -- Historical result preservation
    player_name VARCHAR(128) NOT NULL,
    register_number VARCHAR(64) NOT NULL,
    status session_status_enum NOT NULL DEFAULT 'PLAYING',
    current_question_index INTEGER NOT NULL DEFAULT 0,
    wrong_attempts_total INTEGER NOT NULL DEFAULT 0,
    penalty_seconds_total INTEGER NOT NULL DEFAULT 0,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 2.7 SOCKET_PLACEMENTS: Live active socket completion state per session
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS socket_placements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES participant_sessions(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    socket_id UUID NOT NULL REFERENCES sockets(id) ON DELETE CASCADE,
    component_id VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_session_socket_placement UNIQUE (session_id, socket_id)
);

-- ----------------------------------------------------------------------------
-- 2.8 QUESTION_ATTEMPTS: Stage-by-stage timing & penalty breakdown
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS question_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES participant_sessions(id) ON DELETE CASCADE,
    question_id UUID REFERENCES questions(id) ON DELETE SET NULL,
    question_index INTEGER NOT NULL DEFAULT 1,
    raw_time_ms BIGINT NOT NULL DEFAULT 0,
    wrong_attempts INTEGER NOT NULL DEFAULT 0,
    penalty_seconds INTEGER NOT NULL DEFAULT 0,
    final_time_ms BIGINT NOT NULL DEFAULT 0,
    completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_session_question_attempt UNIQUE (session_id, question_id)
);

-- ----------------------------------------------------------------------------
-- 2.8 TOURNAMENT_RESULTS: Official finalized results & immutable leaderboard
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tournament_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL UNIQUE REFERENCES participant_sessions(id) ON DELETE CASCADE,
    event_id UUID REFERENCES events(id) ON DELETE SET NULL, -- Historical result preservation
    player_name VARCHAR(128) NOT NULL,
    register_number VARCHAR(64) NOT NULL,
    total_questions INTEGER NOT NULL DEFAULT 1,
    raw_time_ms BIGINT NOT NULL,
    total_wrong_attempts INTEGER NOT NULL DEFAULT 0,
    total_penalty_seconds INTEGER NOT NULL DEFAULT 0,
    final_time_ms BIGINT NOT NULL,
    rank INTEGER,
    question_breakdowns JSONB DEFAULT '[]'::jsonb,
    completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 3. PERFORMANCE & INTEGRITY INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_events_status ON events (status);
CREATE INDEX IF NOT EXISTS idx_events_custom_id ON events (custom_id);

CREATE INDEX IF NOT EXISTS idx_questions_event_id ON questions (event_id);
CREATE INDEX IF NOT EXISTS idx_questions_order ON questions (event_id, question_order);

CREATE INDEX IF NOT EXISTS idx_sockets_question_id ON sockets (question_id);
CREATE INDEX IF NOT EXISTS idx_sockets_order ON sockets (question_id, slot_order);

CREATE INDEX IF NOT EXISTS idx_sessions_session_id ON participant_sessions (session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_event_id ON participant_sessions (event_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON participant_sessions (status);
CREATE INDEX IF NOT EXISTS idx_sessions_reg_no ON participant_sessions (register_number);

CREATE INDEX IF NOT EXISTS idx_attempts_session_id ON question_attempts (session_id);
CREATE INDEX IF NOT EXISTS idx_attempts_question_id ON question_attempts (question_id);

CREATE INDEX IF NOT EXISTS idx_results_event_id ON tournament_results (event_id);
CREATE INDEX IF NOT EXISTS idx_results_final_time ON tournament_results (final_time_ms ASC);
CREATE INDEX IF NOT EXISTS idx_results_reg_no ON tournament_results (register_number);

-- ============================================================================
-- 4. SEED DATA (DEFAULT GLOBAL TOURNAMENT CONFIGURATION)
-- ============================================================================

INSERT INTO tournament_settings (key, event_status, default_penalty_seconds, allow_replay, audio_enabled, updated_at)
VALUES ('global', 'OPEN', 5, TRUE, TRUE, NOW())
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- 5. ROW LEVEL SECURITY (RLS) & SERVICE-ROLE STRATEGY
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sockets ENABLE ROW LEVEL SECURITY;
ALTER TABLE participant_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE socket_placements ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_results ENABLE ROW LEVEL SECURITY;

-- Service Role Policy: FastAPI Backend connects with the Supabase Service Role key
-- or direct PostgreSQL connection string, bypassing RLS for authoritative game operations.
-- Public Frontend has READ-ONLY access to active events, public socket hints, and results.
-- Secret answers (accepted_component_id) are ONLY validated on FastAPI backend.
