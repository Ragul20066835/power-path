/**
 * POWERPATH Phase 5 High-Concurrency & Load Test Suite
 * Measures latency percentiles (p50, p95, p99, max), throughput, race conditions,
 * heartbeat load, admin live monitor performance, and full DB integrity for 10, 25, and 50 simultaneous players.
 */

const BASE_URL = 'http://127.0.0.1:8000';

// Timing collector for percentile calculation
class MetricsCollector {
  constructor(name) {
    this.name = name;
    this.latencies = [];
    this.successCount = 0;
    this.failureCount = 0;
    this.timeoutCount = 0;
    this.statusCounts = {};
    this.errors = [];
    this.startTime = 0;
    this.endTime = 0;
  }

  start() {
    this.startTime = performance.now();
  }

  record(latencyMs, status, error = null) {
    this.latencies.push(latencyMs);
    this.statusCounts[status] = (this.statusCounts[status] || 0) + 1;

    if (status >= 200 && status < 300) {
      this.successCount++;
    } else {
      this.failureCount++;
      if (error) this.errors.push(error);
    }
  }

  recordTimeout(error) {
    this.timeoutCount++;
    this.failureCount++;
    this.errors.push(error);
  }

  stop() {
    this.endTime = performance.now();
    this.latencies.sort((a, b) => a - b);
  }

  get totalDurationMs() {
    return this.endTime - this.startTime;
  }

  getPercentile(p) {
    if (this.latencies.length === 0) return 0;
    const idx = Math.min(
      Math.floor((p / 100) * this.latencies.length),
      this.latencies.length - 1
    );
    return this.latencies[idx];
  }

  get stats() {
    const p50 = this.getPercentile(50);
    const p95 = this.getPercentile(95);
    const p99 = this.getPercentile(99);
    const max = this.latencies.length > 0 ? this.latencies[this.latencies.length - 1] : 0;
    const avg = this.latencies.length > 0 ? (this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length) : 0;
    const http4xx = Object.entries(this.statusCounts)
      .filter(([code]) => code.startsWith('4'))
      .reduce((sum, [, count]) => sum + count, 0);
    const http5xx = Object.entries(this.statusCounts)
      .filter(([code]) => code.startsWith('5'))
      .reduce((sum, [, count]) => sum + count, 0);

    return {
      name: this.name,
      totalRequests: this.latencies.length,
      successCount: this.successCount,
      failureCount: this.failureCount,
      timeoutCount: this.timeoutCount,
      p50: Number(p50.toFixed(2)),
      p95: Number(p95.toFixed(2)),
      p99: Number(p99.toFixed(2)),
      max: Number(max.toFixed(2)),
      avg: Number(avg.toFixed(2)),
      totalDurationMs: Number(this.totalDurationMs.toFixed(2)),
      http4xx,
      http5xx,
      statusCounts: this.statusCounts,
      errors: this.errors
    };
  }
}

async function timedFetch(path, options = {}, timeoutMs = 15000) {
  const url = `${BASE_URL}${path}`;
  const t0 = performance.now();
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    const latency = performance.now() - t0;
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return { status: res.status, ok: res.ok, latency, data };
  } catch (err) {
    clearTimeout(id);
    const latency = performance.now() - t0;
    return { status: err.name === 'AbortError' ? 408 : 599, ok: false, latency, error: err.message };
  }
}

// Ensure an active event exists for testing
async function setupActiveTournamentEvent() {
  // Login as admin
  const loginRes = await timedFetch('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'AdminPassword123!' })
  });

  let adminToken = loginRes.ok ? loginRes.data.access_token : null;
  if (!adminToken) {
    const seedLogin = await timedFetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'testadmin', password: 'AdminPassword123!' })
    });
    adminToken = seedLogin.data?.access_token;
  }

  const customEventId = `LOAD_TEST_EVT_${Date.now()}`;
  const eventPayload = {
    custom_id: customEventId,
    name: 'High-Concurrency Load Arena',
    description: 'Automated 50-player concurrency test arena',
    status: 'ACTIVE',
    questions: [
      {
        custom_id: 'Q_CONCUR_1',
        name: 'Stage 1 - Power & Ground',
        difficulty: 'Easy',
        penalty_seconds: 5,
        question_order: 1,
        sockets: [
          { custom_id: 'S1', label: 'SOURCE', accepted_component_id: 'battery', hint: '9V Battery' },
          { custom_id: 'S2', label: 'GROUND', accepted_component_id: 'ground', hint: 'Earth 0V' }
        ]
      },
      {
        custom_id: 'Q_CONCUR_2',
        name: 'Stage 2 - Protection & Output',
        difficulty: 'Medium',
        penalty_seconds: 5,
        question_order: 2,
        sockets: [
          { custom_id: 'S1', label: 'LIMITER', accepted_component_id: 'resistor', hint: '330Ω Resistor' },
          { custom_id: 'S2', label: 'LOAD', accepted_component_id: 'led', hint: 'Red LED' }
        ]
      }
    ]
  };

  const createRes = await timedFetch('/api/v1/admin/events', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`
    },
    body: JSON.stringify(eventPayload)
  });

  return { eventId: createRes.data.id, adminToken };
}

/**
 * Simulates a full, realistic contestant lifecycle:
 * 1. Start Session
 * 2. State Recovery (GET session)
 * 3. Stage 1: 1 Wrong placement (+5s penalty), 2 Correct placements
 * 4. Stage 1: Complete question
 * 5. Stage 2: 1 Wrong placement (+5s penalty), 2 Correct placements
 * 6. Stage 2: Complete question
 * 7. Finish Session
 * 8. Result Verification
 */
async function simulatePlayer(playerIndex, eventId, metrics, batchPrefix = 'LOAD') {
  const regNo = `REG-${batchPrefix}-${String(playerIndex).padStart(3, '0')}`;
  const playerName = `Contestant_${batchPrefix}_${playerIndex}`;
  const sessionLog = {
    playerIndex,
    batchPrefix,
    regNo,
    playerName,
    stepsSuccess: true,
    wrongAttemptsExpected: 2,
    penaltiesExpected: 10,
    errors: []
  };

  // 1. Session Start
  const startRes = await timedFetch('/api/v1/game/session/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ player_name: playerName, register_number: regNo, event_id: eventId })
  });
  metrics.record(startRes.latency, startRes.status);
  if (!startRes.ok) {
    sessionLog.stepsSuccess = false;
    sessionLog.errors.push(`Start failed: HTTP ${startRes.status}`);
    return sessionLog;
  }

  const session = startRes.data;
  const sessionId = session.session_id;
  const q1 = session.current_question;
  const q1_s1 = q1.sockets[0].id;
  const q1_s2 = q1.sockets[1].id;

  // 2. Fetch Session State (Recovery)
  const recRes = await timedFetch(`/api/v1/game/session/${sessionId}`);
  metrics.record(recRes.latency, recRes.status);
  if (!recRes.ok || recRes.data.session_id !== sessionId) {
    sessionLog.stepsSuccess = false;
    sessionLog.errors.push('Session recovery failed');
  }

  // 3. Stage 1 Wrong Placement (voltmeter on S1 -> +5s penalty)
  const wrong1 = await timedFetch('/api/v1/game/placement/attempt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, question_id: q1.id, socket_id: q1_s1, component_id: 'voltmeter' })
  });
  metrics.record(wrong1.latency, wrong1.status);
  if (!wrong1.ok || wrong1.data.correct !== false) {
    sessionLog.stepsSuccess = false;
    sessionLog.errors.push('Stage 1 wrong placement rejection failed');
  }

  // 4. Stage 1 Correct S1 Placement (battery)
  const right1 = await timedFetch('/api/v1/game/placement/attempt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, question_id: q1.id, socket_id: q1_s1, component_id: '9V Battery' })
  });
  metrics.record(right1.latency, right1.status);
  if (!right1.ok || right1.data.correct !== true) {
    sessionLog.stepsSuccess = false;
    sessionLog.errors.push('Stage 1 correct S1 placement failed');
  }

  // 5. Stage 1 Correct S2 Placement (ground)
  const right2 = await timedFetch('/api/v1/game/placement/attempt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, question_id: q1.id, socket_id: q1_s2, component_id: 'Earth 0V' })
  });
  metrics.record(right2.latency, right2.status);
  if (!right2.ok || right2.data.correct !== true) {
    sessionLog.stepsSuccess = false;
    sessionLog.errors.push('Stage 1 correct S2 ground placement failed');
  }

  // 6. Complete Stage 1
  const q1Done = await timedFetch('/api/v1/game/question/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, question_id: q1.id })
  });
  metrics.record(q1Done.latency, q1Done.status);
  if (!q1Done.ok || !q1Done.data.has_next_question) {
    sessionLog.stepsSuccess = false;
    sessionLog.errors.push('Stage 1 advance failed');
    return sessionLog;
  }

  const q2 = q1Done.data.next_question;
  const q2_s1 = q2.sockets[0].id;
  const q2_s2 = q2.sockets[1].id;

  // 7. Stage 2 Wrong Placement (ammeter on S1 -> +5s penalty)
  const wrong2 = await timedFetch('/api/v1/game/placement/attempt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, question_id: q2.id, socket_id: q2_s1, component_id: 'ammeter' })
  });
  metrics.record(wrong2.latency, wrong2.status);
  if (!wrong2.ok || wrong2.data.correct !== false) {
    sessionLog.stepsSuccess = false;
    sessionLog.errors.push('Stage 2 wrong placement rejection failed');
  }

  // 8. Stage 2 Correct S1 Placement (resistor)
  const right3 = await timedFetch('/api/v1/game/placement/attempt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, question_id: q2.id, socket_id: q2_s1, component_id: 'Resistor 330Ω' })
  });
  metrics.record(right3.latency, right3.status);

  // 9. Stage 2 Correct S2 Placement (led)
  const right4 = await timedFetch('/api/v1/game/placement/attempt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, question_id: q2.id, socket_id: q2_s2, component_id: 'LED' })
  });
  metrics.record(right4.latency, right4.status);

  // 10. Complete Stage 2
  const q2Done = await timedFetch('/api/v1/game/question/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, question_id: q2.id })
  });
  metrics.record(q2Done.latency, q2Done.status);

  // 11. Finish Session
  const finishRes = await timedFetch('/api/v1/game/session/finish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId })
  });
  metrics.record(finishRes.latency, finishRes.status);
  if (!finishRes.ok) {
    sessionLog.stepsSuccess = false;
    sessionLog.errors.push('Finish session failed');
    return sessionLog;
  }

  const result = finishRes.data;
  sessionLog.result = result;
  sessionLog.sessionId = sessionId;

  // Integrity checks on returned result
  if (result.total_wrong_attempts !== 2 || result.total_penalty_seconds !== 10) {
    sessionLog.stepsSuccess = false;
    sessionLog.errors.push(`Penalty mismatch: got ${result.total_penalty_seconds}s, expected 10s`);
  }
  if (result.final_time_ms !== result.raw_time_ms + 10000) {
    sessionLog.stepsSuccess = false;
    sessionLog.errors.push(`Final time mismatch: raw=${result.raw_time_ms}, final=${result.final_time_ms}`);
  }

  return sessionLog;
}

// Executes a concurrent batch of N players
async function runConcurrentBatch(playerCount, eventId, testName, batchPrefix = 'LOAD') {
  const metrics = new MetricsCollector(testName);
  metrics.start();

  const promises = [];
  for (let i = 1; i <= playerCount; i++) {
    promises.push(simulatePlayer(i, eventId, metrics, batchPrefix));
  }

  const results = await Promise.all(promises);
  metrics.stop();

  const playersSucceeded = results.filter(r => r.stepsSuccess).length;
  const playersFailed = results.filter(r => !r.stepsSuccess).length;

  return {
    playerCount,
    playersSucceeded,
    playersFailed,
    stats: metrics.stats,
    playerResults: results
  };
}

// Test Race Conditions
async function testRaceConditions(eventId) {
  const metrics = new MetricsCollector('Race Condition Stress');
  metrics.start();

  // 1. Simultaneous session start burst (10 identical attempts)
  const regNo = `RACE-${Date.now()}`;
  const startBurst = await Promise.all(
    Array.from({ length: 10 }).map(() =>
      timedFetch('/api/v1/game/session/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_name: 'RaceTester', register_number: regNo, event_id: eventId })
      })
    )
  );
  startBurst.forEach(r => metrics.record(r.latency, r.status));

  // Pick one session for deep race testing
  const validSession = startBurst.find(r => r.ok)?.data;
  if (!validSession) throw new Error('Failed to create session for race testing');

  const sId = validSession.session_id;
  const q1Id = validSession.current_question.id;
  const s1Id = validSession.current_question.sockets[0].id;
  const s2Id = validSession.current_question.sockets[1].id;

  // 2. Rapid concurrent duplicate placement on same socket (10 simultaneous requests)
  const dupPlacementBurst = await Promise.all(
    Array.from({ length: 10 }).map(() =>
      timedFetch('/api/v1/game/placement/attempt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sId, question_id: q1Id, socket_id: s1Id, component_id: 'battery' })
      })
    )
  );
  dupPlacementBurst.forEach(r => metrics.record(r.latency, r.status));

  // Place S2
  await timedFetch('/api/v1/game/placement/attempt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sId, question_id: q1Id, socket_id: s2Id, component_id: 'ground' })
  });

  // 3. Rapid concurrent duplicate question complete calls (10 simultaneous requests)
  const dupCompleteBurst = await Promise.all(
    Array.from({ length: 10 }).map(() =>
      timedFetch('/api/v1/game/question/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sId, question_id: q1Id })
      })
    )
  );
  dupCompleteBurst.forEach(r => metrics.record(r.latency, r.status));

  // Solve Q2
  const q2 = dupCompleteBurst.find(r => r.ok && r.data.next_question)?.data.next_question;
  if (q2) {
    await timedFetch('/api/v1/game/placement/attempt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sId, question_id: q2.id, socket_id: q2.sockets[0].id, component_id: 'resistor' })
    });
    await timedFetch('/api/v1/game/placement/attempt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sId, question_id: q2.id, socket_id: q2.sockets[1].id, component_id: 'led' })
    });
    await timedFetch('/api/v1/game/question/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sId, question_id: q2.id })
    });
  }

  // 4. Rapid concurrent duplicate session finish calls (10 simultaneous requests)
  const dupFinishBurst = await Promise.all(
    Array.from({ length: 10 }).map(() =>
      timedFetch('/api/v1/game/session/finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sId })
      })
    )
  );
  dupFinishBurst.forEach(r => metrics.record(r.latency, r.status));

  metrics.stop();

  const allFinish200 = dupFinishBurst.every(r => r.status === 200);
  const distinctResultIds = new Set(dupFinishBurst.map(r => r.data?.id)).size;

  return {
    stats: metrics.stats,
    duplicatePlacementHandled: dupPlacementBurst.every(r => r.status === 200),
    duplicateCompleteHandled: dupCompleteBurst.every(r => r.status === 200),
    duplicateFinishHandled: allFinish200 && distinctResultIds === 1,
    distinctResultIds
  };
}

// Test Heartbeat Load for 50 Concurrent Players
async function testHeartbeatLoad(sessions) {
  const metrics = new MetricsCollector('50-Player Heartbeat Load');
  metrics.start();

  // Send 3 waves of concurrent heartbeats across all 50 sessions
  for (let wave = 1; wave <= 3; wave++) {
    const wavePromises = sessions.map(s =>
      timedFetch(`/api/v1/game/session/${s.sessionId}/heartbeat`, { method: 'POST' })
    );
    const responses = await Promise.all(wavePromises);
    responses.forEach(r => metrics.record(r.latency, r.status));
    await new Promise(res => setTimeout(res, 50));
  }

  metrics.stop();
  return metrics.stats;
}

// Test Admin Live Monitor under active concurrent load
async function testAdminMonitorUnderLoad(adminToken, eventId) {
  const metrics = new MetricsCollector('Admin Live Monitor Under Load');
  metrics.start();

  const headers = { Authorization: `Bearer ${adminToken}` };
  const requests = Array.from({ length: 15 }).map(() =>
    timedFetch(`/api/v1/admin/monitor/telemetry?event_id=${eventId}`, { headers })
  );

  const responses = await Promise.all(requests);
  responses.forEach(r => metrics.record(r.latency, r.status));
  metrics.stop();

  const firstValid = responses.find(r => r.ok)?.data;
  return {
    stats: metrics.stats,
    activeCount: firstValid?.summary?.active_count,
    completedCount: firstValid?.summary?.completed_count,
    totalCount: firstValid?.summary?.total_count,
    sampleSessionCount: firstValid?.sessions?.length
  };
}

// Deep Database Integrity Verification
async function verifyDatabaseIntegrity(eventId, allBatchesResults, adminToken) {
  const headers = { Authorization: `Bearer ${adminToken}` };
  const leaderboardRes = await timedFetch(`/api/v1/results/leaderboard?event_id=${eventId}&limit=200`, { headers });
  const telemetryRes = await timedFetch(`/api/v1/admin/monitor/telemetry?event_id=${eventId}&limit=200`, { headers });

  const leaderboard = leaderboardRes.data || [];
  const telemetry = telemetryRes.data || { sessions: [] };

  const allSimulated = allBatchesResults.filter(r => r.stepsSuccess);
  const sessionMap = new Map(allSimulated.map(r => [r.sessionId, r]));

  const integrity = {
    totalSessionsCreated: allSimulated.length,
    totalSessionsCompleted: allSimulated.filter(r => r.result).length,
    leaderboardEntries: leaderboard.length,
    duplicateResultsFound: 0,
    duplicateSessionsFound: 0,
    penaltyViolations: 0,
    finalTimeViolations: 0,
    crossPlayerContamination: 0
  };

  // Check individual player results (ResultPublic)
  const resultIds = new Set();
  const sessionResultIds = new Set();

  for (const p of allSimulated) {
    const res = p.result;
    if (!res) continue;

    if (resultIds.has(res.id)) integrity.duplicateResultsFound++;
    resultIds.add(res.id);

    if (sessionResultIds.has(res.session_id)) integrity.duplicateSessionsFound++;
    sessionResultIds.add(res.session_id);

    // Penalty verification on ResultPublic: 2 wrong attempts * 5s = 10s penalty
    if (res.total_wrong_attempts !== 2 || res.total_penalty_seconds !== 10) {
      integrity.penaltyViolations++;
    }

    // Time verification: final_time_ms = raw_time_ms + total_penalty_seconds * 1000
    if (res.final_time_ms !== res.raw_time_ms + (res.total_penalty_seconds * 1000)) {
      integrity.finalTimeViolations++;
    }
  }

  // Check public LeaderboardEntry table consistency
  const leaderboardRegs = new Set();
  for (const entry of leaderboard) {
    if (leaderboardRegs.has(entry.register_number)) {
      integrity.duplicateSessionsFound++;
    }
    leaderboardRegs.add(entry.register_number);

    if (entry.final_time_ms !== entry.raw_time_ms + (entry.total_penalty_seconds * 1000)) {
      integrity.finalTimeViolations++;
    }
  }

  // Cross-player contamination check
  for (const s of telemetry.sessions) {
    if (sessionMap.has(s.session_id)) {
      const original = sessionMap.get(s.session_id);
      if (s.player_name !== original.playerName || s.register_number !== original.regNo) {
        integrity.crossPlayerContamination++;
      }
    }
  }

  return integrity;
}

// Master Suite Execution
async function runPhase5MasterLoadSuite() {
  console.log('================================================================');
  console.log('⚡ POWERPATH PHASE 5 HIGH-CONCURRENCY & LOAD TEST SUITE ⚡');
  console.log('================================================================\n');

  console.log('Setting up dedicated load-test arena event...');
  const { eventId, adminToken } = await setupActiveTournamentEvent();
  console.log(`Arena initialized (Event ID: ${eventId})\n`);

  // 1. Batch 10 Concurrent Players
  console.log('▶ Running 10 Concurrent Players Test...');
  const res10 = await runConcurrentBatch(10, eventId, '10 Concurrent Players', 'B10');
  console.log(`✔ 10-Player Batch Complete: ${res10.playersSucceeded}/10 succeeded (p50: ${res10.stats.p50}ms, p95: ${res10.stats.p95}ms, max: ${res10.stats.max}ms)\n`);

  // 2. Batch 25 Concurrent Players
  console.log('▶ Running 25 Concurrent Players Test...');
  const res25 = await runConcurrentBatch(25, eventId, '25 Concurrent Players', 'B25');
  console.log(`✔ 25-Player Batch Complete: ${res25.playersSucceeded}/25 succeeded (p50: ${res25.stats.p50}ms, p95: ${res25.stats.p95}ms, max: ${res25.stats.max}ms)\n`);

  // 3. Batch 50 Concurrent Players
  console.log('▶ Running 50 Concurrent Players Test...');
  const res50 = await runConcurrentBatch(50, eventId, '50 Concurrent Players', 'B50');
  console.log(`✔ 50-Player Batch Complete: ${res50.playersSucceeded}/50 succeeded (p50: ${res50.stats.p50}ms, p95: ${res50.stats.p95}ms, max: ${res50.stats.max}ms)\n`);

  // 4. Concurrent Race Condition Stress
  console.log('▶ Running Concurrent Race Condition & Idempotency Stress Test...');
  const raceResults = await testRaceConditions(eventId);
  console.log(`✔ Race Conditions Test Complete (p50: ${raceResults.stats.p50}ms, p95: ${raceResults.stats.p95}ms)\n`);

  // 5. 50-Player Heartbeat Load
  console.log('▶ Running 50-Player Concurrent Heartbeat Load Test (150 heartbeat requests)...');
  const validSessions50 = res50.playerResults.filter(r => r.stepsSuccess && r.sessionId);
  const heartbeatStats = await testHeartbeatLoad(validSessions50);
  console.log(`✔ Heartbeat Load Complete (p50: ${heartbeatStats.p50}ms, p95: ${heartbeatStats.p95}ms, max: ${heartbeatStats.max}ms)\n`);

  // 6. Admin Live Monitor Under Load
  console.log('▶ Running Admin Live Monitor Under Load Test...');
  const adminMonitorResults = await testAdminMonitorUnderLoad(adminToken, eventId);
  console.log(`✔ Admin Live Monitor Complete (p50: ${adminMonitorResults.stats.p50}ms, p95: ${adminMonitorResults.stats.p95}ms)\n`);

  // 7. Database Integrity Verification
  console.log('▶ Running Database Integrity & Cross-Contamination Audit...');
  const allBatches = [...res10.playerResults, ...res25.playerResults, ...res50.playerResults];
  const dbIntegrity = await verifyDatabaseIntegrity(eventId, allBatches, adminToken);
  console.log('✔ Database Integrity Audit Complete.\n');

  // Summary Output
  const summary = {
    batch10: res10,
    batch25: res25,
    batch50: res50,
    raceResults,
    heartbeatStats,
    adminMonitorResults,
    dbIntegrity
  };

  console.log('================ JSON SUMMARY OUTPUT ================');
  console.log(JSON.stringify(summary, null, 2));
  console.log('====================================================');
}

runPhase5MasterLoadSuite().catch(err => {
  console.error('Fatal Load Test Error:', err);
  process.exit(1);
});
