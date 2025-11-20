# Max Signal Bot — Backend

FastAPI backend for market analysis and trading signal generation.

## Setup

1. **Create virtual environment:**
   ```bash
   python3.11 -m venv .venv
   source .venv/bin/activate  # On Windows: .venv\Scripts\activate
   ```

2. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Set up MySQL database:**
   - Run the setup script from the parent `scripts/` directory:
     ```bash
     mysql -u root -p < ../scripts/mysql_local_setup.sql
     ```
   - Edit the password in the script first!

4. **Configure local settings:**
   ```bash
   cp ../docs/BACKEND_config_local.example.py app/config_local.py
   ```
   - Edit `app/config_local.py` and set your MySQL password, OpenRouter API key, Telegram bot token, etc.

5. **Run Alembic migrations:**
   ```bash
   alembic upgrade head
   ```

6. **Start the development server:**
   ```bash
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

7. **Verify:**
   - Visit `http://localhost:8000/health` — should return `{"status": "ok", ...}`
   - Visit `http://localhost:8000/docs` — FastAPI auto-generated docs

## Project Structure

```
backend/
├── app/
│   ├── api/          # API route handlers
│   ├── core/         # Core config, database, etc.
│   ├── models/       # SQLAlchemy models
│   └── main.py       # FastAPI app entry point
├── alembic/          # Database migrations
├── requirements.txt
└── README.md
```

## Development

- **Database migrations:** Use Alembic (`alembic revision --autogenerate -m "description"`, then `alembic upgrade head`)
- **API docs:** Auto-generated at `/docs` (Swagger) and `/redoc`
- **Logging:** Uses structlog (configure in `app/core/logging.py` when needed)

## Deployment

See `docs/MASTER_PLAN.md` for deployment instructions (single VM, systemd).

