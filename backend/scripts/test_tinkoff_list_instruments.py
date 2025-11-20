"""
Test script to get list of all available MOEX instruments from Tinkoff API.
"""
import sys
from pathlib import Path
from datetime import datetime, timezone

# Add backend directory to path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

try:
    from tinkoff.invest import Client
    from tinkoff.invest import InstrumentStatus
    from tinkoff.invest.schemas import InstrumentIdType
except ImportError:
    print("❌ tinkoff-investments package not installed")
    sys.exit(1)

TOKEN = "t.kNu8LX8-p9SIAbeOyH8TdqQOhrgtp4_7Nt0aOPOAQJ6t4UKr5faObQdv64Zi8ph99WIiiCDmdAaIX0s9F6e1AA"

def test_get_all_shares():
    """Test getting all available shares from MOEX."""
    print("🔍 Fetching all MOEX shares from Tinkoff API...")
    try:
        with Client(TOKEN) as client:
            # Get all shares
            shares_response = client.instruments.shares(
                instrument_status=InstrumentStatus.INSTRUMENT_STATUS_BASE
            )
            
            print(f"✅ Found {len(shares_response.instruments)} total shares")
            
            # Filter for MOEX only
            moex_shares = [
                inst for inst in shares_response.instruments 
                if inst.exchange == "MOEX"
            ]
            
            print(f"✅ Found {len(moex_shares)} MOEX shares")
            
            # Show first 20
            print("\n📋 Sample MOEX shares (first 20):")
            for inst in moex_shares[:20]:
                print(f"   - {inst.name} ({inst.ticker})")
                print(f"     FIGI: {inst.figi}")
                print(f"     Currency: {inst.currency}")
                print()
            
            # Get unique tickers
            tickers = sorted(set(inst.ticker for inst in moex_shares))
            print(f"\n📊 Total unique MOEX tickers: {len(tickers)}")
            print(f"   First 30 tickers: {', '.join(tickers[:30])}")
            
            return moex_shares, tickers
            
    except Exception as e:
        print(f"❌ Failed: {e}")
        import traceback
        traceback.print_exc()
        return None, None

def test_get_all_bonds():
    """Test getting all available bonds from MOEX."""
    print("\n🔍 Fetching all MOEX bonds from Tinkoff API...")
    try:
        with Client(TOKEN) as client:
            bonds_response = client.instruments.bonds(
                instrument_status=InstrumentStatus.INSTRUMENT_STATUS_BASE
            )
            
            moex_bonds = [
                inst for inst in bonds_response.instruments 
                if inst.exchange == "MOEX"
            ]
            
            print(f"✅ Found {len(moex_bonds)} MOEX bonds")
            return moex_bonds
            
    except Exception as e:
        print(f"❌ Failed: {e}")
        return None

def test_get_all_etfs():
    """Test getting all available ETFs from MOEX."""
    print("\n🔍 Fetching all MOEX ETFs from Tinkoff API...")
    try:
        with Client(TOKEN) as client:
            etfs_response = client.instruments.etfs(
                instrument_status=InstrumentStatus.INSTRUMENT_STATUS_BASE
            )
            
            moex_etfs = [
                inst for inst in etfs_response.instruments 
                if inst.exchange == "MOEX"
            ]
            
            print(f"✅ Found {len(moex_etfs)} MOEX ETFs")
            
            # Show first 10
            print("\n📋 Sample MOEX ETFs:")
            for inst in moex_etfs[:10]:
                print(f"   - {inst.name} ({inst.ticker})")
                print(f"     FIGI: {inst.figi}")
            
            return moex_etfs
            
    except Exception as e:
        print(f"❌ Failed: {e}")
        return None

def test_get_all_currencies():
    """Test getting all available currency pairs."""
    print("\n🔍 Fetching all currency pairs from Tinkoff API...")
    try:
        with Client(TOKEN) as client:
            currencies_response = client.instruments.currencies(
                instrument_status=InstrumentStatus.INSTRUMENT_STATUS_BASE
            )
            
            print(f"✅ Found {len(currencies_response.instruments)} currency pairs")
            
            # Show first 10
            print("\n📋 Sample currency pairs:")
            for inst in currencies_response.instruments[:10]:
                print(f"   - {inst.name} ({inst.ticker})")
                print(f"     FIGI: {inst.figi}")
                print(f"     Exchange: {inst.exchange}")
            
            return currencies_response.instruments
            
    except Exception as e:
        print(f"❌ Failed: {e}")
        return None

def main():
    print("=" * 70)
    print("Tinkoff API - List All Available Instruments")
    print("=" * 70)
    
    # Test 1: Get all MOEX shares
    moex_shares, tickers = test_get_all_shares()
    
    # Test 2: Get all MOEX bonds
    moex_bonds = test_get_all_bonds()
    
    # Test 3: Get all MOEX ETFs
    moex_etfs = test_get_all_etfs()
    
    # Test 4: Get currency pairs
    currencies = test_get_all_currencies()
    
    print("\n" + "=" * 70)
    print("📊 Summary:")
    if moex_shares:
        print(f"   MOEX Shares: {len(moex_shares)}")
    if moex_bonds:
        print(f"   MOEX Bonds: {len(moex_bonds)}")
    if moex_etfs:
        print(f"   MOEX ETFs: {len(moex_etfs)}")
    if currencies:
        print(f"   Currency pairs: {len(currencies)}")
    print("=" * 70)
    
    if tickers:
        print(f"\n💡 We can dynamically fetch {len(tickers)} MOEX tickers from API!")
        print("   No need to hardcode - we can query Tinkoff API for the list.")

if __name__ == "__main__":
    main()

