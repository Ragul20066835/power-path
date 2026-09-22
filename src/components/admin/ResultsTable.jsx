import React, { useState } from 'react';
import { Trophy, Download, Search, Award, Clock, Zap, ChevronDown, ChevronRight, Layers } from 'lucide-react';

/**
 * ResultsTable - Ranked Tournament Standings with Question Breakdowns and CSV Exporter
 */
export function ResultsTable({ results, events }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [eventFilter, setEventFilter] = useState('ALL');
  const [expandedRows, setExpandedRows] = useState(new Set());

  const toggleExpand = (sessionId) => {
    const next = new Set(expandedRows);
    if (next.has(sessionId)) {
      next.delete(sessionId);
    } else {
      next.add(sessionId);
    }
    setExpandedRows(next);
  };

  const filteredResults = results.filter((r) => {
    const matchesSearch =
      (r.playerName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.registerNumber || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.sessionId || '').toLowerCase().includes(searchQuery.toLowerCase());

    const matchesEvent = eventFilter === 'ALL' || r.eventId === eventFilter;
    return matchesSearch && matchesEvent;
  });

  const handleExportCsv = () => {
    if (filteredResults.length === 0) {
      alert('No results available to export.');
      return;
    }

    const headers = [
      'rank',
      'player_name',
      'register_number',
      'event_id',
      'event_name',
      'total_questions',
      'event_raw_time_formatted',
      'event_raw_time_ms',
      'total_wrong_attempts',
      'total_penalty_seconds',
      'event_final_time_formatted',
      'event_final_time_ms',
      'question_breakdowns_summary',
      'session_id',
      'completed_at'
    ];

    const rows = filteredResults.map((r) => {
      const qSummary = (r.questionBreakdowns || [])
        .map((q) => `Q${q.questionIndex}: ${q.rawTimeFormatted} (+${q.penaltySeconds}s)`)
        .join(' | ');

      return [
        r.rank,
        `"${r.playerName.replace(/"/g, '""')}"`,
        `"${r.registerNumber}"`,
        `"${r.eventId}"`,
        `"${(r.eventName || '').replace(/"/g, '""')}"`,
        r.totalQuestions || (r.questionBreakdowns?.length || 1),
        `"${r.rawTimeFormatted}"`,
        r.rawTimeMs,
        r.wrongAttempts,
        r.penaltySeconds,
        `"${r.finalTimeFormatted}"`,
        r.finalTimeMs,
        `"${qSummary.replace(/"/g, '""')}"`,
        `"${r.sessionId}"`,
        `"${r.completedAt}"`
      ];
    });

    const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `powerpath_official_results_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="admin-page-view animate-fade-in">
      <div className="admin-view-header">
        <div>
          <h2 className="view-title">OFFICIAL TOURNAMENT RESULTS &amp; LEADERBOARD</h2>
          <p className="view-subtitle">
            Ranked tournament standings sorted by aggregated Event Final Effective Time.
          </p>
        </div>

        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={handleExportCsv}
          disabled={filteredResults.length === 0}
        >
          <Download size={16} />
          <span>EXPORT CSV</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="admin-filter-bar">
        <div className="search-input-wrap">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            className="admin-search-input"
            placeholder="Search contestant by name or roll number..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="select-filter-wrap">
          <select
            className="admin-filter-select"
            value={eventFilter}
            onChange={(e) => setEventFilter(e.target.value)}
          >
            <option value="ALL">ALL TOURNAMENT EVENTS</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.id}: {ev.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Results Table */}
      <div className="admin-table-card">
        <table className="admin-data-table">
          <thead>
            <tr>
              <th className="w-12"></th>
              <th className="w-16">RANK</th>
              <th>PARTICIPANT</th>
              <th>REGISTER NO</th>
              <th>EVENT NAME</th>
              <th>STAGES</th>
              <th>TOTAL RAW TIME</th>
              <th>TOTAL WRONG</th>
              <th>PENALTY</th>
              <th>FINAL EVENT TIME</th>
            </tr>
          </thead>
          <tbody>
            {filteredResults.length > 0 ? (
              filteredResults.map((result) => {
                const isTop3 = result.rank <= 3;
                const isExpanded = expandedRows.has(result.sessionId);
                const breakdowns = result.questionBreakdowns || [];

                return (
                  <React.Fragment key={result.sessionId}>
                    <tr className={isTop3 ? 'top-rank-row' : ''}>
                      <td>
                        {breakdowns.length > 0 && (
                          <button
                            type="button"
                            className="table-icon-btn text-cyan-400"
                            onClick={() => toggleExpand(result.sessionId)}
                            title="View stage breakdowns"
                          >
                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </button>
                        )}
                      </td>
                      <td>
                        <div className="rank-badge-wrap">
                          {result.rank === 1 && <Trophy size={16} className="text-amber-400" />}
                          {result.rank === 2 && <Award size={16} className="text-slate-300" />}
                          {result.rank === 3 && <Award size={16} className="text-amber-600" />}
                          <span className="font-mono font-black">{result.rank}</span>
                        </div>
                      </td>
                      <td>
                        <strong>{result.playerName}</strong>
                      </td>
                      <td className="font-mono text-cyan-400">{result.registerNumber}</td>
                      <td>
                        <span className="font-mono text-xs">{result.eventName || result.eventId}</span>
                      </td>
                      <td>
                        <span className="font-mono font-bold text-xs">{breakdowns.length || result.totalQuestions || 1} Stages</span>
                      </td>
                      <td className="font-mono">{result.rawTimeFormatted}</td>
                      <td className="font-mono">{result.wrongAttempts}</td>
                      <td className="font-mono text-amber-400">{result.penaltyFormatted}</td>
                      <td>
                        <span className="font-mono font-black text-emerald-400 text-base">
                          {result.finalTimeFormatted}
                        </span>
                      </td>
                    </tr>

                    {/* Expandable Per-Question Breakdown Row */}
                    {isExpanded && breakdowns.length > 0 && (
                      <tr className="bg-slate-900/90">
                        <td colSpan={10} className="p-3">
                          <div className="pl-6 border-l-2 border-cyan-400">
                            <span className="text-xs font-bold text-cyan-400 font-tech uppercase block mb-2">
                              Stage-by-Stage Telemetry Breakdown for {result.playerName}:
                            </span>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                              {breakdowns.map((q) => (
                                <div key={q.questionId} className="bg-slate-950 p-2.5 rounded border border-slate-800 text-xs font-mono">
                                  <div className="flex justify-between items-center mb-1">
                                    <strong className="text-white">Stage {q.questionIndex}: {q.questionName}</strong>
                                    <span className="badge badge-diff-easy text-xxs">{q.difficulty}</span>
                                  </div>
                                  <div className="flex justify-between text-slate-400 text-xxs">
                                    <span>Raw: {q.rawTimeFormatted}</span>
                                    <span className="text-amber-400">Wrong: {q.wrongAttempts} (+{q.penaltySeconds}s)</span>
                                    <span className="text-emerald-400 font-bold">Time: {q.finalTimeFormatted}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            ) : (
              <tr>
                <td colSpan={10} className="table-empty-row">
                  No completed tournament results recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
