/**
 * DROP & CONNECT - Excel / CSV Parser, Validator & Template Generator
 * Hierarchy: EVENT -> QUESTIONS -> SLOTS
 * Handles bulk event and question uploads with strict transactional validation.
 */

import * as XLSX from 'xlsx';
import { COMPONENTS_MAP, DEFAULT_PENALTY_SECONDS } from '../data/gameData.js';

/**
 * Normalizes raw component input (from strings, display names, or IDs) into canonical component IDs
 */
export function normalizeComponentId(rawVal) {
  if (!rawVal) return null;
  const str = String(rawVal).trim().toLowerCase();

  // Direct ID check
  if (COMPONENTS_MAP[str]) return str;

  // Keyword / Substring / Alias matching
  if (str.includes('battery') || str.includes('dc-9v') || str.includes('voltage source') || str.includes('9v')) return 'battery';
  if (str.includes('switch') || str.includes('spst') || str.includes('toggle')) return 'switch';
  if (str.includes('resistor') || str.includes('limiter') || str.includes('330') || str.includes('ohm') || str.includes('r-')) return 'resistor';
  if (str.includes('led') || str.includes('diode') || str.includes('indicator') || str.includes('light')) return 'led';
  if (str.includes('ammeter') || str.includes('mtr-am') || str.includes('current meter')) return 'ammeter';
  if (str.includes('ground') || str.includes('gnd') || str.includes('earth') || str.includes('0v')) return 'ground';
  if (str.includes('voltmeter') || str.includes('mtr-vm') || str.includes('volt meter')) return 'voltmeter';
  if (str.includes('capacitor') || str.includes('cap-') || str.includes('100uf') || str.includes('100μf')) return 'capacitor';
  if (str.includes('inductor') || str.includes('ind-') || str.includes('10mh') || str.includes('choke')) return 'inductor';

  return null;
}

// ----------------------------------------------------------------------------
// 1. EVENT BULK TEMPLATE
// ----------------------------------------------------------------------------
export const REQUIRED_COLUMNS = [
  'event_id',
  'event_name',
  'question_id',
  'question_name',
  'difficulty',
  'slot_id',
  'slot_label',
  'correct_component',
  'hint'
];

export const SAMPLE_TEMPLATE_ROWS = [
  // Event E001 - Question 1 (5 Slots)
  {
    event_id: 'E001',
    event_name: 'POWERPATH — Championship Round 1',
    question_id: 'Q001',
    question_name: 'Basic Series DC Loop',
    difficulty: 'Easy',
    slot_id: 'S1',
    slot_label: 'SOURCE',
    correct_component: '9V Battery',
    hint: '9V DC Voltage Source'
  },
  {
    event_id: 'E001',
    event_name: 'POWERPATH — Championship Round 1',
    question_id: 'Q001',
    question_name: 'Basic Series DC Loop',
    difficulty: 'Easy',
    slot_id: 'S2',
    slot_label: 'SWITCH',
    correct_component: 'Toggle Switch',
    hint: 'Power Continuity Switch'
  },
  {
    event_id: 'E001',
    event_name: 'POWERPATH — Championship Round 1',
    question_id: 'Q001',
    question_name: 'Basic Series DC Loop',
    difficulty: 'Easy',
    slot_id: 'S3',
    slot_label: 'LIMITER',
    correct_component: 'Resistor 330Ω',
    hint: 'Current Limiting Resistor 330Ω'
  },
  {
    event_id: 'E001',
    event_name: 'POWERPATH — Championship Round 1',
    question_id: 'Q001',
    question_name: 'Basic Series DC Loop',
    difficulty: 'Easy',
    slot_id: 'S4',
    slot_label: 'INDICATOR',
    correct_component: 'LED',
    hint: 'Visual Red LED Indicator'
  },
  {
    event_id: 'E001',
    event_name: 'POWERPATH — Championship Round 1',
    question_id: 'Q001',
    question_name: 'Basic Series DC Loop',
    difficulty: 'Easy',
    slot_id: 'S5',
    slot_label: 'METER',
    correct_component: 'Ammeter (mA)',
    hint: 'Series In-Line Current Meter'
  }
];

// ----------------------------------------------------------------------------
// 2. QUESTIONS-ONLY TEMPLATE (For uploading into an existing Event)
// ----------------------------------------------------------------------------
export const QUESTION_REQUIRED_COLUMNS = [
  'question_id',
  'question_name',
  'description',
  'difficulty',
  'penalty_seconds',
  'socket_id',
  'socket_label',
  'correct_component',
  'component_description'
];

export const SAMPLE_QUESTION_TEMPLATE_ROWS = [
  {
    question_id: 'Q001',
    question_name: 'Basic Series Circuit',
    description: 'Connect the circuit components in the correct series sequence.',
    difficulty: 'Easy',
    penalty_seconds: 5,
    socket_id: 'S1',
    socket_label: 'SOURCE',
    correct_component: '9V Battery',
    component_description: '9V DC Voltage Source'
  },
  {
    question_id: 'Q001',
    question_name: 'Basic Series Circuit',
    description: 'Connect the circuit components in the correct series sequence.',
    difficulty: 'Easy',
    penalty_seconds: 5,
    socket_id: 'S2',
    socket_label: 'SWITCH',
    correct_component: 'Toggle Switch',
    component_description: 'Power Continuity Switch'
  },
  {
    question_id: 'Q001',
    question_name: 'Basic Series Circuit',
    description: 'Connect the circuit components in the correct series sequence.',
    difficulty: 'Easy',
    penalty_seconds: 5,
    socket_id: 'S3',
    socket_label: 'LIMITER',
    correct_component: 'Resistor 330Ω',
    component_description: 'Current Limiting Resistor'
  },
  {
    question_id: 'Q001',
    question_name: 'Basic Series Circuit',
    description: 'Connect the circuit components in the correct series sequence.',
    difficulty: 'Easy',
    penalty_seconds: 5,
    socket_id: 'S4',
    socket_label: 'OUTPUT',
    correct_component: 'LED',
    component_description: 'Light Emitting Diode'
  },
  {
    question_id: 'Q001',
    question_name: 'Basic Series Circuit',
    description: 'Connect the circuit components in the correct series sequence.',
    difficulty: 'Easy',
    penalty_seconds: 5,
    socket_id: 'S5',
    socket_label: 'REFERENCE',
    correct_component: 'Ground',
    component_description: '0V Circuit Ground Return'
  },
  {
    question_id: 'Q002',
    question_name: 'Metered Protection Loop',
    description: 'Build a circuit with current limitation and series metering.',
    difficulty: 'Medium',
    penalty_seconds: 5,
    socket_id: 'S1',
    socket_label: 'SOURCE',
    correct_component: '9V Battery',
    component_description: 'DC Power Source'
  },
  {
    question_id: 'Q002',
    question_name: 'Metered Protection Loop',
    description: 'Build a circuit with current limitation and series metering.',
    difficulty: 'Medium',
    penalty_seconds: 5,
    socket_id: 'S2',
    socket_label: 'LIMITER',
    correct_component: 'Resistor 330Ω',
    component_description: 'Current Limiter'
  },
  {
    question_id: 'Q002',
    question_name: 'Metered Protection Loop',
    description: 'Build a circuit with current limitation and series metering.',
    difficulty: 'Medium',
    penalty_seconds: 5,
    socket_id: 'S3',
    socket_label: 'METER',
    correct_component: 'Ammeter (mA)',
    component_description: 'Series Current Meter'
  },
  {
    question_id: 'Q002',
    question_name: 'Metered Protection Loop',
    description: 'Build a circuit with current limitation and series metering.',
    difficulty: 'Medium',
    penalty_seconds: 5,
    socket_id: 'S4',
    socket_label: 'INDICATOR',
    correct_component: 'LED',
    component_description: 'Visual Indicator'
  },
  {
    question_id: 'Q002',
    question_name: 'Metered Protection Loop',
    description: 'Build a circuit with current limitation and series metering.',
    difficulty: 'Medium',
    penalty_seconds: 5,
    socket_id: 'S5',
    socket_label: 'GROUND',
    correct_component: 'Ground',
    component_description: 'Common Ground Return'
  }
];

// ============================================================================
// 3. TEMPLATE DOWNLOADERS
// ============================================================================

export function downloadCsvTemplate() {
  const headers = REQUIRED_COLUMNS.join(',');
  const rows = SAMPLE_TEMPLATE_ROWS.map((r) =>
    REQUIRED_COLUMNS.map((col) => `"${String(r[col] || '').replace(/"/g, '""')}"`).join(',')
  );
  const csvContent = [headers, ...rows].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', 'powerpath_event_template.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadExcelTemplate() {
  const worksheet = XLSX.utils.json_to_sheet(SAMPLE_TEMPLATE_ROWS, {
    header: REQUIRED_COLUMNS
  });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Events & Questions');

  XLSX.writeFile(workbook, 'powerpath_event_template.xlsx');
}

export function downloadQuestionsCsvTemplate() {
  const headers = QUESTION_REQUIRED_COLUMNS.join(',');
  const rows = SAMPLE_QUESTION_TEMPLATE_ROWS.map((r) =>
    QUESTION_REQUIRED_COLUMNS.map((col) => `"${String(r[col] || '').replace(/"/g, '""')}"`).join(',')
  );
  const csvContent = [headers, ...rows].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', 'powerpath_questions_template.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ============================================================================
// 4. PARSE FILE (CSV or XLSX)
// ============================================================================

export async function parseUploadFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        const rawJson = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
        resolve(rawJson);
      } catch (err) {
        reject(new Error(`Failed to parse file: ${err.message}`));
      }
    };

    reader.onerror = () => {
      reject(new Error('Failed reading the selected file.'));
    };

    reader.readAsBinaryString(file);
  });
}

// ============================================================================
// 5. TRANSACTIONAL VALIDATOR (EVENT -> QUESTIONS -> SLOTS)
// ============================================================================

export function validateUploadRows(rows) {
  const errors = [];
  if (!rows || !Array.isArray(rows) || rows.length === 0) {
    return {
      isValid: false,
      errors: [{ row: 0, message: 'The uploaded file contains no data rows.' }],
      events: [],
      totalRows: 0
    };
  }

  // Check column names
  const firstRow = rows[0];
  const normalizedRowKeys = Object.keys(firstRow).map((k) => k.trim().toLowerCase());

  const hasEventCol = normalizedRowKeys.includes('event_id');
  const hasQuestionCol = normalizedRowKeys.includes('question_id') || normalizedRowKeys.includes('challenge_id');

  if (!hasQuestionCol) {
    errors.push({
      row: 1,
      message: `Missing required column "question_id" (or "challenge_id"). Found headers: [${Object.keys(firstRow).join(', ')}]`
    });
    return {
      isValid: false,
      errors,
      events: [],
      totalRows: rows.length
    };
  }

  // Hierarchy Map: event_id -> { id, name, questionsMap: question_id -> { id, name, slots: [] } }
  const eventsMap = new Map();

  rows.forEach((rawRow, idx) => {
    const rowNum = idx + 2;

    const row = {};
    Object.entries(rawRow).forEach(([k, v]) => {
      row[k.trim().toLowerCase()] = typeof v === 'string' ? v.trim() : String(v || '').trim();
    });

    const eventId = row.event_id || 'E001';
    const eventName = row.event_name || 'Imported Circuit Event';
    const questionId = row.question_id || row.challenge_id;
    const questionName = row.question_name || row.challenge_name || `Circuit Question ${questionId}`;
    const difficulty = row.difficulty || 'Easy';
    const slotId = row.slot_id || row.socket_id;
    const slotLabel = row.slot_label || row.socket_label;
    const rawComponent = row.correct_component || row.component;
    const hint = row.hint || row.component_description || '';

    // Validate fields
    if (!eventId) {
      errors.push({ row: rowNum, message: 'Missing required field "event_id"' });
    }
    if (!questionId) {
      errors.push({ row: rowNum, message: 'Missing required field "question_id"' });
    }
    if (!slotId) {
      errors.push({ row: rowNum, message: 'Missing required field "slot_id" (or socket_id)' });
    }
    if (!slotLabel) {
      errors.push({ row: rowNum, message: 'Missing required field "slot_label" (or socket_label)' });
    }
    if (!rawComponent) {
      errors.push({ row: rowNum, message: 'Missing required field "correct_component"' });
    }

    const normalizedComp = normalizeComponentId(rawComponent);
    if (rawComponent && !normalizedComp) {
      errors.push({
        row: rowNum,
        message: `Unknown component "${rawComponent}". Valid components are: 9V Battery, Toggle Switch, Resistor 330Ω, LED, Ammeter, Ground, Voltmeter, Capacitor, Inductor.`
      });
    }

    if (eventId && questionId && slotId && normalizedComp) {
      // 1. Ensure Event exists in map
      if (!eventsMap.has(eventId)) {
        eventsMap.set(eventId, {
          id: eventId,
          name: eventName,
          description: `Event: ${eventName}`,
          status: 'INACTIVE',
          questionsMap: new Map()
        });
      }

      const event = eventsMap.get(eventId);

      // 2. Ensure Question exists in event's questionsMap
      if (!event.questionsMap.has(questionId)) {
        event.questionsMap.set(questionId, {
          id: questionId,
          name: questionName,
          description: `Question: ${questionName}`,
          difficulty: difficulty,
          penaltySeconds: DEFAULT_PENALTY_SECONDS,
          questionOrder: event.questionsMap.size + 1,
          slots: [],
          slotIdsSet: new Set()
        });
      }

      const question = event.questionsMap.get(questionId);

      // 3. Check duplicate slot within same question
      if (question.slotIdsSet.has(slotId.toUpperCase())) {
        errors.push({
          row: rowNum,
          message: `Duplicate slot_id "${slotId}" in question "${questionId}" of event "${eventId}". Each slot ID must be unique within its question.`
        });
      } else {
        question.slotIdsSet.add(slotId.toUpperCase());
        question.slots.push({
          id: slotId.toUpperCase(),
          label: (slotLabel || slotId).toUpperCase(),
          category: COMPONENTS_MAP[normalizedComp]?.category || 'General',
          hint: hint || COMPONENTS_MAP[normalizedComp]?.name || '',
          acceptedComponentId: normalizedComp,
          pinLabelLeft: 'IN',
          pinLabelRight: 'OUT',
          slotOrder: question.slots.length + 1
        });
      }
    }
  });

  // Structural constraints validation
  const finalizedEvents = [];
  let totalQuestionsCount = 0;

  eventsMap.forEach((event) => {
    const questionsArray = [];
    event.questionsMap.forEach((question) => {
      if (question.slots.length < 2) {
        errors.push({
          row: 0,
          message: `Question "${question.id}" in Event "${event.id}" has only ${question.slots.length} slot(s). A circuit question must have at least 2 sockets.`
        });
      }
      delete question.slotIdsSet;
      questionsArray.push(question);
    });

    if (questionsArray.length === 0) {
      errors.push({
        row: 0,
        message: `Event "${event.id}" contains 0 valid questions.`
      });
    }

    delete event.questionsMap;
    event.questions = questionsArray;
    totalQuestionsCount += questionsArray.length;
    finalizedEvents.push(event);
  });

  const isValid = errors.length === 0;

  return {
    isValid,
    errors,
    events: isValid ? finalizedEvents : [],
    totalRows: rows.length,
    detectedEventsCount: finalizedEvents.length,
    detectedQuestionsCount: totalQuestionsCount
  };
}

// ============================================================================
// 6. QUESTION-ONLY CSV VALIDATOR (Adds Questions into an existing Event)
// ============================================================================

export function validateQuestionUploadRows(rows) {
  const errors = [];
  if (!rows || !Array.isArray(rows) || rows.length === 0) {
    return {
      isValid: false,
      errors: [{ row: 0, message: 'The uploaded file contains no data rows.' }],
      questions: [],
      totalRows: 0
    };
  }

  const questionsMap = new Map();

  rows.forEach((rawRow, idx) => {
    const rowNum = idx + 2;
    const row = {};
    Object.entries(rawRow).forEach(([k, v]) => {
      row[k.trim().toLowerCase()] = typeof v === 'string' ? v.trim() : String(v || '').trim();
    });

    const questionId = row.question_id || row.challenge_id;
    const questionName = row.question_name || row.challenge_name;
    const description = row.description || `Circuit Question ${questionId}`;
    const rawDifficulty = row.difficulty || 'Easy';
    const rawPenalty = row.penalty_seconds || row.penalty || '5';
    const socketId = row.socket_id || row.slot_id;
    const socketLabel = row.socket_label || row.slot_label;
    const rawComponent = row.correct_component || row.component;
    const componentDesc = row.component_description || row.hint || '';

    // Field Validations
    if (!questionId) {
      errors.push({ row: rowNum, message: 'Missing required field "question_id"' });
    }
    if (!questionName) {
      errors.push({ row: rowNum, message: 'Missing required field "question_name"' });
    }
    if (!socketId) {
      errors.push({ row: rowNum, message: 'Missing required field "socket_id"' });
    }
    if (!socketLabel) {
      errors.push({ row: rowNum, message: 'Missing required field "socket_label"' });
    }
    if (!rawComponent) {
      errors.push({ row: rowNum, message: 'Missing required field "correct_component"' });
    }

    const normalizedComp = normalizeComponentId(rawComponent);
    if (rawComponent && !normalizedComp) {
      errors.push({
        row: rowNum,
        message: `Unknown component "${rawComponent}". Valid options: 9V Battery, Toggle Switch, Resistor 330Ω, LED, Ammeter, Ground, Voltmeter, Capacitor, Inductor.`
      });
    }

    const penaltyNum = Number(rawPenalty);
    if (isNaN(penaltyNum) || penaltyNum <= 0) {
      errors.push({
        row: rowNum,
        message: `Invalid penalty_seconds value "${rawPenalty}". Must be a positive number.`
      });
    }

    const difficultyNormalized = ['easy', 'medium', 'hard'].includes(rawDifficulty.toLowerCase())
      ? rawDifficulty.charAt(0).toUpperCase() + rawDifficulty.slice(1).toLowerCase()
      : null;

    if (!difficultyNormalized) {
      errors.push({
        row: rowNum,
        message: `Invalid difficulty "${rawDifficulty}". Must be Easy, Medium, or Hard.`
      });
    }

    if (questionId && socketId && normalizedComp && difficultyNormalized && penaltyNum > 0) {
      if (!questionsMap.has(questionId)) {
        questionsMap.set(questionId, {
          id: questionId,
          name: questionName,
          description: description,
          difficulty: difficultyNormalized,
          penaltySeconds: penaltyNum,
          questionOrder: questionsMap.size + 1,
          slots: [],
          socketIdsSet: new Set()
        });
      }

      const q = questionsMap.get(questionId);

      // Check duplicate socket_id within this question
      if (q.socketIdsSet.has(socketId.toUpperCase())) {
        errors.push({
          row: rowNum,
          message: `Duplicate socket_id "${socketId}" inside question "${questionId}". Each socket ID must be unique within its question.`
        });
      } else {
        q.socketIdsSet.add(socketId.toUpperCase());
        q.slots.push({
          id: socketId.toUpperCase(),
          label: (socketLabel || socketId).toUpperCase(),
          hint: componentDesc || COMPONENTS_MAP[normalizedComp]?.description || '',
          acceptedComponentId: normalizedComp,
          pinLabelLeft: 'IN',
          pinLabelRight: 'OUT',
          slotOrder: q.slots.length + 1
        });
      }
    }
  });

  const finalizedQuestions = [];
  questionsMap.forEach((q) => {
    if (q.slots.length < 2) {
      errors.push({
        row: 0,
        message: `Question "${q.id}" has only ${q.slots.length} socket(s). A circuit question must have at least 2 sockets.`
      });
    }
    delete q.socketIdsSet;
    finalizedQuestions.push(q);
  });

  const isValid = errors.length === 0;
  return {
    isValid,
    errors,
    questions: isValid ? finalizedQuestions : [],
    totalRows: rows.length,
    detectedQuestionsCount: finalizedQuestions.length
  };
}

