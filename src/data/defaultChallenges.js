/**
 * DROP & CONNECT - Default Seed Challenges
 * Dynamic challenge configurations loaded by the system.
 */

export const DEFAULT_CHALLENGES = [
  {
    id: 'C001',
    name: 'Basic Series DC Loop',
    description: 'Assemble a fundamental 9V DC series circuit with control switch, current limiting resistor, LED emitter, and series current meter.',
    difficulty: 'Easy',
    penaltySeconds: 5,
    status: 'ACTIVE',
    slots: [
      {
        id: 'S1',
        label: 'SOURCE',
        category: 'Power Supply',
        hint: '9V DC Voltage Source',
        acceptedComponentId: 'battery',
        pinLabelLeft: 'PWR+',
        pinLabelRight: 'GND-',
        slotOrder: 1
      },
      {
        id: 'S2',
        label: 'SWITCH',
        category: 'Control',
        hint: 'SPST Power Switch',
        acceptedComponentId: 'switch',
        pinLabelLeft: 'IN',
        pinLabelRight: 'OUT',
        slotOrder: 2
      },
      {
        id: 'S3',
        label: 'LIMITER',
        category: 'Protection',
        hint: 'Current Limiting Resistor',
        acceptedComponentId: 'resistor',
        pinLabelLeft: 'IN',
        pinLabelRight: 'OUT',
        slotOrder: 3
      },
      {
        id: 'S4',
        label: 'INDICATOR',
        category: 'Output',
        hint: 'Visual LED Diode',
        acceptedComponentId: 'led',
        pinLabelLeft: 'ANODE',
        pinLabelRight: 'CATHODE',
        slotOrder: 4
      },
      {
        id: 'S5',
        label: 'METER',
        category: 'Measurement',
        hint: 'Series In-Line Ammeter',
        acceptedComponentId: 'ammeter',
        pinLabelLeft: 'mA+',
        pinLabelRight: 'COM-',
        slotOrder: 5
      }
    ],
    createdAt: '2026-09-22T08:00:00.000Z',
    updatedAt: '2026-09-22T08:00:00.000Z'
  },
  {
    id: 'C002',
    name: 'Protected LED Branch',
    description: 'A compact 3-component branch circuit focusing on voltage supply and diode current regulation.',
    difficulty: 'Easy',
    penaltySeconds: 5,
    status: 'INACTIVE',
    slots: [
      {
        id: 'S1',
        label: 'SOURCE',
        category: 'Power Supply',
        hint: 'DC Voltage Source',
        acceptedComponentId: 'battery',
        pinLabelLeft: 'PWR+',
        pinLabelRight: 'GND-',
        slotOrder: 1
      },
      {
        id: 'S2',
        label: 'LIMITER',
        category: 'Protection',
        hint: 'Current Limiting Resistor',
        acceptedComponentId: 'resistor',
        pinLabelLeft: 'IN',
        pinLabelRight: 'OUT',
        slotOrder: 2
      },
      {
        id: 'S3',
        label: 'INDICATOR',
        category: 'Output',
        hint: 'Visual LED Diode',
        acceptedComponentId: 'led',
        pinLabelLeft: 'ANODE',
        pinLabelRight: 'CATHODE',
        slotOrder: 3
      }
    ],
    createdAt: '2026-09-22T08:30:00.000Z',
    updatedAt: '2026-09-22T08:30:00.000Z'
  },
  {
    id: 'C003',
    name: 'Switched Telemetry Loop',
    description: 'Current monitoring test circuit requiring inline power switching and precise current measurement.',
    difficulty: 'Medium',
    penaltySeconds: 5,
    status: 'INACTIVE',
    slots: [
      {
        id: 'S1',
        label: 'SOURCE',
        category: 'Power Supply',
        hint: '9V DC Voltage Source',
        acceptedComponentId: 'battery',
        pinLabelLeft: 'PWR+',
        pinLabelRight: 'GND-',
        slotOrder: 1
      },
      {
        id: 'S2',
        label: 'SWITCH',
        category: 'Control',
        hint: 'SPST Power Switch',
        acceptedComponentId: 'switch',
        pinLabelLeft: 'IN',
        pinLabelRight: 'OUT',
        slotOrder: 2
      },
      {
        id: 'S3',
        label: 'LIMITER',
        category: 'Protection',
        hint: 'Current Limiting Resistor',
        acceptedComponentId: 'resistor',
        pinLabelLeft: 'IN',
        pinLabelRight: 'OUT',
        slotOrder: 3
      },
      {
        id: 'S4',
        label: 'METER',
        category: 'Measurement',
        hint: 'Series In-Line Ammeter',
        acceptedComponentId: 'ammeter',
        pinLabelLeft: 'mA+',
        pinLabelRight: 'COM-',
        slotOrder: 4
      }
    ],
    createdAt: '2026-09-22T09:00:00.000Z',
    updatedAt: '2026-09-22T09:00:00.000Z'
  }
];
