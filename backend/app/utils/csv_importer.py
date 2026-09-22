"""
POWERPATH CSV Import & Normalization Engine
Parses Question-only CSVs and Full-Event CSVs with strict transactional validation.
Rolls back completely if any row fails validation.
"""

import csv
import io
import re
import uuid
from typing import List, Dict, Any, Tuple, Optional
from sqlalchemy.orm import Session
from app.models import Event, Question, Socket
from app.constants import VALID_COMPONENT_IDS, COMPONENTS_MAP

# Component Normalization Mapping
NORMALIZATION_MAP = {
    # Battery
    "battery": "battery",
    "9v battery": "battery",
    "9v_battery": "battery",
    "dc-9v": "battery",
    "battery 9v": "battery",
    "power": "battery",

    # Switch
    "switch": "switch",
    "toggle switch": "switch",
    "toggle_switch": "switch",
    "sw-spst": "switch",
    "spst": "switch",

    # Resistor
    "resistor": "resistor",
    "resistor 330ω": "resistor",
    "resistor 330 ohm": "resistor",
    "resistor 330": "resistor",
    "r-330ω": "resistor",
    "330ω": "resistor",
    "330 ohm": "resistor",

    # LED
    "led": "led",
    "led-red": "led",
    "red led": "led",
    "light emitting diode": "led",

    # Ammeter
    "ammeter": "ammeter",
    "ammeter (ma)": "ammeter",
    "mtr-am": "ammeter",
    "current meter": "ammeter",

    # Ground (Mandatory canonical reference)
    "ground": "ground",
    "gnd": "ground",
    "gnd-0v": "ground",
    "earth 0v": "ground",
    "earth": "ground",
    "0v": "ground",
    "reference 0v": "ground",

    # Decoys
    "voltmeter": "voltmeter",
    "mtr-vm": "voltmeter",
    "voltage meter": "voltmeter",

    "capacitor": "capacitor",
    "capacitor 100μf": "capacitor",
    "cap-100μf": "capacitor",
    "100μf": "capacitor",

    "inductor": "inductor",
    "inductor 10mh": "inductor",
    "ind-10mh": "inductor",
    "10mh": "inductor",
}


def normalize_component_name(raw_name: Optional[str]) -> Optional[str]:
    """Normalizes raw component strings/codes into canonical 9 component IDs."""
    if not raw_name:
        return None
    cleaned = raw_name.strip().lower()
    cleaned = re.sub(r"\s+", " ", cleaned)

    if cleaned in NORMALIZATION_MAP:
        return NORMALIZATION_MAP[cleaned]

    # Check if standard ID
    if cleaned in VALID_COMPONENT_IDS:
        return cleaned

    return None


def parse_csv_rows(file_content: str) -> List[Dict[str, str]]:
    """Parses raw CSV string into a list of normalized key/value dicts."""
    f = io.StringIO(file_content.strip())
    reader = csv.DictReader(f)
    rows = []
    for r in reader:
        # Normalize header keys: lowercase, strip, replace spaces with underscores
        normalized_row = {
            k.strip().lower().replace(" ", "_"): (v.strip() if v else "")
            for k, v in r.items()
            if k
        }
        rows.append(normalized_row)
    return rows


class CSVValidationError(Exception):
    def __init__(self, errors: List[Dict[str, Any]]):
        self.errors = errors
        super().__init__(f"CSV validation failed with {len(errors)} error(s).")


def import_questions_csv(
    file_content: str,
    target_event_id: str,
    db: Session
) -> Dict[str, Any]:
    """
    Imports Question-only CSV into an existing Event.
    Transactional: Rollback completely if any error.
    """
    # Verify target event exists
    event_identifier = str(target_event_id).strip()
    try:
        event_uuid = uuid.UUID(event_identifier)
    except (ValueError, AttributeError):
        event_uuid = None

    if event_uuid is not None:
        event = db.query(Event).filter(Event.id == str(event_uuid)).first()
        if not event:
            event = db.query(Event).filter(Event.custom_id == event_identifier).first()
    else:
        event = db.query(Event).filter(Event.custom_id == event_identifier).first()

    if not event:
        raise CSVValidationError([{
            "row": 0,
            "field": "event_id",
            "value": target_event_id,
            "message": f"Target Event '{target_event_id}' not found."
        }])

    rows = parse_csv_rows(file_content)
    if not rows:
        raise CSVValidationError([{
            "row": 0,
            "field": "file",
            "value": "",
            "message": "CSV file is empty or missing headers."
        }])

    errors: List[Dict[str, Any]] = []
    # Grouping: question_custom_id -> { info, sockets: { socket_custom_id: socket_info } }
    questions_map: Dict[str, Dict[str, Any]] = {}

    for idx, row in enumerate(rows, start=1):
        q_id = row.get("question_id") or row.get("custom_id")
        q_name = row.get("question_name") or row.get("name")
        s_id = row.get("socket_id") or row.get("slot_id") or row.get("socket_custom_id")
        s_label = row.get("socket_label") or row.get("label")
        raw_comp = row.get("correct_component") or row.get("accepted_component_id") or row.get("component")
        hint = row.get("component_description") or row.get("hint") or ""
        difficulty = row.get("difficulty") or "Easy"
        penalty_str = row.get("penalty_seconds") or "5"
        description = row.get("description") or ""

        # Validate required fields
        if not q_id:
            errors.append({"row": idx, "field": "question_id", "value": "", "message": "Missing question_id."})
        if not q_name:
            errors.append({"row": idx, "field": "question_name", "value": "", "message": "Missing question_name."})
        if not s_id:
            errors.append({"row": idx, "field": "socket_id", "value": "", "message": "Missing socket_id."})
        if not s_label:
            errors.append({"row": idx, "field": "socket_label", "value": "", "message": "Missing socket_label."})

        # Validate component
        comp_id = normalize_component_name(raw_comp)
        if not comp_id:
            errors.append({
                "row": idx,
                "field": "correct_component",
                "value": raw_comp or "",
                "message": f"Unknown component '{raw_comp}'. Must be one of the canonical 9 components."
            })

        # Validate penalty
        try:
            penalty = int(penalty_str)
            if penalty < 0:
                errors.append({"row": idx, "field": "penalty_seconds", "value": penalty_str, "message": "Penalty must be >= 0."})
        except ValueError:
            errors.append({"row": idx, "field": "penalty_seconds", "value": penalty_str, "message": "Penalty must be a valid integer."})
            penalty = 5

        if errors:
            continue

        # Group by question
        if q_id not in questions_map:
            questions_map[q_id] = {
                "custom_id": q_id,
                "name": q_name,
                "description": description,
                "difficulty": difficulty,
                "penalty_seconds": penalty,
                "sockets": {}
            }

        q_entry = questions_map[q_id]
        if s_id in q_entry["sockets"]:
            errors.append({
                "row": idx,
                "field": "socket_id",
                "value": s_id,
                "message": f"Duplicate socket_id '{s_id}' in question '{q_id}'."
            })
        else:
            q_entry["sockets"][s_id] = {
                "custom_id": s_id,
                "label": s_label,
                "accepted_component_id": comp_id,
                "hint": hint,
                "slot_order": len(q_entry["sockets"]) + 1
            }

    if errors:
        raise CSVValidationError(errors)

    # Perform DB insertion within transaction
    # Calculate starting question_order
    existing_q_count = db.query(Question).filter(Question.event_id == event.id).count()
    created_questions_count = 0
    created_sockets_count = 0

    try:
        for q_order_offset, (q_id, q_data) in enumerate(questions_map.items(), start=1):
            # Check if question already exists in this event
            existing_q = db.query(Question).filter(
                Question.event_id == event.id,
                Question.custom_id == q_id
            ).first()

            if existing_q:
                # Update existing question or overwrite sockets
                existing_q.name = q_data["name"]
                existing_q.description = q_data["description"]
                existing_q.difficulty = q_data["difficulty"]
                existing_q.penalty_seconds = q_data["penalty_seconds"]
                db.query(Socket).filter(Socket.question_id == existing_q.id).delete()
                target_q = existing_q
            else:
                target_q = Question(
                    event_id=event.id,
                    custom_id=q_data["custom_id"],
                    name=q_data["name"],
                    description=q_data["description"],
                    difficulty=q_data["difficulty"],
                    penalty_seconds=q_data["penalty_seconds"],
                    question_order=existing_q_count + q_order_offset
                )
                db.add(target_q)
                db.flush()
                created_questions_count += 1

            for s_order, (s_id, s_data) in enumerate(q_data["sockets"].items(), start=1):
                sock = Socket(
                    question_id=target_q.id,
                    custom_id=s_data["custom_id"],
                    label=s_data["label"],
                    accepted_component_id=s_data["accepted_component_id"],
                    hint=s_data["hint"],
                    slot_order=s_order
                )
                db.add(sock)
                created_sockets_count += 1

        db.commit()
    except Exception as e:
        db.rollback()
        raise e

    return {
        "event_id": event.id,
        "event_custom_id": event.custom_id,
        "questions_imported": len(questions_map),
        "sockets_imported": created_sockets_count
    }


def import_events_csv(file_content: str, db: Session) -> Dict[str, Any]:
    """
    Imports full Event + Questions + Sockets CSV.
    Transactional: Rollback completely if any error.
    """
    rows = parse_csv_rows(file_content)
    if not rows:
        raise CSVValidationError([{
            "row": 0,
            "field": "file",
            "value": "",
            "message": "CSV file is empty or missing headers."
        }])

    errors: List[Dict[str, Any]] = []
    # Hierarchy: event_id -> { info, questions: { q_id -> { info, sockets: { s_id -> s_info } } } }
    events_map: Dict[str, Dict[str, Any]] = {}

    for idx, row in enumerate(rows, start=1):
        e_id = row.get("event_id") or row.get("event_custom_id")
        e_name = row.get("event_name") or "Tournament Round"
        e_desc = row.get("event_description") or ""

        q_id = row.get("question_id") or row.get("custom_id")
        q_name = row.get("question_name") or row.get("name")
        q_desc = row.get("description") or ""
        difficulty = row.get("difficulty") or "Easy"
        penalty_str = row.get("penalty_seconds") or "5"

        s_id = row.get("socket_id") or row.get("slot_id") or row.get("socket_custom_id")
        s_label = row.get("socket_label") or row.get("label")
        raw_comp = row.get("correct_component") or row.get("accepted_component_id") or row.get("component")
        hint = row.get("component_description") or row.get("hint") or ""

        if not e_id:
            errors.append({"row": idx, "field": "event_id", "value": "", "message": "Missing event_id."})
        if not q_id:
            errors.append({"row": idx, "field": "question_id", "value": "", "message": "Missing question_id."})
        if not q_name:
            errors.append({"row": idx, "field": "question_name", "value": "", "message": "Missing question_name."})
        if not s_id:
            errors.append({"row": idx, "field": "socket_id", "value": "", "message": "Missing socket_id."})
        if not s_label:
            errors.append({"row": idx, "field": "socket_label", "value": "", "message": "Missing socket_label."})

        comp_id = normalize_component_name(raw_comp)
        if not comp_id:
            errors.append({
                "row": idx,
                "field": "correct_component",
                "value": raw_comp or "",
                "message": f"Unknown component '{raw_comp}'."
            })

        try:
            penalty = int(penalty_str)
            if penalty < 0:
                errors.append({"row": idx, "field": "penalty_seconds", "value": penalty_str, "message": "Penalty must be >= 0."})
        except ValueError:
            errors.append({"row": idx, "field": "penalty_seconds", "value": penalty_str, "message": "Penalty must be an integer."})
            penalty = 5

        if errors:
            continue

        if e_id not in events_map:
            events_map[e_id] = {
                "custom_id": e_id,
                "name": e_name,
                "description": e_desc,
                "questions": {}
            }

        evt_entry = events_map[e_id]
        if q_id not in evt_entry["questions"]:
            evt_entry["questions"][q_id] = {
                "custom_id": q_id,
                "name": q_name,
                "description": q_desc,
                "difficulty": difficulty,
                "penalty_seconds": penalty,
                "sockets": {}
            }

        q_entry = evt_entry["questions"][q_id]
        if s_id in q_entry["sockets"]:
            errors.append({
                "row": idx,
                "field": "socket_id",
                "value": s_id,
                "message": f"Duplicate socket_id '{s_id}' in question '{q_id}' of event '{e_id}'."
            })
        else:
            q_entry["sockets"][s_id] = {
                "custom_id": s_id,
                "label": s_label,
                "accepted_component_id": comp_id,
                "hint": hint,
                "slot_order": len(q_entry["sockets"]) + 1
            }

    if errors:
        raise CSVValidationError(errors)

    created_events = 0
    created_questions = 0
    created_sockets = 0

    try:
        for e_id, e_data in events_map.items():
            event = db.query(Event).filter(Event.custom_id == e_id).first()
            if not event:
                event = Event(
                    custom_id=e_data["custom_id"],
                    name=e_data["name"],
                    description=e_data["description"],
                    status="INACTIVE"
                )
                db.add(event)
                db.flush()
                created_events += 1
            else:
                event.name = e_data["name"]
                event.description = e_data["description"]

            for q_order, (q_id, q_data) in enumerate(e_data["questions"].items(), start=1):
                question = db.query(Question).filter(
                    Question.event_id == event.id,
                    Question.custom_id == q_id
                ).first()

                if not question:
                    question = Question(
                        event_id=event.id,
                        custom_id=q_data["custom_id"],
                        name=q_data["name"],
                        description=q_data["description"],
                        difficulty=q_data["difficulty"],
                        penalty_seconds=q_data["penalty_seconds"],
                        question_order=q_order
                    )
                    db.add(question)
                    db.flush()
                    created_questions += 1
                else:
                    question.name = q_data["name"]
                    question.description = q_data["description"]
                    question.difficulty = q_data["difficulty"]
                    question.penalty_seconds = q_data["penalty_seconds"]
                    db.query(Socket).filter(Socket.question_id == question.id).delete()

                for s_order, (s_id, s_data) in enumerate(q_data["sockets"].items(), start=1):
                    sock = Socket(
                        question_id=question.id,
                        custom_id=s_data["custom_id"],
                        label=s_data["label"],
                        accepted_component_id=s_data["accepted_component_id"],
                        hint=s_data["hint"],
                        slot_order=s_order
                    )
                    db.add(sock)
                    created_sockets_count = created_sockets + 1
                    created_sockets += 1

        db.commit()
    except Exception as e:
        db.rollback()
        raise e

    return {
        "events_imported": len(events_map),
        "questions_imported": created_questions,
        "sockets_imported": created_sockets
    }
