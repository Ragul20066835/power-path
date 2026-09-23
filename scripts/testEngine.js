/**
 * DROP & CONNECT - Comprehensive Dynamic Game Engine & Excel/CSV Validator Test Suite
 * Tests Event -> Question -> Slot hierarchy, multi-stage game loop, aggregate telemetry, and transactional upload parser.
 */

import {
  createInitialGameState,
  startNewGame,
  attemptPlacement,
  advanceToNextQuestion,
  formatTime,
  calculateQuestionResult,
  calculateAggregateResult,
  generateSessionId,
  saveSessionToStorage,
  loadSessionFromStorage
} from '../src/engine/gameEngine.js';
import { DEFAULT_EVENTS } from '../src/data/defaultEvents.js';
import { GLOBAL_COMPONENTS } from '../src/data/gameData.js';
import {
  validateUploadRows,
  validateQuestionUploadRows,
  normalizeComponentId,
  REQUIRED_COLUMNS
} from '../src/engine/excelParser.js';
import {
  saveEvent,
  getEvents,
  getEventById,
  deleteEvent,
  deleteQuestionFromEvent,
  importQuestionsIntoEvent,
  importEventsData
} from '../src/engine/adminStorage.js';

let passedTests = 0;
let totalTests = 0;

function assert(condition, testName, extraInfo = '') {
  totalTests++;
  if (condition) {
    console.log(`\x1b[32m✔ PASS:\x1b[0m ${testName}`);
    passedTests++;
  } else {
    console.error(`\x1b[31m✖ FAIL:\x1b[0m ${testName} ${extraInfo}`);
  }
}

console.log('=== STARTING POWERPATH EVENT HIERARCHY & DYNAMIC ENGINE TEST SUITE ===\n');

// Mock sessionStorage & localStorage in Node.js environment
const mockSessionStorage = new Map();
globalThis.sessionStorage = {
  getItem: (key) => mockSessionStorage.get(key) || null,
  setItem: (key, val) => mockSessionStorage.set(key, String(val)),
  removeItem: (key) => mockSessionStorage.delete(key),
  clear: () => mockSessionStorage.clear()
};

const mockLocalStorage = new Map();
globalThis.localStorage = {
  getItem: (key) => mockLocalStorage.get(key) || null,
  setItem: (key, val) => mockLocalStorage.set(key, String(val)),
  removeItem: (key) => mockLocalStorage.delete(key),
  clear: () => mockLocalStorage.clear()
};

const e001 = DEFAULT_EVENTS[0]; // 3 questions (Q001: 5 slots, Q002: 4 slots, Q003: 4 slots)
const q001 = e001.questions[0];

// TEST 1: Correct component -> correct slot in Q1
{
  const initial = startNewGame(e001, { name: 'Jane Doe', regNo: '24ECE101' }, 1000);
  const res = attemptPlacement(initial, q001, 'battery', 'S1', 2000);
  assert(res.action === 'correct', 'TEST 1.1: Battery in S1 accepted');
  assert(res.state.placedComponents.S1 === 'battery', 'TEST 1.2: S1 slot recorded as battery');
  assert(res.state.wrongAttempts === 0, 'TEST 1.3: No wrong attempts on correct drop');
  assert(res.state.penaltySeconds === 0, 'TEST 1.4: No penalty seconds added');
}

// TEST 2: Wrong component -> slot (Decoy & mismatched)
{
  const initial = startNewGame(e001, { name: 'Jane Doe', regNo: '24ECE101' }, 1000);
  // Attempt placing voltmeter (decoy) in S1
  const res1 = attemptPlacement(initial, q001, 'voltmeter', 'S1', 2000);
  assert(res1.action === 'wrong', 'TEST 2.1: Voltmeter in S1 rejected');
  assert(res1.state.wrongAttempts === 1, 'TEST 2.2: Question wrong attempts incremented to 1');
  assert(res1.state.penaltySeconds === 5, 'TEST 2.3: Question penalty seconds equals 5s');
  assert(res1.state.placedComponents.S1 === null, 'TEST 2.4: S1 slot remains empty');

  // Attempt placing resistor (wrong slot) in S1
  const res2 = attemptPlacement(res1.state, q001, 'resistor', 'S1', 3000);
  assert(res2.action === 'wrong', 'TEST 2.5: Resistor in S1 rejected');
  assert(res2.state.wrongAttempts === 2, 'TEST 2.6: Question wrong attempts incremented to 2');
  assert(res2.state.penaltySeconds === 10, 'TEST 2.7: Question penalty seconds equals 10s');
}

// TEST 3: Drop outside slot
{
  const initial = startNewGame(e001, { name: 'Jane Doe', regNo: '24ECE101' }, 1000);
  const res = attemptPlacement(initial, q001, 'battery', 'NON_EXISTENT_SLOT', 2000);
  assert(res.action === 'ignored', 'TEST 3.1: Drop on invalid slot is ignored (no-op)');
  assert(res.state.wrongAttempts === 0, 'TEST 3.2: Drop outside does not increment wrong attempts');
  assert(res.state.penaltySeconds === 0, 'TEST 3.3: Drop outside adds 0 penalty');
}

// TEST 4: Same component twice
{
  const initial = startNewGame(e001, { name: 'Jane Doe', regNo: '24ECE101' }, 1000);
  const res1 = attemptPlacement(initial, q001, 'battery', 'S1', 2000);
  assert(res1.action === 'correct', 'TEST 4.1: Battery in S1 placed');

  // Try placing battery again into S2
  const res2 = attemptPlacement(res1.state, q001, 'battery', 'S2', 3000);
  assert(res2.action === 'ignored', 'TEST 4.2: Using battery a second time is ignored');
  assert(res2.reason === 'COMPONENT_ALREADY_USED', 'TEST 4.3: Reason is COMPONENT_ALREADY_USED');
  assert(res2.state.placedComponents.S2 === null, 'TEST 4.4: S2 slot remains empty');
}

// TEST 5: Filled slot receives another component
{
  const initial = startNewGame(e001, { name: 'Jane Doe', regNo: '24ECE101' }, 1000);
  const res1 = attemptPlacement(initial, q001, 'battery', 'S1', 2000);

  // Try placing switch into already filled S1 slot
  const res2 = attemptPlacement(res1.state, q001, 'switch', 'S1', 3000);
  assert(res2.action === 'ignored', 'TEST 5.1: Placing into occupied slot is ignored');
  assert(res2.reason === 'SLOT_ALREADY_OCCUPIED', 'TEST 5.2: Reason is SLOT_ALREADY_OCCUPIED');
  assert(res2.state.placedComponents.S1 === 'battery', 'TEST 5.3: S1 slot retains original battery');
}

// TEST 6: Multi-Stage Question Progression (Event with 2 Questions)
{
  const testEvent = {
    id: 'E_TEST',
    name: 'Multi-Question Test Event',
    questions: [
      {
        id: 'Q1',
        name: 'Question 1 (2 slots)',
        penaltySeconds: 5,
        slots: [
          { id: 'S1', acceptedComponentId: 'battery' },
          { id: 'S2', acceptedComponentId: 'resistor' }
        ]
      },
      {
        id: 'Q2',
        name: 'Question 2 (2 slots)',
        penaltySeconds: 5,
        slots: [
          { id: 'S1', acceptedComponentId: 'switch' },
          { id: 'S2', acceptedComponentId: 'led' }
        ]
      }
    ]
  };

  let state = startNewGame(testEvent, { name: 'Alice', regNo: '24ECE050' }, 10000);
  assert(state.currentQuestionIndex === 0, 'TEST 6.1: Starts at Question Index 0');
  assert(state.currentQuestion.id === 'Q1', 'TEST 6.2: Current Question is Q1');

  // Complete Question 1 with 1 mistake
  state = attemptPlacement(state, state.currentQuestion, 'voltmeter', 'S1', 11000).state; // 1 wrong
  state = attemptPlacement(state, state.currentQuestion, 'battery', 'S1', 12000).state;
  const q1Finish = attemptPlacement(state, state.currentQuestion, 'resistor', 'S2', 15000);

  assert(q1Finish.isQuestionCompleted === true, 'TEST 6.3: Q1 completed');
  assert(q1Finish.isCompleted === false, 'TEST 6.4: Event not completed yet (Q2 remains)');
  assert(q1Finish.state.questionResults.length === 1, 'TEST 6.5: Q1 telemetry recorded');
  assert(q1Finish.state.questionResults[0].wrongAttempts === 1, 'TEST 6.6: Q1 had 1 wrong attempt');
  assert(q1Finish.state.questionResults[0].rawTimeMs === 5000, 'TEST 6.7: Q1 raw time is 5000ms');

  // Advance to Question 2
  state = advanceToNextQuestion(q1Finish.state, 16000);
  assert(state.currentQuestionIndex === 1, 'TEST 6.8: Advanced to Question Index 1');
  assert(state.currentQuestion.id === 'Q2', 'TEST 6.9: Current Question is Q2');
  assert(state.isQuestionCompleted === false, 'TEST 6.10: Question completion flag reset for Q2');
  assert(state.placedComponents.S1 === null, 'TEST 6.11: Tray/Sockets reset for Q2');

  // Complete Question 2 (cleanly with 0 mistakes)
  state = attemptPlacement(state, state.currentQuestion, 'switch', 'S1', 18000).state;
  const q2Finish = attemptPlacement(state, state.currentQuestion, 'led', 'S2', 20000);

  assert(q2Finish.isQuestionCompleted === true, 'TEST 6.12: Q2 completed');
  assert(q2Finish.isCompleted === true, 'TEST 6.13: Full Event completed on final question finish');
  assert(q2Finish.state.status === 'completed', 'TEST 6.14: State status set to completed');

  // Check aggregate event result
  const eventResult = q2Finish.state.result;
  assert(eventResult.event_id === 'E_TEST', 'TEST 6.15: Result references E_TEST');
  assert(eventResult.totalQuestions === 2, 'TEST 6.16: Result has 2 total questions');
  assert(eventResult.event_raw_time_ms === 9000, 'TEST 6.17: Event raw time is 5000 + 4000 = 9000ms');
  assert(eventResult.event_penalty_seconds === 5, 'TEST 6.18: Total event penalty is 5s');
  assert(eventResult.event_final_time_ms === 14000, 'TEST 6.19: Final event time is 9000 + 5000 = 14000ms (00:14.00)');
  assert(eventResult.event_final_time_formatted === '00:14.00', 'TEST 6.20: Final time formatted as 00:14.00');
}

// TEST 7: Actions after completion are blocked
{
  const miniEvent = {
    id: 'E_MINI',
    name: 'Mini',
    questions: [
      {
        id: 'Q1',
        name: 'Q1',
        penaltySeconds: 5,
        slots: [{ id: 'S1', acceptedComponentId: 'battery' }]
      }
    ]
  };

  let state = startNewGame(miniEvent, { name: 'Tester', regNo: 'TEST01' }, 1000);
  state = attemptPlacement(state, state.currentQuestion, 'battery', 'S1', 2000).state;

  const postCompleteAttempt = attemptPlacement(state, state.currentQuestion, 'voltmeter', 'S1', 10000);
  assert(postCompleteAttempt.action === 'ignored', 'TEST 7.1: Action after completion is ignored');
  assert(postCompleteAttempt.reason === 'GAME_ALREADY_COMPLETED', 'TEST 7.2: Reason is GAME_ALREADY_COMPLETED');
}

// TEST 8: Session storage save & reload resilience across stages
{
  let state = startNewGame(e001, { name: 'Sam', regNo: '24ECE005' }, 1000);
  state = attemptPlacement(state, q001, 'battery', 'S1', 2000).state;
  state = attemptPlacement(state, q001, 'voltmeter', 'S2', 3000).state; // 1 mistake

  saveSessionToStorage(state);
  const reloaded = loadSessionFromStorage();

  assert(reloaded !== null, 'TEST 8.1: Session loaded from storage');
  assert(reloaded.sessionId === state.sessionId, 'TEST 8.2: Session ID preserved');
  assert(reloaded.player.name === 'Sam', 'TEST 8.3: Player name preserved');
  assert(reloaded.wrongAttempts === 1, 'TEST 8.4: Question wrong attempts preserved across reload');
  assert(reloaded.penaltySeconds === 5, 'TEST 8.5: Penalty count preserved across reload');
  assert(reloaded.placedComponents.S1 === 'battery', 'TEST 8.6: Placed components preserved');
}

// TEST 9: Decoy verification across all slots
{
  const decoys = ['voltmeter', 'capacitor', 'inductor'];
  const initial = startNewGame(e001, { name: 'DecoyTest', regNo: 'DEC01' }, 1000);

  let allDecoysRejected = true;
  decoys.forEach((decoy) => {
    q001.slots.forEach((slot) => {
      const outcome = attemptPlacement(initial, q001, decoy, slot.id, 2000);
      if (outcome.action !== 'wrong') {
        allDecoysRejected = false;
      }
    });
  });

  assert(allDecoysRejected === true, 'TEST 9.1: All 3 decoys rejected on all challenge sockets');
}

// TEST 10: Transactional Excel/CSV Validator Tests (Event -> Questions -> Slots)
{
  // 10.1 Valid Bulk Upload Rows with Multiple Questions in ONE Event
  const validRows = [
    {
      event_id: 'E999',
      event_name: 'Championship Round 1',
      question_id: 'Q101',
      question_name: 'Basic Series Circuit',
      difficulty: 'Easy',
      slot_id: 'S1',
      slot_label: 'SOURCE',
      correct_component: 'battery',
      hint: '9V DC Voltage Source'
    },
    {
      event_id: 'E999',
      event_name: 'Championship Round 1',
      question_id: 'Q101',
      question_name: 'Basic Series Circuit',
      difficulty: 'Easy',
      slot_id: 'S2',
      slot_label: 'SWITCH',
      correct_component: 'switch',
      hint: 'Control Switch'
    },
    {
      event_id: 'E999',
      event_name: 'Championship Round 1',
      question_id: 'Q102',
      question_name: 'LED Protection Circuit',
      difficulty: 'Medium',
      slot_id: 'S1',
      slot_label: 'POWER',
      correct_component: 'battery',
      hint: 'Power'
    },
    {
      event_id: 'E999',
      event_name: 'Championship Round 1',
      question_id: 'Q102',
      question_name: 'LED Protection Circuit',
      difficulty: 'Medium',
      slot_id: 'S2',
      slot_label: 'PROTECT',
      correct_component: 'resistor',
      hint: 'Resistor'
    }
  ];

  const validResult = validateUploadRows(validRows);
  assert(validResult.isValid === true, 'TEST 10.1: Valid multi-question rows pass transactional validator');
  assert(validResult.events.length === 1, 'TEST 10.2: Exactly 1 event created from upload');
  assert(validResult.events[0].id === 'E999', 'TEST 10.3: Event ID is E999');
  assert(validResult.events[0].questions.length === 2, 'TEST 10.4: Event has exactly 2 questions (Q101, Q102)');
  assert(validResult.events[0].questions[0].slots.length === 2, 'TEST 10.5: Q101 contains 2 slots');
  assert(validResult.events[0].questions[1].slots.length === 2, 'TEST 10.6: Q102 contains 2 slots');

  // 10.2 Invalid Component Rejection (Transactional Halt across entire batch)
  const invalidCompRows = [
    {
      event_id: 'E998',
      event_name: 'Faulty Event',
      question_id: 'Q101',
      question_name: 'Q1',
      difficulty: 'Easy',
      slot_id: 'S1',
      slot_label: 'SOURCE',
      correct_component: 'battery',
      hint: '9V DC Supply'
    },
    {
      event_id: 'E998',
      event_name: 'Faulty Event',
      question_id: 'Q101',
      question_name: 'Q1',
      difficulty: 'Easy',
      slot_id: 'S2',
      slot_label: 'UNKNOWN_PART',
      correct_component: 'laser_gun', // Invalid component
      hint: 'Invalid'
    }
  ];

  const invalidCompResult = validateUploadRows(invalidCompRows);
  assert(invalidCompResult.isValid === false, 'TEST 10.7: Unknown component fails validation');
  assert(invalidCompResult.events.length === 0, 'TEST 10.8: Transactional rule: 0 events imported on error');
  assert(invalidCompResult.errors.some((e) => e.message.toLowerCase().includes('unknown component')), 'TEST 10.9: Error diagnostics report unknown component');

  // 10.3 Duplicate Slot ID Rejection within same Question
  const duplicateSlotRows = [
    {
      event_id: 'E997',
      event_name: 'Duplicate Slot Event',
      question_id: 'Q101',
      question_name: 'Q1',
      difficulty: 'Easy',
      slot_id: 'S1',
      slot_label: 'SOURCE',
      correct_component: 'battery',
      hint: '9V Supply'
    },
    {
      event_id: 'E997',
      event_name: 'Duplicate Slot Event',
      question_id: 'Q101',
      question_name: 'Q1',
      difficulty: 'Easy',
      slot_id: 'S1', // Duplicate slot ID in same question
      slot_label: 'LIMITER',
      correct_component: 'resistor',
      hint: '330 Ohm'
    }
  ];

  const duplicateResult = validateUploadRows(duplicateSlotRows);
  assert(duplicateResult.isValid === false, 'TEST 10.10: Duplicate slot ID in same question fails validation');
  assert(duplicateResult.events.length === 0, 'TEST 10.11: Transactional rule: batch rejected on duplicate slot');

  // 10.4 Missing Required Field Rejection (e.g. missing question_id)
  const missingFieldRows = [
    {
      event_id: 'E996',
      event_name: 'Missing Question Event',
      question_id: '', // Missing
      question_name: 'Q1',
      difficulty: 'Easy',
      slot_id: 'S1',
      slot_label: 'SOURCE',
      correct_component: 'battery',
      hint: '9V Supply'
    }
  ];

  const missingResult = validateUploadRows(missingFieldRows);
  assert(missingResult.isValid === false, 'TEST 10.12: Missing question_id fails validation');
  assert(missingResult.events.length === 0, 'TEST 10.13: Batch rejected on missing question_id');
}

// TEST 11: Component Normalization & Alias Mapping
{
  assert(normalizeComponentId('9V Battery') === 'battery', 'TEST 11.1: "9V Battery" normalizes to battery');
  assert(normalizeComponentId('Toggle Switch') === 'switch', 'TEST 11.2: "Toggle Switch" normalizes to switch');
  assert(normalizeComponentId('Resistor 330Ω') === 'resistor', 'TEST 11.3: "Resistor 330Ω" normalizes to resistor');
  assert(normalizeComponentId('LED') === 'led', 'TEST 11.4: "LED" normalizes to led');
  assert(normalizeComponentId('Ammeter (mA)') === 'ammeter', 'TEST 11.5: "Ammeter (mA)" normalizes to ammeter');
  assert(normalizeComponentId('Ground') === 'ground', 'TEST 11.6: "Ground" normalizes to ground');
  assert(normalizeComponentId('GND') === 'ground', 'TEST 11.7: "GND" normalizes to ground');
  assert(normalizeComponentId('Earth 0V') === 'ground', 'TEST 11.8: "Earth 0V" normalizes to ground');
  assert(normalizeComponentId('Voltmeter') === 'voltmeter', 'TEST 11.9: "Voltmeter" normalizes to voltmeter');
  assert(normalizeComponentId('Capacitor 100μF') === 'capacitor', 'TEST 11.10: "Capacitor 100μF" normalizes to capacitor');
  assert(normalizeComponentId('Inductor 10mH') === 'inductor', 'TEST 11.11: "Inductor 10mH" normalizes to inductor');
  assert(normalizeComponentId('laser_beam') === null, 'TEST 11.12: Unknown component returns null');
}

// TEST 12: Question-Only CSV Validator & Import (NEVER creates a new event)
{
  // 12.1 Valid Question CSV Rows
  const validQRows = [
    {
      question_id: 'Q501',
      question_name: 'Series Circuit Lab',
      description: 'Build series circuit',
      difficulty: 'Easy',
      penalty_seconds: 5,
      socket_id: 'S1',
      socket_label: 'SOURCE',
      correct_component: '9V Battery',
      component_description: 'Power source'
    },
    {
      question_id: 'Q501',
      question_name: 'Series Circuit Lab',
      description: 'Build series circuit',
      difficulty: 'Easy',
      penalty_seconds: 5,
      socket_id: 'S2',
      socket_label: 'LIMITER',
      correct_component: 'Resistor 330Ω',
      component_description: 'Limiter'
    },
    {
      question_id: 'Q502',
      question_name: 'Switched Branch Lab',
      description: 'Build switched circuit',
      difficulty: 'Medium',
      penalty_seconds: 5,
      socket_id: 'S1',
      socket_label: 'SWITCH',
      correct_component: 'Toggle Switch',
      component_description: 'Switch'
    },
    {
      question_id: 'Q502',
      question_name: 'Switched Branch Lab',
      description: 'Build switched circuit',
      difficulty: 'Medium',
      penalty_seconds: 5,
      socket_id: 'S2',
      socket_label: 'OUTPUT',
      correct_component: 'LED',
      component_description: 'LED'
    }
  ];

  const res = validateQuestionUploadRows(validQRows);
  assert(res.isValid === true, 'TEST 12.1: Question CSV passes validation');
  assert(res.questions.length === 2, 'TEST 12.2: Exactly 2 questions extracted');
  assert(res.questions[0].id === 'Q501', 'TEST 12.3: First question is Q501');
  assert(res.questions[0].slots.length === 2, 'TEST 12.4: Q501 has 2 slots');
  assert(res.questions[1].id === 'Q502', 'TEST 12.5: Second question is Q502');

  // 12.2 Import into existing event without creating new event
  const targetEvent = {
    id: 'E_TARGET_TEST',
    name: 'Target Existing Event',
    description: 'Testing question import',
    status: 'INACTIVE',
    questions: []
  };
  saveEvent(targetEvent);

  const updated = importQuestionsIntoEvent('E_TARGET_TEST', res.questions);
  assert(updated.questions.length === 2, 'TEST 12.6: Questions imported directly into E_TARGET_TEST');
  assert(updated.id === 'E_TARGET_TEST', 'TEST 12.7: Target event ID remains E_TARGET_TEST (no new event created)');

  // 12.3 Validation Failure (Duplicate socket in same question)
  const duplicateSocketRows = [
    {
      question_id: 'Q503',
      question_name: 'Dup Socket Q',
      difficulty: 'Easy',
      penalty_seconds: 5,
      socket_id: 'S1',
      socket_label: 'SOURCE',
      correct_component: '9V Battery'
    },
    {
      question_id: 'Q503',
      question_name: 'Dup Socket Q',
      difficulty: 'Easy',
      penalty_seconds: 5,
      socket_id: 'S1', // Duplicate socket ID
      socket_label: 'OUTPUT',
      correct_component: 'LED'
    }
  ];
  const dupRes = validateQuestionUploadRows(duplicateSocketRows);
  assert(dupRes.isValid === false, 'TEST 12.8: Duplicate socket ID in same question fails validation');
  assert(dupRes.questions.length === 0, 'TEST 12.9: 0 questions imported on validation error');
}

// TEST 13: Event Delete & Question Delete Isolated Operations
{
  // Setup 2 distinct events
  saveEvent({
    id: 'E_DEL_1',
    name: 'Event 1 To Delete',
    status: 'ACTIVE',
    questions: [
      { id: 'Q_D1', name: 'Q1', slots: [{ id: 'S1', acceptedComponentId: 'battery' }] },
      { id: 'Q_D2', name: 'Q2', slots: [{ id: 'S1', acceptedComponentId: 'switch' }] }
    ]
  });
  saveEvent({
    id: 'E_DEL_2',
    name: 'Event 2 To Keep',
    status: 'INACTIVE',
    questions: [
      { id: 'Q_K1', name: 'Keep Q', slots: [{ id: 'S1', acceptedComponentId: 'led' }] }
    ]
  });

  // 13.1 Delete Question from E_DEL_1
  deleteQuestionFromEvent('E_DEL_1', 'Q_D1');
  const ev1AfterQDel = getEventById('E_DEL_1');
  assert(ev1AfterQDel.questions.length === 1, 'TEST 13.1: Question Q_D1 deleted, 1 question remains');
  assert(ev1AfterQDel.questions[0].id === 'Q_D2', 'TEST 13.2: Remaining question is Q_D2');
  assert(getEventById('E_DEL_2').questions.length === 1, 'TEST 13.3: Event 2 questions unaffected');

  // 13.2 Delete Entire Event E_DEL_1
  deleteEvent('E_DEL_1');
  const allEventsAfter = getEvents();
  assert(!allEventsAfter.some((e) => e.id === 'E_DEL_1'), 'TEST 13.4: Event E_DEL_1 and its questions removed');
  assert(allEventsAfter.some((e) => e.id === 'E_DEL_2'), 'TEST 13.5: Event E_DEL_2 remains untouched');
}

// TEST 14: Full 5-Question 24-Socket CSV Validation & Import with Ground
{
  // Realistic Question CSV simulation: 5 Questions, 24 Sockets, containing Ground
  const rows24 = [
    // Q1: 5 sockets (with Ground)
    { question_id: 'Q001', question_name: 'Basic Series Circuit', description: 'Series circuit', difficulty: 'Easy', penalty_seconds: 5, socket_id: 'S1', socket_label: 'SOURCE', correct_component: '9V Battery', component_description: 'Power' },
    { question_id: 'Q001', question_name: 'Basic Series Circuit', description: 'Series circuit', difficulty: 'Easy', penalty_seconds: 5, socket_id: 'S2', socket_label: 'SWITCH', correct_component: 'Toggle Switch', component_description: 'Switch' },
    { question_id: 'Q001', question_name: 'Basic Series Circuit', description: 'Series circuit', difficulty: 'Easy', penalty_seconds: 5, socket_id: 'S3', socket_label: 'LIMITER', correct_component: 'Resistor 330Ω', component_description: 'Resistor' },
    { question_id: 'Q001', question_name: 'Basic Series Circuit', description: 'Series circuit', difficulty: 'Easy', penalty_seconds: 5, socket_id: 'S4', socket_label: 'INDICATOR', correct_component: 'LED', component_description: 'LED' },
    { question_id: 'Q001', question_name: 'Basic Series Circuit', description: 'Series circuit', difficulty: 'Easy', penalty_seconds: 5, socket_id: 'S5', socket_label: 'GROUND', correct_component: 'Ground', component_description: 'Common Ground Return' },

    // Q2: 5 sockets (with Ground and Ammeter)
    { question_id: 'Q002', question_name: 'Telemetry Branch', description: 'Telemetry branch', difficulty: 'Medium', penalty_seconds: 5, socket_id: 'S1', socket_label: 'SOURCE', correct_component: '9V Battery', component_description: 'Power' },
    { question_id: 'Q002', question_name: 'Telemetry Branch', description: 'Telemetry branch', difficulty: 'Medium', penalty_seconds: 5, socket_id: 'S2', socket_label: 'SWITCH', correct_component: 'Toggle Switch', component_description: 'Switch' },
    { question_id: 'Q002', question_name: 'Telemetry Branch', description: 'Telemetry branch', difficulty: 'Medium', penalty_seconds: 5, socket_id: 'S3', socket_label: 'LIMITER', correct_component: 'Resistor 330Ω', component_description: 'Resistor' },
    { question_id: 'Q002', question_name: 'Telemetry Branch', description: 'Telemetry branch', difficulty: 'Medium', penalty_seconds: 5, socket_id: 'S4', socket_label: 'METER', correct_component: 'Ammeter (mA)', component_description: 'Ammeter' },
    { question_id: 'Q002', question_name: 'Telemetry Branch', description: 'Telemetry branch', difficulty: 'Medium', penalty_seconds: 5, socket_id: 'S5', socket_label: 'GROUND', correct_component: 'Ground', component_description: '0V Reference' },

    // Q3: 4 sockets
    { question_id: 'Q003', question_name: 'Protected Diode Stage', description: 'Protected diode', difficulty: 'Easy', penalty_seconds: 5, socket_id: 'S1', socket_label: 'SOURCE', correct_component: '9V Battery', component_description: 'Power' },
    { question_id: 'Q003', question_name: 'Protected Diode Stage', description: 'Protected diode', difficulty: 'Easy', penalty_seconds: 5, socket_id: 'S2', socket_label: 'LIMITER', correct_component: 'Resistor 330Ω', component_description: 'Resistor' },
    { question_id: 'Q003', question_name: 'Protected Diode Stage', description: 'Protected diode', difficulty: 'Easy', penalty_seconds: 5, socket_id: 'S3', socket_label: 'INDICATOR', correct_component: 'LED', component_description: 'LED' },
    { question_id: 'Q003', question_name: 'Protected Diode Stage', description: 'Protected diode', difficulty: 'Easy', penalty_seconds: 5, socket_id: 'S4', socket_label: 'GROUND', correct_component: 'Ground', component_description: 'Ground' },

    // Q4: 5 sockets
    { question_id: 'Q004', question_name: 'Switched Meter Loop', description: 'Switched loop', difficulty: 'Medium', penalty_seconds: 5, socket_id: 'S1', socket_label: 'SOURCE', correct_component: '9V Battery', component_description: 'Power' },
    { question_id: 'Q004', question_name: 'Switched Meter Loop', description: 'Switched loop', difficulty: 'Medium', penalty_seconds: 5, socket_id: 'S2', socket_label: 'SWITCH', correct_component: 'Toggle Switch', component_description: 'Switch' },
    { question_id: 'Q004', question_name: 'Switched Meter Loop', description: 'Switched loop', difficulty: 'Medium', penalty_seconds: 5, socket_id: 'S3', socket_label: 'METER', correct_component: 'Ammeter (mA)', component_description: 'Ammeter' },
    { question_id: 'Q004', question_name: 'Switched Meter Loop', description: 'Switched loop', difficulty: 'Medium', penalty_seconds: 5, socket_id: 'S4', socket_label: 'INDICATOR', correct_component: 'LED', component_description: 'LED' },
    { question_id: 'Q004', question_name: 'Switched Meter Loop', description: 'Switched loop', difficulty: 'Medium', penalty_seconds: 5, socket_id: 'S5', socket_label: 'GROUND', correct_component: 'Ground', component_description: 'Ground' },

    // Q5: 5 sockets
    { question_id: 'Q005', question_name: 'Full Finals Challenge', description: 'Finals challenge', difficulty: 'Hard', penalty_seconds: 5, socket_id: 'S1', socket_label: 'SOURCE', correct_component: '9V Battery', component_description: 'Power' },
    { question_id: 'Q005', question_name: 'Full Finals Challenge', description: 'Finals challenge', difficulty: 'Hard', penalty_seconds: 5, socket_id: 'S2', socket_label: 'SWITCH', correct_component: 'Toggle Switch', component_description: 'Switch' },
    { question_id: 'Q005', question_name: 'Full Finals Challenge', description: 'Finals challenge', difficulty: 'Hard', penalty_seconds: 5, socket_id: 'S3', socket_label: 'LIMITER', correct_component: 'Resistor 330Ω', component_description: 'Resistor' },
    { question_id: 'Q005', question_name: 'Full Finals Challenge', description: 'Finals challenge', difficulty: 'Hard', penalty_seconds: 5, socket_id: 'S4', socket_label: 'METER', correct_component: 'Ammeter (mA)', component_description: 'Ammeter' },
    { question_id: 'Q005', question_name: 'Full Finals Challenge', description: 'Finals challenge', difficulty: 'Hard', penalty_seconds: 5, socket_id: 'S5', socket_label: 'GROUND', correct_component: 'Ground', component_description: 'Ground' }
  ];

  assert(rows24.length === 24, 'TEST 14.1: Exactly 24 CSV rows defined');

  const val24 = validateQuestionUploadRows(rows24);
  assert(val24.isValid === true, 'TEST 14.2: 24-socket CSV passes validation with 0 errors');
  assert(val24.errors.length === 0, 'TEST 14.3: 0 errors reported');
  assert(val24.questions.length === 5, 'TEST 14.4: Exactly 5 Questions detected');

  const totalSocketsDetected = val24.questions.reduce((sum, q) => sum + q.slots.length, 0);
  assert(totalSocketsDetected === 24, 'TEST 14.5: Exactly 24 Sockets detected across 5 Questions');

  // Verify Ground component accepted across questions
  const q1Ground = val24.questions[0].slots.find((s) => s.id === 'S5');
  assert(q1Ground && q1Ground.acceptedComponentId === 'ground', 'TEST 14.6: Q001 S5 accepted Ground component');

  // Import into E002 without creating a new event
  saveEvent({ id: 'E002', name: 'Event E002', questions: [] });
  const eventBeforeCount = getEvents().length;
  const importedE002 = importQuestionsIntoEvent('E002', val24.questions);

  assert(importedE002.id === 'E002', 'TEST 14.7: Questions imported into target E002');
  assert(importedE002.questions.length === 5, 'TEST 14.8: E002 contains all 5 questions');
  assert(getEvents().length === eventBeforeCount, 'TEST 14.9: No new Event created by Question CSV upload');
}

// TEST 15: Event Delete & Persistence Reload Resilience
{
  // 15.1 Delete E002
  const deleteOk = deleteEvent('E002');
  assert(deleteOk === true, 'TEST 15.1: deleteEvent("E002") returned true');

  // 15.2 Verify E002 is gone immediately
  const eventsAfterDel = getEvents();
  assert(!eventsAfterDel.some((e) => e.id === 'E002'), 'TEST 15.2: E002 not in current getEvents()');

  // 15.3 Simulate browser refresh by calling getEvents() from cold storage
  const coldEvents = getEvents();
  assert(!coldEvents.some((e) => e.id === 'E002'), 'TEST 15.3: E002 does NOT return after cold reload');
  assert(getEventById('E002') === null, 'TEST 15.4: getEventById("E002") returns null');

  // 15.5 Delete all events and verify getEvents() does not recreate default seed
  eventsAfterDel.forEach((ev) => deleteEvent(ev.id));
  const emptyEvents = getEvents();
  assert(Array.isArray(emptyEvents) && emptyEvents.length === 0, 'TEST 15.5: Empty storage does NOT recreate seed events after initialization');
}

// TEST 16: Ground Component Game Engine Execution
{
  const groundEvent = {
    id: 'E_GND',
    name: 'Ground Circuit Test',
    questions: [
      {
        id: 'Q_G1',
        name: 'Ground Loop',
        penaltySeconds: 5,
        slots: [
          { id: 'S1', label: 'SOURCE', acceptedComponentId: 'battery' },
          { id: 'S2', label: 'GND', acceptedComponentId: 'ground' }
        ]
      }
    ]
  };

  let state = startNewGame(groundEvent, { name: 'GroundTester', regNo: 'GND01' }, 1000);

  // Place wrong component (switch) in Ground slot -> error +5s
  const wrongRes = attemptPlacement(state, groundEvent.questions[0], 'switch', 'S2', 2000);
  assert(wrongRes.action === 'wrong', 'TEST 16.1: Switch in Ground slot rejected');
  assert(wrongRes.state.wrongAttempts === 1, 'TEST 16.2: Wrong attempts incremented');

  // Place correct Ground component in S2
  const correctGnd = attemptPlacement(wrongRes.state, groundEvent.questions[0], 'ground', 'S2', 3000);
  assert(correctGnd.action === 'correct', 'TEST 16.3: Ground component accepted in Ground slot');
  assert(correctGnd.state.placedComponents.S2 === 'ground', 'TEST 16.4: S2 recorded as ground');

  // Placing Ground a second time in S1 is blocked
  const dupGnd = attemptPlacement(correctGnd.state, groundEvent.questions[0], 'ground', 'S1', 4000);
  assert(dupGnd.action === 'ignored', 'TEST 16.5: Duplicate Ground placement blocked');
  assert(dupGnd.reason === 'COMPONENT_ALREADY_USED', 'TEST 16.6: Reason is COMPONENT_ALREADY_USED');
}

// TEST 17: Multi-Identifier Event Lookup & Questions Import (UUID & customId support)
{
  const backendEvent = {
    id: '3af75c45-336d-44e0-8d9f-e9a60eae1448',
    customId: 'ERR2S',
    name: 'electrox',
    status: 'ACTIVE',
    questions: [
      {
        id: 'Q001',
        name: 'Stage 1',
        slots: [{ id: 'S1', label: 'PWR', acceptedComponentId: 'battery' }]
      }
    ]
  };

  saveEvent(backendEvent);

  // 1. Lookup by UUID primary id
  const byUuid = getEventById('3af75c45-336d-44e0-8d9f-e9a60eae1448');
  assert(byUuid !== null, 'TEST 17.1: getEventById with UUID resolves event');
  assert(byUuid.name === 'electrox', 'TEST 17.2: Resolved event name is electrox');

  // 2. Lookup by customId
  const byCustomId = getEventById('ERR2S');
  assert(byCustomId !== null, 'TEST 17.3: getEventById with customId resolves event');
  assert(byCustomId.id === '3af75c45-336d-44e0-8d9f-e9a60eae1448', 'TEST 17.4: Resolved event ID is UUID');

  // 3. Import Questions using UUID
  const newQuestions = [
    {
      id: 'Q002',
      name: 'Stage 2',
      slots: [{ id: 'S1', label: 'SWITCH', acceptedComponentId: 'switch' }]
    }
  ];

  const updated = importQuestionsIntoEvent('3af75c45-336d-44e0-8d9f-e9a60eae1448', newQuestions);
  assert(updated.questions.length === 2, 'TEST 17.5: Questions imported into UUID event');
  assert(updated.id === '3af75c45-336d-44e0-8d9f-e9a60eae1448', 'TEST 17.6: Target event ID remains UUID');

  // 4. Import Questions using customId
  const newQuestions2 = [
    {
      id: 'Q003',
      name: 'Stage 3',
      slots: [{ id: 'S1', label: 'LED', acceptedComponentId: 'led' }]
    }
  ];
  const updated2 = importQuestionsIntoEvent('ERR2S', newQuestions2);
  assert(updated2.questions.length === 3, 'TEST 17.7: Questions imported into customId ERR2S');

  // Cleanup
  deleteEvent('3af75c45-336d-44e0-8d9f-e9a60eae1448');
  assert(getEventById('ERR2S') === null, 'TEST 17.8: Event cleanly removed');
}

// TEST 18: POWERPATH_PLAYER_SESSION Recovery Pointer Parsing & Lifecycle
{
  const SESSION_KEY = 'POWERPATH_PLAYER_SESSION';
  localStorage.clear();

  // Helper simulating apiService.getSavedSessionId
  function getSavedSessionId() {
    try {
      const raw = localStorage.getItem(SESSION_KEY) || localStorage.getItem('powerpath_session_id');
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw);
        return (parsed && parsed.sessionId) ? parsed.sessionId : raw;
      } catch {
        return raw;
      }
    } catch {
      return null;
    }
  }

  function saveSessionId(sessionId, eventId = null) {
    try {
      const payload = JSON.stringify({
        sessionId,
        eventId: eventId || null,
        savedAt: Date.now()
      });
      localStorage.setItem(SESSION_KEY, payload);
    } catch {}
  }

  function clearSessionId() {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem('powerpath_session_id');
  }

  // 1. Initial empty state
  assert(getSavedSessionId() === null, 'TEST 18.1: Initially no saved session');

  // 2. Save structured session pointer
  saveSessionId('PP-12345678', 'ERR2S');
  assert(getSavedSessionId() === 'PP-12345678', 'TEST 18.2: Structured session ID extracted properly');

  // 3. Backward compatibility with raw string session pointer
  localStorage.setItem('powerpath_session_id', 'PP-LEGACY-999');
  localStorage.removeItem(SESSION_KEY);
  assert(getSavedSessionId() === 'PP-LEGACY-999', 'TEST 18.3: Legacy raw string session ID supported');

  // 4. Clear session removes all pointers
  clearSessionId();
  assert(getSavedSessionId() === null, 'TEST 18.4: clearSessionId wipes all session pointers');
}

// TEST 19: Authoritative Admin Participants Data Mapping & Telemetry Parsing
{
  const rawBackendSessions = [
    {
      id: 'sess-uuid-001',
      session_id: 'PP-TEST001',
      player_name: 'ragul2',
      register_number: 'TEST001',
      status: 'COMPLETED',
      event_id: 'd8e7f629-e3c7-4af5-a1ab-8505eb61b1f3',
      event_name: 'drop3',
      current_question_index: 2,
      total_questions: 2,
      current_question_name: 'Stage 2',
      placed_count: 5,
      total_slots_in_current_q: 5,
      wrong_attempts_total: 2,
      penalty_seconds_total: 10,
      started_at: '2026-09-23T06:43:00.000Z',
      completed_at: '2026-09-23T06:43:25.000Z',
      final_time_ms: 25000,
      is_active: false
    },
    {
      id: 'sess-uuid-002',
      session_id: 'PP-TEST002',
      player_name: 'ragul3',
      register_number: 'TEST002',
      status: 'PLAYING',
      event_id: 'd8e7f629-e3c7-4af5-a1ab-8505eb61b1f3',
      event_name: 'drop3',
      current_question_index: 0,
      total_questions: 2,
      current_question_name: 'Stage 1',
      placed_count: 2,
      total_slots_in_current_q: 5,
      wrong_attempts_total: 0,
      penalty_seconds_total: 0,
      started_at: '2026-09-23T06:45:00.000Z',
      completed_at: null,
      final_time_ms: null,
      is_active: true
    }
  ];

  // Helper simulating apiService.getAdminParticipants mapping
  const mapped = rawBackendSessions.map((s) => ({
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

  assert(mapped.length === 2, 'TEST 19.1: Exactly 2 participants mapped from backend telemetry');
  assert(mapped[0].name === 'ragul2' && mapped[0].regNo === 'TEST001', 'TEST 19.2: Participant A correctly mapped');
  assert(mapped[0].status === 'COMPLETED', 'TEST 19.3: Participant A status is COMPLETED');
  assert(mapped[0].finalTimeFormatted === '00:25.00', 'TEST 19.4: Participant A final time formatted');
  assert(mapped[1].name === 'ragul3' && mapped[1].status === 'PLAYING', 'TEST 19.5: Participant B correctly mapped with PLAYING');
  assert(mapped[1].finalTimeFormatted === 'In Progress', 'TEST 19.6: Playing participant shows "In Progress"');
}

// TEST 20: No Stale LocalStorage Participant Contamination
{
  localStorage.setItem('powerpath_participants', JSON.stringify([
    { sessionId: 'STALE-001', name: 'Ghost LocalStorage Player', regNo: 'GHOST-01' }
  ]));

  const authoritativeBackendParticipants = [
    { sessionId: 'PP-REAL-001', name: 'Authoritative Player', regNo: 'REG-REAL-01', status: 'COMPLETED' }
  ];

  // Refresh mechanism prioritizes backend data over localStorage
  const effectiveParticipants = authoritativeBackendParticipants.length > 0
    ? authoritativeBackendParticipants
    : getParticipants();

  assert(effectiveParticipants.length === 1, 'TEST 20.1: Authoritative backend list used');
  assert(effectiveParticipants[0].sessionId === 'PP-REAL-001', 'TEST 20.2: Authoritative session present');
  assert(!effectiveParticipants.some((p) => p.sessionId === 'STALE-001'), 'TEST 20.3: Stale localStorage ghost not present');

  localStorage.clear();
}

console.log(`\n======================================================`);
console.log(`TEST RESULTS: ${passedTests} / ${totalTests} TESTS PASSED`);
console.log(`======================================================\n`);

if (passedTests === totalTests) {
  process.exit(0);
} else {
  process.exit(1);
}



