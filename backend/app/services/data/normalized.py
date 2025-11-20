"""
Normalized data structures for market data.
"""
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel


class OHLCVCandle(BaseModel):
    """Normalized OHLCV candle."""
    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float


class MarketData(BaseModel):
    """Normalized market data response."""
    instrument: str
    timeframe: str
    exchange: Optional[str] = None
    candles: List[OHLCVCandle]
    fetched_at: datetime

