import React, { useState } from 'react';
import { Settings, Save, AlertTriangle, CheckCircle2, Shield, Trash2, Database } from 'lucide-react';
import apiService from '../../services/apiService.js';

/**
 * SettingsPanel - Global Tournament & Event Configuration
 */
export function SettingsPanel({ settings, onSaveSettings, onRefresh }) {
  const [eventStatus, setEventStatus] = useState(settings.eventStatus || 'OPEN');
  const [defaultPenaltySeconds, setDefaultPenaltySeconds] = useState(settings.defaultPenaltySeconds || 5);
  const [allowReplay, setAllowReplay] = useState(settings.allowReplay !== false);
  const [audioEnabled, setAudioEnabled] = useState(settings.audioEnabled !== false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [cleanupStatus, setCleanupStatus] = useState(null);
  const [isCleaning, setIsCleaning] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSaveSettings({
      eventStatus,
      defaultPenaltySeconds: Number(defaultPenaltySeconds) || 5,
      allowReplay,
      audioEnabled
    });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const handleClearTestData = async () => {
    setIsCleaning(true);
    setCleanupStatus(null);

    try {
      // 1. Fetch matching test records count before delete
      const preview = await apiService.getTestDataPreview();
      const sessions = preview?.test_sessions ?? 0;
      const results = preview?.test_results ?? 0;
      const attempts = preview?.test_attempts ?? 0;
      const events = preview?.load_test_events ?? 0;

      const totalMatches = sessions + results + attempts + events;
      if (totalMatches === 0) {
        alert('No test or load-test records found in the database.');
        setIsCleaning(false);
        return;
      }

      // 2. Explicit confirmation dialog showing exact numbers
      const confirmed = window.confirm(
        `Found ${sessions} test session(s), ${results} result(s), and their related attempts.\nAre you sure you want to permanently delete them?`
      );
      if (!confirmed) {
        setIsCleaning(false);
        return;
      }

      // 3. Execute permanent deletion
      const res = await apiService.clearTestData();
      const delSessions = res?.deleted_sessions ?? 0;
      const delResults = res?.deleted_results ?? 0;
      const delAttempts = res?.deleted_attempts ?? 0;

      setCleanupStatus({
        type: 'success',
        text: `Successfully cleared ${delSessions} test session(s), ${delResults} result(s), and ${delAttempts} attempt(s).`
      });

      // 4. Refresh Participants and Results tables
      if (typeof onRefresh === 'function') {
        onRefresh();
      }
    } catch (err) {
      setCleanupStatus({
        type: 'error',
        text: err?.message || 'Failed to clear test data.'
      });
    } finally {
      setIsCleaning(false);
    }
  };

  return (
    <div className="admin-page-view animate-fade-in">
      <div className="admin-view-header">
        <div>
          <h2 className="view-title">EVENT &amp; GAME ENGINE SETTINGS</h2>
          <p className="view-subtitle">
            Configure tournament operational status, default penalties, and session policies.
          </p>
        </div>
      </div>

      {savedSuccess && (
        <div className="form-success-alert animate-fade-in mb-4">
          <CheckCircle2 size={18} />
          <span>Global event settings updated successfully!</span>
        </div>
      )}

      {cleanupStatus && (
        <div
          className={`animate-fade-in mb-4 p-3 rounded text-sm flex items-center gap-2 ${
            cleanupStatus.type === 'success'
              ? 'bg-emerald-950/80 border border-emerald-500/50 text-emerald-300'
              : 'bg-rose-950/80 border border-rose-500/50 text-rose-300'
          }`}
        >
          {cleanupStatus.type === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          <span>{cleanupStatus.text}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="admin-form-container">
        <div className="admin-form-section">
          <h3 className="section-title">
            <Shield size={16} className="text-cyan-400" />
            <span>1. TOURNAMENT STATUS</span>
          </h3>

          <div className="form-group">
            <label className="form-label" htmlFor="event-status">
              CURRENT EVENT STATUS
            </label>
            <select
              id="event-status"
              className="form-select"
              value={eventStatus}
              onChange={(e) => setEventStatus(e.target.value)}
            >
              <option value="OPEN">OPEN (Participants can register &amp; play)</option>
              <option value="PAUSED">PAUSED (Registration paused with holding screen)</option>
              <option value="CLOSED">CLOSED (Event concluded &bull; Leaderboard frozen)</option>
            </select>
          </div>
        </div>

        <div className="admin-form-section mt-4">
          <h3 className="section-title">
            <Settings size={16} className="text-amber-400" />
            <span>2. GAME ENGINE DEFAULTS</span>
          </h3>

          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label" htmlFor="default-penalty">
                DEFAULT PENALTY PER WRONG DROP (SECONDS)
              </label>
              <input
                id="default-penalty"
                type="number"
                min={1}
                max={60}
                className="form-input font-mono"
                value={defaultPenaltySeconds}
                onChange={(e) => setDefaultPenaltySeconds(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">ALLOW PLAY AGAIN / MULTIPLE ATTEMPTS</label>
              <div className="toggle-row mt-2">
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={allowReplay}
                    onChange={(e) => setAllowReplay(e.target.checked)}
                  />
                  <span className="toggle-slider"></span>
                </label>
                <span className="toggle-label">
                  {allowReplay ? 'Enabled (Contestants can retry)' : 'Disabled (Single attempt only)'}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="editor-footer-bar mt-6">
          <button type="submit" className="btn btn-primary">
            <Save size={18} />
            <span>Save Settings</span>
          </button>
        </div>
      </form>

      {/* 3. DATA MANAGEMENT & TEST DATA */}
      <div className="admin-form-container mt-6">
        <div className="admin-form-section">
          <h3 className="section-title">
            <Database size={16} className="text-rose-400" />
            <span>3. DATA MANAGEMENT &amp; TEST DATA</span>
          </h3>
          <p className="text-xs text-slate-400 mb-4">
            Permanently clear synthetic test and load-test participant records (participants named{' '}
            <code className="text-amber-300 font-mono">RaceTester</code>, registration numbers prefixed with{' '}
            <code className="text-amber-300 font-mono">RACE-</code>, or events prefixed with{' '}
            <code className="text-amber-300 font-mono">LOAD_TEST_EVT_</code>). Real contestants and tournament
            championship rounds are strictly protected.
          </p>
          <div>
            <button
              type="button"
              className="btn btn-secondary border-rose-500/50 text-rose-300 hover:bg-rose-950/40"
              onClick={handleClearTestData}
              disabled={isCleaning}
            >
              <Trash2 size={16} />
              <span>{isCleaning ? 'Checking & Clearing...' : 'CLEAR TEST DATA'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
