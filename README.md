# Research Flow

General-purpose research platform for creating custom analysis flows using any data sources, tools, and knowledge bases.

## Repository Structure

This is a monorepo containing both backend and frontend:

- **Backend** (`backend/`): FastAPI application with MySQL, Alembic migrations, and analysis pipeline
- **Frontend** (`frontend/`): Next.js application with TailwindCSS

See individual README files in each directory for setup instructions.

## Documentation

- **Master Plan**: `docs/MASTER_PLAN.md` — Complete architecture, milestones, and progress tracking
- **MySQL Setup**: `scripts/mysql_local_setup.sql` — Local database setup script

## Quick Start

1. **Set up MySQL database:**
   ```bash
   mysql -u root -p < scripts/mysql_local_setup.sql
   ```
   (Edit password in script first!)

2. **Backend:**
   ```bash
   cd backend
   python3.11 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   cp ../docs/BACKEND_config_local.example.py app/config_local.py
   # Edit app/config_local.py with your settings
   alembic upgrade head
   uvicorn app.main:app --reload
   ```

3. **Frontend:**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

4. **Verify:**
   - Backend: `http://localhost:8000/health`
   - Frontend: `http://localhost:3000`

## Development Status

See `docs/MASTER_PLAN.md` for current milestone progress.

