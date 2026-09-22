"""
POWERPATH Security Utilities
JWT generation/decoding and bcrypt password hashing.
"""

from datetime import datetime, timedelta, timezone
import uuid
from typing import Optional, Dict, Any
import jwt
from passlib.context import CryptContext
from app.config import get_settings

settings = get_settings()

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifies a plaintext password against a stored bcrypt hash."""
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Generates a secure bcrypt password hash."""
    return pwd_context.hash(password)


def _json_safe(value: Any) -> Any:
    """Recursively converts UUID and other non-JSON-serializable objects to JSON-safe types."""
    if isinstance(value, uuid.UUID):
        return str(value)
    elif isinstance(value, dict):
        return {k: _json_safe(v) for k, v in value.items()}
    elif isinstance(value, (list, tuple, set)):
        return [_json_safe(item) for item in value]
    return value


def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """Creates a signed HS256 JWT access token with expiration."""
    to_encode = {k: _json_safe(v) for k, v in data.items()}
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode.update({"exp": expire, "iat": datetime.now(timezone.utc)})
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
    return encoded_jwt


def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    """Decodes and validates a JWT token. Returns payload dict or None if invalid/expired."""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        return payload
    except (jwt.PyJWTError, Exception):
        return None
