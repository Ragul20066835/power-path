import React, { useState } from 'react';
import { Settings, Save, AlertTriangle, CheckCircle2, Shield } from 'lucide-react';

/**
 * SettingsPanel - Global Tournament & Event Configuration
 */
export function SettingsPanel({ settings, onSaveSettings }) {
  const [eventStatus, setEventStatus] = useState(settings.eventStatus || 'OPEN');
  const [defaultPenaltySeconds, setDefaultPenaltySeconds] = useState(settings.defaultPenaltySeconds || 5);
  const [allowReplay, setAllowReplay] = useState(settings.allowReplay !== false);
  const [audioEnabled, setAudioEnabled] = useState(settings.audioEnabled !== false);
  const [savedSuccess, setSavedSuccess] = useState(false);

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
    </div>
  );
}
