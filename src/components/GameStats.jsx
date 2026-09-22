import React from 'react';
import { Timer } from './Timer';
import { User, ShieldAlert, Cpu, CheckCircle2, Layers, Radio, Sparkles } from 'lucide-react';

/**
 * GameStats - High-Tech Tournament Mission Control HUD & Stage Progress
 */
export function GameStats({
  player,
  sessionId,
  timerData,
  wrongAttempts = 0,
  penaltySeconds = 0,
  placedCount = 0,
  totalSlots = 5,
  currentQuestionIndex = 0,
  totalQuestions = 1,
  currentQuestionName = 'Circuit Challenge',
  eventName = 'Championship Round',
  isCompleted = false
}) {
  const progressPercent = Math.min(100, Math.round((placedCount / (totalSlots || 1)) * 100));
  const currentStageNumber = String(currentQuestionIndex + 1).padStart(2, '0');
  const totalStagesNumber = String(totalQuestions).padStart(2, '0');

  return (
    <div className="game-hud-wrapper">
      {/* Top Stage & Question Banner with Progress */}
      <div className="stage-banner-card glass-panel">
        <div className="stage-banner-left">
          <div className="stage-badge-pill">
            <span className="live-dot-pulse"></span>
            <span className="stage-badge-label font-mono">
              QUESTION {currentStageNumber} / {totalStagesNumber}
            </span>
          </div>
          <div className="stage-title-wrap">
            <h2 className="current-question-title text-ellipsis" title={currentQuestionName}>
              {currentQuestionName}
            </h2>
            <div className="stage-meta-tags">
              <span className="stage-event-tag font-mono">{eventName}</span>
              <span className="stage-status-tag">
                {isCompleted ? (
                  <span className="text-emerald-400 flex-center-gap">
                    <CheckCircle2 size={12} /> ALL COMPLETED
                  </span>
                ) : (
                  <span className="text-cyan-400 flex-center-gap">
                    <Radio size={11} className="animate-pulse" /> LIVE TELEMETRY
                  </span>
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Question Progress Track (01 ━ 02 ━ 03 ━ ... ━ 20) */}
        <div className="stage-progression-bar">
          <div className="progress-header-row">
            <span className="progress-header-label">STAGE PROGRESSION</span>
            <span className="progress-header-value font-mono">
              {currentStageNumber} of {totalStagesNumber} Completed
            </span>
          </div>

          <div className="stages-segmented-track" role="tablist">
            {Array.from({ length: Math.min(totalQuestions, 20) }).map((_, idx) => {
              const isPast = idx < currentQuestionIndex;
              const isCurrent = idx === currentQuestionIndex;
              return (
                <div
                  key={idx}
                  className={`stage-step-node ${isPast ? 'past' : ''} ${isCurrent ? 'current' : ''}`}
                  title={`Stage ${idx + 1}`}
                >
                  <span className="step-num font-mono">
                    {String(idx + 1).padStart(2, '0')}
                  </span>
                  <div className="step-bar"></div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 4-Column HUD Card Grid */}
      <div className="game-stats-hud">
        {/* Card 1: Participant Identity */}
        <div className="hud-card glass-panel player-hud-card">
          <div className="hud-card-icon-wrap cyan-halo">
            <User size={18} className="text-cyan-400" />
          </div>
          <div className="hud-card-body">
            <span className="hud-card-label">PARTICIPANT</span>
            <span className="hud-card-value text-ellipsis" title={player?.name}>
              {player?.name || 'Contestant'}
            </span>
            <span className="hud-card-sub font-mono text-ellipsis">
              {player?.regNo || 'ROLL NO'} &bull; {sessionId}
            </span>
          </div>
        </div>

        {/* Card 2: High-Precision Stopwatch Timer */}
        <Timer
          rawTimeFormatted={timerData.rawTimeFormatted}
          penaltySeconds={timerData.penaltySeconds}
          finalTimeFormatted={timerData.finalTimeFormatted}
          penaltyFlash={timerData.penaltyFlash}
          isCompleted={isCompleted}
        />

        {/* Card 3: Wrong Drops & Active Penalties */}
        <div
          className={`hud-card glass-panel attempts-hud-card ${
            wrongAttempts > 0 ? 'has-penalties' : ''
          }`}
        >
          <div
            className={`hud-card-icon-wrap ${
              wrongAttempts > 0 ? 'rose-halo' : 'purple-halo'
            }`}
          >
            <ShieldAlert
              size={18}
              className={wrongAttempts > 0 ? 'text-rose-400' : 'text-purple-300'}
            />
          </div>
          <div className="hud-card-body">
            <span className="hud-card-label">MISPLACEMENTS</span>
            <div className="attempts-row">
              <span className="hud-card-value font-mono">{wrongAttempts}</span>
              <span className="penalty-tag font-mono">
                +{penaltySeconds}s Penalty
              </span>
            </div>
            <span className="hud-card-sub font-mono">
              {wrongAttempts === 0 ? 'Flawless Placement' : `${wrongAttempts} error(s) logged`}
            </span>
          </div>
        </div>

        {/* Card 4: Sockets in Current Stage */}
        <div className="hud-card glass-panel progress-hud-card">
          <div className="hud-card-icon-wrap emerald-halo">
            <Cpu size={18} className="text-emerald-400" />
          </div>
          <div className="hud-card-body">
            <div className="progress-label-row">
              <span className="hud-card-label">SOCKETS POPULATED</span>
              <span className="progress-count-text font-mono">
                {placedCount}/{totalSlots}
              </span>
            </div>
            <div
              className="progress-track"
              role="progressbar"
              aria-valuenow={progressPercent}
              aria-valuemin="0"
              aria-valuemax="100"
            >
              <div
                className="progress-fill"
                style={{ width: `${progressPercent}%` }}
              ></div>
            </div>
            <span className="hud-card-sub font-mono">
              {isCompleted || placedCount === totalSlots ? (
                <span className="text-emerald-400 font-semibold flex-center-gap">
                  <CheckCircle2 size={12} /> Stage Complete
                </span>
              ) : (
                `${totalSlots - placedCount} socket(s) remaining`
              )}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default GameStats;
