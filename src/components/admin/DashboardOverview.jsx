import React from 'react';
import {
  Layers,
  Zap,
  Users,
  Activity,
  Trophy,
  Clock,
  PlusCircle,
  UploadCloud,
  Radio,
  FileSpreadsheet,
  CheckCircle2,
  ListOrdered
} from 'lucide-react';
import { formatTime } from '../../engine/gameEngine.js';

/**
 * DashboardOverview - Admin KPI Summary and Quick Action Launchpad
 */
export function DashboardOverview({
  events,
  activeEvent,
  participants,
  results,
  onNavigateTab,
  onOpenCreateEvent
}) {
  const totalEvents = events.length;
  const totalQuestions = events.reduce((sum, e) => sum + (e.questions?.length || 0), 0);
  const totalParticipants = participants.length;
  const liveContestants = participants.filter((p) => p.status === 'PLAYING').length;
  const completedMatches = results.length;

  const avgFinalTimeMs =
    results.length > 0
      ? Math.round(results.reduce((acc, r) => acc + (r.finalTimeMs || 0), 0) / results.length)
      : 0;

  return (
    <div className="admin-dashboard-view animate-fade-in">
      {/* KPI Cards Grid */}
      <div className="admin-kpi-grid">
        <div className="kpi-card" onClick={() => onNavigateTab('events')}>
          <div className="kpi-icon-wrap text-cyan-400 bg-cyan-950/40 border-cyan-800/50">
            <Layers size={22} />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">TOTAL EVENTS</span>
            <span className="kpi-value font-mono">{totalEvents}</span>
            <span className="kpi-sub">{events.filter((e) => e.status === 'ACTIVE').length} Active</span>
          </div>
        </div>

        <div className="kpi-card highlight-kpi" onClick={() => onNavigateTab('questions')}>
          <div className="kpi-icon-wrap text-amber-400 bg-amber-950/40 border-amber-800/50">
            <Zap size={22} />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">ACTIVE EVENT</span>
            <span className="kpi-value text-ellipsis" title={activeEvent?.name}>
              {activeEvent?.id || 'None'}
            </span>
            <span className="kpi-sub font-mono">
              {activeEvent?.questions?.length || 0} Questions &bull; {activeEvent?.name}
            </span>
          </div>
        </div>

        <div className="kpi-card" onClick={() => onNavigateTab('questions')}>
          <div className="kpi-icon-wrap text-emerald-400 bg-emerald-950/40 border-emerald-800/50">
            <ListOrdered size={22} />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">TOTAL QUESTIONS</span>
            <span className="kpi-value font-mono">{totalQuestions}</span>
            <span className="kpi-sub">Across all configured events</span>
          </div>
        </div>

        <div className="kpi-card live-kpi" onClick={() => onNavigateTab('live')}>
          <div className="kpi-icon-wrap text-rose-400 bg-rose-950/40 border-rose-800/50">
            <Activity size={22} className="animate-pulse" />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">CONTESTANTS PLAYING</span>
            <div className="kpi-value-row">
              <span className="kpi-value font-mono">{liveContestants}</span>
              <span className="live-status-pill font-mono">LIVE</span>
            </div>
            <span className="kpi-sub">{totalParticipants} Registered</span>
          </div>
        </div>

        <div className="kpi-card" onClick={() => onNavigateTab('results')}>
          <div className="kpi-icon-wrap text-emerald-400 bg-emerald-950/40 border-emerald-800/50">
            <Trophy size={22} />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">COMPLETED MATCHES</span>
            <span className="kpi-value font-mono">{completedMatches}</span>
            <span className="kpi-sub">Official event submissions</span>
          </div>
        </div>

        <div className="kpi-card" onClick={() => onNavigateTab('results')}>
          <div className="kpi-icon-wrap text-purple-400 bg-purple-950/40 border-purple-800/50">
            <Clock size={22} />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">AVERAGE FINAL TIME</span>
            <span className="kpi-value font-mono">{formatTime(avgFinalTimeMs)}</span>
            <span className="kpi-sub">Total event duration</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Active Event Details + Quick Launch Shortcuts */}
      <div className="dashboard-columns-grid">
        <div className="dashboard-card active-challenge-showcase">
          <div className="card-header-bar">
            <div className="card-header-title">
              <Zap size={18} className="text-amber-400" />
              <h3>CURRENT ACTIVE EVENT &bull; PROGRESSIVE STAGES</h3>
            </div>
            <span className="badge badge-active">ASSIGNED TO PLAYERS</span>
          </div>

          {activeEvent ? (
            <div className="active-challenge-body">
              <div className="challenge-hero-meta">
                <div>
                  <h4 className="challenge-hero-name">{activeEvent.name}</h4>
                  <p className="challenge-hero-desc">{activeEvent.description}</p>
                </div>
                <div className="challenge-tags">
                  <span className="tag font-mono">Event ID: {activeEvent.id}</span>
                  <span className="tag font-mono">{activeEvent.questions?.length || 0} Progressive Questions</span>
                </div>
              </div>

              <div className="active-slots-preview">
                <span className="slots-preview-title">
                  QUESTIONS &amp; TOPOLOGIES ({activeEvent.questions?.length || 0} STAGES)
                </span>
                <div className="flex flex-col gap-2">
                  {(activeEvent.questions || []).map((q, idx) => (
                    <div key={q.id} className="bg-slate-900/80 p-3 rounded-lg border border-slate-800 flex justify-between items-center">
                      <div>
                        <strong className="text-white text-sm">
                          Stage {idx + 1}: {q.name}
                        </strong>
                        <span className="text-xs text-slate-400 block mt-0.5">
                          {q.slots?.length || 0} Sockets &bull; {(q.slots || []).map((s) => s.label).join(' &rarr; ')}
                        </span>
                      </div>
                      <span className={`badge badge-diff-${(q.difficulty || 'Easy').toLowerCase()}`}>
                        {q.difficulty}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="empty-state-box">
              <p>No event is currently active.</p>
              <button
                type="button"
                className="btn btn-primary btn-sm mt-3"
                onClick={() => onNavigateTab('events')}
              >
                Activate an Event
              </button>
            </div>
          )}
        </div>

        {/* Shortcuts */}
        <div className="dashboard-card quick-actions-card">
          <div className="card-header-bar">
            <div className="card-header-title">
              <Activity size={18} className="text-cyan-400" />
              <h3>OPERATION SHORTCUTS</h3>
            </div>
          </div>

          <div className="shortcuts-list">
            <button
              type="button"
              className="shortcut-btn"
              onClick={onOpenCreateEvent}
            >
              <div className="shortcut-icon bg-cyan-950/50 text-cyan-400">
                <PlusCircle size={20} />
              </div>
              <div className="shortcut-meta">
                <strong>Create Tournament Event</strong>
                <span>Set up new tournament round and circuit questions</span>
              </div>
            </button>

            <button
              type="button"
              className="shortcut-btn"
              onClick={() => onNavigateTab('questions')}
            >
              <div className="shortcut-icon bg-amber-950/50 text-amber-400">
                <ListOrdered size={20} />
              </div>
              <div className="shortcut-meta">
                <strong>Manage Event Questions</strong>
                <span>Add, edit, or reorder progressive circuit stages and sockets</span>
              </div>
            </button>

            <button
              type="button"
              className="shortcut-btn"
              onClick={() => onNavigateTab('upload')}
            >
              <div className="shortcut-icon bg-blue-950/50 text-blue-400">
                <UploadCloud size={20} />
              </div>
              <div className="shortcut-meta">
                <strong>Bulk Event Upload</strong>
                <span>Import entire Event &amp; Questions via Excel / CSV</span>
              </div>
            </button>

            <button
              type="button"
              className="shortcut-btn"
              onClick={() => onNavigateTab('results')}
            >
              <div className="shortcut-icon bg-emerald-950/50 text-emerald-400">
                <FileSpreadsheet size={20} />
              </div>
              <div className="shortcut-meta">
                <strong>Leaderboard &amp; CSV Export</strong>
                <span>View ranked scores and export full breakdown data</span>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
