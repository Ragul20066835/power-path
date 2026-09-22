"""
POWERPATH Admin Authentication & Authorization Dependencies
"""

import logging
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import AdminUser
from app.constants import AdminRole
from app.utils.security import decode_access_token, get_password_hash

logger = logging.getLogger("powerpath.auth")

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


def get_current_admin(
    token: Optional[str] = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> AdminUser:
    """
    FastAPI dependency that validates the Bearer JWT token and returns the authenticated AdminUser.
    Raises 401 UNAUTHORIZED if missing, invalid, or expired.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate admin credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if not token:
        raise credentials_exception

    payload = decode_access_token(token)
    if payload is None:
        raise credentials_exception

    user_id: Optional[str] = payload.get("sub")
    if user_id is None:
        raise credentials_exception

    admin = db.query(AdminUser).filter(AdminUser.id == user_id).first()
    if admin is None:
        raise credentials_exception

    return admin


def get_current_super_admin(
    current_admin: AdminUser = Depends(get_current_admin)
) -> AdminUser:
    """
    FastAPI dependency that requires SUPER_ADMIN role.
    Raises 403 FORBIDDEN if the admin is not a SUPER_ADMIN.
    """
    if current_admin.role != AdminRole.SUPER_ADMIN.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Super administrator privileges required for this operation"
        )
    return current_admin


def seed_initial_admin(
    db: Session,
    username: str = "admin",
    email: str = "admin@powerpath.io",
    password: str = "admin123",
    role: str = AdminRole.SUPER_ADMIN.value,
    force_update: bool = True
) -> Optional[AdminUser]:
    """
    Development/Setup helper to create or synchronize the default admin account.
    """
    existing_user = db.query(AdminUser).filter(
        (AdminUser.username == username) | (AdminUser.email == email)
    ).first()

    if existing_user:
        if force_update:
            existing_user.hashed_password = get_password_hash(password)
            db.commit()
            db.refresh(existing_user)
            logger.info(f"Updated credentials for admin user: {username}")
        return existing_user

    admin = AdminUser(
        username=username,
        email=email,
        hashed_password=get_password_hash(password),
        role=role
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)
    logger.info(f"Initialized seed admin user: {username} ({role})")
    return admin
