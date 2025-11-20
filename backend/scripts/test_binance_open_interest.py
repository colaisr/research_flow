"""
Test script to investigate Binance API capabilities for open interest data.
Tests both CCXT library and direct Binance API.
"""
import sys
from pathlib import Path

# Add backend directory to path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

def test_ccxt_open_interest():
    """Test CCXT library for open interest."""
    print("🔍 Testing CCXT library for open interest...")
    
    try:
        import ccxt
        
        # Initialize Binance exchange
        exchange = ccxt.binance({
            'apiKey': '',  # Not needed for public data
            'secret': '',
            'enableRateLimit': True,
            'options': {
                'defaultType': 'future',  # Use futures market
            }
        })
        
        print(f"   ✅ CCXT Binance initialized")
        print(f"   Exchange: {exchange.name}")
        print(f"   Has fetch_open_interest: {hasattr(exchange, 'fetch_open_interest')}")
        print(f"   Has fetch_open_interest_history: {hasattr(exchange, 'fetch_open_interest_history')}")
        
        # Test fetch_open_interest if available
        if hasattr(exchange, 'fetch_open_interest'):
            try:
                print("\n   Testing fetch_open_interest('BTC/USDT:USDT')...")
                oi = exchange.fetch_open_interest('BTC/USDT:USDT')
                print(f"   ✅ Success!")
                print(f"      Type: {type(oi)}")
                print(f"      Data: {oi}")
                
                # Inspect structure
                if isinstance(oi, dict):
                    print(f"\n   📋 Open Interest fields:")
                    for key, value in oi.items():
                        print(f"      - {key}: {type(value).__name__} = {value}")
                        
            except Exception as e:
                print(f"   ❌ Failed: {e}")
                import traceback
                traceback.print_exc()
        else:
            print("   ⚠️  fetch_open_interest() not available in CCXT")
        
        # Test fetch_open_interest_history if available
        if hasattr(exchange, 'fetch_open_interest_history'):
            try:
                print("\n   Testing fetch_open_interest_history('BTC/USDT:USDT', '1h', limit=10)...")
                oi_history = exchange.fetch_open_interest_history('BTC/USDT:USDT', '1h', limit=10)
                print(f"   ✅ Success!")
                print(f"      Type: {type(oi_history)}")
                print(f"      Length: {len(oi_history) if isinstance(oi_history, list) else 'N/A'}")
                
                if isinstance(oi_history, list) and len(oi_history) > 0:
                    print(f"\n   📋 First entry:")
                    for key, value in oi_history[0].items():
                        print(f"      - {key}: {type(value).__name__} = {value}")
                        
            except Exception as e:
                print(f"   ❌ Failed: {e}")
                import traceback
                traceback.print_exc()
        else:
            print("   ⚠️  fetch_open_interest_history() not available in CCXT")
            
        return exchange
        
    except ImportError:
        print("   ❌ CCXT not installed")
        print("   Install with: pip install ccxt")
        return None
    except Exception as e:
        print(f"   ❌ Failed: {e}")
        import traceback
        traceback.print_exc()
        return None

def test_binance_direct_api():
    """Test Binance API directly via requests."""
    print("\n🔍 Testing Binance API directly...")
    
    try:
        import requests
        
        base_url = "https://fapi.binance.com"
        
        # Test 1: Open Interest
        print("\n   1️⃣  Testing GET /fapi/v1/openInterest?symbol=BTCUSDT...")
        try:
            response = requests.get(f"{base_url}/fapi/v1/openInterest", params={"symbol": "BTCUSDT"})
            response.raise_for_status()
            data = response.json()
            print(f"   ✅ Success!")
            print(f"   📋 Response fields:")
            for key, value in data.items():
                print(f"      - {key}: {type(value).__name__} = {value}")
        except Exception as e:
            print(f"   ❌ Failed: {e}")
        
        # Test 2: Open Interest History
        print("\n   2️⃣  Testing GET /fapi/v1/openInterestHist?symbol=BTCUSDT&period=5m&limit=5...")
        try:
            response = requests.get(
                f"{base_url}/fapi/v1/openInterestHist",
                params={"symbol": "BTCUSDT", "period": "5m", "limit": 5}
            )
            response.raise_for_status()
            data = response.json()
            print(f"   ✅ Success!")
            print(f"   📋 Response type: {type(data)}")
            if isinstance(data, list) and len(data) > 0:
                print(f"   📋 First entry fields:")
                for key, value in data[0].items():
                    print(f"      - {key}: {type(value).__name__} = {value}")
            else:
                print(f"   Data: {data}")
        except Exception as e:
            print(f"   ❌ Failed: {e}")
        
        # Test 3: Top Trader Long/Short Account Ratio
        print("\n   3️⃣  Testing GET /fapi/v1/topLongShortAccountRatio?symbol=BTCUSDT&period=5m...")
        try:
            response = requests.get(
                f"{base_url}/fapi/v1/topLongShortAccountRatio",
                params={"symbol": "BTCUSDT", "period": "5m"}
            )
            response.raise_for_status()
            data = response.json()
            print(f"   ✅ Success!")
            print(f"   📋 Response fields:")
            for key, value in data.items():
                print(f"      - {key}: {type(value).__name__} = {value}")
        except Exception as e:
            print(f"   ❌ Failed: {e}")
        
        # Test 4: Global Long/Short Account Ratio
        print("\n   4️⃣  Testing GET /fapi/v1/globalLongShortAccountRatio?symbol=BTCUSDT&period=5m...")
        try:
            response = requests.get(
                f"{base_url}/fapi/v1/globalLongShortAccountRatio",
                params={"symbol": "BTCUSDT", "period": "5m"}
            )
            response.raise_for_status()
            data = response.json()
            print(f"   ✅ Success!")
            print(f"   📋 Response fields:")
            for key, value in data.items():
                print(f"      - {key}: {type(value).__name__} = {value}")
        except Exception as e:
            print(f"   ❌ Failed: {e}")
        
        # Test 5: Top Trader Long/Short Position Ratio
        print("\n   5️⃣  Testing GET /fapi/v1/topLongShortPositionRatio?symbol=BTCUSDT&period=5m...")
        try:
            response = requests.get(
                f"{base_url}/fapi/v1/topLongShortPositionRatio",
                params={"symbol": "BTCUSDT", "period": "5m"}
            )
            response.raise_for_status()
            data = response.json()
            print(f"   ✅ Success!")
            print(f"   📋 Response fields:")
            for key, value in data.items():
                print(f"      - {key}: {type(value).__name__} = {value}")
        except Exception as e:
            print(f"   ❌ Failed: {e}")
        
    except ImportError:
        print("   ❌ requests library not installed")
        print("   Install with: pip install requests")
    except Exception as e:
        print(f"   ❌ Failed: {e}")
        import traceback
        traceback.print_exc()

def main():
    print("=" * 70)
    print("Binance API - Open Interest Investigation")
    print("=" * 70)
    
    # Test CCXT
    exchange = test_ccxt_open_interest()
    
    # Test Direct API
    test_binance_direct_api()
    
    print("\n" + "=" * 70)
    print("📝 Summary:")
    print("   - CCXT: Check if fetch_open_interest() is available")
    print("   - Direct API: All endpoints tested above")
    print("   - Next: Integrate into our data adapters")
    print("=" * 70)

if __name__ == "__main__":
    main()

