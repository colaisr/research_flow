"""
Test script to investigate MOEX ISS API for open interest data.
Tests the analyticalproducts/futoi endpoints.
"""
import sys
from pathlib import Path
from datetime import datetime, timedelta, timezone

# Add backend directory to path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

def test_moex_iss_all_securities():
    """Test MOEX ISS API - Get OI for all securities on a specific date."""
    print("🔍 Testing MOEX ISS API - All securities OI...")
    
    try:
        import requests
        
        base_url = "https://iss.moex.com/iss"
        
        # Test with dates (MOEX ISS free tier restricts last 14 days)
        today = datetime.now(timezone.utc).date()
        # Try dates older than 14 days (free tier restriction)
        test_dates = [today - timedelta(days=i) for i in [15, 20, 30, 60]]
        
        for test_date in test_dates:
            date_str = test_date.strftime("%Y-%m-%d")
            print(f"\n   Testing date: {date_str}")
            
            url = f"{base_url}/analyticalproducts/futoi/securities.json"
            params = {"date": date_str}
            
            try:
                response = requests.get(url, params=params, timeout=10)
                response.raise_for_status()
                data = response.json()
                
                print(f"   ✅ Success!")
                
                # Parse MOEX ISS response structure
                # MOEX ISS returns nested structure: futoi -> securities
                if "futoi" in data:
                    futoi_data = data["futoi"]
                    
                    # Check available dates first
                    if "futoi.dates" in data:
                        dates_data = data["futoi.dates"]
                        if "data" in dates_data and len(dates_data["data"]) > 0:
                            dates_columns = dates_data.get("columns", [])
                            dates_rows = dates_data["data"]
                            print(f"   📅 Available dates: {len(dates_rows)}")
                            if dates_rows:
                                print(f"      First 5 dates: {dates_rows[:5]}")
                    
                    # Check securities data
                    if "data" in futoi_data and len(futoi_data["data"]) > 0:
                        columns = futoi_data.get("columns", [])
                        rows = futoi_data["data"]
                        
                        print(f"   📊 Found {len(rows)} records")
                        print(f"   📋 Columns: {columns}")
                        
                        # Show first few records
                        print(f"\n   📋 Sample records (first 5):")
                        for i, row in enumerate(rows[:5]):
                            record = dict(zip(columns, row))
                            print(f"      {i+1}. {record}")
                        
                        # Check for OI-related fields
                        oi_fields = [col for col in columns if 'pos' in col.lower() or 'oi' in col.lower() or 'open' in col.lower()]
                        if oi_fields:
                            print(f"\n   ✅ Found OI-related fields: {oi_fields}")
                        
                        return data, columns, rows
                    else:
                        print(f"   ⚠️  No securities data for {date_str}")
                        print(f"   Response keys: {list(data.keys())}")
                elif "securities" in data:
                    securities_data = data["securities"]
                    
                    # MOEX ISS returns data in columns format
                    if "data" in securities_data and len(securities_data["data"]) > 0:
                        columns = securities_data.get("columns", [])
                        rows = securities_data["data"]
                        
                        print(f"   📊 Found {len(rows)} records")
                        print(f"   📋 Columns: {columns}")
                        
                        # Show first few records
                        print(f"\n   📋 Sample records (first 5):")
                        for i, row in enumerate(rows[:5]):
                            record = dict(zip(columns, row))
                            print(f"      {i+1}. {record}")
                        
                        # Check for OI-related fields
                        oi_fields = [col for col in columns if 'pos' in col.lower() or 'oi' in col.lower() or 'open' in col.lower()]
                        if oi_fields:
                            print(f"\n   ✅ Found OI-related fields: {oi_fields}")
                        
                        return data, columns, rows
                    else:
                        print(f"   ⚠️  No data for {date_str}")
                else:
                    print(f"   ⚠️  Unexpected response structure: {list(data.keys())}")
                    # Try to print full structure for debugging
                    print(f"   Full response structure:")
                    for key, value in data.items():
                        if isinstance(value, dict):
                            print(f"      {key}: {list(value.keys())}")
                        else:
                            print(f"      {key}: {type(value).__name__}")
                    
            except requests.exceptions.HTTPError as e:
                if e.response.status_code == 404:
                    print(f"   ⚠️  404 - Data not available for {date_str}")
                else:
                    print(f"   ❌ HTTP Error: {e}")
            except Exception as e:
                print(f"   ❌ Failed: {e}")
        
        print("\n   ⚠️  No data found for any test date")
        return None, None, None
        
    except ImportError:
        print("   ❌ requests library not installed")
        print("   Install with: pip install requests")
        return None, None, None
    except Exception as e:
        print(f"   ❌ Failed: {e}")
        import traceback
        traceback.print_exc()
        return None, None, None

def test_moex_iss_specific_ticker(ticker: str = "Si"):
    """Test MOEX ISS API - Get OI for a specific ticker over date range."""
    print(f"\n🔍 Testing MOEX ISS API - Specific ticker: {ticker}...")
    
    try:
        import requests
        
        base_url = "https://iss.moex.com/iss"
        
        # Test with dates older than 14 days (free tier restriction)
        end_date = datetime.now(timezone.utc).date() - timedelta(days=15)
        start_date = end_date - timedelta(days=7)
        
        url = f"{base_url}/analyticalproducts/futoi/securities/{ticker}.json"
        params = {
            "from": start_date.strftime("%Y-%m-%d"),
            "till": end_date.strftime("%Y-%m-%d")
        }
        
        print(f"   Date range: {params['from']} to {params['till']}")
        
        try:
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()
            data = response.json()
            
            print(f"   ✅ Success!")
            
            # Parse MOEX ISS response structure
            # MOEX ISS returns nested structure: futoi -> securities
            if "futoi" in data:
                futoi_data = data["futoi"]
                
                if "data" in futoi_data and len(futoi_data["data"]) > 0:
                    columns = futoi_data.get("columns", [])
                    rows = futoi_data["data"]
                    
                    print(f"   📊 Found {len(rows)} records")
                    print(f"   📋 Columns: {columns}")
                    
                    # Show first few records
                    print(f"\n   📋 Sample records (first 5):")
                    for i, row in enumerate(rows[:5]):
                        record = dict(zip(columns, row))
                        print(f"      {i+1}. {record}")
                    
                    # Check for OI-related fields
                    oi_fields = [col for col in columns if 'pos' in col.lower() or 'oi' in col.lower() or 'open' in col.lower()]
                    if oi_fields:
                        print(f"\n   ✅ Found OI-related fields: {oi_fields}")
                    
                    return data, columns, rows
                else:
                    print(f"   ⚠️  No data for ticker {ticker}")
                    print(f"   Response keys: {list(data.keys())}")
            elif "securities" in data:
                securities_data = data["securities"]
                
                if "data" in securities_data and len(securities_data["data"]) > 0:
                    columns = securities_data.get("columns", [])
                    rows = securities_data["data"]
                    
                    print(f"   📊 Found {len(rows)} records")
                    print(f"   📋 Columns: {columns}")
                    
                    # Show first few records
                    print(f"\n   📋 Sample records (first 5):")
                    for i, row in enumerate(rows[:5]):
                        record = dict(zip(columns, row))
                        print(f"      {i+1}. {record}")
                    
                    return data, columns, rows
                else:
                    print(f"   ⚠️  No data for ticker {ticker}")
            else:
                print(f"   ⚠️  Unexpected response structure: {list(data.keys())}")
                # Try to print full structure for debugging
                print(f"   Full response structure:")
                for key, value in data.items():
                    if isinstance(value, dict):
                        print(f"      {key}: {list(value.keys())}")
                    else:
                        print(f"      {key}: {type(value).__name__}")
                
        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 404:
                print(f"   ⚠️  404 - Ticker {ticker} not found or no data")
            else:
                print(f"   ❌ HTTP Error: {e}")
        except Exception as e:
            print(f"   ❌ Failed: {e}")
            import traceback
            traceback.print_exc()
            
        return None, None, None
        
    except ImportError:
        print("   ❌ requests library not installed")
        return None, None, None
    except Exception as e:
        print(f"   ❌ Failed: {e}")
        import traceback
        traceback.print_exc()
        return None, None, None

def test_moex_iss_metadata():
    """Test MOEX ISS API - Get metadata about the endpoint."""
    print("\n🔍 Testing MOEX ISS API - Metadata...")
    
    try:
        import requests
        
        base_url = "https://iss.moex.com/iss"
        url = f"{base_url}/analyticalproducts/futoi/securities.json"
        
        # Request metadata
        params = {"iss.meta": "on"}
        
        try:
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()
            data = response.json()
            
            print(f"   ✅ Success!")
            
            # Check for metadata
            if "securities" in data:
                securities_data = data["securities"]
                if "metadata" in securities_data:
                    metadata = securities_data["metadata"]
                    print(f"   📋 Metadata fields:")
                    for key, value in metadata.items():
                        print(f"      - {key}: {value}")
                else:
                    print(f"   ⚠️  No metadata found")
            
            return data
            
        except Exception as e:
            print(f"   ❌ Failed: {e}")
            import traceback
            traceback.print_exc()
            
        return None
        
    except ImportError:
        print("   ❌ requests library not installed")
        return None
    except Exception as e:
        print(f"   ❌ Failed: {e}")
        import traceback
        traceback.print_exc()
        return None

def test_alternative_endpoints():
    """Test alternative MOEX ISS endpoints that might have OI data."""
    print("\n🔍 Testing alternative MOEX ISS endpoints...")
    
    try:
        import requests
        
        base_url = "https://iss.moex.com/iss"
        
        # Test different endpoint variations
        endpoints_to_test = [
            "/engines/futures/markets/forts/securities.json",
            "/engines/futures/markets/forts/securities/Si.json",
            "/statistics/engines/futures/markets/forts/securities.json",
        ]
        
        for endpoint in endpoints_to_test:
            url = f"{base_url}{endpoint}"
            print(f"\n   Testing: {endpoint}")
            
            try:
                response = requests.get(url, timeout=10)
                if response.status_code == 200:
                    data = response.json()
                    print(f"      ✅ 200 OK")
                    print(f"      Keys: {list(data.keys())}")
                    
                    # Check if it has securities data
                    if "securities" in data or "marketdata" in data:
                        print(f"      ✅ Has securities/marketdata")
                else:
                    print(f"      ⚠️  {response.status_code}")
            except Exception as e:
                print(f"      ❌ Failed: {e}")
        
    except ImportError:
        print("   ❌ requests library not installed")
    except Exception as e:
        print(f"   ❌ Failed: {e}")
        import traceback
        traceback.print_exc()

def main():
    print("=" * 70)
    print("MOEX ISS API - Open Interest Investigation")
    print("=" * 70)
    
    # Test 1: Get metadata
    test_moex_iss_metadata()
    
    # Test 2: All securities OI
    data, columns, rows = test_moex_iss_all_securities()
    
    # Test 3: Specific ticker OI
    ticker_data, ticker_columns, ticker_rows = test_moex_iss_specific_ticker("Si")
    
    # Test 4: Alternative endpoints
    test_alternative_endpoints()
    
    print("\n" + "=" * 70)
    print("📝 Summary:")
    if columns:
        print(f"   ✅ MOEX ISS API works!")
        print(f"   ✅ Available fields: {columns}")
        print(f"   ✅ Can fetch OI data for all securities or specific tickers")
    else:
        print(f"   ⚠️  Could not fetch OI data (may need different date or ticker)")
    print("=" * 70)

if __name__ == "__main__":
    main()

