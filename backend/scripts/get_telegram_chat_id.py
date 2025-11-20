"""
Helper script to get your Telegram chat_id.
Usage: python scripts/get_telegram_chat_id.py

This will show recent updates from your bot, including chat_id when you send /start.
"""
import sys
from pathlib import Path

# Add backend directory to path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from app.core.database import SessionLocal
from app.models.settings import AppSettings
import requests


def get_chat_id():
    """Get chat_id from Telegram bot updates."""
    db = SessionLocal()
    try:
        # Get bot token from settings
        token_setting = db.query(AppSettings).filter(
            AppSettings.key == "telegram_bot_token"
        ).first()
        
        if not token_setting or not token_setting.value:
            print("❌ Telegram bot token not configured in Settings")
            print("   Please set it in Settings → Telegram Configuration first")
            return
        
        bot_token = token_setting.value
        
        # Get updates from Telegram API
        url = f"https://api.telegram.org/bot{bot_token}/getUpdates"
        response = requests.get(url, timeout=10)
        
        if response.status_code != 200:
            print(f"❌ Failed to get updates: {response.status_code}")
            print(f"   Response: {response.text}")
            return
        
        data = response.json()
        
        if not data.get('ok'):
            print(f"❌ Telegram API error: {data.get('description', 'Unknown error')}")
            return
        
        updates = data.get('result', [])
        
        if not updates:
            print("📭 No recent updates found.")
            print("")
            print("To get your chat_id:")
            print("1. Open Telegram and find your bot")
            print("2. Send /start to your bot")
            print("3. Run this script again")
            return
        
        print(f"📬 Found {len(updates)} recent update(s):\n")
        
        seen_chats = set()
        for update in updates:
            message = update.get('message', {})
            chat = message.get('chat', {})
            chat_id = chat.get('id')
            username = chat.get('username')
            first_name = chat.get('first_name')
            text = message.get('text', '')
            
            if chat_id and chat_id not in seen_chats:
                seen_chats.add(chat_id)
                print(f"  Chat ID: {chat_id}")
                if username:
                    print(f"  Username: @{username}")
                if first_name:
                    print(f"  Name: {first_name}")
                if text:
                    print(f"  Last message: {text[:50]}")
                print("")
        
        if seen_chats:
            print("To add a user to the database, run:")
            print(f"  python scripts/add_telegram_user.py <chat_id> [username] [first_name] [last_name]")
            print("")
            print("Example:")
            for chat_id in list(seen_chats)[:1]:  # Show example for first chat
                print(f"  python scripts/add_telegram_user.py {chat_id}")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()


if __name__ == '__main__':
    get_chat_id()

