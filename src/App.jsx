import React, { useState, useEffect, useCallback, useRef } from 'react';
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

  // Player Game State with Authoritative Recovery
  const [gameState, setGameState] = useState({
    sessionId: null,
    player: { name: '', regNo: '' },
    status: 'idle', // 'idle' | 'running' | 'completed'
    currentQuestionIndex: 0,
    currentQuestion: null,
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
  // INITIAL DATA & SESSION RECOVERY
  // --------------------------------------------------------------------------
  const loadInitialData = useCallback(async () => {
    try {
      // 1. Fetch live tournament settings
      try {
        const liveSettings = await apiService.getSettings();
        if (liveSettings) {
          setSettings(liveSettings);
        }
      } catch (err) {
        console.warn('Could not fetch remote settings, using local fallback:', err.message);
      }

      // 2. Fetch active event from backend
      let remoteActiveEvent = null;
      try {
        remoteActiveEvent = await apiService.getActiveEvent();
      } catch (err) {
        console.warn('Could not fetch remote active event:', err.message);
      }

      const effectiveActiveEvent = remoteActiveEvent || getLocalActiveEvent() || null;
      setActiveEvent(effectiveActiveEvent);

      // 3. Attempt Authoritative Session Recovery
      const savedSessionId = apiService.getSavedSessionId();
      if (savedSessionId) {
        try {
          const recovered = await apiService.recoverSession(savedSessionId);
          if (recovered && recovered.sessionId) {
            const placedMap = {};
            if (recovered.currentQuestion && recovered.currentQuestion.slots) {
              recovered.currentQuestion.slots.forEach((s) => {
                placedMap[s.id] = recovered.placedSocketIds.includes(s.id) ? (s.customId || s.id) : null;
              });
            }

            if (recovered.status === 'running') {
              setGameState({
                sessionId: recovered.sessionId,
                player: recovered.player,
                status: 'running',
                currentQuestionIndex: recovered.currentQuestionIndex,
                currentQuestion: recovered.currentQuestion,
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
                apiService.clearSessionId();
              }
              return;
            }
          }
        } catch (recErr) {
          console.warn('Session recovery failed:', recErr.message);
          apiService.clearSessionId();
        }
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
    }
  }, [showToast]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // Refresh admin data
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

    setParticipants(getParticipants());
  }, []);

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

        setGameState({
          sessionId: sessionData.sessionId,
          player: sessionData.player,
          status: 'running',
          currentQuestionIndex: sessionData.currentQuestionIndex || 0,
          currentQuestion: sessionData.currentQuestion,
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
        const totalQ = sessionData.totalQuestions || activeEvent?.questions?.length || 1;
        showToast(
          'Circuit Challenge Initialized',
          `Event: ${activeEvent?.name || 'Round 1'} (${totalQ} stages).`,
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
      if (!gameState.sessionId || !question || isPlacementPending) {
        return;
      }

      // If slot is already placed, ignore
      if (gameState.placedComponents[slotId]) {
        return;
      }

      setIsPlacementPending(true);

      try {
        const outcome = await apiService.attemptPlacement(
          gameState.sessionId,
          question.id,
          slotId,
          componentId
        );

        if (outcome.correct) {
          soundEngine.playSnap();
          const component = COMPONENTS_MAP[componentId];
          const slot = question?.slots?.find((s) => s.id === slotId);

          const updatedPlaced = {
            ...gameState.placedComponents,
            [slotId]: componentId
          };

          const allSlots = question.slots || [];
          const allFilled = allSlots.every((s) => Boolean(updatedPlaced[s.id]));

          setGameState((prev) => ({
            ...prev,
            placedComponents: updatedPlaced,
            lastAction: { type: 'CORRECT_PLACEMENT', slotId, componentId },
            isQuestionCompleted: allFilled
          }));

          showToast(
            'Socket Connected',
            `${component?.name || componentId} → ${slot?.label || slotId}`,
            'success',
            2000
          );

          if (allFilled) {
            soundEngine.playVictory();
            try {
              const compRes = await apiService.completeQuestion(gameState.sessionId, question.id);
              if (compRes.hasNextQuestion) {
                setGameState((prev) => ({
                  ...prev,
                  nextQuestion: compRes.nextQuestion,
                  isQuestionCompleted: true
                }));
                showToast(
                  'STAGE COMPLETED!',
                  `Question ${gameState.currentQuestionIndex + 1} circuit verified. Ready for next stage!`,
                  'success',
                  3500
                );
              } else if (compRes.eventCompleted) {
                // Final session finish
                const finishRes = await apiService.finishSession(gameState.sessionId);
                soundEngine.playVictory();
                setGameState((prev) => ({
                  ...prev,
                  status: 'completed',
                  isQuestionCompleted: true,
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
              }
            } catch (compErr) {
              console.error('Stage completion error:', compErr);
            }
          }
        } else {
          // Incorrect placement
          soundEngine.playError();
          const component = COMPONENTS_MAP[componentId];
          const slot = question?.slots?.find((s) => s.id === slotId);

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
    [gameState.sessionId, gameState.placedComponents, gameState.currentQuestionIndex, isPlacementPending, showToast]
  );

  const handleAdvanceToNextQuestion = useCallback(() => {
    if (!gameState.nextQuestion && !activeEvent?.questions?.[gameState.currentQuestionIndex + 1]) {
      return;
    }

    const nextQ = gameState.nextQuestion || activeEvent.questions[gameState.currentQuestionIndex + 1];
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
      placedComponents: initialPlaced,
      isQuestionCompleted: false,
      nextQuestion: null,
      lastAction: null
    }));
  }, [gameState.nextQuestion, gameState.currentQuestionIndex, activeEvent]);

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
        {gameState.status === 'idle' ? (
          <Home
            activeEvent={activeEvent}
            settings={settings}
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
