/**
 * DROP & CONNECT - Default Event & Questions Structure
 * Hierarchy: EVENT -> QUESTIONS -> SLOTS
 */

export const DEFAULT_EVENTS = [
  {
    id: 'E001',
    name: 'POWERPATH — Championship Round 1',
    description: 'Official electronics symposium circuit challenge consisting of progressive circuit assembly stages.',
    status: 'ACTIVE',
    createdAt: '2026-09-22T08:00:00.000Z',
    updatedAt: '2026-09-22T08:00:00.000Z',
    questions: [
      {
        id: 'Q001',
        name: 'Basic Series DC Loop',
        description: 'Assemble a fundamental 9V DC series loop with switch control, resistor protection, LED emission, and series current meter.',
        difficulty: 'Easy',
        penaltySeconds: 5,
        questionOrder: 1,
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
            hint: 'Current Limiting Resistor 330Ω',
            acceptedComponentId: 'resistor',
            pinLabelLeft: 'IN',
            pinLabelRight: 'OUT',
            slotOrder: 3
          },
          {
            id: 'S4',
            label: 'INDICATOR',
            category: 'Output',
            hint: 'Visual Red LED Indicator',
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
        ]
      },
      {
        id: 'Q002',
        name: 'Protected LED Branch',
        description: 'A compact 3-component branch circuit testing fast component placement and current limiting.',
        difficulty: 'Easy',
        penaltySeconds: 5,
        questionOrder: 2,
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
            label: 'LIMITER',
            category: 'Protection',
            hint: 'Current Limiter 330Ω',
            acceptedComponentId: 'resistor',
            pinLabelLeft: 'IN',
            pinLabelRight: 'OUT',
            slotOrder: 2
          },
          {
            id: 'S3',
            label: 'INDICATOR',
            category: 'Output',
            hint: 'Visual Red LED Diode',
            acceptedComponentId: 'led',
            pinLabelLeft: 'ANODE',
            pinLabelRight: 'CATHODE',
            slotOrder: 3
          }
        ]
      },
      {
        id: 'Q003',
        name: 'Switched Telemetry Loop',
        description: 'Power switching loop requiring inline power interruption and in-line current telemetry.',
        difficulty: 'Medium',
        penaltySeconds: 5,
        questionOrder: 3,
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
        ]
      }
    ]
  }
];
