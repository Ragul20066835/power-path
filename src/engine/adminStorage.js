/**
 * DROP & CONNECT - Admin Storage & Persistence Adapter
 * Hierarchy: EVENT -> QUESTIONS -> SLOTS
 * Manages Events, Questions, Settings, Participants, Results, and Admin Authentication.
 */

import { STORAGE_KEYS, DEFAULT_PENALTY_SECONDS } from '../data/gameData.js';
import { DEFAULT_EVENTS } from '../data/defaultEvents.js';

// Safe localStorage wrapper
function readStorage(key, fallback) {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : fallback;
  } catch (e) {
    console.warn(`Failed reading storage key "${key}":`, e);
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn(`Failed writing storage key "${key}":`, e);
  }
}

// ============================================================================
// 1. EVENT MANAGEMENT (Hierarchy: Event -> Questions -> Slots)
// ============================================================================

export function getEvents() {
  const isInit = readStorage(STORAGE_KEYS.INITIALIZED, false);
  const storedEvents = readStorage(STORAGE_KEYS.EVENTS, null);

  // If never initialized before and no events stored, seed initial default events ONCE
  if (!isInit && storedEvents === null) {
    writeStorage(STORAGE_KEYS.INITIALIZED, true);
    writeStorage(STORAGE_KEYS.EVENTS, DEFAULT_EVENTS);
    return DEFAULT_EVENTS;
  }

  // Once initialized, return stored events array (even if empty [])
  if (Array.isArray(storedEvents)) {
    return storedEvents;
  }

  return [];
}

export function saveEvents(eventsList) {
  writeStorage(STORAGE_KEYS.EVENTS, eventsList);
  return eventsList;
}

export function getEventById(id) {
  const events = getEvents();
  return events.find((e) => e.id === id) || null;
}

export function getActiveEvent() {
  const events = getEvents();
  const active = events.find((e) => e.status === 'ACTIVE');
  if (active) return active;
  if (events.length > 0) {
    return events[0];
  }
  return null;
}

export function saveEvent(event) {
  const events = getEvents();
  const index = events.findIndex((e) => e.id === event.id);

  const now = new Date().toISOString();
  const updatedEvent = {
    ...event,
    updatedAt: now,
    questions: (event.questions || []).map((q, qIdx) => ({
      ...q,
      questionOrder: q.questionOrder || qIdx + 1,
      penaltySeconds: Number(q.penaltySeconds) || DEFAULT_PENALTY_SECONDS,
      slots: (q.slots || []).map((slot, sIdx) => ({
        ...slot,
        slotOrder: slot.slotOrder || sIdx + 1
      }))
    }))
  };

  let nextList;
  if (index >= 0) {
    nextList = [...events];
    nextList[index] = updatedEvent;
  } else {
    updatedEvent.createdAt = updatedEvent.createdAt || now;
    nextList = [...events, updatedEvent];
  }

  saveEvents(nextList);
  return updatedEvent;
}

export function activateEvent(eventId) {
  const events = getEvents();
  const target = events.find((e) => e.id === eventId);
  if (!target) return false;

  if (!target.questions || target.questions.length === 0) {
    throw new Error(`Event ${eventId} cannot be activated because it contains 0 questions.`);
  }

  const nextList = events.map((e) => ({
    ...e,
    status: e.id === eventId ? 'ACTIVE' : 'INACTIVE',
    updatedAt: new Date().toISOString()
  }));

  saveEvents(nextList);
  return true;
}

export function deactivateEvent(eventId) {
  const events = getEvents();
  const nextList = events.map((e) => {
    if (e.id === eventId) {
      return { ...e, status: 'INACTIVE', updatedAt: new Date().toISOString() };
    }
    return e;
  });
  saveEvents(nextList);
  return true;
}

export function duplicateEvent(eventId) {
  const original = getEventById(eventId);
  if (!original) return null;

  const newId = `E${Date.now().toString(36).toUpperCase().slice(-4)}`;
  const duplicate = {
    ...original,
    id: newId,
    name: `${original.name} (Copy)`,
    status: 'INACTIVE',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    questions: (original.questions || []).map((q, idx) => ({
      ...q,
      id: `${q.id}_C`,
      questionOrder: idx + 1
    }))
  };

  saveEvent(duplicate);
  return duplicate;
}

export function deleteEvent(eventId) {
  const events = getEvents();
  const target = events.find((e) => e.id === eventId);
  if (!target) return false;

  // Filter out ONLY the specified event (all its questions and sockets are deleted with it)
  const nextList = events.filter((e) => e.id !== eventId);

  saveEvents(nextList);

  // If a player had an active session with this deleted event, clear it from session storage
  try {
    const rawSession = sessionStorage.getItem(STORAGE_KEYS.SESSION);
    if (rawSession) {
      const sess = JSON.parse(rawSession);
      if (sess.event?.id === eventId) {
        sessionStorage.removeItem(STORAGE_KEYS.SESSION);
      }
    }
  } catch (err) {
    // ignore
  }

  return true;
}

// ============================================================================
// 2. QUESTION MANAGEMENT INSIDE AN EVENT
// ============================================================================

export function saveQuestionInEvent(eventId, questionData) {
  const event = getEventById(eventId);
  if (!event) throw new Error(`Event ${eventId} not found.`);

  const questions = [...(event.questions || [])];
  const qIndex = questions.findIndex((q) => q.id === questionData.id);

  const updatedQuestion = {
    ...questionData,
    penaltySeconds: Number(questionData.penaltySeconds) || DEFAULT_PENALTY_SECONDS,
    slots: (questionData.slots || []).map((s, idx) => ({
      ...s,
      slotOrder: s.slotOrder || idx + 1
    }))
  };

  if (qIndex >= 0) {
    questions[qIndex] = updatedQuestion;
  } else {
    updatedQuestion.questionOrder = questions.length + 1;
    questions.push(updatedQuestion);
  }

  const updatedEvent = {
    ...event,
    questions,
    updatedAt: new Date().toISOString()
  };

  saveEvent(updatedEvent);
  return updatedQuestion;
}

export const addQuestionToEvent = (eventId, questionData) => saveQuestionInEvent(eventId, questionData);
export const updateQuestionInEvent = (eventId, questionData) => saveQuestionInEvent(eventId, questionData);

export function deleteQuestionFromEvent(eventId, questionId) {
  const event = getEventById(eventId);
  if (!event) return false;

  // Deletes only that question and its sockets, keeping the parent event intact
  const updatedQuestions = (event.questions || [])
    .filter((q) => q.id !== questionId)
    .map((q, idx) => ({ ...q, questionOrder: idx + 1 }));

  saveEvent({
    ...event,
    questions: updatedQuestions,
    updatedAt: new Date().toISOString()
  });

  return true;
}

export function duplicateQuestionInEvent(eventId, questionId) {
  const event = getEventById(eventId);
  if (!event) return null;

  const originalQ = (event.questions || []).find((q) => q.id === questionId);
  if (!originalQ) return null;

  const newQId = `Q${Date.now().toString(36).toUpperCase().slice(-4)}`;
  const duplicate = {
    ...originalQ,
    id: newQId,
    name: `${originalQ.name} (Copy)`,
    questionOrder: (event.questions || []).length + 1,
    slots: (originalQ.slots || []).map((s) => ({ ...s }))
  };

  saveQuestionInEvent(eventId, duplicate);
  return duplicate;
}

export function reorderQuestionsInEvent(eventId, newQuestions) {
  const event = getEventById(eventId);
  if (!event) return false;

  const reordered = newQuestions.map((q, idx) => ({
    ...q,
    questionOrder: idx + 1
  }));

  saveEvent({
    ...event,
    questions: reordered,
    updatedAt: new Date().toISOString()
  });

  return true;
}

/**
 * Imports questions directly into an existing Event (never creates a new Event)
 */
export function importQuestionsIntoEvent(eventId, newQuestionsList, overwrite = false) {
  const event = getEventById(eventId);
  if (!event) throw new Error(`Event "${eventId}" not found.`);

  let mergedQuestions;
  if (overwrite) {
    mergedQuestions = newQuestionsList.map((q, idx) => ({
      ...q,
      questionOrder: idx + 1
    }));
  } else {
    const existingQuestions = [...(event.questions || [])];
    newQuestionsList.forEach((newQ) => {
      const idx = existingQuestions.findIndex((q) => q.id === newQ.id);
      if (idx >= 0) {
        existingQuestions[idx] = { ...newQ, questionOrder: idx + 1 };
      } else {
        existingQuestions.push({ ...newQ, questionOrder: existingQuestions.length + 1 });
      }
    });
    mergedQuestions = existingQuestions.map((q, idx) => ({ ...q, questionOrder: idx + 1 }));
  }

  const updatedEvent = {
    ...event,
    questions: mergedQuestions,
    updatedAt: new Date().toISOString()
  };

  saveEvent(updatedEvent);
  return updatedEvent;
}

/**
 * Atomically imports bulk events into storage (shared source of truth)
 */
export function importEventsData(eventsList) {
  if (!Array.isArray(eventsList) || eventsList.length === 0) return getEvents();
  
  const currentEvents = getEvents();
  const nextList = [...currentEvents];

  eventsList.forEach((incomingEvent) => {
    const existingIdx = nextList.findIndex((e) => e.id === incomingEvent.id);
    const now = new Date().toISOString();
    const formatted = {
      ...incomingEvent,
      updatedAt: now,
      questions: (incomingEvent.questions || []).map((q, qIdx) => ({
        ...q,
        questionOrder: q.questionOrder || qIdx + 1,
        penaltySeconds: Number(q.penaltySeconds) || DEFAULT_PENALTY_SECONDS,
        slots: (q.slots || []).map((slot, sIdx) => ({
          ...slot,
          slotOrder: slot.slotOrder || sIdx + 1
        }))
      }))
    };

    if (existingIdx >= 0) {
      nextList[existingIdx] = formatted;
    } else {
      formatted.createdAt = formatted.createdAt || now;
      nextList.push(formatted);
    }
  });

  saveEvents(nextList);
  return nextList;
}

// ============================================================================
// 3. GLOBAL EVENT SETTINGS
// ============================================================================

const DEFAULT_SETTINGS = {
  eventStatus: 'OPEN', // 'OPEN' | 'PAUSED' | 'CLOSED'
  defaultPenaltySeconds: DEFAULT_PENALTY_SECONDS,
  maxSlots: 10,
  allowReplay: true,
  audioEnabled: true
};

export function getSettings() {
  return readStorage(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);
}

export function saveSettings(newSettings) {
  const current = getSettings();
  const merged = { ...current, ...newSettings };
  writeStorage(STORAGE_KEYS.SETTINGS, merged);
  return merged;
}

// ============================================================================
// 4. PARTICIPANTS & LIVE TELEMETRY
// ============================================================================

export function getParticipants() {
  return readStorage(STORAGE_KEYS.PARTICIPANTS, []);
}

export function recordParticipantSession(sessionData) {
  const participants = getParticipants();
  const index = participants.findIndex((p) => p.sessionId === sessionData.sessionId);

  const currentQIndex = sessionData.currentQuestionIndex || 0;
  const totalQ = sessionData.event?.questions?.length || 1;
  const currentQ = sessionData.currentQuestion || sessionData.event?.questions?.[currentQIndex];

  const record = {
    sessionId: sessionData.sessionId,
    name: sessionData.player.name,
    regNo: sessionData.player.regNo,
    eventId: sessionData.event?.id || 'E001',
    eventName: sessionData.event?.name || 'Championship Round',
    currentQuestionId: currentQ?.id || 'Q001',
    currentQuestionName: currentQ?.name || 'Question',
    currentQuestionIndex: currentQIndex,
    totalQuestions: totalQ,
    questionProgressText: `Q${currentQIndex + 1}/${totalQ}`,
    placedCount: Object.values(sessionData.placedComponents || {}).filter(Boolean).length,
    totalSlotsInCurrentQ: currentQ?.slots?.length || 5,
    status: sessionData.status === 'completed' ? 'COMPLETED' : 'PLAYING',
    wrongAttempts: sessionData.totalWrongAttempts || sessionData.wrongAttempts || 0,
    penaltySeconds: sessionData.totalPenaltySeconds || sessionData.penaltySeconds || 0,
    startedAt: sessionData.startEpoch || Date.now(),
    completedAt: sessionData.completedAt ? Date.now() : null,
    finalTimeFormatted: sessionData.result?.finalTimeFormatted || null,
    finalTimeMs: sessionData.result?.finalTimeMs || null,
    rawTimeFormatted: sessionData.result?.rawTimeFormatted || null
  };

  let nextList;
  if (index >= 0) {
    nextList = [...participants];
    nextList[index] = { ...nextList[index], ...record };
  } else {
    nextList = [record, ...participants];
  }

  writeStorage(STORAGE_KEYS.PARTICIPANTS, nextList);
  return record;
}

// ============================================================================
// 5. RESULTS & LEADERBOARD (Ranked by Event Final Time)
// ============================================================================

export function getResults() {
  const results = readStorage(STORAGE_KEYS.RESULTS, []);
  return results.sort((a, b) => a.finalTimeMs - b.finalTimeMs);
}

export function recordGameResult(resultData) {
  const results = readStorage(STORAGE_KEYS.RESULTS, []);
  const exists = results.findIndex((r) => r.sessionId === resultData.sessionId);

  const newRecord = {
    sessionId: resultData.sessionId,
    playerName: resultData.player.name,
    registerNumber: resultData.player.regNo,
    eventId: resultData.eventId,
    eventName: resultData.eventName,
    totalQuestions: resultData.totalQuestions,
    rawTimeMs: resultData.rawTimeMs,
    rawTimeFormatted: resultData.rawTimeFormatted,
    wrongAttempts: resultData.wrongAttempts,
    penaltySeconds: resultData.penaltySeconds,
    penaltyFormatted: resultData.penaltyFormatted,
    finalTimeMs: resultData.finalTimeMs,
    finalTimeFormatted: resultData.finalTimeFormatted,
    questionBreakdowns: resultData.questionBreakdowns || [],
    completedAt: new Date().toISOString()
  };

  let nextList;
  if (exists >= 0) {
    nextList = [...results];
    nextList[exists] = newRecord;
  } else {
    nextList = [...results, newRecord];
  }

  // Recalculate ranks
  nextList.sort((a, b) => a.finalTimeMs - b.finalTimeMs);
  nextList = nextList.map((r, idx) => ({ ...r, rank: idx + 1 }));

  writeStorage(STORAGE_KEYS.RESULTS, nextList);
  return nextList;
}

// ============================================================================
// 6. ADMIN AUTH
// ============================================================================

export function checkAdminAuth() {
  const auth = readStorage(STORAGE_KEYS.ADMIN_AUTH, null);
  return auth && auth.isAuthenticated ? auth : { isAuthenticated: false };
}

export function adminLogin(username, password) {
  const cleanUser = (username || '').trim();
  const cleanPass = (password || '').trim();

  if (!cleanUser || !cleanPass) {
    return { success: false, message: 'Please enter both username/email and password.' };
  }

  const authData = {
    isAuthenticated: true,
    user: {
      username: cleanUser,
      email: cleanUser.includes('@') ? cleanUser : `${cleanUser}@electroplay.event`,
      role: 'SUPER_ADMIN'
    },
    token: `MOCK_JWT_${Date.now()}_${Math.random().toString(36).substring(2)}`,
    loginTime: new Date().toISOString()
  };

  writeStorage(STORAGE_KEYS.ADMIN_AUTH, authData);
  return { success: true, auth: authData };
}

export function adminLogout() {
  localStorage.removeItem(STORAGE_KEYS.ADMIN_AUTH);
  return true;
}
