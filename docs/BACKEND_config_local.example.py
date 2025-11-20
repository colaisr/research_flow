"""
Local configuration example for the backend.
Copy this file into the backend repo as `app/config_local.py` and keep it out of git.
"""

# Database (MySQL)
# Replace the password and adjust host/port if needed.
# This connects to a NEW database on the same MySQL server (separate from infrazen_dev).
MYSQL_DSN = "mysql+pymysql://max_signal_user:CHANGE_ME_STRONG_PASSWORD@localhost:3306/max_signal_dev?charset=utf8mb4"

# OpenRouter API
# Paste your key on the server only; do not commit.
OPENROUTER_API_KEY = "PASTE_YOUR_KEY_HERE"
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
DEFAULT_LLM_MODEL = "openai/gpt-4o-mini"  # change as needed

# Telegram
TELEGRAM_BOT_TOKEN = "PASTE_YOUR_TELEGRAM_BOT_TOKEN"
TELEGRAM_CHANNEL_ID = -1001234567890  # replace with your channel id

# Scheduler
DAYSTART_SCHEDULE = "08:00"  # local server time HH:MM

# Security
SESSION_COOKIE_NAME = "maxsignal_session"
SESSION_SECRET = "CHANGE_ME_RANDOM_SECRET_FOR_SIGNING"  # keep only on the server

# Feature flags
ENABLE_TELEGRAM_AUTO_SEND = False
ENABLE_BACKTESTING = False


