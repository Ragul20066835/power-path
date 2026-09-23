/**
 * POWERPATH Centralized API Service Client
 * Production-ready communication layer between React and FastAPI.
 * Base URL configured via VITE_API_BASE_URL (defaults to http://localhost:8000 in dev).
 */

import { formatTime } from '../engine/gameEngine.js';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

const STORAGE_KEYS = {
  ADMIN_TOKEN: 'powerpath_admin_token',
  SESSION_ID: 'powerpath_session_id',
  PLAYER_SESSION: 'POWERPATH_PLAYER_SESSION'
};

/**
 * Normalizes backend Question/Socket entities for seamless React UI consumption.
 */
function normalizeQuestionForFrontend(q) {
  if (!q) return null;
  const sockets = q.sockets || q.slots || [];
  const normalizedSlots = sockets.map((s) => ({
    id: s.id,
    customId: s.custom_id || s.customId || s.id,
    label: s.label || 'SLOT',
    hint: s.hint || '',
    pinLabelLeft: s.pin_label_left || s.pinLabelLeft || 'IN',
    pinLabelRight: s.pin_label_right || s.pinLabelRight || 'OUT',
    slotOrder: s.slot_order || s.slotOrder || 1,
    acceptedComponentId: s.accepted_component_id || s.acceptedComponentId || undefined
  }));

  return {
    id: q.id,
    customId: q.custom_id || q.customId || q.id,
    name: q.name,
    description: q.description || '',
    difficulty: q.difficulty || 'Easy',
    penaltySeconds: q.penalty_seconds || q.penaltySeconds || 5,
    questionOrder: q.question_order || q.questionOrder || 1,
    sockets: normalizedSlots,
    slots: normalizedSlots
  };
}

function normalizeEventForFrontend(event) {
  if (!event) return null;
  const questions = (event.questions || []).map(normalizeQuestionForFrontend);
  const totalQ = Number(event.total_questions || event.totalQuestions || questions.length || 0);
  return {
    id: event.id,
    customId: event.custom_id || event.customId || event.id,
    name: event.name,
    description: event.description || '',
    status: event.status || 'INACTIVE',
    questions,
    totalQuestions: totalQ > 0 ? totalQ : questions.length
  };
}

class ApiService {
  constructor() {
    this.baseUrl = API_BASE_URL.replace(/\/+$/, '');
  }

  // --------------------------------------------------------------------------
  // TOKEN & STORAGE HELPERS
  // --------------------------------------------------------------------------
  getAdminToken() {
    try {
      return localStorage.getItem(STORAGE_KEYS.ADMIN_TOKEN) || null;
    } catch (e) {
      return null;
    }
  }

  setAdminToken(token) {
    try {
      if (token) {
        localStorage.setItem(STORAGE_KEYS.ADMIN_TOKEN, token);
      } else {
        localStorage.removeItem(STORAGE_KEYS.ADMIN_TOKEN);
      }
    } catch (e) {
      console.warn('Failed storing admin token:', e);
    }
  }

  getSavedSessionId() {
    try {
      // 1. Try POWERPATH_PLAYER_SESSION JSON recovery pointer
      const raw = localStorage.getItem(STORAGE_KEYS.PLAYER_SESSION) || sessionStorage.getItem(STORAGE_KEYS.PLAYER_SESSION);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.sessionId) return String(parsed.sessionId).trim();
          if (typeof parsed === 'string' && parsed.trim()) return parsed.trim();
        } catch (_) {
          if (typeof raw === 'string' && raw.trim()) return raw.trim();
        }
      }
      // 2. Fallback to legacy SESSION_ID key
      const legacy = localStorage.getItem(STORAGE_KEYS.SESSION_ID) || sessionStorage.getItem(STORAGE_KEYS.SESSION_ID);
      return legacy ? String(legacy).trim() : null;
    } catch (e) {
      return null;
    }
  }

  saveSessionId(sessionId, meta = {}) {
    try {
      if (sessionId) {
        const cleanId = String(sessionId).trim();
        const payload = JSON.stringify({
          sessionId: cleanId,
          eventId: meta.eventId || null,
          registerNo: meta.registerNo || null,
          savedAt: new Date().toISOString()
        });
        localStorage.setItem(STORAGE_KEYS.PLAYER_SESSION, payload);
        sessionStorage.setItem(STORAGE_KEYS.PLAYER_SESSION, payload);
        localStorage.setItem(STORAGE_KEYS.SESSION_ID, cleanId);
        sessionStorage.setItem(STORAGE_KEYS.SESSION_ID, cleanId);
      } else {
        localStorage.removeItem(STORAGE_KEYS.PLAYER_SESSION);
        sessionStorage.removeItem(STORAGE_KEYS.PLAYER_SESSION);
        localStorage.removeItem(STORAGE_KEYS.SESSION_ID);
        sessionStorage.removeItem(STORAGE_KEYS.SESSION_ID);
      }
    } catch (e) {
      console.warn('Failed storing session recovery record:', e);
    }
  }

  clearSessionId() {
    this.saveSessionId(null);
  }

  // --------------------------------------------------------------------------
  // HTTP REQUEST WRAPPER
  // --------------------------------------------------------------------------
  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
    const headers = {
      ...(options.headers || {})
    };

    // Attach Bearer token if not already present
    const token = this.getAdminToken();
    if (token && !headers['Authorization']) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Set JSON content-type if body is not FormData
    if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    const config = {
      ...options,
      headers
    };

    try {
      const response = await fetch(url, config);

      if (response.status === 401) {
        // If an admin call returns 401, clear stale token
        if (endpoint.includes('/admin') || endpoint.includes('/auth/me')) {
          this.setAdminToken(null);
        }
      }

      let data;
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        data = await response.json();
      } else {
        data = await response.text();
      }

      if (!response.ok) {
        const errorMessage =
          (typeof data === 'object' && (data.detail?.message || data.detail || data.message)) ||
          `Request failed with status ${response.status}`;
        const error = new Error(typeof errorMessage === 'string' ? errorMessage : JSON.stringify(errorMessage));
        error.status = response.status;
        error.data = data;
        throw error;
      }

      return data;
    } catch (err) {
      if (err.name === 'TypeError' && err.message.includes('fetch')) {
        const netErr = new Error('Unable to connect to POWERPATH server. Please check your network connection.');
        netErr.status = 0;
        throw netErr;
      }
      throw err;
    }
  }

  // --------------------------------------------------------------------------
  // 1. SYSTEM & SETTINGS
  // --------------------------------------------------------------------------
  async getHealth() {
    return this.request('/api/v1/health');
  }

  async getSettings() {
    const res = await this.request('/api/v1/settings');
    return {
      key: res.key || 'global',
      eventStatus: res.event_status || 'OPEN',
      defaultPenaltySeconds: res.default_penalty_seconds || 5,
      allowReplay: res.allow_replay ?? true,
      audioEnabled: res.audio_enabled ?? true,
      updatedAt: res.updated_at
    };
  }

  async updateAdminSettings(settingsData) {
    const payload = {
      event_status: settingsData.eventStatus || settingsData.event_status,
      default_penalty_seconds: settingsData.defaultPenaltySeconds || settingsData.default_penalty_seconds,
      allow_replay: settingsData.allowReplay ?? settingsData.allow_replay,
      audio_enabled: settingsData.audioEnabled ?? settingsData.audio_enabled
    };
    return this.request('/api/v1/admin/settings', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  // --------------------------------------------------------------------------
  // 2. PUBLIC EVENTS & LEADERBOARD
  // --------------------------------------------------------------------------
  async getActiveEvent() {
    try {
      const data = await this.request('/api/v1/events/active');
      return normalizeEventForFrontend(data);
    } catch (err) {
      if (err.status === 404) {
        return null;
      }
      throw err;
    }
  }

  async getPublicLeaderboard(eventId = null) {
    const query = eventId ? `?event_id=${encodeURIComponent(eventId)}` : '';
    const results = await this.request(`/api/v1/results/leaderboard${query}`);
    return (results || []).map((r, idx) => ({
      rank: r.rank || idx + 1,
      playerName: r.player_name,
      registerNumber: r.register_number,
      rawTimeMs: r.raw_time_ms,
      totalPenaltySeconds: r.total_penalty_seconds,
      finalTimeMs: r.final_time_ms,
      completedAt: r.completed_at
    }));
  }

  // --------------------------------------------------------------------------
  // 3. PLAYER GAMEPLAY FLOW
  // --------------------------------------------------------------------------
  async startSession(playerName, registerNumber, eventId = null) {
    const payload = {
      player_name: playerName.trim(),
      register_number: registerNumber.trim().toUpperCase(),
      event_id: eventId || null
    };

    const data = await this.request('/api/v1/game/session/start', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    if (data.session_id) {
      this.saveSessionId(data.session_id, {
        eventId: data.event?.id || eventId,
        registerNo: data.register_number
      });
    }

    const totalQ = Number(data.total_questions || data.event?.total_questions || 1);
    return {
      sessionId: data.session_id,
      player: {
        name: data.player_name,
        regNo: data.register_number
      },
      status: 'running',
      currentQuestionIndex: data.current_question_index || 0,
      totalQuestions: totalQ > 0 ? totalQ : 1,
      totalWrongAttempts: data.wrong_attempts_total || 0,
      totalPenaltySeconds: data.penalty_seconds_total || 0,
      startedAt: data.started_at,
      startTime: new Date(data.started_at).getTime(),
      event: normalizeEventForFrontend(data.event),
      currentQuestion: normalizeQuestionForFrontend(data.current_question),
      placedSocketIds: data.placed_socket_ids || []
    };
  }

  async recoverSession(sessionId) {
    if (!sessionId) return null;

    try {
      const data = await this.request(`/api/v1/game/session/${encodeURIComponent(sessionId)}`);
      this.saveSessionId(data.session_id, {
        eventId: data.event?.id,
        registerNo: data.register_number
      });

      const totalQ = Number(data.total_questions || data.event?.total_questions || 1);
      return {
        sessionId: data.session_id,
        player: {
          name: data.player_name,
          regNo: data.register_number
        },
        status: data.status === 'PLAYING' ? 'running' : data.status === 'COMPLETED' ? 'completed' : 'idle',
        currentQuestionIndex: data.current_question_index || 0,
        totalQuestions: totalQ > 0 ? totalQ : 1,
        totalWrongAttempts: data.wrong_attempts_total || 0,
        totalPenaltySeconds: data.penalty_seconds_total || 0,
        startedAt: data.started_at,
        startTime: new Date(data.started_at).getTime(),
        completedAt: data.completed_at,
        event: normalizeEventForFrontend(data.event),
        currentQuestion: normalizeQuestionForFrontend(data.current_question),
        placedSocketIds: data.placed_socket_ids || [],
        completedQuestionsCount: data.completed_questions_count || 0
      };
    } catch (err) {
      if (err.status === 404 || err.status === 400) {
        this.clearSessionId();
        return null;
      }
      throw err;
    }
  }

  async attemptPlacement(sessionId, questionId, socketId, componentId) {
    const payload = {
      session_id: sessionId,
      question_id: questionId,
      socket_id: socketId,
      component_id: componentId
    };

    const res = await this.request('/api/v1/game/placement/attempt', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    return {
      correct: Boolean(res.correct),
      socketId: res.socket_id,
      socketCustomId: res.socket_custom_id,
      alreadyCompleted: Boolean(res.already_completed),
      penaltyApplied: res.penalty_applied || 0,
      wrongAttemptsTotal: res.wrong_attempts_total || 0,
      penaltySecondsTotal: res.penalty_seconds_total || 0,
      message: res.message || ''
    };
  }

  async completeQuestion(sessionId, questionId) {
    const payload = {
      session_id: sessionId,
      question_id: questionId
    };

    const res = await this.request('/api/v1/game/question/complete', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    return {
      sessionId: res.session_id,
      questionIndex: res.question_index,
      hasNextQuestion: Boolean(res.has_next_question),
      nextQuestion: normalizeQuestionForFrontend(res.next_question),
      eventCompleted: Boolean(res.event_completed),
      wrongAttemptsTotal: res.wrong_attempts_total || 0,
      penaltySecondsTotal: res.penalty_seconds_total || 0,
      message: res.message
    };
  }

  async finishSession(sessionId) {
    const payload = { session_id: sessionId };
    const res = await this.request('/api/v1/game/session/finish', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    return {
      id: res.id,
      sessionId: res.session_id,
      playerName: res.player_name,
      registerNumber: res.register_number,
      totalQuestions: res.total_questions,
      rawTimeMs: res.raw_time_ms,
      totalWrongAttempts: res.total_wrong_attempts,
      totalPenaltySeconds: res.total_penalty_seconds,
      finalTimeMs: res.final_time_ms,
      rank: res.rank,
      completedAt: res.completed_at
    };
  }

  // --------------------------------------------------------------------------
  // 4. ADMIN AUTHENTICATION
  // --------------------------------------------------------------------------
  async loginAdmin(username, password) {
    const payload = { username, password };
    const res = await this.request('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    if (res.access_token) {
      this.setAdminToken(res.access_token);
    }
    return res;
  }

  async getAdminProfile() {
    return this.request('/api/v1/auth/me');
  }

  logoutAdmin() {
    this.setAdminToken(null);
  }

  // --------------------------------------------------------------------------
  // 5. ADMIN EVENTS CRUD
  // --------------------------------------------------------------------------
  async getAdminEvents() {
    const events = await this.request('/api/v1/admin/events');
    return (events || []).map(normalizeEventForFrontend);
  }

  async createAdminEvent(eventData) {
    const payload = {
      custom_id: eventData.customId || eventData.custom_id || eventData.id,
      name: eventData.name,
      description: eventData.description || '',
      status: eventData.status || 'INACTIVE',
      questions: (eventData.questions || []).map((q, idx) => ({
        custom_id: q.customId || q.custom_id || `Q${idx + 1}`,
        name: q.name,
        description: q.description || '',
        difficulty: q.difficulty || 'Easy',
        penalty_seconds: q.penaltySeconds || q.penalty_seconds || 5,
        question_order: q.questionOrder || idx + 1,
        sockets: (q.sockets || q.slots || []).map((s, sIdx) => ({
          custom_id: s.customId || s.custom_id || `S${sIdx + 1}`,
          label: s.label,
          accepted_component_id: s.acceptedComponentId || s.accepted_component_id,
          hint: s.hint || '',
          pin_label_left: s.pinLabelLeft || s.pin_label_left || 'IN',
          pin_label_right: s.pinLabelRight || s.pin_label_right || 'OUT',
          slot_order: s.slotOrder || s.slot_order || sIdx + 1
        }))
      }))
    };

    const res = await this.request('/api/v1/admin/events', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    return normalizeEventForFrontend(res);
  }

  async updateAdminEvent(eventId, updateData) {
    const payload = {
      custom_id: updateData.customId || updateData.custom_id,
      name: updateData.name,
      description: updateData.description,
      status: updateData.status
    };

    const res = await this.request(`/api/v1/admin/events/${encodeURIComponent(eventId)}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    return normalizeEventForFrontend(res);
  }

  async deleteAdminEvent(eventId) {
    return this.request(`/api/v1/admin/events/${encodeURIComponent(eventId)}`, {
      method: 'DELETE'
    });
  }

  async activateAdminEvent(eventId) {
    const res = await this.request(`/api/v1/admin/events/${encodeURIComponent(eventId)}/activate`, {
      method: 'POST'
    });
    return normalizeEventForFrontend(res);
  }

  async deactivateAdminEvent(eventId) {
    const res = await this.request(`/api/v1/admin/events/${encodeURIComponent(eventId)}/deactivate`, {
      method: 'POST'
    });
    return normalizeEventForFrontend(res);
  }

  // --------------------------------------------------------------------------
  // 6. ADMIN QUESTIONS CRUD
  // --------------------------------------------------------------------------
  async getAdminQuestions(eventId) {
    const questions = await this.request(`/api/v1/admin/events/${encodeURIComponent(eventId)}/questions`);
    return (questions || []).map(normalizeQuestionForFrontend);
  }

  async createAdminQuestion(eventId, questionData) {
    const payload = {
      custom_id: questionData.customId || questionData.custom_id,
      name: questionData.name,
      description: questionData.description || '',
      difficulty: questionData.difficulty || 'Easy',
      penalty_seconds: questionData.penaltySeconds || questionData.penalty_seconds || 5,
      question_order: questionData.questionOrder || questionData.question_order || 1,
      sockets: (questionData.sockets || questionData.slots || []).map((s, idx) => ({
        custom_id: s.customId || s.custom_id || `S${idx + 1}`,
        label: s.label,
        accepted_component_id: s.acceptedComponentId || s.accepted_component_id,
        hint: s.hint || '',
        pin_label_left: s.pinLabelLeft || s.pin_label_left || 'IN',
        pin_label_right: s.pinLabelRight || s.pin_label_right || 'OUT',
        slot_order: s.slotOrder || s.slot_order || idx + 1
      }))
    };

    const res = await this.request(`/api/v1/admin/events/${encodeURIComponent(eventId)}/questions`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    return normalizeQuestionForFrontend(res);
  }

  async updateAdminQuestion(eventId, questionId, updateData) {
    const payload = {
      custom_id: updateData.customId || updateData.custom_id,
      name: updateData.name,
      description: updateData.description,
      difficulty: updateData.difficulty,
      penalty_seconds: updateData.penaltySeconds || updateData.penalty_seconds,
      question_order: updateData.questionOrder || updateData.question_order
    };

    const res = await this.request(
      `/api/v1/admin/events/${encodeURIComponent(eventId)}/questions/${encodeURIComponent(questionId)}`,
      {
        method: 'PUT',
        body: JSON.stringify(payload)
      }
    );
    return normalizeQuestionForFrontend(res);
  }

  async deleteAdminQuestion(eventId, questionId) {
    return this.request(
      `/api/v1/admin/events/${encodeURIComponent(eventId)}/questions/${encodeURIComponent(questionId)}`,
      {
        method: 'DELETE'
      }
    );
  }

  // --------------------------------------------------------------------------
  // 7. ADMIN RESULTS & LEADERBOARD
  // --------------------------------------------------------------------------
  async getAdminResults(eventId = null) {
    const query = eventId ? `?event_id=${encodeURIComponent(eventId)}` : '';
    const results = await this.request(`/api/v1/admin/results${query}`);
    return (results || []).map((r, idx) => ({
      id: r.id,
      rank: r.rank || idx + 1,
      sessionId: r.session_id,
      playerName: r.player_name,
      registerNumber: r.register_number,
      totalQuestions: r.total_questions,
      rawTimeMs: r.raw_time_ms,
      totalWrongAttempts: r.total_wrong_attempts,
      totalPenaltySeconds: r.total_penalty_seconds,
      finalTimeMs: r.final_time_ms,
      completedAt: r.completed_at
    }));
  }

  // --------------------------------------------------------------------------
  // 8. ADMIN CSV UPLOADS
  // --------------------------------------------------------------------------
  async uploadQuestionsCSV(file, eventId) {
    const formData = new FormData();
    formData.append('file', file);
    if (eventId) {
      formData.append('event_id', eventId);
    }

    const query = eventId ? `?event_id=${encodeURIComponent(eventId)}` : '';
    return this.request(`/api/v1/admin/upload/questions${query}`, {
      method: 'POST',
      body: formData
    });
  }

  async uploadEventsCSV(file) {
    const formData = new FormData();
    formData.append('file', file);

    return this.request('/api/v1/admin/upload/events', {
      method: 'POST',
      body: formData
    });
  }

  // --------------------------------------------------------------------------
  // 9. LIVE TELEMETRY, HEARTBEAT & WEBSOCKET MONITOR
  // --------------------------------------------------------------------------
  async sendHeartbeat(sessionId) {
    if (!sessionId) return null;
    try {
      return await this.request(`/api/v1/game/session/${encodeURIComponent(sessionId)}/heartbeat`, {
        method: 'POST'
      });
    } catch (e) {
      console.warn('Heartbeat error:', e.message);
      return null;
    }
  }

  async getLiveTelemetry(eventId = null, status = null) {
    const params = new URLSearchParams();
    if (eventId && eventId !== 'ALL') params.append('event_id', eventId);
    if (status && status !== 'ALL') params.append('status', status);

    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/api/v1/admin/monitor/telemetry${query}`);
  }

  async getAdminParticipants(eventId = null, status = null) {
    const params = new URLSearchParams();
    if (eventId && eventId !== 'ALL') params.append('event_id', eventId);
    if (status && status !== 'ALL') params.append('status', status);

    const query = params.toString() ? `?${params.toString()}` : '';
    const res = await this.request(`/api/v1/admin/participants${query}`);
    const sessions = (res && res.sessions) ? res.sessions : (Array.isArray(res) ? res : []);

    return sessions.map((s) => ({
      id: s.id,
      sessionId: s.session_id,
      name: s.player_name,
      regNo: s.register_number,
      status: s.status,
      eventId: s.event_id,
      eventName: s.event_name,
      currentQuestionIndex: s.current_question_index ?? 0,
      totalQuestions: s.total_questions || 1,
      currentQuestionName: s.current_question_name,
      placedCount: s.placed_count || 0,
      totalSlotsInCurrentQ: s.total_slots_in_current_q || 0,
      wrongAttempts: s.wrong_attempts_total || 0,
      penaltySeconds: s.penalty_seconds_total || 0,
      startedAt: s.started_at,
      completedAt: s.completed_at,
      finalTimeMs: s.final_time_ms,
      finalTimeFormatted: s.final_time_ms != null ? formatTime(s.final_time_ms) : (s.status === 'COMPLETED' ? '00:00.00' : 'In Progress'),
      isActive: Boolean(s.is_active),
      questionProgressText: `Stage ${(s.current_question_index || 0) + 1}/${s.total_questions || 1}`
    }));
  }

  connectMonitorWebSocket(onEvent, onStatusChange) {
    const token = this.getAdminToken();
    if (!token) {
      if (onStatusChange) onStatusChange('polling');
      return { disconnect: () => {} };
    }

    const wsProtocol = this.baseUrl.startsWith('https') ? 'wss' : 'ws';
    const cleanHost = this.baseUrl.replace(/^https?:\/\//, '');
    const wsUrl = `${wsProtocol}://${cleanHost}/api/v1/ws/monitor?token=${encodeURIComponent(token)}`;

    let ws = null;
    let isDisposed = false;
    let pingInterval = null;
    let reconnectTimeout = null;

    const connect = () => {
      if (isDisposed) return;

      try {
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          if (onStatusChange) onStatusChange('connected');
          // Start keep-alive ping every 20s
          pingInterval = setInterval(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.send('ping');
            }
          }, 20000);
        };

        ws.onmessage = (event) => {
          if (event.data === 'pong') return;
          try {
            const parsed = JSON.parse(event.data);
            if (onEvent) onEvent(parsed);
          } catch (err) {
            console.warn('Error parsing WS message:', err);
          }
        };

        ws.onclose = () => {
          if (pingInterval) clearInterval(pingInterval);
          if (onStatusChange) onStatusChange('polling');
          // Attempt reconnect after 4s
          if (!isDisposed) {
            reconnectTimeout = setTimeout(connect, 4000);
          }
        };

        ws.onerror = (err) => {
          console.warn('Monitor WS error, falling back to polling:', err);
          if (ws) ws.close();
        };
      } catch (err) {
        console.warn('Failed opening WebSocket connection:', err);
        if (onStatusChange) onStatusChange('polling');
      }
    };

    connect();

    return {
      disconnect: () => {
        isDisposed = true;
        if (pingInterval) clearInterval(pingInterval);
        if (reconnectTimeout) clearTimeout(reconnectTimeout);
        if (ws) ws.close();
      }
    };
  }
}

export const apiService = new ApiService();
export default apiService;
