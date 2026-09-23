"""
POWERPATH Event Identifier Resolver
Centralized helper for resolving Events by UUID primary key or custom_id.
Protects PostgreSQL from invalid UUID cast errors when querying non-UUID strings.
"""

import uuid
from typing import Optional, Any
from sqlalchemy.orm import Session
from app.models import Event


def resolve_event_identifier(db: Session, identifier: Any) -> Optional[Event]:
    """
    Safely resolves an Event row from either a UUID primary key or a custom_id.

    Resolution Strategy:
    1. If identifier is a valid UUID (UUID instance or 32/36-char hex UUID string):
       - Queries Event.id == str(parsed_uuid)
       - If not found in Event.id, checks Event.custom_id == identifier
    2. If identifier is NOT a valid UUID (e.g., 'ERR2S', 'E001'):
       - Queries ONLY Event.custom_id == identifier
       - NEVER queries Event.id to prevent PostgreSQL DataError: invalid input syntax for type uuid

    Returns:
        Event model instance if found, otherwise None.
    """
    if identifier is None:
        return None

    # Handle UUID instance directly
    if isinstance(identifier, uuid.UUID):
        event = db.query(Event).filter(Event.id == str(identifier)).first()
        if not event:
            try:
                event = db.query(Event).filter(Event.id == identifier).first()
            except Exception:
                pass
        if not event:
            event = db.query(Event).filter(Event.custom_id == str(identifier)).first()
        return event

    event_identifier = str(identifier).strip()
    if not event_identifier:
        return None

    # Determine if identifier is a valid UUID string
    try:
        parsed_uuid = uuid.UUID(event_identifier)
    except (ValueError, AttributeError, TypeError):
        parsed_uuid = None

    if parsed_uuid is not None:
        # Valid UUID format: check primary key first
        event = db.query(Event).filter(Event.id == str(parsed_uuid)).first()
        if not event:
            try:
                event = db.query(Event).filter(Event.id == parsed_uuid).first()
            except Exception:
                pass
        if not event:
            # Fallback to custom_id match
            event = db.query(Event).filter(Event.custom_id == event_identifier).first()
        return event

    # Non-UUID string: query ONLY Event.custom_id
    return db.query(Event).filter(Event.custom_id == event_identifier).first()
