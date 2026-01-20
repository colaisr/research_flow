"""
Script to set T-Bank payment gateway credentials.

Usage:
    python scripts/set_tbank_credentials.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.core.database import SessionLocal
from app.models.settings import AppSettings


def set_tbank_credentials(
    terminal_key: str,
    password: str,
    test_mode: bool = True
):
    """Set T-Bank credentials in AppSettings."""
    db = SessionLocal()
    try:
        # Set terminal key
        setting = db.query(AppSettings).filter(AppSettings.key == 'tbank_terminal_key').first()
        if setting:
            setting.value = terminal_key
            print(f"✅ Updated tbank_terminal_key")
        else:
            setting = AppSettings(
                key='tbank_terminal_key',
                value=terminal_key,
                description='T-Bank Terminal Key',
                is_secret=True
            )
            db.add(setting)
            print(f"✅ Created tbank_terminal_key")
        
        # Set password
        setting = db.query(AppSettings).filter(AppSettings.key == 'tbank_password').first()
        if setting:
            setting.value = password
            print(f"✅ Updated tbank_password")
        else:
            setting = AppSettings(
                key='tbank_password',
                value=password,
                description='T-Bank Password',
                is_secret=True
            )
            db.add(setting)
            print(f"✅ Created tbank_password")
        
        # Set test mode
        setting = db.query(AppSettings).filter(AppSettings.key == 'tbank_test_mode').first()
        if setting:
            setting.value = 'true' if test_mode else 'false'
            print(f"✅ Updated tbank_test_mode = {test_mode}")
        else:
            setting = AppSettings(
                key='tbank_test_mode',
                value='true' if test_mode else 'false',
                description='T-Bank Test Mode (true for test, false for production)',
                is_secret=False
            )
            db.add(setting)
            print(f"✅ Created tbank_test_mode = {test_mode}")
        
        db.commit()
        print("\n" + "=" * 60)
        print("✅ T-Bank credentials configured successfully!")
        print("=" * 60)
        
    except Exception as e:
        db.rollback()
        print("\n" + "=" * 60)
        print(f"❌ Error setting credentials: {e}")
        print("=" * 60)
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        db.close()


def main():
    """Main function."""
    import sys
    
    print("=" * 60)
    print("Setting T-Bank Payment Gateway Credentials")
    print("=" * 60)
    
    # Get credentials from command line arguments or use defaults
    if len(sys.argv) >= 3:
        terminal_key = sys.argv[1]
        password = sys.argv[2]
        test_mode = sys.argv[3].lower() == 'true' if len(sys.argv) >= 4 else False
    else:
        # Default credentials (for backward compatibility)
        terminal_key = "1768852476031DEMO"
        password = "W4Vd#YBu3^jrd$s4"
        test_mode = True  # DEMO terminal key indicates test mode
    
    print(f"\nTerminal Key: {terminal_key}")
    print(f"Password: {'*' * len(password)}")
    print(f"Test Mode: {test_mode}")
    print()
    
    set_tbank_credentials(
        terminal_key=terminal_key,
        password=password,
        test_mode=test_mode
    )


if __name__ == "__main__":
    main()
