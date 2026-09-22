import React from 'react';
import { Clock, AlertTriangle, CheckCircle2 } from 'lucide-react';

/**
 * Timer - Futuristic High-Precision Mission Stopwatch
 * Tracks elapsed time, centisecond resolution, dynamic penalty flashes, and final time.
 */
export function Timer({
  rawTimeFormatted,
  penaltySeconds = 0,
  finalTimeFormatted,
  penaltyFlash,
  isCompleted
}) {
  return (
    <div
      className={`timer-card glass-panel ${penaltyFlash ? 'flash-penalty' : ''} ${
        isCompleted ? 'timer-completed' : ''
      }`}
    >
      <div className="timer-header">
        <div className="timer-label-group">
          <Clock size={15} className={isCompleted ? 'text-emerald-400' : 'text-cyan-400'} />
          <span className="timer-status-text">
            {isCompleted ? 'FINAL EVENT TIME' : 'MATCH TIME'}
          </span>
        </div>

        {penaltySeconds > 0 && (
          <div className="timer-penalty-badge animate-pulse">
            <AlertTriangle size={11} className="text-amber-400" />
            <span>+{penaltySeconds}s PENALTY</span>
          </div>
        )}
      </div>

      <div className="timer-digits-wrapper">
        <span className="timer-digits font-mono">
          {isCompleted ? finalTimeFormatted : rawTimeFormatted}
        </span>
      </div>

      <div className="timer-sub-breakdown">
        <span className="timer-stat-pill font-mono">
          Raw: <strong>{rawTimeFormatted}</strong>
        </span>
        <span className="timer-stat-divider">&bull;</span>
        <span
          className={`timer-stat-pill font-mono ${
            penaltySeconds > 0 ? 'text-amber-400 font-semibold' : ''
          }`}
        >
          Pen: <strong>+{penaltySeconds}s</strong>
        </span>
        {!isCompleted && (
          <>
            <span className="timer-stat-divider">&bull;</span>
            <span className="timer-stat-pill font-mono text-cyan-300">
              Est: <strong>{finalTimeFormatted}</strong>
            </span>
          </>
        )}
      </div>
    </div>
  );
}

export default Timer;
