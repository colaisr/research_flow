"""
Test script for Tinkoff Invest API integration.
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

TOKEN = "t.kNu8LX8-p9SIAbeOyH8TdqQOhrgtp4_7Nt0aOPOAQJ6t4UKr5faObQdv64Zi8ph99WIiiCDmdAaIX0s9F6e1AA"

def test_connection():
    """Test basic API connection."""
    print("🔌 Testing Tinkoff API connection...")
    try:
        with Client(TOKEN) as client:
            accounts = client.users.get_accounts()
            print(f"✅ Connected successfully!")
            print(f"   Found {len(accounts.accounts)} account(s)")
            if accounts.accounts:
                print(f"   First account ID: {accounts.accounts[0].id}")
            return True
    except Exception as e:
        print(f"❌ Connection failed: {e}")
        return False

def test_find_instrument(ticker: str = "SBER"):
    """Test finding an instrument by ticker."""
    print(f"\n🔍 Searching for instrument: {ticker}")
    try:
        with Client(TOKEN) as client:
            # Search for instrument
            instruments = client.instruments.find_instrument(query=ticker)
            
            if not instruments.instruments:
                print(f"❌ No instruments found for {ticker}")
                return None
            
            print(f"✅ Found {len(instruments.instruments)} instrument(s):")
            for inst in instruments.instruments[:10]:  # Show first 10
                print(f"   - {inst.name} ({inst.ticker})")
                print(f"     FIGI: {inst.figi}")
                print(f"     Type: {inst.instrument_type}")
            
            # Find the main share (not preferred, not bonds)
            # Prefer BBG FIGI over TCS (Bloomberg vs Tinkoff internal)
            selected = None
            main_shares = []
            
            for inst in instruments.instruments:
                if inst.instrument_type == "share" and inst.ticker == ticker:
                    main_shares.append(inst)
            
            # Sort: prefer BBG FIGI (Bloomberg), then TCS
            main_shares.sort(key=lambda x: (not x.figi.startswith("BBG"), x.figi))
            
            for inst in main_shares:
                # Get full instrument details to verify exchange
                try:
                    full_inst = client.instruments.share_by(
                        id_type=InstrumentIdType.INSTRUMENT_ID_TYPE_FIGI, 
                        id=inst.figi
                    )
                    if full_inst.instrument.exchange == "MOEX":
                        print(f"\n   ✅ Selected: {inst.name} (FIGI: {inst.figi})")
                        selected = inst
                        break
                except Exception as e:
                    print(f"   ⚠️  Could not get full details for {inst.figi}: {e}")
            
            # If still no selection, use first main share
            if not selected and main_shares:
                selected = main_shares[0]
                print(f"\n   ✅ Selected (first main share): {selected.name} (FIGI: {selected.figi})")
            
            if not selected:
                # Fallback to first share instrument
                for inst in instruments.instruments:
                    if inst.instrument_type == "share":
                        print(f"\n   ✅ Selected (fallback): {inst.name} (FIGI: {inst.figi})")
                        selected = inst
                        break
            
            return selected
            
    except Exception as e:
        print(f"❌ Search failed: {e}")
        import traceback
        traceback.print_exc()
        return None

def test_get_candles(figi: str, days: int = 30):
    """Test fetching historical candles."""
    print(f"\n📊 Fetching candles for FIGI: {figi}")
    print(f"   Period: last {days} days")
    try:
        with Client(TOKEN) as client:
            to_date = datetime.now(timezone.utc)
            from_date = to_date - timedelta(days=days)
            
            print(f"   From: {from_date}")
            print(f"   To: {to_date}")
            
            candles_response = client.market_data.get_candles(
                figi=figi,
                from_=from_date,
                to=to_date,
                interval=CandleInterval.CANDLE_INTERVAL_DAY
            )
            
            if not candles_response.candles:
                print(f"❌ No candles returned")
                return None
            
            print(f"✅ Retrieved {len(candles_response.candles)} candles")
            
            # Show first and last candle
            if candles_response.candles:
                first = candles_response.candles[0]
                last = candles_response.candles[-1]
                print(f"\n   First candle:")
                print(f"     Time: {first.time}")
                print(f"     O: {first.open.units}.{first.open.nano/1e9:.2f}")
                print(f"     H: {first.high.units}.{first.high.nano/1e9:.2f}")
                print(f"     L: {first.low.units}.{first.low.nano/1e9:.2f}")
                print(f"     C: {first.close.units}.{first.close.nano/1e9:.2f}")
                print(f"     V: {first.volume}")
                
                print(f"\n   Last candle:")
                print(f"     Time: {last.time}")
                print(f"     O: {last.open.units}.{last.open.nano/1e9:.2f}")
                print(f"     H: {last.high.units}.{last.high.nano/1e9:.2f}")
                print(f"     L: {last.low.units}.{last.low.nano/1e9:.2f}")
                print(f"     C: {last.close.units}.{last.close.nano/1e9:.2f}")
                print(f"     V: {last.volume}")
            
            return candles_response.candles
            
    except Exception as e:
        print(f"❌ Failed to fetch candles: {e}")
        import traceback
        traceback.print_exc()
        return None

def test_timeframe_mapping():
    """Test different timeframe intervals."""
    print(f"\n⏱️  Testing timeframe intervals...")
    
    timeframe_map = {
        'M1': CandleInterval.CANDLE_INTERVAL_1_MIN,
        'M5': CandleInterval.CANDLE_INTERVAL_5_MIN,
        'M15': CandleInterval.CANDLE_INTERVAL_15_MIN,
        'H1': CandleInterval.CANDLE_INTERVAL_HOUR,
        'D1': CandleInterval.CANDLE_INTERVAL_DAY,
    }
    
    print("   Available mappings:")
    for tf, interval in timeframe_map.items():
        print(f"     {tf} → {interval}")
    
    return timeframe_map

def main():
    print("=" * 60)
    print("Tinkoff Invest API Test")
    print("=" * 60)
    
    # Test 1: Connection
    if not test_connection():
        sys.exit(1)
    
    # Test 2: Find instrument
    instrument = test_find_instrument("SBER")
    if not instrument:
        print("\n⚠️  Could not find instrument, trying GAZP...")
        instrument = test_find_instrument("GAZP")
    
    if not instrument:
        print("\n❌ Could not find any MOEX instrument to test")
        sys.exit(1)
    
    # Test 3: Get candles
    candles = test_get_candles(instrument.figi, days=30)
    
    # Test 4: Timeframe mapping
    timeframe_map = test_timeframe_mapping()
    
    print("\n" + "=" * 60)
    if candles:
        print("✅ All tests passed! Tinkoff API is working.")
        print(f"\n📝 Summary:")
        print(f"   - Can connect to API")
        print(f"   - Can search instruments by ticker")
        print(f"   - Can fetch historical candles")
        print(f"   - Ready for adapter implementation")
    else:
        print("⚠️  Some tests failed, but basic connection works")
    print("=" * 60)

if __name__ == "__main__":
    main()

