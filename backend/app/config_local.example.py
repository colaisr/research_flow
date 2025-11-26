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

# RAG System Configuration
DEFAULT_EMBEDDING_MODEL = "openai/text-embedding-3-small"  # Embedding model for RAG (transparent to user)
STORAGE_BASE_PATH = "data"  # Relative path (works everywhere) or absolute path like "/srv/research-flow/backend/data"
VECTOR_DB_BACKEND = "chromadb"  # "chromadb" (MVP) or "qdrant" (future)

# RAG Query Filtering
# Minimum similarity score threshold. Results below this threshold will be filtered out.
# For ChromaDB L2 distance: lower is better, typical good matches: < 1.0, moderate: 1.0-1.5, poor: > 1.5
# For cosine similarity: higher is better, typical good matches: > 0.7, moderate: 0.5-0.7, poor: < 0.5
# Set to None to disable filtering (show all results)
# Recommended: 1.2 for L2 distance, or 0.6 for cosine similarity
RAG_MIN_SIMILARITY_SCORE = None  # None = no filtering, or set threshold (e.g., 1.2 for L2 distance)

# Default threshold for new RAGs (applied when creating a new RAG)
# Set to None if you want new RAGs to have no filtering by default
# Recommended: 1.2 for L2 distance (filters out poor matches while keeping moderate ones)
RAG_DEFAULT_MIN_SIMILARITY_SCORE = 1.2  # Default threshold for new RAGs

