"""
Instrument model (trading pairs/symbols).
"""
from sqlalchemy import Column, Integer, String, DateTime, Boolean
from sqlalchemy.sql import func
from app.core.database import Base


class Instrument(Base):
    __tablename__ = "instruments"

    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String(50), unique=True, index=True, nullable=False)  # e.g., "BTC/USDT", "AAPL", "SBER"
    type = Column(String(20), nullable=False)  # "crypto" or "equity"
    exchange = Column(String(50), nullable=True)  # e.g., "binance", "NYSE", "MOEX"
    figi = Column(String(50), nullable=True, index=True)  # Tinkoff FIGI identifier (for MOEX instruments)
    is_enabled = Column(Boolean, default=False, nullable=False)  # Whether instrument appears in dropdowns (admin must enable)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

