"""
Test script to get list of all available MOEX instruments from MOEX ISS API.
"""
import sys
import requests
from pathlib import Path

# Add backend directory to path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

try:
    import apimoex
except ImportError:
    print("❌ apimoex package not installed")
    print("   Install with: pip install apimoex")
    sys.exit(1)

def test_get_moex_securities():
    """Get all securities from MOEX ISS API."""
    print("🔍 Fetching all MOEX securities from ISS API...")
    
    with requests.Session() as session:
        try:
            # Get securities from main trading board (TQBR - T+2 stocks)
            data = apimoex.get_board_securities(session, board='TQBR')
            
            print(f"✅ Found {len(data)} securities on TQBR board")
            
            # Show first 20
            print("\n📋 Sample MOEX securities (first 20):")
            for i, sec in enumerate(data[:20], 1):
                ticker = sec.get('SECID', 'N/A')
                name = sec.get('SHORTNAME', 'N/A')
                print(f"   {i}. {name} ({ticker})")
            
            # Get unique tickers
            tickers = sorted(set(sec.get('SECID') for sec in data if sec.get('SECID')))
            print(f"\n📊 Total unique tickers: {len(tickers)}")
            print(f"   First 30 tickers: {', '.join(tickers[:30])}")
            
            # Popular tickers (you mentioned: нефть, газ, золото, серебро, платина)
            popular_keywords = {
                'нефть': ['GAZP', 'ROSN', 'LUKOIL', 'TATN'],
                'газ': ['GAZP', 'NOVATEK'],
                'золото': ['POLY', 'GVLD'],
                'серебро': [],
                'платина': []
            }
            
            print("\n🔍 Searching for popular instruments:")
            found_popular = {}
            for category, keywords in popular_keywords.items():
                found = []
                for ticker in tickers:
                    if any(kw in ticker.upper() for kw in keywords):
                        found.append(ticker)
                found_popular[category] = found
                if found:
                    print(f"   {category}: {', '.join(found)}")
            
            return data, tickers
            
        except Exception as e:
            print(f"❌ Failed: {e}")
            import traceback
            traceback.print_exc()
            return None, None

def test_get_moex_boards():
    """Get list of available trading boards."""
    print("\n🔍 Fetching available trading boards...")
    
    with requests.Session() as session:
        try:
            boards = apimoex.get_board_securities(session)
            print(f"✅ Found boards data")
            
            # Try different boards
            boards_to_try = ['TQBR', 'TQTD', 'TQIR', 'TQDE', 'TQPI']
            all_tickers = set()
            
            for board in boards_to_try:
                try:
                    data = apimoex.get_board_securities(session, board=board)
                    tickers = set(sec.get('SECID') for sec in data if sec.get('SECID'))
                    all_tickers.update(tickers)
                    print(f"   Board {board}: {len(tickers)} instruments")
                except:
                    print(f"   Board {board}: Not available")
            
            print(f"\n📊 Total unique instruments across all boards: {len(all_tickers)}")
            return list(all_tickers)
            
        except Exception as e:
            print(f"❌ Failed: {e}")
            return None

def main():
    print("=" * 70)
    print("MOEX ISS API - List All Available Instruments")
    print("=" * 70)
    
    # Test 1: Get securities from main board
    securities, tickers = test_get_moex_securities()
    
    # Test 2: Try different boards
    all_tickers = test_get_moex_boards()
    
    print("\n" + "=" * 70)
    print("💡 Recommendation:")
    print("   - Use MOEX ISS API to get the list of available instruments")
    print("   - Use Tinkoff API to fetch actual OHLCV data (requires FIGI)")
    print("   - Cache ticker → FIGI mapping in database")
    print("=" * 70)

if __name__ == "__main__":
    main()

