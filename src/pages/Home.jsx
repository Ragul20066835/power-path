import React from 'react';
import { PlayerForm } from '../components/PlayerForm';
import {
  Zap,
  Cpu,
  Clock,
  ShieldAlert,
  CheckCircle2,
  Lock,
  ListOrdered,
  Layers,
  ChevronRight,
  Sparkles,
  Radio
} from 'lucide-react';

/**
 * Home - Futuristic Electronics Tournament Landing Screen
 */
export function Home({ activeEvent, settings, serverSyncError, onRetry, onStartGame }) {
  const totalQ = Number(
    activeEvent?.totalQuestions !== undefined && activeEvent?.totalQuestions !== null
      ? activeEvent.totalQuestions
      : activeEvent?.questions?.length || 0
  );
  const calculatedSockets = (activeEvent?.questions || []).reduce((sum, q) => sum + (q.slots?.length || q.sockets?.length || 0), 0);
  const totalSockets = Number(
    activeEvent?.totalSockets !== undefined && activeEvent?.totalSockets !== null
      ? activeEvent.totalSockets
      : calculatedSockets
  );

  const isEventOpen =
    (settings?.eventStatus === 'OPEN' || !settings?.eventStatus) &&
    activeEvent &&
    activeEvent.status === 'ACTIVE' &&
    totalQ > 0 &&
    !serverSyncError;

  const questions = activeEvent?.questions || [];
  const questionCount = totalQ;
  const totalSlots = totalSockets;
  const eventPenalty = questions[0]?.penaltySeconds || settings?.defaultPenaltySeconds || 5;

  return (
    <div className="home-page-container">
      {/* Hero Section */}
      <section className="hero-section">
        {/* Glow ambient circle */}
        <div className="hero-ambient-glow" aria-hidden="true"></div>

        <div className="hero-badge-wrap">
          <div className="live-event-badge">
            <span className="live-pulse-dot"></span>
            <span className="badge-text-primary">LIVE EVENT</span>
            <span className="badge-divider">&bull;</span>
            <span className="badge-text-secondary">ELECTRONICS CLUB CHALLENGE</span>
          </div>
        </div>

        <h1 className="hero-title">
          <span className="hero-gradient-amp">POWERPATH</span>
        </h1>

        <p className="hero-tagline">
          &ldquo;Build the Circuit. Beat the Clock.&rdquo;
        </p>

        {/* Active Event Banner */}
        <div className="hero-active-event-banner">
          <div className="active-event-label-row">
            <span className="active-event-sub">ACTIVE EVENT</span>
            <span className="active-event-pill font-mono">{activeEvent?.customId || activeEvent?.id || 'CHAMPIONSHIP'}</span>
          </div>
          <div className="active-event-main-name">
            {activeEvent?.name || 'POWERPATH — Championship Round'}
          </div>
        </div>
      </section>

      {/* Server Sync Error Banner if backend cannot be reached */}
      {serverSyncError && (
        <div className="event-paused-banner server-sync-error animate-shake" role="alert" style={{ borderColor: 'rgba(239, 68, 68, 0.4)', background: 'rgba(239, 68, 68, 0.1)' }}>
          <div className="paused-icon-wrap" style={{ background: 'rgba(239, 68, 68, 0.2)' }}>
            <ShieldAlert size={20} className="text-rose-400" />
          </div>
          <div className="paused-text" style={{ flex: 1 }}>
            <strong className="text-rose-400">
              SERVER SYNC ERROR: UNABLE TO CONNECT TO TOURNAMENT SERVER
            </strong>
            <p className="text-rose-200">
              {serverSyncError}
            </p>
          </div>
          {onRetry && (
            <button
              type="button"
              className="btn btn-secondary text-xs px-3 py-1.5"
              onClick={onRetry}
            >
              Retry Connection
            </button>
          )}
        </div>
      )}

      {/* Maintenance / Paused Banner if event is closed */}
      {!serverSyncError && !isEventOpen && (
        <div className="event-paused-banner animate-shake" role="status">
          <div className="paused-icon-wrap">
            <Lock size={20} className="text-amber-400" />
          </div>
          <div className="paused-text">
            <strong>
              TOURNAMENT STATUS:{' '}
              {!activeEvent
                ? 'NO ACTIVE EVENT'
                : totalQ === 0
                ? 'EVENT HAS 0 QUESTIONS'
                : settings?.eventStatus || 'PAUSED'}
            </strong>
            <p>
              {!activeEvent
                ? 'No tournament event is currently active. Please ask an administrator to activate an event.'
                : totalQ === 0
                ? 'The active event has no questions configured. Please ask an administrator to add challenges.'
                : 'Registration and gameplay are temporarily paused by event administrators.'}
            </p>
          </div>
        </div>
      )}

      {/* Main Content Grid: Player Registration + Active Event Specification */}
      <div className="home-content-grid">
        {/* Column 1: Player Registration Card */}
        <div className="form-column">
          {isEventOpen ? (
            <PlayerForm onStartGame={onStartGame} />
          ) : (
            <div className="player-form-card glass-panel text-center opacity-75">
              <div className="form-card-badge">
                <Lock size={14} className="text-amber-400" />
                <span>REGISTRATION LOCKED</span>
              </div>
              <h3 className="form-title text-amber-400 mt-3">SESSION REGISTRATION CLOSED</h3>
              <p className="form-subtitle mt-2">
                {serverSyncError
                  ? 'Please reconnect to tournament server to proceed.'
                  : !activeEvent
                  ? 'No active event is currently configured for player registration.'
                  : 'Please wait for tournament administrators to open the session.'}
              </p>
            </div>
          )}
        </div>

        {/* Column 2: Event Information Card */}
        <div className="overview-column">
          <div className="overview-card glass-panel">
            {/* Header */}
            <div className="overview-header-row">
              <div className="overview-title-group">
                <div className="overview-icon-badge">
                  <Cpu size={18} className="text-cyan-400" />
                </div>
                <div>
                  <h3 className="overview-heading">ACTIVE EVENT MISSION</h3>
                  <span className="overview-subheading">Challenge Specifications &amp; Telemetry</span>
                </div>
              </div>
              <span className={`badge-pill ${activeEvent ? 'badge-live' : 'badge-idle'}`}>
                <Radio size={11} className="animate-pulse" />
                <span>{activeEvent?.customId || activeEvent?.id || 'NO EVENT'}</span>
              </span>
            </div>

            {/* Event Name & Description */}
            <div className="mission-highlight-box">
              <span className="mission-title font-tech">
                {activeEvent?.name || 'Championship Electronics Circuit Challenge'}
              </span>
              <p className="mission-desc">
                {activeEvent?.description ||
                  'Construct complete functional DC circuits across progressive question stages with maximum speed and zero wiring penalties.'}
              </p>
            </div>

            {/* Core Metrics Grid */}
            <div className="overview-metrics-grid">
              <div className="overview-metric-card">
                <div className="metric-icon-bubble cyan-glow">
                  <ListOrdered size={16} className="text-cyan-400" />
                </div>
                <div className="metric-info">
                  <span className="metric-num">{questionCount}</span>
                  <span className="metric-text">CIRCUIT CHALLENGES</span>
                </div>
              </div>

              <div className="overview-metric-card">
                <div className="metric-icon-bubble emerald-glow">
                  <Zap size={16} className="text-emerald-400" />
                </div>
                <div className="metric-info">
                  <span className="metric-num">{totalSlots}</span>
                  <span className="metric-text">CIRCUIT SOCKETS</span>
                </div>
              </div>

              <div className="overview-metric-card">
                <div className="metric-icon-bubble rose-glow">
                  <ShieldAlert size={16} className="text-rose-400" />
                </div>
                <div className="metric-info">
                  <span className="metric-num">+{eventPenalty}s</span>
                  <span className="metric-text">PENALTY / WRONG DROP</span>
                </div>
              </div>

              <div className="overview-metric-card">
                <div className="metric-icon-bubble purple-glow">
                  <Clock size={16} className="text-purple-300" />
                </div>
                <div className="metric-info">
                  <span className="metric-num">0.01s</span>
                  <span className="metric-text">CENTISECOND TIMING</span>
                </div>
              </div>
            </div>

            {/* Challenge Format Flow */}
            {questions.length > 0 && (
              <div className="challenge-format-section">
                <div className="format-header">
                  <Layers size={14} className="text-cyan-400" />
                  <span>CHALLENGE FORMAT</span>
                </div>
                <div className="format-stages-flow">
                  {questions.slice(0, 5).map((q, idx) => (
                    <React.Fragment key={q.id || idx}>
                      <div className="stage-pill">
                        <span className="stage-idx">Q{idx + 1}</span>
                        <span className="stage-name text-ellipsis">{q.name}</span>
                      </div>
                      {idx < Math.min(questions.length - 1, 4) && (
                        <ChevronRight size={14} className="flow-arrow" />
                      )}
                    </React.Fragment>
                  ))}
                  {questions.length > 5 && (
                    <>
                      <ChevronRight size={14} className="flow-arrow" />
                      <div className="stage-pill final-pill">
                        <span className="stage-idx">Q{questions.length}</span>
                        <span className="stage-name">Final Stage</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Quick Feature Pills */}
            <div className="rules-quick-preview">
              <div className="quick-pill">
                <CheckCircle2 size={13} className="text-emerald-400" />
                <span>Mouse Drag &amp; Drop</span>
              </div>
              <div className="quick-pill">
                <CheckCircle2 size={13} className="text-emerald-400" />
                <span>Touch Screen Ready</span>
              </div>
              <div className="quick-pill">
                <CheckCircle2 size={13} className="text-emerald-400" />
                <span>Tap-to-Place Fallback</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Home;
