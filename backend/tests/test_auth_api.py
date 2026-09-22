"""
Admin Authentication Tests
Tests:
- Valid login with username and password
- Valid login with email and password
- Invalid password returns 401
- Non-existent user returns 401
- GET /auth/me returns profile with valid JWT
- GET /auth/me returns 401 without JWT
- Protected endpoints reject unauthenticated requests
"""

import uuid
import pytest
from app.utils.security import create_access_token, decode_access_token
from app.models import AdminUser
from app.utils.security import get_password_hash


@pytest.mark.anyio
async def test_admin_login_success_with_username(async_client, admin_user):
    """Test login with username and correct password."""
    response = await async_client.post(
        "/api/v1/auth/login",
        json={"username": "testadmin", "password": "AdminPassword123!"}
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["user"]["username"] == "testadmin"
    assert data["user"]["role"] == "SUPER_ADMIN"


@pytest.mark.anyio
async def test_admin_login_success_with_email(async_client, admin_user):
    """Test login with email and correct password."""
    response = await async_client.post(
        "/api/v1/auth/login",
        json={"username": "testadmin@powerpath.io", "password": "AdminPassword123!"}
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["user"]["email"] == "testadmin@powerpath.io"


@pytest.mark.anyio
async def test_admin_login_invalid_password(async_client, admin_user):
    """Test login with wrong password returns 401."""
    response = await async_client.post(
        "/api/v1/auth/login",
        json={"username": "testadmin", "password": "WrongPassword!"}
    )
    assert response.status_code == 401
    assert "Incorrect username or password" in response.json()["detail"]


@pytest.mark.anyio
async def test_admin_login_unknown_user(async_client, db_session):
    """Test login with unknown user returns 401."""
    response = await async_client.post(
        "/api/v1/auth/login",
        json={"username": "nonexistent", "password": "AnyPassword"}
    )
    assert response.status_code == 401


@pytest.mark.anyio
async def test_auth_me_with_valid_token(async_client, admin_headers):
    """Test GET /api/v1/auth/me returns current admin profile."""
    response = await async_client.get("/api/v1/auth/me", headers=admin_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["username"] == "testadmin"
    assert data["role"] == "SUPER_ADMIN"


@pytest.mark.anyio
async def test_auth_me_without_token(async_client):
    """Test GET /api/v1/auth/me returns 401 when token is omitted."""
    response = await async_client.get("/api/v1/auth/me")
    assert response.status_code == 401


@pytest.mark.anyio
async def test_protected_admin_endpoint_requires_token(async_client):
    """Test accessing admin event endpoint without token fails with 401."""
    response = await async_client.get("/api/v1/admin/events")
    assert response.status_code == 401


def test_create_access_token_with_uuid_object():
    """Verify that create_access_token properly handles raw uuid.UUID object for sub and custom claims."""
    raw_uuid = uuid.uuid4()
    token = create_access_token(
        data={"sub": raw_uuid, "username": "uuid_admin", "role": "SUPER_ADMIN"}
    )
    assert isinstance(token, str)

    payload = decode_access_token(token)
    assert payload is not None
    assert payload["sub"] == str(raw_uuid)
    assert payload["username"] == "uuid_admin"
    assert payload["role"] == "SUPER_ADMIN"
    assert "exp" in payload
    assert "iat" in payload


def test_create_access_token_with_nested_uuids():
    """Verify that create_access_token properly handles nested dictionaries and lists containing UUIDs."""
    uuid_1 = uuid.uuid4()
    uuid_2 = uuid.uuid4()
    uuid_3 = uuid.uuid4()
    token = create_access_token(
        data={
            "sub": uuid_1,
            "metadata": {"org_id": uuid_2, "allowed_events": [uuid_3]},
        }
    )
    payload = decode_access_token(token)
    assert payload is not None
    assert payload["sub"] == str(uuid_1)
    assert payload["metadata"]["org_id"] == str(uuid_2)
    assert payload["metadata"]["allowed_events"] == [str(uuid_3)]


@pytest.mark.anyio
async def test_auth_me_with_raw_uuid_token(async_client, db_session):
    """Test GET /api/v1/auth/me using a token generated with a raw UUID subject."""
    test_id = str(uuid.uuid4())
    raw_uuid_sub = uuid.UUID(test_id)
    admin = AdminUser(
        id=test_id,
        username="uuiduser",
        email="uuiduser@powerpath.io",
        hashed_password=get_password_hash("UuidPassword123!"),
        role="SUPER_ADMIN"
    )
    db_session.add(admin)
    db_session.commit()
    db_session.refresh(admin)

    # Generate token passing raw UUID object as sub
    token = create_access_token(
        data={"sub": raw_uuid_sub, "username": admin.username, "role": admin.role}
    )

    headers = {"Authorization": f"Bearer {token}"}
    response = await async_client.get("/api/v1/auth/me", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == test_id
    assert data["username"] == "uuiduser"
    assert data["role"] == "SUPER_ADMIN"

