import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Activity,
  Radio,
  User,
  Clock,
  AlertTriangle,
  Cpu,
  ListOrdered,
  RefreshCw,
  Wifi,
  WifiOff,
  CheckCircle2,
  Ban,
  ShieldAlert
} from 'lucide-react';
import { apiService } from '../../services/apiService';
import { formatTime } from '../../engine/gameEngine';

/**
 * LiveMonitor - Real-Time Telemetry Screen for Active Matches
 * Displays live contestant telemetry, stage progression, heartbeat activity, and summary metrics.
 * Supports both WebSocket Realtime Stream and automatic Live Polling fallback.
 */
export function LiveMonitor({ activeEvent, onRefresh }) {
  const [telemetryData, setTelemetryData] = useState({
    summary: { active_count: 0, completed_count: 0, abandoned_count: 0, total_count: 0 },
    sessions: [],
    timestamp: new Date().toISOString()
  });

  const [filterStatus, setFilterStatus] = useState('ALL'); // 'ALL' | 'PLAYING' | 'COMPLETED' | 'ABANDONED'
  const [connectionMode, setConnectionMode] = useState('polling'); // 'connected' | 'polling' | 'disconnected'
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const pollingTimerRef = useRef(null);

  // Fetch telemetry from backend
  const fetchTelemetry = useCallback(async (showLoading = false) => {
    if (showLoading) setIsLoading(true);
    try {
      const data = await apiService.getLiveTelemetry(activeEvent?.id);
      if (data && data.summary) {
        setTelemetryData(data);
        setLastUpdated(new Date());
      }
    } catch (err) {
      console.warn('Failed fetching live telemetry:', err.message);
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }, [activeEvent?.id]);

  // Realtime WebSocket subscription with auto-polling fallback
  useEffect(() => {
    fetchTelemetry(true);

    const wsHandler = apiService.connectMonitorWebSocket(
      (event) => {
        // When real-time event is received (session_started, placement_attempt, question_completed, session_finished), refresh telemetry
        fetchTelemetry(false);
        if (onRefresh) onRefresh();
      },
      (status) => {
        setConnectionMode(status);
      }
    );

    // Polling interval (every 4s as resilient fallback / heartbeat sync)
    pollingTimerRef.current = setInterval(() => {
      fetchTelemetry(false);
    }, 4000);

    return () => {
      wsHandler.disconnect();
      if (pollingTimerRef.current) clearInterval(pollingTimerRef.current);
    };
  }, [fetchTelemetry, onRefresh]);

  const { summary, sessions } = telemetryData;

  const filteredSessions = sessions.filter((s) => {
    if (filterStatus === 'ALL') return true;
    return s.status === filterStatus;
  });

  return (
    <div className="admin-page-view animate-fade-in">
      {/* Header & Controls */}
      <div className="admin-view-header">
        <div>
          <div className="flex-center-gap mb-1">
            <Radio size={20} className="text-rose-400 animate-pulse" />
            <h2 className="view-title">LIVE TOURNAMENT TELEMETRY</h2>
          </div>
          <p className="view-subtitle">
            Authoritative real-time monitoring of contestants progressing through circuit stages.
          </p>
        </div>

        {/* Realtime Status Indicator & Manual Refresh */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/90 border border-slate-700/80 text-xs font-mono">
            {connectionMode === 'connected' ? (
              <>
                <span className="live-pulse-dot" style={{ backgroundColor: '#10b981' }}></span>
                <span className="text-emerald-400 font-bold">REALTIME SYNC</span>
              </>
            ) : (
              <>
                <span className="live-pulse-dot" style={{ backgroundColor: '#f59e0b' }}></span>
                <span className="text-amber-400 font-bold">LIVE POLLING</span>
              </>
            )}
            <span className="text-slate-500">•</span>
            <span className="text-slate-400">{lastUpdated.toLocaleTimeString()}</span>
          </div>

          <button
            onClick={() => fetchTelemetry(true)}
            disabled={isLoading}
            className="btn btn-secondary btn-sm flex items-center gap-1.5"
            title="Refresh telemetry"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Top Telemetry Summary Counters */}
      <div className="telemetry-summary-grid">
        <div
          onClick={() => setFilterStatus('PLAYING')}
          className={`telemetry-stat-card ${filterStatus === 'PLAYING' ? 'active-tab' : ''}`}
        >
          <div className="telemetry-stat-label">
            <span className="live-pulse-dot" style={{ backgroundColor: '#10b981', width: '8px', height: '8px' }}></span>
            <span>ACTIVE PLAYERS</span>
          </div>
          <div className="telemetry-stat-num" style={{ color: '#10b981' }}>
            {summary.active_count}
          </div>
        </div>

        <div
          onClick={() => setFilterStatus('COMPLETED')}
          className={`telemetry-stat-card ${filterStatus === 'COMPLETED' ? 'active-tab' : ''}`}
        >
          <div className="telemetry-stat-label">
            <CheckCircle2 size={13} style={{ color: '#c084fc' }} />
            <span>COMPLETED</span>
          </div>
          <div className="telemetry-stat-num" style={{ color: '#c084fc' }}>
            {summary.completed_count}
          </div>
        </div>

        <div
          onClick={() => setFilterStatus('ABANDONED')}
          className={`telemetry-stat-card ${filterStatus === 'ABANDONED' ? 'active-tab' : ''}`}
        >
          <div className="telemetry-stat-label">
            <Ban size={13} style={{ color: '#f59e0b' }} />
            <span>ABANDONED ({'>'}5m)</span>
          </div>
          <div className="telemetry-stat-num" style={{ color: '#f59e0b' }}>
            {summary.abandoned_count}
          </div>
        </div>

        <div
          onClick={() => setFilterStatus('ALL')}
          className={`telemetry-stat-card ${filterStatus === 'ALL' ? 'active-tab' : ''}`}
        >
          <div className="telemetry-stat-label">
            <Activity size={13} style={{ color: '#00f2fe' }} />
            <span>TOTAL CONTESTANTS</span>
          </div>
          <div className="telemetry-stat-num" style={{ color: '#00f2fe' }}>
            {summary.total_count}
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="telemetry-filter-tabs">
        {['ALL', 'PLAYING', 'COMPLETED', 'ABANDONED'].map((st) => (
          <button
            key={st}
            onClick={() => setFilterStatus(st)}
            className={`telemetry-filter-btn ${filterStatus === st ? 'selected' : ''}`}
          >
            {st} ({st === 'ALL' ? summary.total_count : st === 'PLAYING' ? summary.active_count : st === 'COMPLETED' ? summary.completed_count : summary.abandoned_count})
          </button>
        ))}
      </div>

      {/* Live Contestants Grid */}
      {filteredSessions.length > 0 ? (
        <div className="live-contestants-grid">
          {filteredSessions.map((player) => {
            const placed = player.placed_count || 0;
            const totalSlots = player.total_slots_in_current_q || 5;
            const progressPercent = totalSlots > 0 ? Math.min(100, Math.round((placed / totalSlots) * 100)) : 100;

            const isCompleted = player.status === 'COMPLETED';
            const isAbandoned = player.status === 'ABANDONED';

            return (
              <div
                key={player.session_id}
                className={`live-contestant-card animate-scale-up ${
                  isCompleted
                    ? 'border-purple-500/40 bg-purple-950/10'
                    : isAbandoned
                    ? 'border-amber-500/30 bg-amber-950/10 opacity-75'
                    : 'border-slate-800'
                }`}
              >
                <div className="live-card-header">
                  <div className="player-avatar-small">
                    <User size={16} />
                  </div>
                  <div className="player-meta-group">
                    <strong className="player-live-name">{player.player_name}</strong>
                    <span className="player-live-reg font-mono">{player.register_number}</span>
                  </div>

                  {/* Liveness Dot */}
                  {player.is_active ? (
                    <span className="live-pulse-dot" style={{ backgroundColor: '#10b981' }} title="Heartbeat active (within last 45s)"></span>
                  ) : isCompleted ? (
                    <CheckCircle2 size={16} className="text-purple-400" title="Completed match" />
                  ) : (
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-600" title="Inactive heartbeat"></span>
                  )}
                </div>

                <div className="live-challenge-tag">
                  <Cpu size={12} className="text-cyan-400" />
                  <span className="font-mono text-cyan-400 font-bold">{player.event_name || player.event_id}</span>
                </div>

                {/* Progressive Question Badge */}
                <div className="bg-slate-900/90 p-2 rounded border border-slate-800 flex justify-between items-center text-xs">
                  <span className="font-bold text-amber-400 font-mono">
                    STAGE {Math.min(player.current_question_index + 1, player.total_questions || 1)} / {player.total_questions || 1}
                  </span>
                  <span className="text-slate-300 text-ellipsis max-w-[140px] truncate" title={player.current_question_name || 'Circuit Stage'}>
                    {player.current_question_name || (isCompleted ? 'All Stages Finished' : 'Circuit Stage')}
                  </span>
                </div>

                {/* Sockets Continuity Progress in Current Question */}
                <div className="live-progress-box">
                  <div className="live-progress-label-row">
                    <span>STAGE CONTINUITY</span>
                    <span className="font-mono text-emerald-400 font-bold">
                      {isCompleted ? 'COMPLETED' : `${placed} / ${totalSlots} Sockets`}
                    </span>
                  </div>
                  <div className="progress-track">
                    <div
                      className="progress-fill"
                      style={{
                        width: `${isCompleted ? 100 : progressPercent}%`,
                        backgroundColor: isCompleted ? '#a855f7' : '#10b981'
                      }}
                    ></div>
                  </div>
                </div>

                {/* Stats Bar */}
                <div className="live-stats-bar">
                  <div className="stat-unit">
                    <span className="stat-unit-label">WRONG</span>
                    <span className="stat-unit-val font-mono text-amber-400">
                      {player.wrong_attempts_total || 0}
                    </span>
                  </div>

                  <div className="stat-unit">
                    <span className="stat-unit-label">PENALTY</span>
                    <span className="stat-unit-val font-mono text-rose-400">
                      +{player.penalty_seconds_total || 0}s
                    </span>
                  </div>

                  <div className="stat-unit">
                    <span className="stat-unit-label">STATUS</span>
                    <span
                      className={`badge ${
                        isCompleted
                          ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                          : isAbandoned
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : 'badge-live'
                      }`}
                    >
                      {isCompleted ? 'FINISHED' : isAbandoned ? 'ABANDONED' : `STAGE ${player.current_question_index + 1}`}
                    </span>
                  </div>
                </div>

                {/* Footer with Session & Timings */}
                <div className="live-card-footer font-mono flex justify-between items-center text-[10px]">
                  <span>{player.session_id}</span>
                  {player.final_time_ms ? (
                    <span className="text-purple-400 font-bold">{formatTime(player.final_time_ms)}</span>
                  ) : (
                    <span className="text-slate-500">
                      Started {new Date(player.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="empty-live-state">
          <Activity size={36} className="text-slate-600 mb-2" />
          <h3>No {filterStatus === 'ALL' ? '' : filterStatus} Contestants Found</h3>
          <p>
            When participants register and start matches, their live progressive stage telemetry will stream here in real-time.
          </p>
        </div>
      )}
    </div>
  );
}

export default LiveMonitor;
