"""
Test script to investigate Tinkoff API capabilities for futures and open interest data.
"""
import sys
from pathlib import Path
from datetime import datetime, timedelta, timezone

# Add backend directory to path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

try:
    from tinkoff.invest import Client
    from tinkoff.invest import CandleInterval
    from tinkoff.invest.schemas import InstrumentIdType
except ImportError:
    print("❌ tinkoff-investments package not installed")
    print("   Install with: pip install tinkoff-investments")
    sys.exit(1)

# Get token from environment or use test token
import os
TOKEN = os.getenv("TINKOFF_API_TOKEN", "t.kNu8LX8-p9SIAbeOyH8TdqQOhrgtp4_7Nt0aOPOAQJ6t4UKr5faObQdv64Zi8ph99WIiiCDmdAaIX0s9F6e1AA")

def test_find_futures():
    """Test finding MOEX futures contracts."""
    print("🔍 Searching for MOEX futures contracts...")
    try:
        with Client(TOKEN) as client:
            # Search for common futures tickers
            futures_tickers = ["Si", "RTS", "GAZP", "SBER"]  # Si = Si-12.24, RTS = RTS-12.24
            
            found_futures = []
            for ticker in futures_tickers:
                search_result = client.instruments.find_instrument(query=ticker)
                
                for inst in search_result.instruments:
                    if inst.instrument_type in ["future", "futures"]:
                        # Check if it's MOEX
                        try:
                            full_inst = client.instruments.future_by(
                                id_type=InstrumentIdType.INSTRUMENT_ID_TYPE_FIGI,
                                id=inst.figi
                            )
                            exchange = full_inst.instrument.exchange
                            if "moex" in exchange.lower() or "forts" in exchange.lower():
                                found_futures.append({
                                    'ticker': inst.ticker,
                                    'name': inst.name,
                                    'figi': inst.figi,
                                    'exchange': exchange,
                                    'full_inst': full_inst.instrument
                                })
                                print(f"   ✅ Found: {inst.name} ({inst.ticker}) - FIGI: {inst.figi}")
                        except Exception as e:
                            print(f"   ⚠️  Could not get details for {inst.figi}: {e}")
            
            return found_futures[:5]  # Return first 5 for testing
            
    except Exception as e:
        print(f"❌ Failed: {e}")
        import traceback
        traceback.print_exc()
        return []

def inspect_future_object(future_obj):
    """Inspect a future object to see all available fields."""
    print("\n📋 Inspecting future object fields:")
    print(f"   Type: {type(future_obj)}")
    
    # List all attributes
    attrs = [attr for attr in dir(future_obj) if not attr.startswith('_')]
    print(f"   Available attributes ({len(attrs)}):")
    for attr in sorted(attrs):
        try:
            value = getattr(future_obj, attr)
            if not callable(value):
                print(f"      - {attr}: {type(value).__name__} = {str(value)[:100]}")
        except Exception as e:
            print(f"      - {attr}: <error: {e}>")

def test_market_data_methods(figi: str):
    """Test various market_data methods to see if they return OI."""
    print(f"\n🔬 Testing market_data methods for FIGI: {figi}")
    
    try:
        with Client(TOKEN) as client:
            # Test 1: get_last_prices
            print("\n   1️⃣  Testing get_last_prices()...")
            try:
                last_prices = client.market_data.get_last_prices(figi=[figi])
                print(f"      ✅ Success: {len(last_prices.last_prices)} price(s)")
                if last_prices.last_prices:
                    price_obj = last_prices.last_prices[0]
                    print(f"         Price: {price_obj.price.units}.{price_obj.price.nano/1e9:.2f}")
                    print(f"         Time: {price_obj.time}")
                    inspect_future_object(price_obj)
            except Exception as e:
                print(f"      ❌ Failed: {e}")
            
            # Test 2: get_order_book
            print("\n   2️⃣  Testing get_order_book()...")
            try:
                order_book = client.market_data.get_order_book(figi=figi, depth=10)
                print(f"      ✅ Success")
                print(f"         Bids: {len(order_book.bids)}")
                print(f"         Asks: {len(order_book.asks)}")
                inspect_future_object(order_book)
            except Exception as e:
                print(f"      ❌ Failed: {e}")
            
            # Test 3: get_trading_status
            print("\n   3️⃣  Testing get_trading_status()...")
            try:
                status = client.market_data.get_trading_status(figi=figi)
                print(f"      ✅ Success")
                inspect_future_object(status)
            except Exception as e:
                print(f"      ❌ Failed: {e}")
            
            # Test 4: get_last_trades
            print("\n   4️⃣  Testing get_last_trades()...")
            try:
                trades = client.market_data.get_last_trades(
                    figi=figi,
                    from_=datetime.now(timezone.utc) - timedelta(hours=1),
                    to=datetime.now(timezone.utc)
                )
                print(f"      ✅ Success: {len(trades.trades)} trade(s)")
                if trades.trades:
                    inspect_future_object(trades.trades[0])
            except Exception as e:
                print(f"      ❌ Failed: {e}")
            
            # Test 5: get_candles (already working, but check response)
            print("\n   5️⃣  Testing get_candles() (checking for OI in response)...")
            try:
                candles = client.market_data.get_candles(
                    figi=figi,
                    from_=datetime.now(timezone.utc) - timedelta(days=1),
                    to=datetime.now(timezone.utc),
                    interval=CandleInterval.CANDLE_INTERVAL_HOUR
                )
                print(f"      ✅ Success: {len(candles.candles)} candle(s)")
                if candles.candles:
                    inspect_future_object(candles.candles[0])
            except Exception as e:
                print(f"      ❌ Failed: {e}")
                
    except Exception as e:
        print(f"❌ Market data tests failed: {e}")
        import traceback
        traceback.print_exc()

def test_instruments_methods():
    """Test instruments methods to see if futures have OI info."""
    print("\n🔬 Testing instruments methods...")
    
    try:
        with Client(TOKEN) as client:
            # Get all futures
            print("\n   Testing instruments.futures()...")
            try:
                futures_response = client.instruments.futures()
                print(f"      ✅ Found {len(futures_response.instruments)} futures")
                
                # Filter MOEX futures
                moex_futures = [
                    f for f in futures_response.instruments 
                    if "moex" in f.exchange.lower() or "forts" in f.exchange.lower()
                ]
                print(f"      ✅ Found {len(moex_futures)} MOEX futures")
                
                if moex_futures:
                    # Inspect first MOEX future
                    first_future = moex_futures[0]
                    print(f"\n      Inspecting: {first_future.name} ({first_future.ticker})")
                    inspect_future_object(first_future)
                    
                    # Get full details
                    print(f"\n      Getting full details via future_by()...")
                    full_future = client.instruments.future_by(
                        id_type=InstrumentIdType.INSTRUMENT_ID_TYPE_FIGI,
                        id=first_future.figi
                    )
                    inspect_future_object(full_future.instrument)
                    
            except Exception as e:
                print(f"      ❌ Failed: {e}")
                import traceback
                traceback.print_exc()
                
    except Exception as e:
        print(f"❌ Instruments tests failed: {e}")
        import traceback
        traceback.print_exc()

def main():
    print("=" * 70)
    print("Tinkoff API - Open Interest Investigation")
    print("=" * 70)
    
    # Step 1: Find futures
    futures = test_find_futures()
    
    if not futures:
        print("\n⚠️  No futures found, trying instruments.futures()...")
        test_instruments_methods()
    else:
        # Step 2: Test market data methods with first future
        if futures:
            test_future = futures[0]
            print(f"\n📊 Testing with: {test_future['name']} (FIGI: {test_future['figi']})")
            test_market_data_methods(test_future['figi'])
    
    # Step 3: Test instruments methods
    test_instruments_methods()
    
    print("\n" + "=" * 70)
    print("📝 Summary:")
    print("   Check output above for any 'open_interest', 'oi', or similar fields")
    print("   If not found, we'll need to use MOEX ISS API directly")
    print("=" * 70)

if __name__ == "__main__":
    main()

