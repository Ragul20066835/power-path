"""
POWERPATH - Component Catalogue & Global System Constants
"""

from typing import Dict, Any, List
from enum import Enum

class ComponentCategory(str, Enum):
    SOURCE = "Source"
    CONTROL = "Control"
    PROTECTION = "Protection"
    OUTPUT = "Output"
    MEASUREMENT = "Measurement"
    REFERENCE = "Reference"
    DECOY = "Decoy"

class EventStatus(str, Enum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"

class TournamentGate(str, Enum):
    OPEN = "OPEN"
    PAUSED = "PAUSED"
    CLOSED = "CLOSED"

class SessionStatus(str, Enum):
    PLAYING = "PLAYING"
    COMPLETED = "COMPLETED"
    ABANDONED = "ABANDONED"

class AdminRole(str, Enum):
    SUPER_ADMIN = "SUPER_ADMIN"
    EVENT_ADMIN = "EVENT_ADMIN"

DEFAULT_PENALTY_SECONDS = 5

# Canonical 9 Electronic Components
GLOBAL_COMPONENTS: List[Dict[str, Any]] = [
    {
        "id": "battery",
        "name": "9V Battery",
        "code": "DC-9V",
        "category": ComponentCategory.SOURCE,
        "is_decoy": False,
        "rating": "9V DC / 500mAh",
        "description": "Supplies electromotive force to drive direct current through the circuit."
    },
    {
        "id": "switch",
        "name": "Toggle Switch",
        "code": "SW-SPST",
        "category": ComponentCategory.CONTROL,
        "is_decoy": False,
        "rating": "250V / 3A Rating",
        "description": "Manually closes or interrupts circuit continuity in the primary loop."
    },
    {
        "id": "resistor",
        "name": "Resistor 330Ω",
        "code": "R-330Ω",
        "category": ComponentCategory.PROTECTION,
        "is_decoy": False,
        "rating": "330Ω ±5% / 0.25W",
        "description": "Limits forward current to protect sensitive components from burning out."
    },
    {
        "id": "led",
        "name": "LED",
        "code": "LED-RED",
        "category": ComponentCategory.OUTPUT,
        "is_decoy": False,
        "rating": "2.0V Vf / 20mA If",
        "description": "Solid-state semiconductor emitting red photons when forward biased."
    },
    {
        "id": "ammeter",
        "name": "Ammeter",
        "code": "MTR-AM",
        "category": ComponentCategory.MEASUREMENT,
        "is_decoy": False,
        "rating": "0-50mA Series Range",
        "description": "Low internal impedance meter wired in series to measure loop current."
    },
    {
        "id": "ground",
        "name": "Ground",
        "code": "GND-0V",
        "category": ComponentCategory.REFERENCE,
        "is_decoy": False,
        "rating": "0V Reference Potential",
        "description": "Provides common circuit ground 0V reference potential and safety return path."
    },
    {
        "id": "voltmeter",
        "name": "Voltmeter",
        "code": "MTR-VM",
        "category": ComponentCategory.DECOY,
        "is_decoy": True,
        "rating": "0-20V Parallel Range",
        "description": "High internal impedance meter meant for parallel voltage checks (DECOY)."
    },
    {
        "id": "capacitor",
        "name": "Capacitor",
        "code": "CAP-100μF",
        "category": ComponentCategory.DECOY,
        "is_decoy": True,
        "rating": "100μF / 25V Electrolytic",
        "description": "Stores electric charge; blocks DC steady-state current flow (DECOY)."
    },
    {
        "id": "inductor",
        "name": "Inductor",
        "code": "IND-10mH",
        "category": ComponentCategory.DECOY,
        "is_decoy": True,
        "rating": "10mH Ferrite Core Choke",
        "description": "Opposes rapid AC current changes with magnetic flux (DECOY)."
    }
]

COMPONENTS_MAP: Dict[str, Dict[str, Any]] = {c["id"]: c for c in GLOBAL_COMPONENTS}
VALID_COMPONENT_IDS = set(COMPONENTS_MAP.keys())
