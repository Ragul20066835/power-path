"""
POWERPATH Admin Authentication Router
Provides secure JWT login and /auth/me profile validation.
"""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.models import AdminUser
from app.schemas import AdminUserPublic, TokenResponse
from app.utils.security import verify_password, create_access_token
from app.utils.auth import get_current_admin

router = APIRouter(prefix="/auth", tags=["Admin Authentication"])


class LoginRequest(BaseModel):
    username: str  # Can be username or email
    password: str


@router.post("/login", response_model=TokenResponse)
async def login(
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Authenticate staff/admin credentials and issue signed JWT access token.
    Supports both JSON payload and form-data (OAuth2 format).
    """
    content_type = request.headers.get("content-type", "")
    username: Optional[str] = None
    password: Optional[str] = None

    if "application/json" in content_type:
        try:
            body = await request.json()
            username = body.get("username")
            password = body.get("password")
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Malformed JSON body"
            )
    else:
        try:
            form = await request.form()
            username = form.get("username")
            password = form.get("password")
        except Exception:
            pass

    if not username or not password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username/email and password are required."
        )

    # Search by username or email
    admin = db.query(AdminUser).filter(
        (AdminUser.username == username) | (AdminUser.email == username)
    ).first()

    if not admin or not verify_password(password, admin.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = create_access_token(
        data={"sub": str(admin.id), "username": admin.username, "role": admin.role}
    )

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=AdminUserPublic.model_validate(admin)
    )


@router.get("/me", response_model=AdminUserPublic)
def get_current_admin_profile(
    current_admin: AdminUser = Depends(get_current_admin)
):
    """
    Validate active admin JWT token and return authenticated user profile.
    """
    return AdminUserPublic.model_validate(current_admin)
