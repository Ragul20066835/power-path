import React, { useState, useEffect } from 'react';
import { GameStats } from '../components/GameStats';
import { CircuitBoard } from '../components/CircuitBoard';
import { ComponentTray } from '../components/ComponentTray';
import { usePointerDragDrop } from '../hooks/usePointerDragDrop';
import { soundEngine } from '../engine/audioEngine';
import { ArrowRight, CheckCircle2, Trophy, Clock, Zap, ShieldCheck } from 'lucide-react';

/**
 * Game - Active Match Game Screen with Multi-Stage Circuit Telemetry
 */
export function Game({
  gameState,
  event,
  timerData,
  onAttemptPlacement,
  onAdvanceToNextQuestion
}) {
  const [shakingSlotId, setShakingSlotId] = useState(null);
  const [justSnappedSlotId, setJustSnappedSlotId] = useState(null);

  const activeEvent = event || gameState.event;
  const currentQIndex = gameState.currentQuestionIndex || 0;
  const questions = activeEvent?.questions || [];
  const currentQuestion = gameState.currentQuestion || questions[currentQIndex] || null;
  const totalQuestions = questions.length || 1;
  const totalSlots = currentQuestion?.slots?.length || 5;

  // Watch lastAction to trigger UI shake/snap animations
  useEffect(() => {
    if (!gameState.lastAction) return;

    if (gameState.lastAction.type === 'WRONG_PLACEMENT') {
      const slotId = gameState.lastAction.slotId;
      setShakingSlotId(slotId);
      const timer = setTimeout(() => setShakingSlotId(null), 700);
      return () => clearTimeout(timer);
    }

    if (gameState.lastAction.type === 'CORRECT_PLACEMENT') {
      const slotId = gameState.lastAction.slotId;
      setJustSnappedSlotId(slotId);
      const timer = setTimeout(() => setJustSnappedSlotId(null), 800);
      return () => clearTimeout(timer);
    }
  }, [gameState.lastAction]);

  const {
    dragState,
    selectedComponentId,
    handlePointerDown,
    handleComponentClick,
    handleSlotClick
  } = usePointerDragDrop({
    isGameRunning: gameState.status === 'running' && !gameState.isQuestionCompleted,
    placedComponents: gameState.placedComponents,
    onAttemptPlacement: (compId, slotId) => onAttemptPlacement(compId, slotId, currentQuestion),
    onPlayClickSound: () => soundEngine.playClick()
  });

  const placedCount = Object.values(gameState.placedComponents || {}).filter(Boolean).length;
  const isCompleted = gameState.status === 'completed';

  // Last finished question telemetry result
  const lastQResult = gameState.questionResults?.[gameState.questionResults.length - 1] || null;

  return (
    <div className="game-screen-container">
      {/* Top HUD & Stage Progression */}
      <GameStats
        player={gameState.player}
        sessionId={gameState.sessionId}
        timerData={timerData}
        wrongAttempts={gameState.totalWrongAttempts || gameState.wrongAttempts || 0}
        penaltySeconds={gameState.totalPenaltySeconds || gameState.penaltySeconds || 0}
        placedCount={placedCount}
        totalSlots={totalSlots}
        currentQuestionIndex={currentQIndex}
        totalQuestions={totalQuestions}
        currentQuestionName={currentQuestion?.name}
        eventName={activeEvent?.name}
        isCompleted={isCompleted}
      />

      {/* Main Interactive Grid: PCB Circuit Board + Floating Component Tray */}
      <div className="game-board-layout">
        {/* Left/Main Column: PCB Circuit Board */}
        <section className="circuit-board-section">
          <CircuitBoard
            challenge={currentQuestion}
            placedComponents={gameState.placedComponents}
            activeHoveredSlot={dragState?.activeSlotHover}
            selectedComponentId={selectedComponentId}
            shakingSlotId={shakingSlotId}
            justSnappedSlotId={justSnappedSlotId}
            isCircuitComplete={isCompleted || gameState.isQuestionCompleted}
            onSlotClick={handleSlotClick}
          />
        </section>

        {/* Right/Side Column: Component Tray */}
        <section className="component-tray-section">
          <ComponentTray
            placedComponents={gameState.placedComponents}
            selectedComponentId={selectedComponentId}
            dragState={dragState}
            onPointerDown={handlePointerDown}
            onComponentClick={handleComponentClick}
          />
        </section>
      </div>

      {/* Intermediate Stage Complete Modal Dialog */}
      {gameState.isQuestionCompleted && !isCompleted && (
        <div className="modal-backdrop animate-fade-in" role="dialog" aria-modal="true">
          <div className="result-modal-card glass-panel animate-scale-up" style={{ maxWidth: '520px' }}>
            <div className="result-header">
              <div className="trophy-badge stage-success-badge">
                <CheckCircle2 size={36} className="text-emerald-400" />
              </div>
              <span className="stage-complete-tag font-mono">TELEMETRY VERIFIED</span>
              <h3 className="result-title text-2xl font-tech">
                STAGE {currentQIndex + 1} COMPLETE!
              </h3>
              <p className="result-subtitle">
                {currentQuestion?.name} circuit verified without loop errors.
              </p>
            </div>

            {lastQResult && (
              <div className="stage-result-summary-box font-mono">
                <div className="stage-stat-row">
                  <span className="text-slate-400">Stage Raw Time:</span>
                  <strong className="text-white">{lastQResult.rawTimeFormatted}</strong>
                </div>
                <div className="stage-stat-row">
                  <span className="text-slate-400">Stage Wrong Drops:</span>
                  <strong className="text-amber-400">
                    {lastQResult.wrongAttempts} (+{lastQResult.penaltySeconds}s)
                  </strong>
                </div>
                <div className="stage-stat-row stage-total-row">
                  <span className="text-slate-300">Stage Final Time:</span>
                  <strong className="text-emerald-400">{lastQResult.finalTimeFormatted}</strong>
                </div>
              </div>
            )}

            <button
              type="button"
              className="btn btn-primary w-full mt-2"
              onClick={onAdvanceToNextQuestion}
              autoFocus
            >
              <span>PROCEED TO STAGE {currentQIndex + 2} / {totalQuestions}</span>
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default Game;
