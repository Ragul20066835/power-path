import React, { useState } from 'react';
import { Search, Users, RefreshCw } from 'lucide-react';

/**
 * ParticipantsList - Displays all registered contest participants and their active stage
 */
export function ParticipantsList({ participants = [], events = [], onRefresh }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [eventFilter, setEventFilter] = useState('ALL');

  const filtered = (participants || []).filter((p) => {
    const matchesSearch =
      (p.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.regNo || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.sessionId || '').toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus =
      statusFilter === 'ALL' || (p.status || '').toUpperCase() === statusFilter;

    const matchesEvent =
      eventFilter === 'ALL' ||
      p.eventId === eventFilter ||
      p.eventName === eventFilter;

    return matchesSearch && matchesStatus && matchesEvent;
  });

  return (
    <div className="admin-page-view animate-fade-in">
      <div className="admin-view-header">
        <div>
          <h2 className="view-title">REGISTERED PARTICIPANTS</h2>
          <p className="view-subtitle">
            Monitor and filter contestant sessions, current stage, and telemetry status.
          </p>
        </div>

        <button type="button" className="btn btn-secondary btn-sm" onClick={onRefresh}>
          <RefreshCw size={14} />
          <span>Refresh</span>
        </button>
      </div>

      <div className="admin-filter-bar">
        <div className="search-input-wrap">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            className="admin-search-input"
            placeholder="Search participant by name, roll no, or session ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {events && events.length > 0 && (
          <div className="select-filter-wrap">
            <select
              className="admin-filter-select"
              value={eventFilter}
              onChange={(e) => setEventFilter(e.target.value)}
            >
              <option value="ALL">ALL EVENTS</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.name || ev.id}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="filter-pill-group">
          {['ALL', 'PLAYING', 'COMPLETED'].map((st) => (
            <button
              key={st}
              type="button"
              className={`filter-pill-sm ${statusFilter === st ? 'active' : ''}`}
              onClick={() => setStatusFilter(st)}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      <div className="admin-table-card">
        <table className="admin-data-table">
          <thead>
            <tr>
              <th>REGISTER NO</th>
              <th>NAME</th>
              <th>SESSION ID</th>
              <th>EVENT</th>
              <th>STAGE PROGRESS</th>
              <th>TOTAL WRONG</th>
              <th>STATUS</th>
              <th>FINAL / ELAPSED</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length > 0 ? (
              filtered.map((p) => {
                const isDone = p.status === 'COMPLETED';
                return (
                  <tr key={p.sessionId}>
                    <td className="font-mono font-bold text-sky-400">{p.regNo}</td>
                    <td><strong>{p.name}</strong></td>
                    <td className="font-mono text-xs text-slate-400">{p.sessionId}</td>
                    <td>
                      <span className="font-mono text-xs">{p.eventName || p.eventId}</span>
                    </td>
                    <td>
                      <span className="font-mono font-bold text-amber-400">
                        {p.questionProgressText || `Stage ${(p.currentQuestionIndex || 0) + 1}/${p.totalQuestions || 1}`}
                      </span>
                    </td>
                    <td>
                      <span className="font-mono text-amber-400">{p.wrongAttempts || 0}</span>
                    </td>
                    <td>
                      <span className={`badge ${isDone ? 'badge-active' : 'badge-live'}`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="font-mono font-bold">
                      {isDone ? p.finalTimeFormatted : (p.rawTimeFormatted || 'In Progress')}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={8} className="table-empty-row">
                  No participants found matching the search criteria.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
