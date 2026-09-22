"""
Pytest configuration and shared fixtures for POWERPATH backend tests.
Uses an isolated in-memory SQLite database for test runs.
"""

import pytest
import os
import sys

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
import httpx

from app.database import Base, get_db
from app.main import app

# Create in-memory SQLite database for testing
SQLALCHEMY_TEST_DATABASE_URL = "sqlite:///:memory:"

test_engine = create_engine(
    SQLALCHEMY_TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


@pytest.fixture(scope="function")
def db_session():
    """Creates a fresh database schema for each test."""
    Base.metadata.create_all(bind=test_engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=test_engine)


@pytest.fixture(scope="function")
def admin_user(db_session):
    """Creates a test admin user and returns it."""
    from app.utils.auth import seed_initial_admin
    admin = seed_initial_admin(
        db=db_session,
        username="testadmin",
        email="testadmin@powerpath.io",
        password="AdminPassword123!",
        role="SUPER_ADMIN"
    )
    return admin


@pytest.fixture(scope="function")
def admin_token(admin_user):
    """Creates a valid JWT token for test admin."""
    from app.utils.security import create_access_token
    token = create_access_token(
        data={"sub": admin_user.id, "username": admin_user.username, "role": admin_user.role}
    )
    return token


@pytest.fixture(scope="function")
def admin_headers(admin_token):
    """Returns authorization headers for admin requests."""
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="function")
async def async_client(db_session):
    """FastAPI AsyncClient using httpx.ASGITransport."""
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client
    app.dependency_overrides.clear()
