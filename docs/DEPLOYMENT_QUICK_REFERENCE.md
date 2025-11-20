# Production Deployment Quick Reference

## One-Time Setup

```bash
# 1. Server setup
sudo mkdir -p /srv/research-flow
sudo chown $USER:$USER /srv/research-flow
cd /srv/research-flow

# 2. Clone monorepo
git clone <repo-url> .

# 3. Backend setup
cd backend
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp app/config_local.example.py app/config_local.py
# Edit config_local.py with production MySQL DSN and SESSION_SECRET
alembic upgrade head
python scripts/create_admin_user.py <email> <password>

# 4. Frontend setup
cd ../frontend
npm ci
npm run build

# 5. Install systemd services
cd ../../
./scripts/install_systemd_services.sh
sudo systemctl enable research-flow-backend research-flow-frontend
sudo systemctl start research-flow-backend research-flow-frontend
```

## Regular Deployments

```bash
# Step 1: Pull latest, update dependencies, run migrations, build
cd /srv/research-flow
./scripts/deploy.sh

# Step 2: Restart backend (if backend changed)
./scripts/restart_backend.sh

# Step 3: Restart frontend (if frontend changed)
./scripts/restart_frontend.sh
```

**What `deploy.sh` does:**
- ✅ Pulls latest changes from git
- ✅ Updates backend Python dependencies (`requirements.txt`)
- ✅ Runs database migrations (`alembic upgrade head`)
- ✅ Updates frontend npm dependencies (`package.json`)
- ✅ Builds frontend for production (`npm run build`)

## Useful Commands

```bash
# Service status
sudo systemctl status research-flow-backend
sudo systemctl status research-flow-frontend

# View logs
sudo journalctl -u research-flow-backend -f
sudo journalctl -u research-flow-frontend -f

# Restart services
sudo systemctl restart research-flow-backend
sudo systemctl restart research-flow-frontend

# Health checks
curl http://localhost:8000/health
curl http://localhost:3000
```

## Configuration

**Backend (`app/config_local.py`):**
- `MYSQL_DSN` - Production database connection
- `SESSION_SECRET` - Generate with `openssl rand -hex 32`

**Frontend (`.env.production` or environment):**
- `NEXT_PUBLIC_API_BASE_URL` - Backend API URL

**Via Settings UI (after login):**
- OpenRouter API key
- Telegram bot token

## Troubleshooting

**Backend won't start:**
```bash
sudo journalctl -u research-flow-backend -n 100
# Check MySQL connection, Python version, virtual environment
```

**Frontend won't start:**
```bash
sudo journalctl -u research-flow-frontend -n 100
# Check Node version, build output, environment variables
```

**Database errors:**
```bash
mysql -u research_flow_prod -p research_flow_prod
# Verify connection, check DSN in config_local.py
```

## Files Location

- Monorepo: `/srv/research-flow/`
- Backend: `/srv/research-flow/backend`
- Frontend: `/srv/research-flow/frontend`
- Scripts: `/srv/research-flow/scripts/`
- Config: `/srv/research-flow/backend/app/config_local.py`
- Logs: `journalctl -u research-flow-backend -u research-flow-frontend`
- Services: `/etc/systemd/system/max-signal-*.service`

