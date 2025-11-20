"""
Data cache model for market data.
"""
from sqlalchemy import Column, Integer, String, Text, DateTime
from sqlalchemy.sql import func
from app.core.database import Base


class DataCache(Base):
    __tablename__ = "data_cache"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(255), unique=True, index=True, nullable=False)  # Cache key
    payload = Column(Text, nullable=False)  # JSON string
    fetched_at = Column(DateTime(timezone=True), server_default=func.now())
    ttl_seconds = Column(Integer, nullable=False, default=3600)  # Time to live

