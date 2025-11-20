# Migration Checklist - Quick Reference

## Pre-Migration

- [ ] New Git repository created (empty)
- [ ] New server access configured (SSH)
- [ ] Server prerequisites installed (Python 3.11+, Node.js 18+, MySQL 8.0+)
- [ ] Database server ready (local or remote)

## Phase 1: Copy to New Repository

- [ ] Clone current repo to temp location
- [ ] Remove `.git` folder
- [ ] Remove sensitive files (`config_local.py`, `.venv`, `node_modules`, `.next`)
- [ ] Copy to new repository location
- [ ] Initialize new git repo (`git init`)
- [ ] Add remote (`git remote add origin <new-repo-url>`)
- [ ] Commit and push (`git add .`, `git commit`, `git push`)

## Phase 2: Server Setup

- [ ] SSH into new server
- [ ] Create `/srv/max-signal` directory
- [ ] Clone new repository
- [ ] Create MySQL database and user
- [ ] Test database connection

## Phase 3: Backend Setup

- [ ] Create Python virtual environment (`python3.11 -m venv .venv`)
- [ ] Install dependencies (`pip install -r requirements.txt`)
- [ ] Copy `config_local.example.py` to `config_local.py`
- [ ] Edit `config_local.py`:
  - [ ] Update `MYSQL_DSN` with new database credentials
  - [ ] Generate new `SESSION_SECRET` (`openssl rand -hex 32`)
  - [ ] Set `OPENROUTER_API_KEY = None` (will set via UI)
  - [ ] Set `TELEGRAM_BOT_TOKEN = None` (will set via UI)
- [ ] Set file permissions (`chmod 600 app/config_local.py`)
- [ ] Run migrations (`alembic upgrade head`)
- [ ] Create admin user (`python scripts/create_admin_user.py`)

## Phase 4: Frontend Setup

- [ ] Install dependencies (`npm ci`)
- [ ] Create `.env.production` with `NEXT_PUBLIC_API_BASE_URL`
- [ ] Build frontend (`npm run build`)

## Phase 5: Systemd Services

- [ ] Copy service files to `/etc/systemd/system/`
- [ ] Edit service files (replace `YOUR_USERNAME` and `YOUR_GROUP`)
- [ ] Reload systemd (`sudo systemctl daemon-reload`)
- [ ] Enable services (`sudo systemctl enable max-signal-*`)
- [ ] Start services (`sudo systemctl start max-signal-*`)
- [ ] Verify services running (`sudo systemctl status max-signal-*`)

## Phase 6: Verification

- [ ] Backend health check (`curl http://localhost:8000/health`)
- [ ] Frontend accessible (`curl http://localhost:3000`)
- [ ] Login to UI with admin credentials
- [ ] Configure OpenRouter API key in Settings
- [ ] Configure Telegram bot token in Settings
- [ ] Test Telegram bot (`/start` command)
- [ ] Run test analysis
- [ ] Verify analysis completes
- [ ] Test publish to Telegram

## Phase 7: Deployment Scripts

- [ ] Test `deploy.sh` script
- [ ] Test `restart_backend.sh` script
- [ ] Test `restart_frontend.sh` script
- [ ] (Optional) Install standalone deploy script

## Post-Migration

- [ ] Document new server details
- [ ] Document new database credentials (securely)
- [ ] Set up database backups
- [ ] Configure firewall rules
- [ ] Test full deployment workflow
- [ ] Verify all functionality works

---

## Quick Commands Reference

```bash
# On local machine - Copy project
cd /tmp
git clone <old-repo> temp-project
cd temp-project && rm -rf .git
cp -r . /path/to/new-repo/

# On new server - Initial setup
sudo mkdir -p /srv/max-signal && sudo chown $USER:$USER /srv/max-signal
cd /srv/max-signal && git clone <new-repo-url> .

# Backend setup
cd backend && python3.11 -m venv .venv
source .venv/bin/activate && pip install -r requirements.txt
cp app/config_local.example.py app/config_local.py
# Edit config_local.py
alembic upgrade head
python scripts/create_admin_user.py admin@example.com password

# Frontend setup
cd frontend && npm ci
echo "NEXT_PUBLIC_API_BASE_URL=http://localhost:8000" > .env.production
npm run build

# Systemd services
sudo cp scripts/systemd/*.service /etc/systemd/system/
sudo nano /etc/systemd/system/max-signal-backend.service  # Edit user
sudo nano /etc/systemd/system/max-signal-frontend.service  # Edit user
sudo systemctl daemon-reload
sudo systemctl enable --now max-signal-backend max-signal-frontend

# Verify
curl http://localhost:8000/health
curl http://localhost:3000
```

---

**Estimated Time:** 2-3 hours for complete migration

