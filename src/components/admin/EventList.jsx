import React, { useState } from 'react';
import {
  PlusCircle,
  UploadCloud,
  CheckCircle2,
  XCircle,
  Edit2,
  Copy,
  Trash2,
  Search,
  Zap,
  Layers,
  HelpCircle,
  ArrowRight
} from 'lucide-react';

/**
 * EventList - Event Management Table & Activation Controller
 */
export function EventList({
  events,
  onActivateEvent,
  onDeactivateEvent,
  onEditEvent,
  onDuplicateEvent,
  onDeleteEvent,
  onManageQuestions,
  onOpenCreateEvent,
  onOpenUploadTab
}) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredEvents = events.filter((e) => {
    const matchesSearch =
      (e.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (e.id || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (e.description || '').toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  return (
    <div className="admin-page-view animate-fade-in">
      <div className="admin-view-header">
        <div>
          <h2 className="view-title">EVENT MANAGEMENT</h2>
          <p className="view-subtitle">
            Create tournament events containing multiple progressive circuit questions.
          </p>
        </div>

        <div className="view-header-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onOpenUploadTab}
          >
            <UploadCloud size={16} />
            <span>Upload Excel/CSV</span>
          </button>

          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={onOpenCreateEvent}
          >
            <PlusCircle size={16} />
            <span>+ Create Event</span>
          </button>
        </div>
      </div>

      <div className="admin-filter-bar">
        <div className="search-input-wrap">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            className="admin-search-input"
            placeholder="Search events by ID or title..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="admin-table-card">
        <table className="admin-data-table">
          <thead>
            <tr>
              <th>EVENT ID</th>
              <th>EVENT NAME &amp; DESCRIPTION</th>
              <th>QUESTIONS</th>
              <th>TOTAL SOCKETS</th>
              <th>STATUS</th>
              <th className="text-right">ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {filteredEvents.length > 0 ? (
              filteredEvents.map((ev) => {
                const isActive = ev.status === 'ACTIVE';
                const questionCount = ev.questions?.length || 0;
                const totalSockets = (ev.questions || []).reduce(
                  (sum, q) => sum + (q.slots?.length || 0),
                  0
                );

                return (
                  <tr key={ev.id} className={isActive ? 'row-active-highlight' : ''}>
                    <td className="font-mono font-bold text-cyan-400">{ev.id}</td>
                    <td>
                      <div className="challenge-title-meta">
                        <strong className="challenge-table-name">{ev.name}</strong>
                        <span className="challenge-table-desc text-ellipsis" title={ev.description}>
                          {ev.description}
                        </span>
                      </div>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="question-count-link font-mono"
                        onClick={() => onManageQuestions(ev)}
                        title="Manage questions in this event"
                      >
                        {questionCount} Question(s) &rarr;
                      </button>
                    </td>
                    <td>
                      <span className="font-mono text-slate-300">{totalSockets} Sockets</span>
                    </td>
                    <td>
                      {isActive ? (
                        <span className="badge badge-active flex-center-gap">
                          <CheckCircle2 size={12} /> ACTIVE
                        </span>
                      ) : (
                        <span className="badge badge-inactive">INACTIVE</span>
                      )}
                    </td>
                    <td>
                      <div className="table-actions-row">
                        {/* Activate / Deactivate Toggle */}
                        {isActive ? (
                          <button
                            type="button"
                            className="action-btn-pill deactivate-btn"
                            onClick={() => onDeactivateEvent(ev.id)}
                            title="Deactivate event"
                          >
                            <XCircle size={14} />
                            <span>Deactivate</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="action-btn-pill activate-btn"
                            onClick={() => onActivateEvent(ev.id)}
                            title="Activate event for players"
                          >
                            <Zap size={14} />
                            <span>Activate</span>
                          </button>
                        )}

                        {/* Questions Manager */}
                        <button
                          type="button"
                          className="table-icon-btn text-cyan-400"
                          onClick={() => onManageQuestions(ev)}
                          title="Manage Event Questions"
                        >
                          <Layers size={15} />
                        </button>

                        {/* Edit Event Metadata */}
                        <button
                          type="button"
                          className="table-icon-btn"
                          onClick={() => onEditEvent(ev)}
                          title="Edit event details"
                        >
                          <Edit2 size={15} />
                        </button>

                        {/* Duplicate */}
                        <button
                          type="button"
                          className="table-icon-btn"
                          onClick={() => onDuplicateEvent(ev.id)}
                          title="Duplicate event"
                        >
                          <Copy size={15} />
                        </button>

                        {/* Delete */}
                        <button
                          type="button"
                          className="table-icon-btn text-rose-400 hover:text-rose-300"
                          onClick={() => {
                            if (
                              window.confirm(
                                `Are you sure you want to delete event "${ev.name}" (${ev.id})?\n\nThis will permanently delete this Event and all its ${questionCount} Questions and ${totalSockets} Sockets.\n\nOther events will not be affected.`
                              )
                            ) {
                              onDeleteEvent(ev.id);
                            }
                          }}
                          title="Delete event and all its questions"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={6} className="table-empty-row">
                  No events found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
