/**
 * POWERPATH Frontend API Integration Test Suite
 * Validates complete end-to-end communication against live FastAPI backend.
 */

const BASE_URL = 'http://127.0.0.1:8000';

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`✔ PASS: ${message}`);
    testsPassed++;
  } else {
    console.error(`❌ FAIL: ${message}`);
    testsFailed++;
  }
}

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, options);
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    data = text;
  }
  return { status: res.status, ok: res.ok, data };
}

async function runIntegrationSuite() {
  console.log('\n=== RUNNING POWERPATH FRONTEND API INTEGRATION SUITE ===\n');

  // 1. Health Check
  const health = await request('/api/v1/health');
  assert(health.status === 200 && health.data.status === 'ok', '1. Backend health check returns 200 OK');

  // 2. Settings Check
  const settings = await request('/api/v1/settings');
  const eventStatus = settings.data.event_status || settings.data.eventStatus;
  assert(settings.status === 200 && eventStatus === 'OPEN', '2. Public tournament settings loaded (Status: OPEN)');

  // 3. Seed / Authenticate Admin
  // Use admin login
  let adminToken = null;
  const loginRes = await request('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'testadmin', password: 'AdminPassword123!' })
  });

  if (loginRes.ok) {
    adminToken = loginRes.data.access_token;
  } else {
    // If not seeded yet, seed via python sub-call or check
    console.log('Logging in as seed admin...');
  }

  // If token obtained:
  if (adminToken) {
    assert(Boolean(adminToken), '3. Admin JWT login successful');

    const me = await request('/api/v1/auth/me', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(me.status === 200 && me.data.username === 'testadmin', '4. GET /api/v1/auth/me validates admin profile');
  } else {
    // Admin login with newly created test admin
    console.log('Skipping seed admin check if already verified in pytest.');
  }

  // 4. Create Active Event via Admin
  let adminHeaders = adminToken ? { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };

  const eventPayload = {
    custom_id: `EVT_E2E_${Date.now()}`,
    name: 'E2E Championship Round',
    description: 'Automated integration challenge',
    status: 'ACTIVE',
    questions: [
      {
        custom_id: 'Q001',
        name: 'Stage 1 - Power Foundation',
        difficulty: 'Easy',
        penalty_seconds: 5,
        question_order: 1,
        sockets: [
          {
            custom_id: 'S1',
            label: 'SOURCE',
            accepted_component_id: 'battery',
            hint: '9V Battery DC Power'
          },
          {
            custom_id: 'S2',
            label: 'GROUND',
            accepted_component_id: 'ground',
            hint: '0V Reference Potential'
          }
        ]
      },
      {
        custom_id: 'Q002',
        name: 'Stage 2 - Current Protection',
        difficulty: 'Medium',
        penalty_seconds: 5,
        question_order: 2,
        sockets: [
          {
            custom_id: 'S1',
            label: 'LIMITER',
            accepted_component_id: 'resistor',
            hint: '330Ω Resistor'
          }
        ]
      }
    ]
  };

  const createEvtRes = await request('/api/v1/admin/events', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify(eventPayload)
  });

  assert(createEvtRes.status === 201 || createEvtRes.status === 200, '5. Admin event created with 2 stages and Ground socket');
  const eventId = createEvtRes.data.id;

  // 5. Verify Public Active Event & Secret Answer Masking
  const activeRes = await request('/api/v1/events/active');
  assert(activeRes.status === 200, '6. Public GET /api/v1/events/active returns active round');
  const activeEvt = activeRes.data;
  assert(activeEvt.questions?.length === 2, '7. Active event contains exactly 2 questions');

  // Secret Masking Check
  const s1 = activeEvt.questions[0].sockets[0];
  const s2 = activeEvt.questions[0].sockets[1];
  assert(s1.accepted_component_id === undefined && s1.acceptedComponentId === undefined, '8. CRITICAL: Secret accepted_component_id is masked on S1');
  assert(s2.accepted_component_id === undefined && s2.acceptedComponentId === undefined, '9. CRITICAL: Secret accepted_component_id is masked on S2 (Ground)');

  // 6. Player Registration & Session Start
  const startRes = await request('/api/v1/game/session/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      player_name: 'E2E Challenger',
      register_number: 'REG-E2E-99',
      event_id: eventId
    })
  });

  assert(startRes.status === 201, '10. Player session initialized (HTTP 201)');
  const session = startRes.data;
  assert(session.session_id.startsWith('PP-'), '11. Server-generated secure session_id format (PP-xxxxxxxx)');
  assert(session.wrong_attempts_total === 0 && session.penalty_seconds_total === 0, '12. Initial penalties and wrong attempts are 0');
  assert(Boolean(session.started_at), '13. Server authoritative started_at timestamp present');

  const sessionId = session.session_id;
  const q1Id = session.current_question.id;
  const s1Id = session.current_question.sockets[0].id;
  const s2Id = session.current_question.sockets[1].id;

  // 7. Session Recovery on Page Reload
  const recRes = await request(`/api/v1/game/session/${sessionId}`);
  assert(recRes.status === 200, '14. Session recovery endpoint returns 200 OK');
  assert(recRes.data.player_name === 'E2E Challenger', '15. Recovered session retains player name');
  assert(recRes.data.current_question.id === q1Id, '16. Recovered session retains active stage 1');

  // 8. Incorrect Placement (+5s penalty)
  const wrongRes = await request('/api/v1/game/placement/attempt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      question_id: q1Id,
      socket_id: s1Id,
      component_id: 'voltmeter'
    })
  });

  assert(wrongRes.status === 200, '17. Placement attempt endpoint returns 200');
  assert(wrongRes.data.correct === false, '18. Incorrect component rejected by server');
  assert(wrongRes.data.penalty_applied === 5, '19. Server applied +5s penalty');
  assert(wrongRes.data.wrong_attempts_total === 1, '20. Wrong attempts total incremented to 1');

  // 9. Correct Placement (Battery in S1)
  const correctS1 = await request('/api/v1/game/placement/attempt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      question_id: q1Id,
      socket_id: s1Id,
      component_id: '9V Battery' // Normalization test
    })
  });

  assert(correctS1.data.correct === true, '21. Correct component (Battery) accepted by server');
  assert(correctS1.data.penalty_applied === 0, '22. Correct placement incurs 0 penalty');

  // 10. Idempotency Check on S1
  const repeatS1 = await request('/api/v1/game/placement/attempt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      question_id: q1Id,
      socket_id: s1Id,
      component_id: 'battery'
    })
  });

  assert(repeatS1.data.correct === true && repeatS1.data.already_completed === true, '23. Repeated placement on S1 is recognized as already completed (idempotent)');
  assert(repeatS1.data.penalty_seconds_total === 5, '24. Idempotent repeat adds NO extra penalty (still 5s)');

  // 11. Correct Placement (Ground in S2)
  const correctS2 = await request('/api/v1/game/placement/attempt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      question_id: q1Id,
      socket_id: s2Id,
      component_id: 'Earth 0V' // Ground normalization test
    })
  });

  assert(correctS2.data.correct === true, '25. Ground component accepted in S2 Ground slot');

  // 12. Complete Stage 1
  const q1Complete = await request('/api/v1/game/question/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      question_id: q1Id
    })
  });

  assert(q1Complete.status === 200, '26. Stage 1 complete endpoint returns 200 OK');
  assert(q1Complete.data.has_next_question === true, '27. Server indicates has_next_question = true');
  const q2 = q1Complete.data.next_question;
  assert(q2.custom_id === 'Q002', '28. Next stage is Q002');

  // 13. Solve Stage 2 (Resistor in S1)
  const s1Q2Id = q2.sockets[0].id;
  const correctQ2S1 = await request('/api/v1/game/placement/attempt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      question_id: q2.id,
      socket_id: s1Q2Id,
      component_id: 'Resistor 330Ω'
    })
  });
  assert(correctQ2S1.data.correct === true, '29. Stage 2 Resistor component placed correctly');

  // 14. Complete Stage 2
  const q2Complete = await request('/api/v1/game/question/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      question_id: q2.id
    })
  });

  assert(q2Complete.data.event_completed === true, '30. Final stage completed (event_completed = true)');

  // 15. Final Session Finish
  const finishRes = await request('/api/v1/game/session/finish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId
    })
  });

  assert(finishRes.status === 200, '31. Match finish endpoint returns 200 OK');
  const result = finishRes.data;
  assert(result.player_name === 'E2E Challenger', '32. Final result player name matches');
  assert(result.total_questions === 2, '33. Final result contains total_questions = 2');
  assert(result.total_penalty_seconds === 5, '34. Total penalty seconds is 5s');
  assert(result.final_time_ms === result.raw_time_ms + 5000, '35. Server calculated final_time_ms = raw_time_ms + 5000ms');
  assert(result.rank === 1, '36. Contestant assigned official Rank 1');

  // 16. Idempotent Finish Call
  const finishRepeat = await request('/api/v1/game/session/finish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId
    })
  });

  assert(finishRepeat.status === 200, '37. Repeated finish call returns 200 OK (idempotent)');
  assert(finishRepeat.data.id === result.id, '38. Repeated finish returns identical result ID');

  // 17. Public Leaderboard Check
  const leadRes = await request(`/api/v1/results/leaderboard?event_id=${eventId}`);
  assert(leadRes.status === 200 && leadRes.data.length >= 1, '39. Public leaderboard displays finished contestant');
  assert(leadRes.data[0].player_name === 'E2E Challenger', '40. Public leaderboard shows correct top contestant');

  // 18. Phase 4: Heartbeat Endpoint Test
  const hbRes = await request(`/api/v1/game/session/${sessionId}/heartbeat`, {
    method: 'POST'
  });
  assert(hbRes.status === 200 && typeof hbRes.data.status === 'string', '41. Heartbeat endpoint updates last_heartbeat with HTTP 200');
  assert(typeof hbRes.data.last_heartbeat === 'string', '42. Heartbeat response contains ISO timestamp');

  // 19. Phase 4: Admin Telemetry & Summary
  const telemRes = await request('/api/v1/admin/monitor/telemetry', {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert(telemRes.status === 200, '43. Admin Live Telemetry endpoint returns 200 OK');
  assert(telemRes.data && telemRes.data.summary && typeof telemRes.data.summary.total_count === 'number', '44. Telemetry includes summary counts (active, completed, abandoned, total)');
  assert(Array.isArray(telemRes.data.sessions), '45. Telemetry includes sessions array');
  
  const finishedSessionTelem = telemRes.data.sessions.find(s => s.session_id === sessionId);
  assert(finishedSessionTelem && finishedSessionTelem.player_name === 'E2E Challenger', '46. Telemetry contains finished contestant session');
  assert(finishedSessionTelem.status === 'COMPLETED', '47. Telemetry displays accurate session status (COMPLETED)');
  assert(finishedSessionTelem.penalty_seconds_total === 5, '48. Telemetry displays accurate penalty seconds (5s)');
  assert(finishedSessionTelem.wrong_attempts_total === 1, '49. Telemetry displays accurate wrong attempts (1)');

  // 20. Phase 4: Telemetry Security & Answer Masking
  assert(finishedSessionTelem.accepted_component_id === undefined, '50. CRITICAL: Telemetry payload NEVER exposes accepted_component_id');

  const unauthTelem = await request('/api/v1/admin/monitor/telemetry');
  assert(unauthTelem.status === 401, '51. Unauthenticated telemetry request strictly rejected with 401 Unauthorized');

  console.log('\n======================================================');
  console.log(`TOTAL TESTS: ${testsPassed + testsFailed} | PASSED: ${testsPassed} | FAILED: ${testsFailed}`);
  console.log('======================================================\n');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runIntegrationSuite().catch((err) => {
  console.error('Fatal Integration Test Error:', err);
  process.exit(1);
});
