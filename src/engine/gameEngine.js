/**
 * DROP & CONNECT - Deterministic Dynamic Game Engine
 * Hierarchy: EVENT -> QUESTIONS -> SLOTS
 * Manages multi-question tournament loops, per-question timing, and aggregated event scoring.
 */

import { STORAGE_KEYS, COMPONENTS_MAP, DEFAULT_PENALTY_SECONDS } from '../data/gameData.js';

export function generateSessionId() {
  const prefix = 'DC';
  const timestamp = Date.now().toString(36).toUpperCase().slice(-4);
  const randomSalt = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${timestamp}-${randomSalt}`;
}

export function formatTime(timeMs) {
  if (typeof timeMs !== 'number' || isNaN(timeMs) || timeMs < 0) {
    return '00:00.00';
  }

  const totalCentiseconds = Math.floor(timeMs / 10);
  const centiseconds = totalCentiseconds % 100;
  const totalSeconds = Math.floor(totalCentiseconds / 100);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60);

  const pad = (num, digits = 2) => String(num).padStart(digits, '0');

  return `${pad(minutes)}:${pad(seconds)}.${pad(centiseconds)}`;
}

export function calculateResult(rawElapsedMs, wrongAttempts, penaltyPerMistake = DEFAULT_PENALTY_SECONDS) {
  const penaltySeconds = wrongAttempts * penaltyPerMistake;
  const penaltyMs = penaltySeconds * 1000;
  const finalTimeMs = Math.max(0, rawElapsedMs + penaltyMs);

  return {
    rawTimeMs: rawElapsedMs,
    rawTimeFormatted: formatTime(rawElapsedMs),
    wrongAttempts,
    penaltySeconds,
    penaltyFormatted: `+${penaltySeconds}s`,
    finalTimeMs,
    finalTimeFormatted: formatTime(finalTimeMs)
  };
}

export function calculateQuestionResult(rawElapsedMs, wrongAttempts, penaltyPerMistake = DEFAULT_PENALTY_SECONDS) {
  return calculateResult(rawElapsedMs, wrongAttempts, penaltyPerMistake);
}

export function calculateAggregateResult(questionResults, eventMeta = {}, playerInfo = {}, sessionId = '') {
  const totalRawMs = (questionResults || []).reduce((sum, r) => sum + (r.rawTimeMs || 0), 0);
  const totalWrong = (questionResults || []).reduce((sum, r) => sum + (r.wrongAttempts || 0), 0);
  const totalPenalty = (questionResults || []).reduce((sum, r) => sum + (r.penaltySeconds || 0), 0);
  const totalFinalMs = totalRawMs + totalPenalty * 1000;

  return {
    eventId: eventMeta.id || 'E001',
    eventName: eventMeta.name || 'Tournament Event',
    player: playerInfo,
    sessionId,
    totalQuestions: questionResults?.length || 0,
    rawTimeMs: totalRawMs,
    rawTimeFormatted: formatTime(totalRawMs),
    wrongAttempts: totalWrong,
    penaltySeconds: totalPenalty,
    penaltyFormatted: `+${totalPenalty}s`,
    finalTimeMs: totalFinalMs,
    finalTimeFormatted: formatTime(totalFinalMs),
    questionBreakdowns: questionResults || []
  };
}

/**
 * Creates initial state for an entire Event consisting of multiple Questions
 */
export function createInitialGameState(event, playerInfo = { name: '', regNo: '' }) {
  const sessionId = generateSessionId();
  const questions = (event && event.questions) ? event.questions : [];
  const currentQuestion = questions[0] || null;

  const initialPlaced = {};
  if (currentQuestion && currentQuestion.slots) {
    currentQuestion.slots.forEach((s) => {
      initialPlaced[s.id] = null;
    });
  }

  return {
    sessionId,
    event: event ? {
      id: event.id,
      name: event.name,
      description: event.description,
      questions: event.questions
    } : null,
    player: {
      name: (playerInfo.name || '').trim(),
      regNo: (playerInfo.regNo || '').trim().toUpperCase()
    },
    status: 'idle', // 'idle' | 'running' | 'completed'
    currentQuestionIndex: 0,
    currentQuestion,
    currentQuestionStartTime: null,
    currentQuestionWrongAttempts: 0,
    placedComponents: initialPlaced,
    questionResults: [], // Completed question metrics
    wrongAttempts: 0,
    penaltySeconds: 0,
    totalWrongAttempts: 0,
    totalPenaltySeconds: 0,
    totalRawElapsedMs: 0,
    startTime: null,
    startEpoch: null,
    elapsedTimeMs: 0,
    isQuestionCompleted: false, // True when waiting to click "Next Question"
    lastAction: null,
    completedAt: null,
    result: null
  };
}

/**
 * Starts a tournament session for the active Event
 */
export function startNewGame(event, playerInfo, currentPerfNow = performance.now()) {
  const base = createInitialGameState(event, playerInfo);
  return {
    ...base,
    status: 'running',
    startTime: currentPerfNow,
    startEpoch: Date.now(),
    currentQuestionStartTime: currentPerfNow,
    currentQuestionIndex: 0,
    currentQuestion: event?.questions?.[0] || null,
    isQuestionCompleted: false
  };
}

/**
 * Dynamic Placement Transition Function for the Current Question
 */
export function attemptPlacement(state, currentQuestion, componentId, slotId, currentPerfNow = performance.now()) {
  if (state.status !== 'running') {
    return {
      state,
      action: 'ignored',
      reason: state.status === 'completed' ? 'GAME_ALREADY_COMPLETED' : 'GAME_NOT_RUNNING'
    };
  }

  if (state.isQuestionCompleted) {
    return {
      state,
      action: 'ignored',
      reason: 'QUESTION_ALREADY_COMPLETED_PROCEED_NEXT'
    };
  }

  if (!currentQuestion || !currentQuestion.slots) {
    return { state, action: 'ignored', reason: 'NO_ACTIVE_QUESTION' };
  }

  const slot = currentQuestion.slots.find((s) => s.id === slotId);
  const component = COMPONENTS_MAP[componentId];

  if (!slot) return { state, action: 'ignored', reason: 'INVALID_SLOT' };
  if (!component) return { state, action: 'ignored', reason: 'INVALID_COMPONENT' };

  if (state.placedComponents[slotId] !== null) {
    return { state, action: 'ignored', reason: 'SLOT_ALREADY_OCCUPIED', slotId };
  }

  const isComponentAlreadyUsed = Object.values(state.placedComponents).includes(componentId);
  if (isComponentAlreadyUsed) {
    return { state, action: 'ignored', reason: 'COMPONENT_ALREADY_USED', componentId };
  }

  const isCorrect = slot.acceptedComponentId === componentId;
  const penaltyPerMistake = currentQuestion.penaltySeconds || DEFAULT_PENALTY_SECONDS;

  if (isCorrect) {
    const nextPlaced = {
      ...state.placedComponents,
      [slotId]: componentId
    };

    const placedCount = Object.values(nextPlaced).filter(Boolean).length;
    const totalRequired = currentQuestion.slots.length;
    const isQDone = placedCount === totalRequired;

    if (isQDone) {
      // Current Question Finished!
      const qElapsed = Math.max(0, currentPerfNow - (state.currentQuestionStartTime || currentPerfNow));
      const qWrong = state.currentQuestionWrongAttempts || 0;
      const qPenalty = qWrong * penaltyPerMistake;
      const qFinal = qElapsed + qPenalty * 1000;

      const qResult = {
        questionIndex: state.currentQuestionIndex + 1,
        questionId: currentQuestion.id,
        questionName: currentQuestion.name,
        difficulty: currentQuestion.difficulty || 'Easy',
        rawTimeMs: qElapsed,
        rawTimeFormatted: formatTime(qElapsed),
        wrongAttempts: qWrong,
        penaltySeconds: qPenalty,
        penaltyFormatted: `+${qPenalty}s`,
        finalTimeMs: qFinal,
        finalTimeFormatted: formatTime(qFinal)
      };

      const nextQuestionResults = [...state.questionResults, qResult];
      const totalQuestions = state.event?.questions?.length || 1;
      const isEventFinished = state.currentQuestionIndex >= totalQuestions - 1;

      let nextStatus = state.status;
      let completedAt = null;
      let finalResult = null;

      if (isEventFinished) {
        // Entire Event Completed!
        nextStatus = 'completed';
        completedAt = currentPerfNow;

        const totalRawMs = nextQuestionResults.reduce((sum, r) => sum + r.rawTimeMs, 0);
        const totalWrong = nextQuestionResults.reduce((sum, r) => sum + r.wrongAttempts, 0);
        const totalPenalty = nextQuestionResults.reduce((sum, r) => sum + r.penaltySeconds, 0);
        const totalFinalMs = totalRawMs + totalPenalty * 1000;

        finalResult = {
          eventId: state.event?.id || 'E001',
          event_id: state.event?.id || 'E001',
          eventName: state.event?.name || 'Tournament Event',
          event_name: state.event?.name || 'Tournament Event',
          player: state.player,
          sessionId: state.sessionId,
          totalQuestions,
          rawTimeMs: totalRawMs,
          rawTimeFormatted: formatTime(totalRawMs),
          event_raw_time_ms: totalRawMs,
          event_raw_time_formatted: formatTime(totalRawMs),
          wrongAttempts: totalWrong,
          penaltySeconds: totalPenalty,
          penaltyFormatted: `+${totalPenalty}s`,
          event_penalty_seconds: totalPenalty,
          finalTimeMs: totalFinalMs,
          finalTimeFormatted: formatTime(totalFinalMs),
          event_final_time_ms: totalFinalMs,
          event_final_time_formatted: formatTime(totalFinalMs),
          questionBreakdowns: nextQuestionResults
        };
      }

      const nextState = {
        ...state,
        status: nextStatus,
        placedComponents: nextPlaced,
        questionResults: nextQuestionResults,
        isQuestionCompleted: !isEventFinished, // If more questions remain, prompt for Next Question
        completedAt,
        result: finalResult,
        lastAction: {
          type: 'QUESTION_COMPLETED',
          questionId: currentQuestion.id,
          isEventComplete: isEventFinished,
          timestamp: Date.now()
        }
      };

      return {
        state: nextState,
        action: 'correct',
        componentId,
        slotId,
        isCompleted: isEventFinished,
        isEventComplete: isEventFinished,
        isQuestionCompleted: true,
        isQuestionComplete: true,
        questionResult: qResult,
        eventResult: finalResult
      };
    } else {
      // Normal correct placement within active question
      const nextState = {
        ...state,
        placedComponents: nextPlaced,
        lastAction: {
          type: 'CORRECT_PLACEMENT',
          componentId,
          slotId,
          timestamp: Date.now()
        }
      };

      return {
        state: nextState,
        action: 'correct',
        componentId,
        slotId,
        isCompleted: false,
        isEventComplete: false,
        isQuestionCompleted: false,
        isQuestionComplete: false,
        placedCount,
        totalRequired
      };
    }
  } else {
    // Wrong drop -> increase current question & total wrong attempts
    const nextQWrong = (state.currentQuestionWrongAttempts || 0) + 1;
    const nextTotalWrong = (state.totalWrongAttempts || 0) + 1;
    const nextTotalPenalty = nextTotalWrong * penaltyPerMistake;

    const nextState = {
      ...state,
      currentQuestionWrongAttempts: nextQWrong,
      totalWrongAttempts: nextTotalWrong,
      totalPenaltySeconds: nextTotalPenalty,
      wrongAttempts: nextTotalWrong,
      penaltySeconds: nextTotalPenalty,
      lastAction: {
        type: 'WRONG_PLACEMENT',
        componentId,
        slotId,
        penaltyAdded: penaltyPerMistake,
        timestamp: Date.now()
      }
    };

    return {
      state: nextState,
      action: 'wrong',
      componentId,
      slotId,
      isCompleted: false,
      isEventComplete: false,
      isQuestionCompleted: false,
      isQuestionComplete: false,
      wrongAttempts: nextTotalWrong,
      penaltyAdded: penaltyPerMistake
    };
  }
}

/**
 * Advances from completed question to the next question in the Event
 */
export function advanceToNextQuestion(state, currentPerfNow = performance.now()) {
  if (state.status !== 'running') return state;

  const nextQIndex = state.currentQuestionIndex + 1;
  const questions = state.event?.questions || [];
  const nextQ = questions[nextQIndex];

  if (!nextQ) return state;

  // Initialize fresh empty slots for the new question
  const nextPlaced = {};
  (nextQ.slots || []).forEach((s) => {
    nextPlaced[s.id] = null;
  });

  return {
    ...state,
    currentQuestionIndex: nextQIndex,
    currentQuestion: nextQ,
    currentQuestionStartTime: currentPerfNow,
    currentQuestionWrongAttempts: 0,
    placedComponents: nextPlaced,
    isQuestionCompleted: false,
    lastAction: {
      type: 'ADVANCED_TO_NEXT_QUESTION',
      questionIndex: nextQIndex,
      questionId: nextQ.id,
      timestamp: Date.now()
    }
  };
}

/**
 * Session Storage Persistence
 */
export function saveSessionToStorage(state) {
  try {
    if (!state || state.status === 'idle') {
      sessionStorage.removeItem(STORAGE_KEYS.SESSION);
      return;
    }
    const serialized = JSON.stringify({
      sessionId: state.sessionId,
      event: state.event,
      player: state.player,
      status: state.status,
      startEpoch: state.startEpoch,
      currentQuestionIndex: state.currentQuestionIndex,
      questionResults: state.questionResults,
      totalWrongAttempts: state.totalWrongAttempts,
      totalPenaltySeconds: state.totalPenaltySeconds,
      placedComponents: state.placedComponents,
      isQuestionCompleted: state.isQuestionCompleted,
      completedAt: state.completedAt,
      result: state.result,
      savedAt: Date.now()
    });
    sessionStorage.setItem(STORAGE_KEYS.SESSION, serialized);
  } catch (err) {
    console.warn('Session persistence failed:', err);
  }
}

export function loadSessionFromStorage() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEYS.SESSION);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data.sessionId || !data.player || !data.status) return null;

    const currentQ = data.event?.questions?.[data.currentQuestionIndex || 0] || null;

    if (data.status === 'running' && data.startEpoch) {
      const elapsedSinceStart = Date.now() - data.startEpoch;
      return {
        ...data,
        currentQuestion: currentQ,
        startTime: performance.now() - elapsedSinceStart,
        currentQuestionStartTime: performance.now(),
        elapsedTimeMs: elapsedSinceStart,
        wrongAttempts: data.totalWrongAttempts || 0,
        penaltySeconds: data.totalPenaltySeconds || 0,
        lastAction: null
      };
    }

    return {
      ...data,
      currentQuestion: currentQ,
      startTime: performance.now(),
      currentQuestionStartTime: performance.now(),
      elapsedTimeMs: data.result ? data.result.rawTimeMs : 0,
      wrongAttempts: data.totalWrongAttempts || 0,
      penaltySeconds: data.totalPenaltySeconds || 0,
      lastAction: null
    };
  } catch (err) {
    console.warn('Session load failed:', err);
    return null;
  }
}

export function clearSessionStorage() {
  try {
    sessionStorage.removeItem(STORAGE_KEYS.SESSION);
  } catch (err) {
    console.warn('Failed to clear session storage:', err);
  }
}
