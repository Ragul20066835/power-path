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

import pytest


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
