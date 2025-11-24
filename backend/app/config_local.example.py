"""
Local configuration example for the backend.
Copy this file as `app/config_local.py` and keep it out of git.
"""

# Database (MySQL)
# Replace the password and adjust host/port if needed.
# This connects to a NEW database on the same MySQL server (separate from infrazen_dev).
MYSQL_DSN = "mysql+pymysql://research_flow_user:CHANGE_ME_STRONG_PASSWORD@localhost:3306/research_flow_dev?charset=utf8mb4"

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
SESSION_COOKIE_NAME = "researchflow_session"
SESSION_SECRET = "CHANGE_ME_RANDOM_SECRET_FOR_SIGNING"  # keep only on the server

# Feature flags
ENABLE_TELEGRAM_AUTO_SEND = False
ENABLE_BACKTESTING = False

# Email (SMTP) Configuration
# For Beget hosting, use smtp.beget.com or smtp.timeweb.ru
SMTP_HOST = "smtp.beget.com"  # or "smtp.timeweb.ru" depending on your hosting
SMTP_PORT = 465  # 465 for SSL, 587 for TLS
SMTP_USE_TLS = False  # Set to True if using port 587
SMTP_USE_SSL = True  # Set to True if using port 465
SMTP_USERNAME = "registration@researchflow.ru"  # Your email address
SMTP_PASSWORD = "YOUR_EMAIL_PASSWORD"  # Email account password
SMTP_FROM_EMAIL = "registration@researchflow.ru"  # From address
SMTP_FROM_NAME = "Research Flow"  # Display name

# Email verification
EMAIL_VERIFICATION_TOKEN_EXPIRY_HOURS = 24  # Token expires after 24 hours
FRONTEND_BASE_URL = "http://localhost:3000"  # Change to https://researchflow.ru in production

