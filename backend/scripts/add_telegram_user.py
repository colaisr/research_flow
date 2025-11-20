"""
Script to add a Telegram user (for testing).
Usage: python scripts/add_telegram_user.py <chat_id> [username] [first_name] [last_name]

Example: python scripts/add_telegram_user.py 123456789 @username John Doe
"""
import sys
from pathlib import Path

# Add backend directory to path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from app.core.database import SessionLocal
from app.models.telegram_user import TelegramUser


def add_telegram_user(chat_id: str, username: str = None, first_name: str = None, last_name: str = None):
    """Add a Telegram user to the database."""
    db = SessionLocal()
    try:
        # Check if user already exists
        existing = db.query(TelegramUser).filter(TelegramUser.chat_id == chat_id).first()
        if existing:
            print(f"✅ User with chat_id {chat_id} already exists")
            if not existing.is_active:
                existing.is_active = True
                db.commit()
                print(f"✅ Reactivated user {chat_id}")
            return
        
        # Create new user
        user = TelegramUser(
            chat_id=chat_id,
            username=username,
            first_name=first_name,
            last_name=last_name,
            is_active=True
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        
        print(f"✅ Added Telegram user:")
        print(f"   Chat ID: {user.chat_id}")
        print(f"   Username: {user.username or 'N/A'}")
        print(f"   Name: {user.first_name or ''} {user.last_name or ''}".strip())
        print(f"   Active: {user.is_active}")
        
    except Exception as e:
        db.rollback()
        print(f"❌ Error adding user: {e}")
        sys.exit(1)
    finally:
        db.close()


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python scripts/add_telegram_user.py <chat_id> [username] [first_name] [last_name]")
        print("\nExample:")
        print("  python scripts/add_telegram_user.py 123456789")
        print("  python scripts/add_telegram_user.py 123456789 @username John Doe")
        sys.exit(1)
    
    chat_id = sys.argv[1]
    username = sys.argv[2] if len(sys.argv) > 2 else None
    first_name = sys.argv[3] if len(sys.argv) > 3 else None
    last_name = sys.argv[4] if len(sys.argv) > 4 else None
    
    add_telegram_user(chat_id, username, first_name, last_name)

