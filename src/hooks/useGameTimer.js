import { useState, useEffect, useRef } from 'react';
import { formatTime, calculateResult } from '../engine/gameEngine.js';

/**
 * High-precision Game Timer Hook
 * Uses requestAnimationFrame with performance.now() to prevent browser throttling drift.
 */
export function useGameTimer({
  status,
  startTime,
  wrongAttempts,
  completedResult
}) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const [penaltyFlash, setPenaltyFlash] = useState(false);
  const prevWrongAttemptsRef = useRef(wrongAttempts);
  const rafIdRef = useRef(null);

  // Trigger brief visual flash when penalty is added
  useEffect(() => {
    if (wrongAttempts > prevWrongAttemptsRef.current) {
      setPenaltyFlash(true);
      const timer = setTimeout(() => setPenaltyFlash(false), 800);
      prevWrongAttemptsRef.current = wrongAttempts;
      return () => clearTimeout(timer);
    }
    prevWrongAttemptsRef.current = wrongAttempts;
  }, [wrongAttempts]);

  // Main animation frame timer loop
  useEffect(() => {
    if (status !== 'running' || !startTime) {
      if (status === 'completed' && completedResult) {
        setElapsedMs(completedResult.rawTimeMs);
      }
      return;
    }

    const updateTimer = () => {
      let currentElapsed = 0;
      if (typeof startTime === 'number') {
        if (startTime > 1000000000000) {
          // Epoch timestamp from server (e.g. Date.now() or started_at)
          currentElapsed = Math.max(0, Date.now() - startTime);
        } else {
          currentElapsed = Math.max(0, performance.now() - startTime);
        }
      }
      setElapsedMs(currentElapsed);
      rafIdRef.current = requestAnimationFrame(updateTimer);
    };

    rafIdRef.current = requestAnimationFrame(updateTimer);

    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, [status, startTime, completedResult]);

  // If completed, use authoritative completedResult
  if (status === 'completed' && completedResult) {
    return {
      rawElapsedMs: completedResult.rawTimeMs,
      rawTimeFormatted: completedResult.rawTimeFormatted,
      penaltySeconds: completedResult.penaltySeconds,
      penaltyFormatted: completedResult.penaltyFormatted,
      finalTimeMs: completedResult.finalTimeMs,
      finalTimeFormatted: completedResult.finalTimeFormatted,
      penaltyFlash
    };
  }

  const liveResult = calculateResult(elapsedMs, wrongAttempts);

  return {
    rawElapsedMs: elapsedMs,
    rawTimeFormatted: liveResult.rawTimeFormatted,
    penaltySeconds: liveResult.penaltySeconds,
    penaltyFormatted: liveResult.penaltyFormatted,
    finalTimeMs: liveResult.finalTimeMs,
    finalTimeFormatted: liveResult.finalTimeFormatted,
    penaltyFlash
  };
}
