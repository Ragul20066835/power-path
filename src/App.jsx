import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Zap } from 'lucide-react';
import { Header } from './components/Header';
import { Home } from './pages/Home';
import { Game } from './pages/Game';
import { ResultModal } from './components/ResultModal';
import { RulesModal } from './components/RulesModal';
import { ToastNotification } from './components/ToastNotification';
import { AdminLayout } from './components/admin/AdminLayout';
import { AdminLogin } from './components/admin/AdminLogin';
import { useGameTimer } from './hooks/useGameTimer';
import { soundEngine } from './engine/audioEngine';
import { apiService } from './services/apiService';
import {
  formatTime,
  calculateResult
} from './engine/gameEngine.js';
import {
  getEvents,
  getActiveEvent as getLocalActiveEvent,
  saveEvent,
  activateEvent,
  deactivateEvent,
  duplicateEvent,
  deleteEvent,
  addQuestionToEvent,
  updateQuestionInEvent,
  deleteQuestionFromEvent,
  duplicateQuestionInEvent,
  reorderQuestionsInEvent,
  importQuestionsIntoEvent,
  importEventsData,
  getSettings as getLocalSettings,
  saveSettings,
  getParticipants,
  getResults as getLocalResults
} from './engine/adminStorage.js';
import { COMPONENTS_MAP } from './data/gameData.js';

export function App() {
  // Top-level View Mode: 'player' | 'admin'
  const [viewMode, setViewMode] = useState(() => {
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')) {
      return 'admin';
    }
    return 'player';
  });

  // Admin Data & Auth State
  const [adminAuth, setAdminAuth] = useState({
    isAuthenticated: Boolean(apiService.getAdminToken()),
    user: null
  });
  const [events, setEvents] = useState(() => getEvents());
  const [settings, setSettings] = useState(() => getLocalSettings());
  const [participants, setParticipants] = useState(() => getParticipants());
  const [results, setResults] = useState(() => getLocalResults());
  const [activeEvent, setActiveEvent] = useState(null);
  const [serverSyncError, setServerSyncError] = useState(null);

  // Recovery Loading & Connection State
  const [isSessionRecovering, setIsSessionRecovering] = useState(() => {
    return Boolean(apiService.getSavedSessionId());
  });
  const [sessionRecoveryError, setSessionRecoveryError] = useState(null);

  // Player Game State with Authoritative Recovery
  const [gameState, setGameState] = useState({
    sessionId: null,
    player: { name: '', regNo: '' },
    status: 'idle', // 'idle' | 'running' | 'completed'
    currentQuestionIndex: 0,
    currentQuestion: null,
    totalQuestions: 1,
    event: null,
    placedComponents: {},
    wrongAttempts: 0,
    penaltySeconds: 0,
    totalWrongAttempts: 0,
    totalPenaltySeconds: 0,
    startedAt: null,
    startTime: null,
    isQuestionCompleted: false,
    nextQuestion: null,
    lastAction: null,
    result: null
  });

  const [toast, setToast] = useState(null);
  const [isRulesOpen, setIsRulesOpen] = useState(false);
  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  const [isPlacementPending, setIsPlacementPending] = useState(false);
  const toastTimerRef = useRef(null);

  const showToast = useCallback((title, message, type = 'info', duration = 3000) => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    const id = Date.now();
    setToast({ id, title, message, type });
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
    }, duration);
  }, []);

  const dismissToast = useCallback(() => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setToast(null);
  }, []);

  // High-precision visual stopwatch (approximated locally from server startedAt, official score from backend)
  const timerData = useGameTimer({
    status: gameState.status,
    startTime: gameState.startTime,
    wrongAttempts: gameState.totalWrongAttempts || gameState.wrongAttempts || 0,
    completedResult: gameState.result
  });

  // Periodic Player Heartbeat (every 15s during active match)
  useEffect(() => {
    if (gameState.status !== 'running' || !gameState.sessionId) {
      return;
    }

    const hbInterval = setInterval(() => {
      apiService.sendHeartbeat(gameState.sessionId);
    }, 15000);

    return () => clearInterval(hbInterval);
  }, [gameState.status, gameState.sessionId]);

  // --------------------------------------------------------------------------
  // ADMIN DATA REFRESH
  // --------------------------------------------------------------------------
  const refreshAdminData = useCallback(async () => {
    try {
      if (apiService.getAdminToken()) {
        const profile = await apiService.getAdminProfile();
        setAdminAuth({ isAuthenticated: true, user: profile });
      }
    } catch (e) {
      setAdminAuth({ isAuthenticated: false, user: null });
    }

    try {
      const adminEvts = await apiService.getAdminEvents();
      if (adminEvts && adminEvts.length > 0) {
        setEvents(adminEvts);
        const act = adminEvts.find((e) => e.status === 'ACTIVE') || null;
        setActiveEvent(act);
      } else {
        setEvents(getEvents());
      }
    } catch (e) {
      setEvents(getEvents());
    }

    try {
      if (apiService.getAdminToken()) {
        const adminParts = await apiService.getAdminParticipants();
        if (adminParts && Array.isArray(adminParts)) {
          setParticipants(adminParts);
        } else {
          setParticipants(getParticipants());
        }
      } else {
        setParticipants(getParticipants());
      }
    } catch (e) {
      console.warn('Could not fetch admin participants from backend:', e);
      setParticipants(getParticipants());
    }

    try {
      const adminRes = await apiService.getAdminResults();
      if (adminRes) {
        setResults(adminRes);
      }
    } catch (e) {
      setResults(getLocalResults());
    }

    try {
      const liveSettings = await apiService.getSettings();
      if (liveSettings) {
        setSettings(liveSettings);
      }
    } catch (e) {
      setSettings(getLocalSettings());
    }
  }, []);

  // --------------------------------------------------------------------------
  // INITIAL DATA & SESSION RECOVERY
  // --------------------------------------------------------------------------
  const loadInitialData = useCallback(async () => {
    setSessionRecoveryError(null);
    setServerSyncError(null);
    try {
      // 1. Fetch live tournament settings
      try {
        const liveSettings = await apiService.getSettings();
        if (liveSettings) {
          setSettings(liveSettings);
        }
      } catch (err) {
        console.warn('Could not fetch remote settings:', err.message);
      }

      // 2. Fetch active event from backend
      let remoteActiveEvent = null;
      let activeEventFetchFailed = false;
      try {
        remoteActiveEvent = await apiService.getActiveEvent();
      } catch (err) {
        console.warn('Could not fetch remote active event:', err.message);
        if (err.status !== 404) {
          activeEventFetchFailed = true;
          setServerSyncError(err.message || 'Unable to connect to POWERPATH tournament server.');
        }
      }

      if (activeEventFetchFailed) {
        setActiveEvent(null);
      } else {
        setActiveEvent(remoteActiveEvent);
      }

      const effectiveActiveEvent = remoteActiveEvent;

      // 3. Attempt Authoritative Session Recovery
      const savedSessionId = apiService.getSavedSessionId();
      if (savedSessionId) {
        setIsSessionRecovering(true);
        try {
          const recovered = await apiService.recoverSession(savedSessionId);
          if (recovered && recovered.sessionId) {
            if (recovered.event) {
              setActiveEvent(recovered.event);
            }

            const placedMap = {};
            if (recovered.currentQuestion && recovered.currentQuestion.slots) {
              recovered.currentQuestion.slots.forEach((s) => {
                placedMap[s.id] = (recovered.placedSocketIds && recovered.placedSocketIds.includes(s.id))
                  ? (s.customId || s.id)
                  : null;
              });
            }

            if (recovered.status === 'running') {
              const totalQ = Number(
                recovered.totalQuestions ||
                recovered.event?.totalQuestions ||
                effectiveActiveEvent?.totalQuestions ||
                effectiveActiveEvent?.questions?.length ||
                1
              );
              setGameState({
                sessionId: recovered.sessionId,
                player: recovered.player,
                status: 'running',
                currentQuestionIndex: recovered.currentQuestionIndex,
                currentQuestion: recovered.currentQuestion,
                totalQuestions: totalQ > 0 ? totalQ : 1,
                event: recovered.event || effectiveActiveEvent,
                placedComponents: placedMap,
                wrongAttempts: recovered.totalWrongAttempts,
                penaltySeconds: recovered.totalPenaltySeconds,
                totalWrongAttempts: recovered.totalWrongAttempts,
                totalPenaltySeconds: recovered.totalPenaltySeconds,
                startedAt: recovered.startedAt,
                startTime: recovered.startTime,
                isQuestionCompleted: false,
                nextQuestion: null,
                lastAction: null,
                result: null
              });
              setIsSessionRecovering(false);
              showToast('Session Restored', `Resumed active match for ${recovered.player.name}.`, 'info', 2500);
              return;
            } else if (recovered.status === 'completed') {
              try {
                const finishRes = await apiService.finishSession(recovered.sessionId);
                setGameState({
                  sessionId: recovered.sessionId,
                  player: recovered.player,
                  status: 'completed',
                  currentQuestionIndex: recovered.totalQuestions,
                  currentQuestion: null,
                  event: recovered.event || effectiveActiveEvent,
                  placedComponents: {},
                  wrongAttempts: finishRes.totalWrongAttempts,
                  penaltySeconds: finishRes.totalPenaltySeconds,
                  totalWrongAttempts: finishRes.totalWrongAttempts,
                  totalPenaltySeconds: finishRes.totalPenaltySeconds,
                  startedAt: recovered.startedAt,
                  startTime: recovered.startTime,
                  isQuestionCompleted: true,
                  nextQuestion: null,
                  lastAction: null,
                  result: {
                    rawTimeMs: finishRes.rawTimeMs,
                    rawTimeFormatted: formatTime(finishRes.rawTimeMs),
                    wrongAttempts: finishRes.totalWrongAttempts,
                    penaltySeconds: finishRes.totalPenaltySeconds,
                    penaltyFormatted: `+${finishRes.totalPenaltySeconds}s`,
                    finalTimeMs: finishRes.finalTimeMs,
                    finalTimeFormatted: formatTime(finishRes.finalTimeMs),
                    rank: finishRes.rank
                  }
                });
              } catch (e) {
                console.warn('Could not fetch finish session result:', e);
              }
              setIsSessionRecovering(false);
              return;
            }
          }
          // If recoverSession returned null (explicitly invalid or cleared on 404)
          setIsSessionRecovering(false);
        } catch (recErr) {
          console.warn('Session recovery connection failure:', recErr.message);
          setSessionRecoveryError('Could not reach tournament server to restore active match.');
          setIsSessionRecovering(false);
          return;
        }
      } else {
        setIsSessionRecovering(false);
      }

      // Default idle state
      if (effectiveActiveEvent) {
        setGameState((prev) => ({
          ...prev,
          status: 'idle',
          currentQuestionIndex: 0,
          currentQuestion: effectiveActiveEvent.questions?.[0] || null,
          placedComponents: {}
        }));
      }
    } catch (e) {
      console.error('Initialization error:', e);
      setIsSessionRecovering(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadInitialData();
    if (adminAuth.isAuthenticated || viewMode === 'admin') {
      refreshAdminData();
    }
  }, [loadInitialData, refreshAdminData, adminAuth.isAuthenticated, viewMode]);

  // --------------------------------------------------------------------------
  // PLAYER ACTIONS
  // --------------------------------------------------------------------------
  const handleStartGame = useCallback(
    async (playerInfo) => {
      if (settings?.eventStatus === 'CLOSED') {
        showToast('Tournament Closed', 'The tournament is currently closed for matches.', 'info', 3500);
        return;
      }
      if (settings?.eventStatus === 'PAUSED') {
        showToast('Tournament Paused', 'New match registrations are temporarily paused.', 'info', 3500);
        return;
      }

      try {
        const sessionData = await apiService.startSession(
          playerInfo.name,
          playerInfo.regNo,
          activeEvent?.id
        );

        const initialPlaced = {};
        if (sessionData.currentQuestion && sessionData.currentQuestion.slots) {
          sessionData.currentQuestion.slots.forEach((s) => {
            initialPlaced[s.id] = null;
          });
        }

        if (sessionData.event) {
          setActiveEvent(sessionData.event);
        }

        const totalQ = Number(
          sessionData.totalQuestions ||
          sessionData.event?.totalQuestions ||
          activeEvent?.totalQuestions ||
          activeEvent?.questions?.length ||
          1
        );

        setGameState({
          sessionId: sessionData.sessionId,
          player: sessionData.player,
          status: 'running',
          currentQuestionIndex: sessionData.currentQuestionIndex || 0,
          currentQuestion: sessionData.currentQuestion,
          totalQuestions: totalQ > 0 ? totalQ : 1,
          event: sessionData.event || activeEvent,
          placedComponents: initialPlaced,
          wrongAttempts: 0,
          penaltySeconds: 0,
          totalWrongAttempts: 0,
          totalPenaltySeconds: 0,
          startedAt: sessionData.startedAt,
          startTime: sessionData.startTime || Date.now(),
          isQuestionCompleted: false,
          nextQuestion: null,
          lastAction: null,
          result: null
        });

        soundEngine.playClick();
        showToast(
          'Circuit Challenge Initialized',
          `Event: ${sessionData.event?.name || activeEvent?.name || 'Tournament'} (${totalQ} stages).`,
          'info',
          3500
        );
      } catch (err) {
        showToast('Registration Error', err.message || 'Could not start game session.', 'error', 4000);
      }
    },
    [settings?.eventStatus, activeEvent, showToast]
  );

  const handleAttemptPlacement = useCallback(
    async (componentId, slotId, question) => {
      const activeQuestion = gameState.currentQuestion || question;
      if (!gameState.sessionId || !activeQuestion || isPlacementPending) {
        return;
      }

      // If slot is already placed, ignore
      if (gameState.placedComponents[slotId]) {
        return;
      }

      setIsPlacementPending(true);

      try {
        // Authoritative question identifier provided directly by backend session
        const qIdentifier = activeQuestion.id || activeQuestion.customId;
        const outcome = await apiService.attemptPlacement(
          gameState.sessionId,
          qIdentifier,
          slotId,
          componentId
        );

        if (outcome.correct) {
          soundEngine.playSnap();
          const component = COMPONENTS_MAP[componentId];
          const slot = activeQuestion?.slots?.find((s) => s.id === slotId || s.customId === slotId);

          const updatedPlaced = {
            ...gameState.placedComponents,
            [slotId]: componentId
          };

          const allSlots = activeQuestion.slots || [];
          const allFilled = allSlots.length > 0 && allSlots.every((s) => Boolean(updatedPlaced[s.id]));

          // Update placed sockets in UI state immediately (DO NOT set isQuestionCompleted here)
          setGameState((prev) => ({
            ...prev,
            placedComponents: updatedPlaced,
            lastAction: { type: 'CORRECT_PLACEMENT', slotId, componentId }
          }));

          showToast(
            'Socket Connected',
            `${component?.name || componentId} → ${slot?.label || slotId}`,
            'success',
            2000
          );

          // ONLY when all slots are completed, submit completion to backend authoritative engine
          if (allFilled) {
            try {
              const compRes = await apiService.completeQuestion(gameState.sessionId, qIdentifier);

              soundEngine.playVictory();

              if (compRes.hasNextQuestion && compRes.nextQuestion) {
                // Intermediate stage advancement confirmed by backend
                setGameState((prev) => ({
                  ...prev,
                  nextQuestion: compRes.nextQuestion,
                  isQuestionCompleted: true,
                  totalWrongAttempts: compRes.wrongAttemptsTotal ?? prev.totalWrongAttempts,
                  totalPenaltySeconds: compRes.penaltySecondsTotal ?? prev.totalPenaltySeconds,
                  wrongAttempts: compRes.wrongAttemptsTotal ?? prev.wrongAttempts,
                  penaltySeconds: compRes.penaltySecondsTotal ?? prev.penaltySeconds
                }));

                showToast(
                  'STAGE COMPLETED!',
                  `Question ${gameState.currentQuestionIndex + 1} circuit verified. Ready for next stage!`,
                  'success',
                  3500
                );
              } else {
                // Final tournament stage complete (no next_question) -> Fetch official result from backend
                try {
                  const finishRes = await apiService.finishSession(gameState.sessionId);
                  soundEngine.playVictory();
                  setGameState((prev) => ({
                    ...prev,
                    status: 'completed',
                    isQuestionCompleted: true,
                    nextQuestion: null,
                    result: {
                      rawTimeMs: finishRes.rawTimeMs,
                      rawTimeFormatted: formatTime(finishRes.rawTimeMs),
                      wrongAttempts: finishRes.totalWrongAttempts,
                      penaltySeconds: finishRes.totalPenaltySeconds,
                      penaltyFormatted: `+${finishRes.totalPenaltySeconds}s`,
                      finalTimeMs: finishRes.finalTimeMs,
                      finalTimeFormatted: formatTime(finishRes.finalTimeMs),
                      rank: finishRes.rank
                    }
                  }));

                  showToast(
                    'CHAMPIONSHIP CIRCUIT COMPLETE!',
                    'All stages completed! Performance telemetry logged.',
                    'success',
                    5000
                  );
                } catch (finishErr) {
                  console.error('Session finish error:', finishErr);
                  setGameState((prev) => ({
                    ...prev,
                    status: 'completed',
                    isQuestionCompleted: true,
                    nextQuestion: null
                  }));
                  showToast(
                    'Match Completed',
                    'All tournament circuits completed successfully!',
                    'success',
                    4000
                  );
                }
              }
            } catch (compErr) {
              console.error('Stage completion sync error:', compErr);
              // On error, player remains safely on active question without showing false victory
              showToast(
                'Stage Completion Sync Error',
                compErr.message || 'Could not verify stage completion with server.',
                'error',
                4000
              );
            }
          }
        } else {
          // Incorrect placement
          soundEngine.playError();
          const component = COMPONENTS_MAP[componentId];
          const slot = activeQuestion?.slots?.find((s) => s.id === slotId || s.customId === slotId);

          setGameState((prev) => ({
            ...prev,
            totalWrongAttempts: outcome.wrongAttemptsTotal,
            totalPenaltySeconds: outcome.penaltySecondsTotal,
            wrongAttempts: outcome.wrongAttemptsTotal,
            penaltySeconds: outcome.penaltySecondsTotal,
            lastAction: { type: 'WRONG_PLACEMENT', slotId, componentId }
          }));

          showToast(
            `Wrong Component! (+${outcome.penaltyApplied || 5}s Penalty)`,
            `${component?.name || componentId} does not match ${slot?.label || slotId}.`,
            'error',
            3500
          );
        }
      } catch (err) {
        showToast('Placement Error', err.message || 'Validation request failed.', 'error', 3000);
      } finally {
        setIsPlacementPending(false);
      }
    },
    [
      gameState.sessionId,
      gameState.currentQuestion,
      gameState.placedComponents,
      gameState.currentQuestionIndex,
      isPlacementPending,
      showToast
    ]
  );

  const handleAdvanceToNextQuestion = useCallback(() => {
    if (!gameState.nextQuestion) {
      return;
    }

    const nextQ = gameState.nextQuestion;
    const initialPlaced = {};
    if (nextQ && nextQ.slots) {
      nextQ.slots.forEach((s) => {
        initialPlaced[s.id] = null;
      });
    }

    soundEngine.playClick();
    setGameState((prev) => ({
      ...prev,
      currentQuestionIndex: prev.currentQuestionIndex + 1,
      currentQuestion: nextQ,
      totalQuestions: prev.totalQuestions,
      placedComponents: initialPlaced,
      isQuestionCompleted: false,
      nextQuestion: null,
      lastAction: null
    }));
  }, [gameState.nextQuestion]);

  const handlePlayAgain = useCallback(async () => {
    apiService.clearSessionId();
    if (activeEvent) {
      handleStartGame(gameState.player);
    } else {
      setGameState((prev) => ({
        ...prev,
        status: 'idle',
        sessionId: null,
        result: null
      }));
    }
  }, [activeEvent, gameState.player, handleStartGame]);

  const handleBackToHome = useCallback(() => {
    apiService.clearSessionId();
    setGameState((prev) => ({
      ...prev,
      status: 'idle',
      sessionId: null,
      currentQuestionIndex: 0,
      currentQuestion: activeEvent?.questions?.[0] || null,
      placedComponents: {},
      result: null
    }));
    soundEngine.playClick();
  }, [activeEvent]);

  const handleResetGame = useCallback(() => {
    if (gameState.status === 'running') {
      const confirmReset = window.confirm(
        'Are you sure you want to restart this match? Progress and elapsed time will be reset.'
      );
      if (!confirmReset) return;
    }
    apiService.clearSessionId();
    setGameState((prev) => ({
      ...prev,
      status: 'idle',
      sessionId: null,
      currentQuestionIndex: 0,
      currentQuestion: activeEvent?.questions?.[0] || null,
      placedComponents: {},
      wrongAttempts: 0,
      penaltySeconds: 0,
      totalWrongAttempts: 0,
      totalPenaltySeconds: 0,
      startedAt: null,
      startTime: null,
      isQuestionCompleted: false,
      nextQuestion: null,
      lastAction: null,
      result: null
    }));
  }, [gameState.status, activeEvent]);

  const handleToggleSound = useCallback(() => {
    const next = soundEngine.toggleSound();
    setIsSoundEnabled(next);
  }, []);

  // --------------------------------------------------------------------------
  // ADMIN ACTIONS
  // --------------------------------------------------------------------------
  const handleAdminLogin = async (user, pass) => {
    try {
      const res = await apiService.loginAdmin(user, pass);
      setAdminAuth({ isAuthenticated: true, user: res.user });
      await refreshAdminData();
      showToast('Admin Authenticated', `Logged in as ${res.user.username}`, 'success', 3000);
      return { success: true };
    } catch (err) {
      showToast('Login Failed', err.message || 'Invalid credentials.', 'error', 3500);
      return { success: false, error: err.message };
    }
  };

  const handleAdminLogout = () => {
    apiService.logoutAdmin();
    setAdminAuth({ isAuthenticated: false, user: null });
    showToast('Logged Out', 'Admin session terminated.', 'info', 2500);
  };

  const handleActivateEvent = async (id) => {
    try {
      await apiService.activateAdminEvent(id);
      await refreshAdminData();
      showToast('Event Activated', `Event ${id} is now active for all player matches.`, 'success', 3000);
    } catch (e) {
      activateEvent(id);
      refreshAdminData();
      showToast('Event Activated', `Event ${id} activated.`, 'success', 3000);
    }
  };

  const handleDeactivateEvent = async (id) => {
    try {
      await apiService.deactivateAdminEvent(id);
      await refreshAdminData();
      showToast('Event Deactivated', `Event ${id} set to INACTIVE.`, 'info', 2500);
    } catch (e) {
      deactivateEvent(id);
      refreshAdminData();
    }
  };

  const handleSaveEvent = async (eventData) => {
    try {
      if (events.some((e) => e.id === eventData.id || e.customId === eventData.id)) {
        await apiService.updateAdminEvent(eventData.id, eventData);
      } else {
        await apiService.createAdminEvent(eventData);
      }
      await refreshAdminData();
      showToast('Event Saved', `Event ${eventData.id || eventData.name} saved successfully.`, 'success', 3000);
    } catch (e) {
      saveEvent(eventData);
      refreshAdminData();
    }
  };

  const handleDuplicateEvent = (id) => {
    const dup = duplicateEvent(id);
    refreshAdminData();
    if (dup) {
      showToast('Event Duplicated', `Created copy: ${dup.id}`, 'info', 3000);
    }
  };

  const handleDeleteEvent = async (id) => {
    try {
      await apiService.deleteAdminEvent(id);
      await refreshAdminData();
      showToast('Event Deleted', `Event ${id} removed.`, 'info', 3000);
    } catch (e) {
      deleteEvent(id);
      refreshAdminData();
    }
  };

  const handleSaveQuestionInEvent = async (eventId, questionData) => {
    try {
      const event = events.find((e) => e.id === eventId);
      const existingQ = event?.questions?.find((q) => q.id === questionData.id || q.customId === questionData.id);
      if (existingQ) {
        await apiService.updateAdminQuestion(eventId, questionData.id, questionData);
        showToast('Question Updated', `Stage ${questionData.name} saved.`, 'success', 2500);
      } else {
        await apiService.createAdminQuestion(eventId, questionData);
        showToast('Question Created', `Stage ${questionData.name} added.`, 'success', 2500);
      }
      await refreshAdminData();
    } catch (e) {
      const event = events.find((e) => e.id === eventId);
      const existingQ = event?.questions?.find((q) => q.id === questionData.id);
      if (existingQ) {
        updateQuestionInEvent(eventId, questionData);
      } else {
        addQuestionToEvent(eventId, questionData);
      }
      refreshAdminData();
    }
  };

  const handleDeleteQuestionFromEvent = async (eventId, questionId) => {
    try {
      await apiService.deleteAdminQuestion(eventId, questionId);
      await refreshAdminData();
      showToast('Question Removed', `Question ${questionId} removed.`, 'info', 2500);
    } catch (e) {
      deleteQuestionFromEvent(eventId, questionId);
      refreshAdminData();
    }
  };

  const handleDuplicateQuestionInEvent = (eventId, questionId) => {
    const dup = duplicateQuestionInEvent(eventId, questionId);
    refreshAdminData();
    if (dup) {
      showToast('Question Duplicated', `Created copy: ${dup.id}`, 'info', 2500);
    }
  };

  const handleReorderQuestionsInEvent = (eventId, newQuestions) => {
    reorderQuestionsInEvent(eventId, newQuestions);
    refreshAdminData();
    showToast('Stages Reordered', 'Question sequence updated.', 'info', 2000);
  };

  const handleImportQuestionsInEvent = async (eventId, newQuestions, file) => {
    try {
      if (apiService.getAdminToken() && file) {
        await apiService.uploadQuestionsCSV(file, eventId);
        await refreshAdminData();
        showToast(
          'Questions Imported',
          `Questions and sockets imported successfully into Event ${eventId}.`,
          'success',
          3500
        );
        return;
      }
      importQuestionsIntoEvent(eventId, newQuestions);
      refreshAdminData();
      showToast(
        'Questions Imported',
        `Imported ${newQuestions.length} question(s) into Event ${eventId}.`,
        'success',
        3500
      );
    } catch (e) {
      showToast('Import Error', e.message, 'error', 4000);
    }
  };

  const handleImportEvents = async (importedList, file) => {
    try {
      if (apiService.getAdminToken() && file) {
        await apiService.uploadEventsCSV(file);
        await refreshAdminData();
        showToast(
          'Bulk Import Successful',
          `Events, questions, and sockets imported successfully into database.`,
          'success',
          4000
        );
        return;
      }
      importEventsData(importedList);
      refreshAdminData();
      showToast(
        'Bulk Import Successful',
        `Imported ${importedList.length} event(s) into database.`,
        'success',
        4000
      );
    } catch (e) {
      showToast('Import Error', e.message, 'error', 4000);
    }
  };

  const handleSaveSettings = async (newSettings) => {
    try {
      await apiService.updateAdminSettings(newSettings);
      await refreshAdminData();
      showToast('Settings Updated', 'Global tournament configuration saved to server.', 'success', 3000);
    } catch (e) {
      saveSettings(newSettings);
      refreshAdminData();
    }
  };

  // --------------------------------------------------------------------------
  // RENDER DISPATCHER
  // --------------------------------------------------------------------------
  if (viewMode === 'admin') {
    if (!adminAuth.isAuthenticated) {
      return (
        <div className="app-layout">
          <div className="bg-grid-overlay" aria-hidden="true"></div>
          <AdminLogin
            onLogin={handleAdminLogin}
            onExitToPlayer={() => setViewMode('player')}
          />
          <ToastNotification toast={toast} onDismiss={dismissToast} />
        </div>
      );
    }

    return (
      <div className="admin-app-root">
        <AdminLayout
          adminUser={adminAuth.user}
          events={events}
          activeEvent={activeEvent}
          participants={participants}
          results={results}
          settings={settings}
          onActivateEvent={handleActivateEvent}
          onDeactivateEvent={handleDeactivateEvent}
          onSaveEvent={handleSaveEvent}
          onDuplicateEvent={handleDuplicateEvent}
          onDeleteEvent={handleDeleteEvent}
          onSaveQuestionInEvent={handleSaveQuestionInEvent}
          onDeleteQuestionFromEvent={handleDeleteQuestionFromEvent}
          onDuplicateQuestionInEvent={handleDuplicateQuestionInEvent}
          onReorderQuestionsInEvent={handleReorderQuestionsInEvent}
          onImportQuestionsInEvent={handleImportQuestionsInEvent}
          onImportEvents={handleImportEvents}
          onSaveSettings={handleSaveSettings}
          onLogout={handleAdminLogout}
          onExitToPlayer={() => setViewMode('player')}
          onRefresh={refreshAdminData}
        />
        <ToastNotification toast={toast} onDismiss={dismissToast} />
      </div>
    );
  }

  // PLAYER SIDE
  return (
    <div className="app-layout">
      <div className="bg-grid-overlay" aria-hidden="true"></div>

      {/* Global Header */}
      <Header
        isSoundEnabled={isSoundEnabled}
        onToggleSound={handleToggleSound}
        onOpenRules={() => setIsRulesOpen(false)}
        onResetGame={handleResetGame}
        onOpenAdmin={() => setViewMode('admin')}
        isGameActive={gameState.status !== 'idle'}
        activeEvent={activeEvent}
      />

      {/* Main Content View */}
      <main className="main-content">
        {isSessionRecovering ? (
          <div className="flex flex-col items-center justify-center min-h-[55vh] text-center p-8 bg-[#0a0f1d]/80 rounded-2xl border border-cyan-500/20 backdrop-blur-xl shadow-2xl max-w-lg mx-auto my-12 animate-pulse">
            <div className="w-14 h-14 rounded-full border-4 border-cyan-500/20 border-t-cyan-400 animate-spin mb-6 shadow-[0_0_20px_rgba(6,182,212,0.4)]"></div>
            <h2 className="text-xl font-mono font-bold tracking-wider text-cyan-400 mb-2 flex items-center gap-2">
              <Zap className="w-5 h-5 animate-bounce" /> RESTORING ACTIVE MATCH...
            </h2>
            <p className="text-sm text-slate-300 font-mono">
              Synchronizing authoritative circuit state with server telemetry
            </p>
          </div>
        ) : sessionRecoveryError ? (
          <div className="flex flex-col items-center justify-center min-h-[55vh] text-center p-8 bg-[#180e15]/90 rounded-2xl border border-rose-500/30 backdrop-blur-xl shadow-2xl max-w-lg mx-auto my-12">
            <div className="w-14 h-14 rounded-full bg-rose-500/10 border border-rose-500/40 flex items-center justify-center mb-6 text-rose-400 font-bold text-2xl">
              !
            </div>
            <h2 className="text-xl font-mono font-bold tracking-wider text-rose-400 mb-2">
              SESSION SYNC PAUSED
            </h2>
            <p className="text-sm text-slate-300 font-mono mb-6">
              {sessionRecoveryError}
            </p>
            <div className="flex gap-4">
              <button
                type="button"
                onClick={loadInitialData}
                className="px-5 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold font-mono text-sm transition-all shadow-[0_0_15px_rgba(6,182,212,0.3)]"
              >
                Retry Sync
              </button>
              <button
                type="button"
                onClick={() => {
                  apiService.clearSessionId();
                  setSessionRecoveryError(null);
                }}
                className="px-5 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-sm border border-slate-700 transition-all"
              >
                New Match
              </button>
            </div>
          </div>
        ) : gameState.status === 'idle' ? (
          <Home
            activeEvent={activeEvent}
            settings={settings}
            serverSyncError={serverSyncError}
            onRetry={loadInitialData}
            onStartGame={handleStartGame}
          />
        ) : (
          <Game
            gameState={gameState}
            event={activeEvent}
            timerData={timerData}
            onAttemptPlacement={handleAttemptPlacement}
            onAdvanceToNextQuestion={handleAdvanceToNextQuestion}
          />
        )}
      </main>

      {/* Result Completion Modal */}
      {gameState.status === 'completed' && gameState.result && (
        <ResultModal
          result={gameState.result}
          player={gameState.player}
          sessionId={gameState.sessionId}
          onPlayAgain={handlePlayAgain}
          onBackToHome={handleBackToHome}
        />
      )}

      {/* Wiring & Schematic Guide */}
      <RulesModal
        isOpen={isRulesOpen}
        event={activeEvent}
        currentQuestion={gameState.currentQuestion}
        onClose={() => setIsRulesOpen(false)}
      />

      {/* Real-Time Toast Notifications */}
      <ToastNotification toast={toast} onDismiss={dismissToast} />
    </div>
  );
}

export default App;
