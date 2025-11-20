"""
Data adapters for fetching market data from various sources.
"""
from datetime import datetime, timedelta, timezone
from typing import Optional, List
import ccxt
import yfinance as yf
import pandas as pd
from app.core.database import SessionLocal
from app.models.data_cache import DataCache
from app.models.instrument import Instrument
from app.models.settings import AppSettings
from app.services.data.normalized import MarketData, OHLCVCandle
import json
import hashlib
import logging

logger = logging.getLogger(__name__)


def get_tinkoff_token(db: Optional[SessionLocal] = None) -> Optional[str]:
    """Get Tinkoff API token from Settings.
    
    Args:
        db: Optional database session. If None, creates a new one.
        
    Returns:
        Tinkoff API token or None if not configured
    """
    if db is None:
        db = SessionLocal()
        try:
            return get_tinkoff_token(db)
        finally:
            db.close()
    
    try:
        setting = db.query(AppSettings).filter(AppSettings.key == "tinkoff_api_token").first()
        return setting.value if setting and setting.value else None
    except Exception as e:
        logger.warning(f"Error getting Tinkoff token: {e}")
        return None


class DataAdapter:
    """Base class for data adapters."""
    
    def fetch_ohlcv(
        self,
        instrument: str,
        timeframe: str,
        limit: int = 500,
        since: Optional[datetime] = None
    ) -> MarketData:
        """Fetch OHLCV data. Must be implemented by subclasses."""
        raise NotImplementedError


class CCXTAdapter(DataAdapter):
    """CCXT adapter for crypto exchanges."""
    
    def __init__(self, exchange_name: str = "binance"):
        """Initialize CCXT adapter.
        
        Args:
            exchange_name: Exchange name (binance, coinbase, etc.)
        """
        exchange_class = getattr(ccxt, exchange_name)
        self.exchange = exchange_class({
            'enableRateLimit': True,
            'options': {
                'defaultType': 'spot',  # or 'future'
            }
        })
        self.exchange_name = exchange_name
    
    def _normalize_timeframe(self, timeframe: str) -> str:
        """Convert our timeframe to CCXT format."""
        mapping = {
            'M1': '1m',
            'M5': '5m',
            'M15': '15m',
            'M30': '30m',
            'H1': '1h',
            'H4': '4h',
            'D1': '1d',
        }
        return mapping.get(timeframe.upper(), timeframe.lower())
    
    def fetch_ohlcv(
        self,
        instrument: str,
        timeframe: str,
        limit: int = 500,
        since: Optional[datetime] = None
    ) -> MarketData:
        """Fetch OHLCV data from crypto exchange."""
        # Normalize symbol format (ensure it matches exchange format)
        symbol = instrument.upper()
        if '/' not in symbol:
            # Try to add /USDT if not present
            symbol = f"{symbol}/USDT"
        
        ccxt_timeframe = self._normalize_timeframe(timeframe)
        since_timestamp = int(since.timestamp() * 1000) if since else None
        
        try:
            # Fetch OHLCV data
            ohlcv = self.exchange.fetch_ohlcv(
                symbol,
                ccxt_timeframe,
                since=since_timestamp,
                limit=limit
            )
            
            # Convert to normalized format
            candles = []
            for candle in ohlcv:
                candles.append(OHLCVCandle(
                    timestamp=datetime.fromtimestamp(candle[0] / 1000, tz=timezone.utc),
                    open=candle[1],
                    high=candle[2],
                    low=candle[3],
                    close=candle[4],
                    volume=candle[5]
                ))
            
            # Sort by timestamp (oldest first) to ensure correct order
            candles.sort(key=lambda c: c.timestamp)
            # Take last N candles (most recent)
            candles = candles[-limit:] if len(candles) > limit else candles
            
            return MarketData(
                instrument=instrument,
                timeframe=timeframe,
                exchange=self.exchange_name,
                candles=candles,
                fetched_at=datetime.now(timezone.utc)
            )
        except Exception as e:
            raise ValueError(f"Failed to fetch data from {self.exchange_name}: {str(e)}")


class YFinanceAdapter(DataAdapter):
    """yfinance adapter for equities."""
    
    def _normalize_futures_ticker(self, symbol: str) -> str:
        """Convert Bloomberg-style futures tickers to Yahoo Finance format.
        
        Maps common Bloomberg futures tickers to Yahoo Finance equivalents.
        Examples:
            NG1 -> NG=F (Natural Gas)
            B1! -> BZ=F (Brent Crude Oil)
            CL1 -> CL=F (WTI Crude Oil)
        """
        # Bloomberg to Yahoo Finance ticker mapping
        ticker_map = {
            'NG1': 'NG=F',      # Natural Gas
            'NG1!': 'NG=F',     # Natural Gas (continuous)
            'B1': 'BZ=F',       # Brent Crude Oil
            'B1!': 'BZ=F',      # Brent Crude Oil (continuous)
            'CL1': 'CL=F',      # WTI Crude Oil
            'CL1!': 'CL=F',     # WTI Crude Oil (continuous)
            'GC1': 'GC=F',      # Gold
            'GC1!': 'GC=F',     # Gold (continuous)
            'SI1': 'SI=F',      # Silver
            'SI1!': 'SI=F',     # Silver (continuous)
            'PL1': 'PL=F',      # Platinum
            'PL1!': 'PL=F',     # Platinum (continuous)
            'PA1': 'PA=F',      # Palladium
            'PA1!': 'PA=F',     # Palladium (continuous)
            'HO1': 'HO=F',      # Heating Oil
            'HO1!': 'HO=F',     # Heating Oil (continuous)
            'RB1': 'RB=F',      # RBOB Gasoline
            'RB1!': 'RB=F',     # RBOB Gasoline (continuous)
            'ZC1': 'ZC=F',      # Corn
            'ZC1!': 'ZC=F',     # Corn (continuous)
            'ZS1': 'ZS=F',      # Soybeans
            'ZS1!': 'ZS=F',     # Soybeans (continuous)
            'ZW1': 'ZW=F',      # Wheat
            'ZW1!': 'ZW=F',     # Wheat (continuous)
        }
        
        # Check if symbol needs mapping
        normalized = ticker_map.get(symbol.upper(), symbol)
        return normalized
    
    def _normalize_timeframe(self, timeframe: str) -> str:
        """Convert our timeframe to yfinance interval."""
        mapping = {
            'M1': '1m',
            'M5': '5m',
            'M15': '15m',
            'M30': '30m',
            'H1': '1h',
            'D1': '1d',
        }
        return mapping.get(timeframe.upper(), '1d')
    
    def fetch_ohlcv(
        self,
        instrument: str,
        timeframe: str,
        limit: int = 500,
        since: Optional[datetime] = None
    ) -> MarketData:
        """Fetch OHLCV data from yfinance."""
        # Normalize Bloomberg-style futures tickers to Yahoo Finance format
        normalized_instrument = self._normalize_futures_ticker(instrument)
        ticker = yf.Ticker(normalized_instrument)
        interval = self._normalize_timeframe(timeframe)
        
        # Calculate period
        if since:
            period = None
            end_date = datetime.utcnow()
        else:
            # Default period based on timeframe
            if timeframe in ['M1', 'M5', 'M15', 'M30', 'H1']:
                period = '5d'  # Intraday data
            else:
                period = '1mo'  # Daily data
        
        try:
            # Fetch data
            if since:
                df = ticker.history(
                    start=since,
                    end=datetime.utcnow(),
                    interval=interval
                )
            else:
                df = ticker.history(period=period, interval=interval)
            
            if df.empty:
                raise ValueError(f"No data available for {instrument} (tried {normalized_instrument})")
            
            # Limit results (tail gets last N, which should be most recent)
            df = df.tail(limit)
            
            # Convert to normalized format
            candles = []
            for idx, row in df.iterrows():
                candles.append(OHLCVCandle(
                    timestamp=idx.to_pydatetime() if isinstance(idx, pd.Timestamp) else idx,
                    open=float(row['Open']),
                    high=float(row['High']),
                    low=float(row['Low']),
                    close=float(row['Close']),
                    volume=float(row['Volume'])
                ))
            
            # Sort by timestamp (oldest first) to ensure correct order
            candles.sort(key=lambda c: c.timestamp)
            # Take last N candles (most recent) - safety check in case tail didn't work as expected
            candles = candles[-limit:] if len(candles) > limit else candles
            
            return MarketData(
                instrument=instrument,  # Keep original symbol for display
                timeframe=timeframe,
                exchange='yfinance',
                candles=candles,
                fetched_at=datetime.now(timezone.utc)
            )
        except Exception as e:
            raise ValueError(f"Failed to fetch data from yfinance for {instrument} (tried {normalized_instrument}): {str(e)}")


class TinkoffAdapter(DataAdapter):
    """Tinkoff Invest API adapter for MOEX instruments."""
    
    def __init__(self, api_token: str):
        """Initialize Tinkoff adapter.
        
        Args:
            api_token: Tinkoff Invest API token
        """
        try:
            from tinkoff.invest import Client
            from tinkoff.invest import CandleInterval
            self.Client = Client
            self.CandleInterval = CandleInterval
        except ImportError:
            raise ImportError("tinkoff-investments package not installed. Install with: pip install tinkoff-investments")
        
        self.api_token = api_token
        self.client = None  # Will be created per request (not kept open)
    
    def _normalize_timeframe(self, timeframe: str):
        """Convert our timeframe to Tinkoff CandleInterval."""
        mapping = {
            'M1': self.CandleInterval.CANDLE_INTERVAL_1_MIN,
            'M5': self.CandleInterval.CANDLE_INTERVAL_5_MIN,
            'M15': self.CandleInterval.CANDLE_INTERVAL_15_MIN,
            'M30': self.CandleInterval.CANDLE_INTERVAL_15_MIN,  # Tinkoff doesn't have M30, use M15
            'H1': self.CandleInterval.CANDLE_INTERVAL_HOUR,
            'D1': self.CandleInterval.CANDLE_INTERVAL_DAY,
        }
        return mapping.get(timeframe.upper(), self.CandleInterval.CANDLE_INTERVAL_DAY)
    
    def _get_figi_for_ticker(self, ticker: str, db: SessionLocal) -> Optional[str]:
        """Get FIGI for a ticker from database or Tinkoff API.
        
        Args:
            ticker: Instrument ticker (e.g., 'SBER')
            db: Database session
            
        Returns:
            FIGI string or None if not found
        """
        # Check database first
        instrument = db.query(Instrument).filter(Instrument.symbol == ticker).first()
        if instrument and instrument.figi:
            return instrument.figi
        
        # If not in DB, search Tinkoff API
        try:
            with self.Client(self.api_token) as client:
                from tinkoff.invest.schemas import InstrumentIdType
                
                # Search for instrument
                search_result = client.instruments.find_instrument(query=ticker)
                
                if not search_result.instruments:
                    logger.warning(f"No instruments found for ticker: {ticker}")
                    return None
                
                # Find MOEX instruments (shares OR futures) with matching ticker
                # Prefer BBG FIGI (Bloomberg) over TCS (Tinkoff internal)
                # Note: Tinkoff API uses "futures" (plural) not "future" (singular)
                found_instruments = []
                for inst in search_result.instruments:
                    # Check for both shares and futures (note: Tinkoff uses "futures" plural)
                    if inst.ticker == ticker and inst.instrument_type in ["share", "future", "futures"]:
                        found_instruments.append(inst)
                
                # Sort: prefer BBG FIGI
                found_instruments.sort(key=lambda x: (not x.figi.startswith("BBG"), x.figi))
                
                for inst in found_instruments:
                    # Verify it's MOEX by getting full details
                    try:
                        if inst.instrument_type == "share":
                            full_inst = client.instruments.share_by(
                                id_type=InstrumentIdType.INSTRUMENT_ID_TYPE_FIGI,
                                id=inst.figi
                            )
                            exchange = full_inst.instrument.exchange
                        elif inst.instrument_type in ["future", "futures"]:
                            # Tinkoff API uses "futures" (plural) for futures contracts
                            full_inst = client.instruments.future_by(
                                id_type=InstrumentIdType.INSTRUMENT_ID_TYPE_FIGI,
                                id=inst.figi
                            )
                            exchange = full_inst.instrument.exchange
                        else:
                            continue
                        
                        # MOEX futures can have exchange "forts_futures_weekend" or "MOEX"
                        # Both are valid MOEX exchanges
                        if exchange == "MOEX" or "forts" in exchange.lower() or "moex" in exchange.lower():
                            figi = inst.figi
                            # Cache FIGI in database
                            if instrument:
                                instrument.figi = figi
                                instrument.exchange = "MOEX"  # Normalize to MOEX
                                db.commit()
                            else:
                                # Create instrument record if it doesn't exist
                                instrument = Instrument(
                                    symbol=ticker,
                                    type="equity",  # Keep as equity for now (futures are also equity-like)
                                    exchange="MOEX",
                                    figi=figi,
                                    is_enabled=False
                                )
                                db.add(instrument)
                                db.commit()
                            
                            logger.info(f"Cached FIGI {figi} for ticker {ticker} (type: {inst.instrument_type}, exchange: {exchange})")
                            return figi
                    except Exception as e:
                        logger.warning(f"Could not verify exchange for {ticker} (FIGI: {inst.figi}, type: {inst.instrument_type}): {e}")
                        continue
                
                # If we found instruments but couldn't verify exchange, try using first one anyway
                # This handles cases where exchange name might be different (e.g., "forts_futures_weekend")
                if found_instruments:
                    logger.info(f"Using first found instrument for {ticker}: {found_instruments[0].figi} (type: {found_instruments[0].instrument_type})")
                    figi = found_instruments[0].figi
                    if instrument:
                        instrument.figi = figi
                        instrument.exchange = "MOEX"  # Normalize to MOEX
                        db.commit()
                    else:
                        instrument = Instrument(
                            symbol=ticker,
                            type="equity",
                            exchange="MOEX",
                            figi=figi,
                            is_enabled=False
                        )
                        db.add(instrument)
                        db.commit()
                    return figi
                
                logger.warning(f"Could not find MOEX instrument (share or future) for ticker: {ticker}")
                return None
                
        except Exception as e:
            logger.error(f"Failed to get FIGI for {ticker}: {e}")
            return None
    
    def fetch_ohlcv(
        self,
        instrument: str,
        timeframe: str,
        limit: int = 500,
        since: Optional[datetime] = None
    ) -> MarketData:
        """Fetch OHLCV data from Tinkoff API.
        
        Args:
            instrument: Ticker symbol (e.g., 'SBER', 'GAZP')
            timeframe: Timeframe (M1, M5, M15, H1, D1)
            limit: Maximum number of candles
            since: Start datetime (optional)
        """
        db = SessionLocal()
        try:
            # Get FIGI for ticker
            figi = self._get_figi_for_ticker(instrument, db)
            if not figi:
                raise ValueError(f"Could not find FIGI for instrument: {instrument}")
            
            # Calculate date range
            to_date = datetime.now(timezone.utc)
            if since:
                from_date = since
            else:
                # Default: fetch last N days based on timeframe
                days_map = {
                    'M1': 1,   # 1 day for 1-minute candles
                    'M5': 1,   # 1 day for 5-minute candles
                    'M15': 3,  # 3 days for 15-minute candles
                    'H1': 7,   # 7 days for hourly candles
                    'D1': 365, # 1 year for daily candles
                }
                days = days_map.get(timeframe.upper(), 30)
                from_date = to_date - timedelta(days=days)
            
            # Get candle interval
            candle_interval = self._normalize_timeframe(timeframe)
            
            # Fetch candles from Tinkoff
            with self.Client(self.api_token) as client:
                candles_response = client.market_data.get_candles(
                    figi=figi,
                    from_=from_date,
                    to=to_date,
                    interval=candle_interval
                )
                
                if not candles_response.candles:
                    raise ValueError(f"No candles returned for {instrument} (FIGI: {figi})")
                
                # Convert to normalized format
                candles = []
                for candle in candles_response.candles:
                    # Tinkoff uses units.nano format for prices
                    def convert_price(price_obj):
                        if hasattr(price_obj, 'units') and hasattr(price_obj, 'nano'):
                            return float(price_obj.units) + float(price_obj.nano) / 1e9
                        return float(price_obj)
                    
                    candles.append(OHLCVCandle(
                        timestamp=candle.time.replace(tzinfo=timezone.utc) if candle.time.tzinfo is None else candle.time,
                        open=convert_price(candle.open),
                        high=convert_price(candle.high),
                        low=convert_price(candle.low),
                        close=convert_price(candle.close),
                        volume=candle.volume
                    ))
                
                # Sort by timestamp (oldest first) to ensure correct order
                candles.sort(key=lambda c: c.timestamp)
                # Take last N candles (most recent)
                candles = candles[-limit:] if len(candles) > limit else candles
                
                return MarketData(
                    instrument=instrument,
                    timeframe=timeframe,
                    exchange="MOEX",
                    candles=candles,
                    fetched_at=datetime.now(timezone.utc)
                )
                
        except Exception as e:
            raise ValueError(f"Failed to fetch data from Tinkoff: {str(e)}")
        finally:
            db.close()


class DataService:
    """Service for fetching and caching market data."""
    
    def __init__(self, tinkoff_token: Optional[str] = None, db: Optional[SessionLocal] = None):
        """Initialize data service with adapters.
        
        Args:
            tinkoff_token: Optional Tinkoff API token for MOEX instruments (if None, tries to load from Settings)
            db: Optional database session for loading token from Settings
        """
        self.ccxt_adapter = CCXTAdapter()
        self.yfinance_adapter = YFinanceAdapter()
        
        # Get Tinkoff token if not provided
        if tinkoff_token is None:
            tinkoff_token = get_tinkoff_token(db)
        
        # Initialize Tinkoff adapter if token available
        if tinkoff_token:
            try:
                self.tinkoff_adapter = TinkoffAdapter(tinkoff_token)
            except Exception as e:
                logger.warning(f"Could not initialize Tinkoff adapter: {e}")
                self.tinkoff_adapter = None
        else:
            self.tinkoff_adapter = None
    
    def _get_cache_key(self, instrument: str, timeframe: str) -> str:
        """Generate cache key."""
        key = f"{instrument}:{timeframe}"
        return hashlib.md5(key.encode()).hexdigest()
    
    def _get_cached_data(self, cache_key: str, ttl_seconds: int = 300) -> Optional[MarketData]:
        """Get cached data if still valid."""
        db = SessionLocal()
        try:
            cache_entry = db.query(DataCache).filter(DataCache.key == cache_key).first()
            if cache_entry:
                age = (datetime.now(timezone.utc) - cache_entry.fetched_at.replace(tzinfo=timezone.utc)).total_seconds()
                if age < min(cache_entry.ttl_seconds, ttl_seconds):
                    # Return cached data
                    data_dict = json.loads(cache_entry.payload)
                    # Convert datetime strings back to datetime objects
                    data_dict['fetched_at'] = datetime.fromisoformat(data_dict['fetched_at'])
                    for candle in data_dict['candles']:
                        candle['timestamp'] = datetime.fromisoformat(candle['timestamp'])
                    return MarketData(**data_dict)
            return None
        finally:
            db.close()
    
    def _cache_data(self, cache_key: str, data: MarketData, ttl_seconds: int = 300):
        """Cache market data."""
        db = SessionLocal()
        try:
            # Convert to JSON-serializable format
            data_dict = {
                'instrument': data.instrument,
                'timeframe': data.timeframe,
                'exchange': data.exchange,
                'candles': [
                    {
                        'timestamp': c.timestamp.isoformat(),
                        'open': c.open,
                        'high': c.high,
                        'low': c.low,
                        'close': c.close,
                        'volume': c.volume
                    }
                    for c in data.candles
                ],
                'fetched_at': data.fetched_at.isoformat()
            }
            
            # Update or create cache entry
            cache_entry = db.query(DataCache).filter(DataCache.key == cache_key).first()
            if cache_entry:
                cache_entry.payload = json.dumps(data_dict)
                cache_entry.fetched_at = datetime.now(timezone.utc)
                cache_entry.ttl_seconds = ttl_seconds
            else:
                cache_entry = DataCache(
                    key=cache_key,
                    payload=json.dumps(data_dict),
                    ttl_seconds=ttl_seconds
                )
                db.add(cache_entry)
            
            db.commit()
        finally:
            db.close()
    
    def fetch_market_data(
        self,
        instrument: str,
        timeframe: str,
        use_cache: bool = True,
        cache_ttl: int = 300
    ) -> MarketData:
        """Fetch market data with caching support.
        
        Args:
            instrument: Symbol (e.g., 'BTC/USDT', 'AAPL', 'SBER')
            timeframe: Timeframe (M1, M5, M15, H1, D1, etc.)
            use_cache: Whether to use cache
            cache_ttl: Cache TTL in seconds (default 5 minutes)
        """
        cache_key = self._get_cache_key(instrument, timeframe)
        
        # Try cache first
        if use_cache:
            cached = self._get_cached_data(cache_key, cache_ttl)
            if cached:
                return cached
        
        # Check database to determine adapter based on exchange field
        db = SessionLocal()
        try:
            from app.models.instrument import Instrument
            db_instrument = db.query(Instrument).filter(Instrument.symbol == instrument).first()
            
            if db_instrument and db_instrument.exchange == "MOEX":
                # MOEX instrument - use Tinkoff adapter
                if not hasattr(self, 'tinkoff_adapter') or self.tinkoff_adapter is None:
                    raise ValueError("Tinkoff adapter not initialized. Please configure Tinkoff API token in Settings → Tinkoff Invest API Configuration.")
                adapter = self.tinkoff_adapter
            elif '/' in instrument.upper() or instrument.upper().endswith('USDT'):
                # Crypto
                adapter = self.ccxt_adapter
            else:
                # Equity (default to yfinance)
                adapter = self.yfinance_adapter
        finally:
            db.close()
        
        # Fetch data
        data = adapter.fetch_ohlcv(instrument, timeframe, limit=500)
        
        # Cache it
        if use_cache:
            self._cache_data(cache_key, data, cache_ttl)
        
        return data

