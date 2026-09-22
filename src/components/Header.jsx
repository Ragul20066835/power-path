import React from 'react';
import { Zap, Volume2, VolumeX, HelpCircle, RotateCcw, Shield, Radio } from 'lucide-react';

/**
 * Header - Premium Navigation & Live Competition Status Bar
 */
export function Header({
  isSoundEnabled,
  onToggleSound,
  onOpenRules,
  onResetGame,
  onOpenAdmin,
  isGameActive,
  activeEvent
}) {
  return (
    <header className="app-header">
      {/* Brand Navigation */}
      <div className="header-brand">
        <div className="brand-logo-glow">
          <Zap size={20} className="text-cyan-400" />
        </div>
        <div className="brand-text">
          <div className="brand-title-row">
            <h1 className="brand-title">POWERPATH</h1>
            <span className="brand-tag">v2.0</span>
          </div>
          <span className="brand-subtitle">Electronics Club Event Challenge</span>
        </div>
      </div>

      {/* Center/Right Status & Action Buttons */}
      <div className="header-center-status">
        <div className="header-live-badge">
          <span className="live-dot-pulse"></span>
          <span className="live-badge-label">ACTIVE EVENT</span>
          <span className="live-badge-event-name text-ellipsis">
            {activeEvent?.name || 'Championship Round'}
          </span>
        </div>
      </div>

      <div className="header-actions">
        {/* Help / Rules Guide */}
        <button
          type="button"
          className="header-btn glass-btn"
          onClick={onOpenRules}
          aria-label="View circuit rules and schematic guide"
          title="Circuit Guide & Rules"
        >
          <HelpCircle size={16} className="text-cyan-400" />
          <span className="btn-label-desktop">Rules</span>
        </button>

        {/* Audio FX Toggle */}
        <button
          type="button"
          className={`header-btn glass-btn ${!isSoundEnabled ? 'muted' : ''}`}
          onClick={onToggleSound}
          aria-label={isSoundEnabled ? 'Mute sound effects' : 'Enable sound effects'}
          title={isSoundEnabled ? 'Sound FX Enabled' : 'Sound FX Muted'}
        >
          {isSoundEnabled ? (
            <Volume2 size={16} className="text-purple-300" />
          ) : (
            <VolumeX size={16} className="text-rose-400" />
          )}
          <span className="btn-label-desktop">{isSoundEnabled ? 'Sound' : 'Muted'}</span>
        </button>

        {/* Reset / Restart Match (only when match is active) */}
        {isGameActive && (
          <button
            type="button"
            className="header-btn glass-btn reset-btn"
            onClick={onResetGame}
            aria-label="Restart current match"
            title="Restart Match"
          >
            <RotateCcw size={15} />
            <span className="btn-label-desktop">Restart</span>
          </button>
        )}

        {/* Admin Switcher */}
        <button
          type="button"
          className="header-btn glass-btn admin-link-btn"
          onClick={onOpenAdmin}
          aria-label="Open Admin Control Panel"
          title="Admin Control Panel"
        >
          <Shield size={15} className="text-cyan-400" />
          <span className="btn-label-desktop">Admin</span>
        </button>
      </div>
    </header>
  );
}

export default Header;
