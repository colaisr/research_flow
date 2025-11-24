"""
Configuration management.
Loads from config_local.py (gitignored) for secrets, with defaults.
"""
import sys
from pathlib import Path
from typing import Optional

# Try to import local config (gitignored)
try:
    from app.config_local import (
        MYSQL_DSN,
        OPENROUTER_API_KEY,
        OPENROUTER_BASE_URL,
        DEFAULT_LLM_MODEL,
        TELEGRAM_BOT_TOKEN,
        TELEGRAM_CHANNEL_ID,
        DAYSTART_SCHEDULE,
        SESSION_COOKIE_NAME,
        SESSION_SECRET,
        ENABLE_TELEGRAM_AUTO_SEND,
        ENABLE_BACKTESTING,
        SMTP_HOST,
        SMTP_PORT,
        SMTP_USE_TLS,
        SMTP_USE_SSL,
        SMTP_USERNAME,
        SMTP_PASSWORD,
        SMTP_FROM_EMAIL,
        SMTP_FROM_NAME,
        EMAIL_VERIFICATION_TOKEN_EXPIRY_HOURS,
        FRONTEND_BASE_URL,
    )
except ImportError:
    # Fallback defaults (will fail at runtime if secrets not set)
    MYSQL_DSN: Optional[str] = None
    OPENROUTER_API_KEY: Optional[str] = None
    OPENROUTER_BASE_URL: str = "https://openrouter.ai/api/v1"
    DEFAULT_LLM_MODEL: str = "openai/gpt-4o-mini"
    TELEGRAM_BOT_TOKEN: Optional[str] = None
    TELEGRAM_CHANNEL_ID: Optional[int] = None
    DAYSTART_SCHEDULE: str = "08:00"
    SESSION_COOKIE_NAME: str = "researchflow_session"
    SESSION_SECRET: Optional[str] = None
    ENABLE_TELEGRAM_AUTO_SEND: bool = False
    ENABLE_BACKTESTING: bool = False
    SMTP_HOST: Optional[str] = None
    SMTP_PORT: int = 465
    SMTP_USE_TLS: bool = False
    SMTP_USE_SSL: bool = True
    SMTP_USERNAME: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    SMTP_FROM_EMAIL: Optional[str] = None
    SMTP_FROM_NAME: str = "Research Flow"
    EMAIL_VERIFICATION_TOKEN_EXPIRY_HOURS: int = 24
    FRONTEND_BASE_URL: str = "http://localhost:3000"


def get_settings():
    """Return settings object (for FastAPI dependency injection if needed)."""
    return type("Settings", (), {
        "mysql_dsn": MYSQL_DSN,
        "openrouter_api_key": OPENROUTER_API_KEY,
        "openrouter_base_url": OPENROUTER_BASE_URL,
        "default_llm_model": DEFAULT_LLM_MODEL,
        "telegram_bot_token": TELEGRAM_BOT_TOKEN,
        "telegram_channel_id": TELEGRAM_CHANNEL_ID,
        "daystart_schedule": DAYSTART_SCHEDULE,
        "session_cookie_name": SESSION_COOKIE_NAME,
        "session_secret": SESSION_SECRET,
        "enable_telegram_auto_send": ENABLE_TELEGRAM_AUTO_SEND,
        "enable_backtesting": ENABLE_BACKTESTING,
        "smtp_host": SMTP_HOST,
        "smtp_port": SMTP_PORT,
        "smtp_use_tls": SMTP_USE_TLS,
        "smtp_use_ssl": SMTP_USE_SSL,
        "smtp_username": SMTP_USERNAME,
        "smtp_password": SMTP_PASSWORD,
        "smtp_from_email": SMTP_FROM_EMAIL,
        "smtp_from_name": SMTP_FROM_NAME,
        "email_verification_token_expiry_hours": EMAIL_VERIFICATION_TOKEN_EXPIRY_HOURS,
        "frontend_base_url": FRONTEND_BASE_URL,
    })()

