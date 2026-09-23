"""
POWERPATH CSV Bulk Upload Router (Admin)
Handles transactional CSV uploads for Questions and Full Events with strict rollback.
"""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import AdminUser
from app.utils.auth import get_current_admin
from app.utils.event_resolver import resolve_event_identifier
from app.utils.csv_importer import (
    import_questions_csv,
    import_events_csv,
    CSVValidationError,
)

router = APIRouter(prefix="/admin/upload", tags=["Admin Bulk Upload"])


@router.post("/questions")
async def upload_questions_csv(
    file: UploadFile = File(...),
    event_id: Optional[str] = Query(None, description="Target Event UUID or custom_id"),
    form_event_id: Optional[str] = Form(None, alias="event_id"),
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Imports Question-only CSV into an existing Event.
    Transactional: Rollback completely if any row fails validation.
    """
    target_event_id = event_id or form_event_id
    if not target_event_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Target 'event_id' is required for Question-only CSV upload."
        )

    # Verify target event exists upfront
    target_event = resolve_event_identifier(db, target_event_id)
    if not target_event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Target Event '{target_event_id}' not found."
        )

    try:
        content_bytes = await file.read()
        file_content = content_bytes.decode("utf-8-sig")  # handles UTF-8 with BOM
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Could not read uploaded file: {str(e)}"
        )

    try:
        result = import_questions_csv(file_content, target_event_id, db)
        return {
            "success": True,
            "message": "Questions and sockets imported successfully.",
            "data": result
        }
    except CSVValidationError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "message": "CSV validation failed. Entire batch was rolled back.",
                "errors": e.errors
            }
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Import failed: {str(e)}"
        )


@router.post("/events")
async def upload_events_csv(
    file: UploadFile = File(...),
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Imports full Event + Questions + Sockets CSV.
    Transactional: Rollback completely if any row fails validation.
    """
    try:
        content_bytes = await file.read()
        file_content = content_bytes.decode("utf-8-sig")
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Could not read uploaded file: {str(e)}"
        )

    try:
        result = import_events_csv(file_content, db)
        return {
            "success": True,
            "message": "Events, questions, and sockets imported successfully.",
            "data": result
        }
    except CSVValidationError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "message": "CSV validation failed. Entire batch was rolled back.",
                "errors": e.errors
            }
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Import failed: {str(e)}"
        )
