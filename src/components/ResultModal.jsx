import React from 'react';
import {
  Trophy,
  Clock,
  AlertTriangle,
  Zap,
  RotateCcw,
  Home,
  Award,
  CheckCircle2,
  Sparkles,
  ShieldCheck
} from 'lucide-react';

/**
 * ResultModal - Premium Championship Event Completion Screen
 */
export function ResultModal({
  result,
  player,
  sessionId,
  onPlayAgain,
  onBackToHome
}) {
  if (!result) return null;

  const breakdowns = result.questionBreakdowns || [];

  return (
    <div className="modal-backdrop animate-fade-in" role="dialog" aria-modal="true" aria-labelledby="result-title">
      <div
        className="result-modal-card glass-panel animate-scale-up"
        style={{ maxWidth: '640px' }}
      >
        {/* Ambient Celebration Halo */}
        <div className="result-ambient-glow" aria-hidden="true"></div>

        {/* Trophy & Header */}
        <div className="result-header">
          <div className="trophy-badge gold-halo">
            <Trophy size={42} className="text-amber-400 animate-bounce" />
          </div>
          <div className="result-badge-pill">
            <Sparkles size={12} className="text-amber-400" />
            <span className="font-mono">CHALLENGE COMPLETE</span>
          </div>
          <h2 id="result-title" className="result-title font-tech">
            CHAMPIONSHIP VERIFIED!
          </h2>
          <p className="result-subtitle">
            {result.eventName || 'POWERPATH Championship'} &bull; All{' '}
            {result.totalQuestions || breakdowns.length || 1} Circuit Stages Verified
          </p>
        </div>

        {/* Participant Identification Pill */}
        <div className="result-player-pill">
          <span className="player-name-tag font-tech">{player?.name || 'Contestant'}</span>
          <span className="player-reg-tag font-mono">{player?.regNo || 'ROLL NO'}</span>
          <span className="session-id-tag font-mono">SESSION: {sessionId}</span>
        </div>

        {/* Highlighted Official Final Event Time */}
        <div className="final-time-banner">
          <span className="final-time-label font-mono">OFFICIAL EVENT TIME</span>
          <div className="final-time-value font-mono">
            {result.finalTimeFormatted}
          </div>
          <span className="final-time-formula font-mono">
            Total Raw Time ({result.rawTimeFormatted}) + Total Penalty ({result.penaltyFormatted})
          </span>
        </div>

        {/* Metrics Grid */}
        <div className="result-metrics-grid">
          <div className="metric-box glass-card">
            <div className="metric-icon-wrap cyan-halo">
              <Clock size={18} className="text-cyan-400" />
            </div>
            <div className="metric-details">
              <span className="metric-label">TOTAL TIME</span>
              <span className="metric-val font-mono">{result.rawTimeFormatted}</span>
            </div>
          </div>

          <div className="metric-box glass-card">
            <div className="metric-icon-wrap rose-halo">
              <AlertTriangle
                size={18}
                className={result.wrongAttempts > 0 ? 'text-rose-400' : 'text-slate-400'}
              />
            </div>
            <div className="metric-details">
              <span className="metric-label">INCORRECT PLACEMENTS</span>
              <span className="metric-val font-mono">{result.wrongAttempts}</span>
            </div>
          </div>

          <div className="metric-box glass-card">
            <div className="metric-icon-wrap amber-halo">
              <Zap size={18} className="text-amber-400" />
            </div>
            <div className="metric-details">
              <span className="metric-label">PENALTY TIME</span>
              <span className="metric-val font-mono">{result.penaltyFormatted}</span>
            </div>
          </div>

          <div className="metric-box glass-card">
            <div className="metric-icon-wrap emerald-halo">
              <Award size={18} className="text-emerald-400" />
            </div>
            <div className="metric-details">
              <span className="metric-label">QUESTIONS COMPLETED</span>
              <span className="metric-val font-mono">
                {result.totalQuestions || breakdowns.length || 1} /{' '}
                {result.totalQuestions || breakdowns.length || 1}
              </span>
            </div>
          </div>
        </div>

        {/* Stage-by-Stage Breakdown Log */}
        {breakdowns.length > 0 && (
          <div className="result-breakdown-section">
            <span className="breakdown-header-title font-tech">
              STAGE TELEMETRY LOG:
            </span>
            <div className="breakdown-list-scroll">
              {breakdowns.map((q) => (
                <div key={q.questionId || q.questionIndex} className="breakdown-row-card">
                  <div className="breakdown-stage-left">
                    <CheckCircle2 size={13} className="text-emerald-400 flex-shrink-0" />
                    <strong className="breakdown-stage-name font-tech">
                      Stage {q.questionIndex}: {q.questionName}
                    </strong>
                  </div>
                  <div className="breakdown-stage-right font-mono">
                    <span className="text-slate-400">Raw: {q.rawTimeFormatted}</span>
                    <span className="text-amber-400">+{q.penaltySeconds}s</span>
                    <span className="text-emerald-400 font-bold">{q.finalTimeFormatted}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="result-actions">
          <button
            type="button"
            className="btn btn-primary play-again-btn"
            onClick={onPlayAgain}
          >
            <RotateCcw size={17} />
            <span>PLAY AGAIN</span>
          </button>

          <button
            type="button"
            className="btn btn-secondary home-btn"
            onClick={onBackToHome}
          >
            <Home size={17} />
            <span>BACK TO HOME</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default ResultModal;
