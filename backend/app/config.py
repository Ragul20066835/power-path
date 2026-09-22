"""
POWERPATH Backend Configuration Module
Reads from environment variables / .env file with production-ready defaults.
"""

from typing import List, Optional
from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache


class Settings(BaseSettings):
    # Environment & Server
    ENVIRONMENT: str = "development"
    PORT: int = 8000
    PROJECT_NAME: str = "POWERPATH API"
    VERSION: str = "1.0.0"

    # Database Configuration (PostgreSQL for Prod/Dev, SQLite fallback for local testing)
    DATABASE_URL: str = "sqlite:///./powerpath.db"
    DATABASE_URL_SYNC: Optional[str] = None

    # Supabase REST / Storage / Auth (Optional direct integration)
    SUPABASE_URL: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""

    # Security & JWT Authentication
    JWT_SECRET: str = "super-secret-powerpath-jwt-key-change-this-in-production-min-32-chars"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440

    # Production Admin Bootstrap (Configurable via Environment Variables)
    ADMIN_BOOTSTRAP_USERNAME: Optional[str] = "admin"
    ADMIN_BOOTSTRAP_EMAIL: Optional[str] = "admin@powerpath.io"
    ADMIN_BOOTSTRAP_PASSWORD: Optional[str] = None

    # CORS Allowed Origins (Comma-separated string)
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173,https://powerpath.vercel.app"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    @property
    def cors_origins_list(self) -> List[str]:
        """Parse comma-separated CORS_ORIGINS into a clean list of URLs."""
        if not self.CORS_ORIGINS:
            return ["*"]
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]


@lru_cache()
def get_settings() -> Settings:
    return Settings()
