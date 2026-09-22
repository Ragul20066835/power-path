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
  AlertTriangle
} from 'lucide-react';

/**
 * ChallengeList - Challenge Management Table & Activation Controller
 */
export function ChallengeList({
  challenges,
  onActivateChallenge,
  onDeactivateChallenge,
  onEditChallenge,
  onDuplicateChallenge,
  onDeleteChallenge,
  onOpenCreateModal,
  onOpenUploadTab
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDifficulty, setFilterDifficulty] = useState('ALL');

  const filteredChallenges = challenges.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.description || '').toLowerCase().includes(searchQuery.toLowerCase());

    const matchesDifficulty =
      filterDifficulty === 'ALL' || c.difficulty.toUpperCase() === filterDifficulty;

    return matchesSearch && matchesDifficulty;
  });

  return (
    <div className="admin-page-view animate-fade-in">
      {/* Top Header & Actions Bar */}
      <div className="admin-view-header">
        <div>
          <h2 className="view-title">CHALLENGE MANAGEMENT</h2>
          <p className="view-subtitle">Author, activate, configure, or bulk-import circuit challenges.</p>
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
            onClick={onOpenCreateModal}
          >
            <PlusCircle size={16} />
            <span>+ Create Challenge</span>
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="admin-filter-bar">
        <div className="search-input-wrap">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            className="admin-search-input"
            placeholder="Search challenges by ID or title..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="filter-pill-group">
          {['ALL', 'EASY', 'MEDIUM', 'HARD'].map((diff) => (
            <button
              key={diff}
              type="button"
              className={`filter-pill-sm ${filterDifficulty === diff ? 'active' : ''}`}
              onClick={() => setFilterDifficulty(diff)}
            >
              {diff}
            </button>
          ))}
        </div>
      </div>

      {/* Challenges Data Table */}
      <div className="admin-table-card">
        <table className="admin-data-table">
          <thead>
            <tr>
              <th>CHALLENGE ID</th>
              <th>NAME &amp; TOPOLOGY</th>
              <th>DIFFICULTY</th>
              <th>SOCKETS</th>
              <th>PENALTY</th>
              <th>STATUS</th>
              <th className="text-right">ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {filteredChallenges.length > 0 ? (
              filteredChallenges.map((challenge) => {
                const isActive = challenge.status === 'ACTIVE';
                const slotCount = challenge.slots?.length || 0;

                return (
                  <tr key={challenge.id} className={isActive ? 'row-active-highlight' : ''}>
                    <td className="font-mono font-bold text-cyan-400">{challenge.id}</td>
                    <td>
                      <div className="challenge-title-meta">
                        <strong className="challenge-table-name">{challenge.name}</strong>
                        <span className="challenge-table-desc text-ellipsis" title={challenge.description}>
                          {challenge.description}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className={`badge badge-diff-${(challenge.difficulty || 'Easy').toLowerCase()}`}>
                        {challenge.difficulty || 'Easy'}
                      </span>
                    </td>
                    <td>
                      <span className="font-mono font-semibold">{slotCount} Slots</span>
                    </td>
                    <td>
                      <span className="font-mono text-amber-400">+{challenge.penaltySeconds || 5}s</span>
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
                            onClick={() => onDeactivateChallenge(challenge.id)}
                            title="Deactivate challenge"
                          >
                            <XCircle size={14} />
                            <span>Deactivate</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="action-btn-pill activate-btn"
                            onClick={() => onActivateChallenge(challenge.id)}
                            title="Activate this challenge for players"
                          >
                            <Zap size={14} />
                            <span>Activate</span>
                          </button>
                        )}

                        {/* Edit Button */}
                        <button
                          type="button"
                          className="table-icon-btn"
                          onClick={() => onEditChallenge(challenge)}
                          title="Edit challenge sockets and configuration"
                        >
                          <Edit2 size={15} />
                        </button>

                        {/* Duplicate Button */}
                        <button
                          type="button"
                          className="table-icon-btn"
                          onClick={() => onDuplicateChallenge(challenge.id)}
                          title="Duplicate challenge"
                        >
                          <Copy size={15} />
                        </button>

                        {/* Delete Button */}
                        <button
                          type="button"
                          className="table-icon-btn text-rose-400 hover:text-rose-300"
                          onClick={() => {
                            if (window.confirm(`Delete challenge "${challenge.name}" (${challenge.id})?`)) {
                              onDeleteChallenge(challenge.id);
                            }
                          }}
                          title="Delete challenge"
                          disabled={challenges.length <= 1}
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
                <td colSpan={7} className="table-empty-row">
                  No challenges found matching the search criteria.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
