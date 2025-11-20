# Open Interest Data Sources Investigation

## Overview
Open Interest (OI) represents the total number of outstanding derivative contracts (futures/options) that haven't been settled. It's crucial for understanding market sentiment, liquidity, and potential price movements.

---

## 1. MOEX Futures (Tinkoff Invest API)

### Current Status
- ✅ **Already integrated**: We use Tinkoff API for MOEX instruments
- ✅ **Futures support**: Code shows futures detection (`instrument_type in ["future", "futures"]`)
- ❓ **Open Interest**: Need to check if Tinkoff API exposes OI data

### Investigation Steps
1. Check Tinkoff SDK documentation for OI endpoints
2. Test `client.market_data` methods for futures-specific data
3. Check if `client.instruments.future_by()` returns OI information
4. Test with actual MOEX futures contract (e.g., Si-12.24, RTS-12.24)

### Potential Endpoints to Test
```python
# Check these Tinkoff SDK methods:
- client.market_data.get_last_prices()  # Might include OI?
- client.market_data.get_order_book()   # Might include OI?
- client.instruments.future_by()        # Check response fields
- client.market_data.get_trading_status() # Check for OI
```

### Alternative: MOEX ISS API (Direct)
- **URL**: `https://iss.moex.com/iss/`
- **Documentation**: MOEX ISS API docs
- **Access**: May require credentials or be publicly available
- **Endpoints to check**:
  - `/engines/futures/markets/forts/securities/{ticker}.json`
  - `/engines/futures/markets/forts/securities/{ticker}/openinterest.json`

---

## 2. Crypto Futures (Binance API)

### Current Status
- ✅ **CCXT integrated**: We use CCXT for crypto exchanges
- ✅ **Binance support**: CCXT supports Binance
- ❓ **Open Interest**: Need to check CCXT methods for OI

### Investigation Steps
1. Check CCXT documentation for `fetch_open_interest()` method
2. Test Binance Futures API directly via CCXT
3. Verify OI data format and availability

### CCXT Methods to Test
```python
# CCXT methods for Binance:
exchange.fetch_open_interest(symbol='BTC/USDT:USDT')
exchange.fetch_open_interest_history(symbol='BTC/USDT:USDT', timeframe='1h')
```

### Binance Direct API Endpoints
- **Futures OI**: `GET /fapi/v1/openInterest?symbol=BTCUSDT`
- **OI History**: `GET /fapi/v1/openInterestHist?symbol=BTCUSDT&period=5m&limit=30`
- **Top Trader OI**: `GET /fapi/v1/topLongShortAccountRatio?symbol=BTCUSDT&period=5m`

### Bybit Alternative
- **OI Endpoint**: `GET /v5/market/open-interest?category=linear&symbol=BTCUSDT&interval=5m`
- **Long/Short Ratio**: `GET /v5/market/account-ratio?category=linear&symbol=BTCUSDT&period=5m`

---

## 3. US Futures (CFTC COT Report)

### Current Status
- ❌ **Not integrated**: No current support
- ✅ **Free data**: CFTC publishes weekly reports
- ⚠️ **Weekly delay**: Data released Fridays (3-day delay)

### Data Source
- **CFTC Website**: https://www.cftc.gov/MarketReports/CommitmentsofTraders/index.htm
- **API Options**:
  - `cotapi.com` (free tier available)
  - Direct CSV download from CFTC
  - Python libraries: `cot` package

### Data Structure
- **Commercial**: Hedgers (producers/consumers)
- **Non-Commercial**: Speculators (large traders)
- **Non-Reportable**: Small traders
- **Open Interest**: Total outstanding contracts

### Implementation Approach
1. Use `cotapi.com` API (free tier: 100 requests/day)
2. Or scrape CFTC CSV files directly
3. Parse and store weekly data
4. Map to our instruments (e.g., Gold → GC futures)

---

## 4. Other Exchanges

### Deribit (Crypto Options)
- **API**: `GET /public/get_book_summary_by_instrument?instrument_name=BTC-PERPETUAL`
- **Returns**: `open_interest` field
- **Use case**: BTC/ETH options and futures

### CME Group (US Futures)
- **DataMine**: Requires paid subscription
- **Alternative**: Use CFTC COT (free, weekly)

---

## Testing Results

### ✅ Phase 1: MOEX (Tinkoff) - COMPLETED
**Result**: ❌ **Tinkoff API does NOT expose open interest data**

**Tested Methods**:
- `client.market_data.get_last_prices()` - No OI
- `client.market_data.get_order_book()` - No OI
- `client.market_data.get_trading_status()` - No OI
- `client.market_data.get_last_trades()` - No OI
- `client.market_data.get_candles()` - No OI
- `client.instruments.future_by()` - Future object has 47 fields, but NO open_interest

**Next Step**: Use MOEX ISS API directly for OI data

### ✅ Phase 2: Crypto (Binance) - COMPLETED
**Result**: ✅ **CCXT supports open interest!**

**CCXT Methods Available**:
- `exchange.fetch_open_interest(symbol='BTC/USDT:USDT')` ✅
  - Returns: `{'openInterestAmount': 96810.322, 'timestamp': ..., 'datetime': ...}`
- `exchange.fetch_open_interest_history(symbol='BTC/USDT:USDT', timeframe='1h', limit=10)` ✅
  - Returns: List of historical OI data points

**Direct Binance API**:
- `/fapi/v1/openInterest?symbol=BTCUSDT` ✅ Works
- `/fapi/v1/openInterestHist` ❌ 404 (endpoint may have changed)
- Long/Short ratio endpoints ❌ 404 (may require different endpoint)

**Next Step**: Integrate CCXT `fetch_open_interest()` into our adapters

### ⏳ Phase 3: US Futures (CFTC) - PENDING
1. Test `cotapi.com` API or direct CSV download
2. Parse COT report structure
3. Map to instrument symbols

---

## Data Model Extension

### Current `MarketData` Model
```python
class MarketData(BaseModel):
    instrument: str
    timeframe: str
    exchange: Optional[str] = None
    candles: List[OHLCVCandle]
    fetched_at: datetime
```

### Proposed Extension
```python
class MarketData(BaseModel):
    instrument: str
    timeframe: str
    exchange: Optional[str] = None
    candles: List[OHLCVCandle]
    fetched_at: datetime
    # New fields:
    open_interest: Optional[float] = None  # For futures/options
    open_interest_change: Optional[float] = None  # Change from previous period
    open_interest_timestamp: Optional[datetime] = None  # When OI was recorded
```

---

## Findings Summary

### ✅ Available Now
1. **Crypto Futures (Binance)**: ✅ CCXT `fetch_open_interest()` works perfectly
   - Real-time OI data
   - Historical OI data available
   - Easy integration (already using CCXT)

### ✅ Available with Limitations
2. **MOEX Futures**: ✅ MOEX ISS API provides OI data
   - **Endpoint**: `/analyticalproducts/futoi/securities.json?date=YYYY-MM-DD`
   - **Specific ticker**: `/analyticalproducts/futoi/securities/{ticker}.json?from=YYYY-MM-DD&till=YYYY-MM-DD`
   - **Data fields**:
     - `pos`: Total open interest
     - `pos_long`: Long positions
     - `pos_short`: Short positions  
     - `pos_long_num`: Number of traders with long positions
     - `pos_short_num`: Number of traders with short positions
     - `clgroup`: Client group (YUR = legal entities, FIZ = individuals)
   - **⚠️ Limitation**: Free tier restricts access to last 14 days (historical data only)
   - **Example**: For date 2025-10-31, got 1000 records with full OI breakdown

### ⏳ Needs Investigation
3. **US Futures (CFTC)**: Weekly COT reports
   - Free but delayed (3-day delay)
   - Different use case (weekly analysis vs real-time)

## Complete Open Interest Investigation Summary

### ✅ Available Sources

1. **Crypto Futures (Binance)**: ✅ **Ready to integrate**
   - **Method**: CCXT `fetch_open_interest()` and `fetch_open_interest_history()`
   - **Data**: Real-time OI, historical OI
   - **Integration**: Easy (already using CCXT)
   - **Limitations**: None for free tier

2. **MOEX Futures**: ✅ **Available with limitations**
   - **Method**: MOEX ISS API `/analyticalproducts/futoi/securities.json`
   - **Data**: Historical OI with detailed breakdown (long/short, trader counts, client groups)
   - **Integration**: Requires HTTP requests (no SDK needed)
   - **Limitations**: Free tier restricts last 14 days (historical data only, not real-time)
   - **Data Quality**: Excellent - includes positions by client group (individuals vs legal entities)

### ⏳ Needs Investigation
3. **US Futures (CFTC)**: Weekly COT reports
   - Free but delayed (3-day delay)
   - Different use case (weekly analysis vs real-time)

## Next Steps
1. **✅ DONE**: Tested Binance OI via CCXT - Ready to integrate
2. **✅ DONE**: Investigated MOEX ISS API - Available with 14-day delay limitation
3. **READY**: Can now implement OI integration for both sources
4. **LATER**: CFTC COT integration (if needed for US futures analysis)

