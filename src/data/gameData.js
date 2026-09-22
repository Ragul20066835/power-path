/**
 * DROP & CONNECT - Global Component Catalog & Constants
 * Global component definitions used across Player and Admin modules.
 */

export const DEFAULT_PENALTY_SECONDS = 5;

export const STORAGE_KEYS = {
  SESSION: 'drop_and_connect_session_v3',
  INITIALIZED: 'drop_and_connect_initialized_v3',
  EVENTS: 'drop_and_connect_events_v3',
  SETTINGS: 'drop_and_connect_settings_v3',
  PARTICIPANTS: 'drop_and_connect_participants_v3',
  RESULTS: 'drop_and_connect_results_v3',
  ADMIN_AUTH: 'drop_and_connect_admin_auth_v3'
};

export const GLOBAL_COMPONENTS = [
  {
    id: 'battery',
    name: '9V Battery',
    code: 'DC-9V',
    category: 'Source',
    isDecoy: false,
    rating: '9V DC / 500mAh',
    description: 'Supplies electromotive force to drive direct current through the circuit.'
  },
  {
    id: 'switch',
    name: 'Toggle Switch',
    code: 'SW-SPST',
    category: 'Control',
    isDecoy: false,
    rating: '250V / 3A Rating',
    description: 'Manually closes or interrupts circuit continuity in the primary loop.'
  },
  {
    id: 'resistor',
    name: 'Resistor 330Ω',
    code: 'R-330Ω',
    category: 'Protection',
    isDecoy: false,
    rating: '330Ω ±5% / 0.25W',
    description: 'Limits forward current to protect sensitive components from burning out.'
  },
  {
    id: 'led',
    name: 'LED Indicator',
    code: 'LED-RED',
    category: 'Output',
    isDecoy: false,
    rating: '2.0V Vf / 20mA If',
    description: 'Solid-state semiconductor emitting red photons when forward biased.'
  },
  {
    id: 'ammeter',
    name: 'Ammeter (mA)',
    code: 'MTR-AM',
    category: 'Measurement',
    isDecoy: false,
    rating: '0-50mA Series Range',
    description: 'Low internal impedance meter wired in series to measure loop current.'
  },
  {
    id: 'ground',
    name: 'Ground',
    code: 'GND-0V',
    category: 'Reference',
    isDecoy: false,
    rating: '0V Reference Potential',
    description: 'Provides common circuit ground 0V reference potential and safety return path.'
  },
  {
    id: 'voltmeter',
    name: 'Voltmeter (V)',
    code: 'MTR-VM',
    category: 'Decoy',
    isDecoy: true,
    rating: '0-20V Parallel Range',
    description: 'High internal impedance meter meant for parallel voltage checks (DECOY).'
  },
  {
    id: 'capacitor',
    name: 'Capacitor 100μF',
    code: 'CAP-100μF',
    category: 'Decoy',
    isDecoy: true,
    rating: '100μF / 25V Electrolytic',
    description: 'Stores electric charge; blocks DC steady-state current flow (DECOY).'
  },
  {
    id: 'inductor',
    name: 'Inductor 10mH',
    code: 'IND-10mH',
    category: 'Decoy',
    isDecoy: true,
    rating: '10mH Ferrite Core Choke',
    description: 'Opposes rapid AC current changes with magnetic flux (DECOY).'
  }
];

export const COMPONENTS_MAP = Object.fromEntries(
  GLOBAL_COMPONENTS.map(c => [c.id, c])
);
