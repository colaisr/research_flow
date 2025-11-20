"""
Settings models for managing available models, data sources, and credentials.
"""
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, JSON
from sqlalchemy.sql import func
from app.core.database import Base


class AvailableModel(Base):
    """Available LLM models that can be used in analyses."""
    __tablename__ = "available_models"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), unique=True, nullable=False)  # e.g., "openai/gpt-4o-mini"
    display_name = Column(String(200), nullable=False)  # e.g., "GPT-4o Mini"
    provider = Column(String(100), nullable=False)  # e.g., "openai", "anthropic"
    description = Column(Text, nullable=True)
    max_tokens = Column(Integer, nullable=True)  # Max context window
    cost_per_1k_tokens = Column(String(50), nullable=True)  # e.g., "$0.15/$0.60"
    is_enabled = Column(Boolean, default=True, nullable=False)
    has_failures = Column(Boolean, default=False, nullable=False)  # Marked as having failures (rate limits, not found, etc.)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class AvailableDataSource(Base):
    """Available data sources that can be used in analyses."""
    __tablename__ = "available_data_sources"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)  # e.g., "ccxt", "yfinance"
    display_name = Column(String(200), nullable=False)  # e.g., "CCXT (Crypto Exchanges)"
    description = Column(Text, nullable=True)
    supports_crypto = Column(Boolean, default=False)
    supports_stocks = Column(Boolean, default=False)
    supports_forex = Column(Boolean, default=False)
    is_enabled = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class AppSettings(Base):
    """Application-wide settings (credentials, etc.)."""
    __tablename__ = "app_settings"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(100), unique=True, nullable=False)  # e.g., "telegram_bot_token", "openrouter_api_key"
    value = Column(Text, nullable=True)  # Encrypted or plain (depending on security needs)
    description = Column(Text, nullable=True)
    is_secret = Column(Boolean, default=False)  # If True, value should be encrypted/masked
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

