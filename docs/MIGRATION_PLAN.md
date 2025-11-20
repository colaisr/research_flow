# Migration Plan: Copy Project to New Repository & Server

## Overview

This document outlines the step-by-step process to copy the current Research Flow project to a new repository and deploy it on a new server with a separate database. This creates an exact duplicate that can later be modified for the new analytical pipelines platform.

## Prerequisites

- [ ] Access to new server (Ubuntu/Debian Linux)
- [ ] New MySQL database server (can be same server or remote)
- [ ] New Git repository created (empty or initialized)
- [ ] SSH access to new server configured
- [ ] Python 3.11+ installed on new server
- [ ] Node.js 18+ installed on new server
- [ ] MySQL 8.0+ installed and running

## Step-by-Step Migration Plan

### Phase 1: Prepare New Repository (Local)

#### Step 1.1: Create Clean Copy of Project

**Option A: Fresh Clone + Copy (Recommended)**
```bash
# On your local machine, create a temporary directory
cd /tmp
git clone <current-repo-url> max-signal-temp
cd max-signal-temp

# Remove git history
rm -rf .git

# Remove sensitive files (they're already gitignored, but double-check)
rm -f backend/app/config_local.py
rm -f backend.log frontend.log
rm -rf backend/.venv frontend/node_modules frontend/.next

# Copy entire project structure to new location
cp -r /tmp/max-signal-temp/* /path/to/new-repo/
```

**Option B: Use Git Archive (Cleaner)**
```bash
# From current project directory
cd /Users/colakamornik/Projects/max_signal_bot

# Create archive excluding git files
git archive --format=tar --output=/tmp/max-signal-clean.tar HEAD

# Extract to new location
mkdir -p /path/to/new-repo
cd /path/to/new-repo
tar -xf /tmp/max-signal-clean.tar

# Clean up any sensitive files
rm -f backend/app/config_local.py
```

#### Step 1.2: Initialize New Git Repository

```bash
cd /path/to/new-repo

# Initialize git
git init
git branch -M main

# Add remote (replace with your new repo URL)
git remote add origin <new-repo-url>

# Verify .gitignore is present
cat .gitignore  # Should show config_local.py and other ignores

# Stage all files
git add .

# Create initial commit
git commit -m "Initial commit: Migrated from max_signal_bot"

# Push to new repository
git push -u origin main
```

#### Step 1.3: Verify Repository Contents

Checklist:
- [ ] All backend files present (`backend/app/`, `backend/alembic/`, etc.)
- [ ] All frontend files present (`frontend/app/`, `frontend/components/`, etc.)
- [ ] All scripts present (`scripts/deploy.sh`, `scripts/systemd/`, etc.)
- [ ] Documentation present (`docs/`, `README.md`)
- [ ] `.gitignore` includes `config_local.py`
- [ ] No sensitive files committed (verify with `git ls-files | grep config_local`)

---

### Phase 2: Server Setup (New Server)

#### Step 2.1: Server Prerequisites

```bash
# SSH into new server
ssh user@new-server-ip

# Update system
sudo apt update && sudo apt upgrade -y

# Install required packages
sudo apt install -y python3.11 python3.11-venv python3-pip
sudo apt install -y nodejs npm mysql-server
sudo apt install -y git curl

# Verify versions
python3.11 --version  # Should be 3.11+
node --version         # Should be 18+
npm --version
mysql --version        # Should be 8.0+
```

#### Step 2.2: Create Deployment Directory

```bash
# Create deployment directory
sudo mkdir -p /srv/research-flow
sudo chown $USER:$USER /srv/research-flow
cd /srv/research-flow

# Clone new repository
git clone <new-repo-url> .

# Verify structure
ls -la
# Should see: backend/ frontend/ scripts/ docs/ README.md
```

#### Step 2.3: Database Setup

**Option A: Local MySQL (Same Server)**

```bash
# Create production database
sudo mysql -u root -p << EOF
CREATE DATABASE research_flow_prod CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'research_flow_prod'@'localhost' IDENTIFIED BY 'STRONG_PASSWORD_HERE';
GRANT ALL PRIVILEGES ON research_flow_prod.* TO 'research_flow_prod'@'localhost';
FLUSH PRIVILEGES;
EOF

# Test connection
mysql -u research_flow_prod -p research_flow_prod
# Enter password, then type: exit
```

**Option B: Remote MySQL**

```bash
# On remote MySQL server, create database and user
# Then test connection from new server:
mysql -u research_flow_prod -p -h remote-mysql-host research_flow_prod
```

---

### Phase 3: Backend Configuration

#### Step 3.1: Backend Environment Setup

```bash
cd /srv/research-flow/backend

# Create virtual environment
python3.11 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install --upgrade pip
pip install -r requirements.txt
```

#### Step 3.2: Create Configuration File

```bash
# Copy example config
cp app/config_local.example.py app/config_local.py

# Edit configuration
nano app/config_local.py
```

**Update `config_local.py` with:**

```python
# Database (PRODUCTION - NEW SERVER)
MYSQL_DSN = "mysql+pymysql://research_flow_prod:STRONG_PASSWORD@localhost:3306/research_flow_prod?charset=utf8mb4"
# OR for remote MySQL:
# MYSQL_DSN = "mysql+pymysql://research_flow_prod:STRONG_PASSWORD@remote-host:3306/research_flow_prod?charset=utf8mb4"

# OpenRouter (will be set via Settings UI)
OPENROUTER_API_KEY = None  # Set via Settings UI after deployment
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
DEFAULT_LLM_MODEL = "openai/gpt-4o-mini"

# Telegram (will be set via Settings UI)
TELEGRAM_BOT_TOKEN = None  # Set via Settings UI after deployment
TELEGRAM_CHANNEL_ID = None  # Not used (direct messages)

# Scheduler
DAYSTART_SCHEDULE = "08:00"

# Security (CRITICAL: Generate new secret!)
SESSION_COOKIE_NAME = "researchflow_session"
SESSION_SECRET = "GENERATE_NEW_RANDOM_SECRET_HERE"

# Feature flags
ENABLE_TELEGRAM_AUTO_SEND = False
ENABLE_BACKTESTING = False
```

**Generate SESSION_SECRET:**
```bash
openssl rand -hex 32
# Copy output and paste into config_local.py
```

**Set file permissions:**
```bash
chmod 600 app/config_local.py
```

#### Step 3.3: Run Database Migrations

```bash
cd /srv/research-flow/backend
source .venv/bin/activate

# Run migrations (creates all tables)
alembic upgrade head

# Verify tables created
mysql -u research_flow_prod -p research_flow_prod -e "SHOW TABLES;"
# Should show: analysis_types, analysis_runs, analysis_steps, instruments, etc.
```

#### Step 3.4: Create Initial Admin User

```bash
cd /srv/research-flow/backend
source .venv/bin/activate

# Create admin user (replace email and password)
python scripts/create_admin_user.py admin@newserver.com STRONG_PASSWORD

# Verify user created
mysql -u research_flow_prod -p research_flow_prod -e "SELECT email, role FROM users;"
```

---

### Phase 4: Frontend Configuration

#### Step 4.1: Frontend Environment Setup

```bash
cd /srv/research-flow/frontend

# Install dependencies
npm ci

# Create production environment file
cat > .env.production << EOF
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
EOF

# Build for production
npm run build

# Verify build succeeded
ls -la .next/
```

**Note:** If using reverse proxy with domain, update `.env.production`:
```
NEXT_PUBLIC_API_BASE_URL=https://your-domain.com/api
```

---

### Phase 5: Systemd Services Setup

#### Step 5.1: Create Systemd Service Files

```bash
cd /srv/research-flow

# Copy systemd service files
sudo cp scripts/systemd/research-flow-backend.service /etc/systemd/system/
sudo cp scripts/systemd/research-flow-frontend.service /etc/systemd/system/

# Edit service files to set correct user
sudo nano /etc/systemd/system/research-flow-backend.service
sudo nano /etc/systemd/system/research-flow-frontend.service
```

**Update both files:**
- Replace `YOUR_USERNAME` with your actual username (run `whoami` to check)
- Replace `YOUR_GROUP` with your group (usually same as username)

**Example:**
```ini
User=deploy
Group=deploy
```

#### Step 5.2: Enable and Start Services

```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable services (start on boot)
sudo systemctl enable research-flow-backend
sudo systemctl enable research-flow-frontend

# Start services
sudo systemctl start research-flow-backend
sudo systemctl start research-flow-frontend

# Check status
sudo systemctl status research-flow-backend
sudo systemctl status research-flow-frontend

# View logs
sudo journalctl -u research-flow-backend -f
sudo journalctl -u research-flow-frontend -f
```

---

### Phase 6: Verification & Testing

#### Step 6.1: Health Checks

```bash
# Backend health
curl http://localhost:8000/health
# Should return: {"status":"ok"}

# Frontend
curl http://localhost:3000
# Should return HTML

# Check services
sudo systemctl is-active research-flow-backend  # Should return: active
sudo systemctl is-active research-flow-frontend # Should return: active
```

#### Step 6.2: Initial Configuration via UI

1. **Access Frontend:**
   - Open browser: `http://new-server-ip:3000`
   - Or if using domain: `https://your-domain.com`

2. **Login:**
   - Email: `admin@newserver.com` (or whatever you used)
   - Password: (the password you set)

3. **Configure Settings:**
   - Go to Settings → OpenRouter Configuration
   - Enter your OpenRouter API key
   - Go to Settings → Telegram Configuration
   - Enter your Telegram bot token (create new bot via @BotFather)

4. **Test Telegram Bot:**
   - Send `/start` to your Telegram bot
   - Check Settings → Telegram Configuration → Active Users (should show 1)

5. **Test Analysis Run:**
   - Go to Dashboard or Analyses page
   - Select an analysis type
   - Select an instrument
   - Run analysis
   - Verify it completes successfully
   - View run details

6. **Test Publishing:**
   - Run an analysis
   - Click "Publish to Telegram"
   - Verify you receive the message

---

### Phase 7: Deployment Scripts Setup

#### Step 7.1: Install Standalone Deploy Script (Optional but Recommended)

```bash
cd /srv/research-flow

# Install standalone deploy script
sudo ./scripts/install_standalone_deploy.sh

# Test deployment
research-flow-deploy

# Verify services still running
sudo systemctl status research-flow-backend
sudo systemctl status research-flow-frontend
```

#### Step 7.2: Verify Deployment Scripts Work

```bash
cd /srv/research-flow

# Test deploy script
./scripts/deploy.sh

# Test restart scripts
./scripts/restart_backend.sh
./scripts/restart_frontend.sh
```

---

## Post-Migration Checklist

### Database
- [ ] All tables created successfully
- [ ] Migrations applied (`alembic current` shows latest version)
- [ ] Admin user created and can login
- [ ] Database connection works from backend

### Backend
- [ ] Backend service running (`systemctl status research-flow-backend`)
- [ ] Health endpoint responds (`/health`)
- [ ] Can access API docs (`http://server:8000/docs`)
- [ ] Database queries work (test via API)

### Frontend
- [ ] Frontend service running (`systemctl status research-flow-frontend`)
- [ ] Frontend accessible (`http://server:3000`)
- [ ] Can login with admin credentials
- [ ] All pages load correctly
- [ ] API calls work (check browser console)

### Configuration
- [ ] OpenRouter API key configured in Settings
- [ ] Telegram bot token configured in Settings
- [ ] Telegram bot responds to `/start`
- [ ] Settings page shows correct configuration

### Functionality
- [ ] Can create analysis run
- [ ] Analysis completes successfully
- [ ] Run details show all steps
- [ ] Can publish to Telegram
- [ ] Telegram message received

### Deployment
- [ ] Deployment scripts work (`deploy.sh`, `restart_*.sh`)
- [ ] Standalone deploy script installed (optional)
- [ ] Services restart correctly after deployment
- [ ] Logs accessible (`journalctl -u max-signal-*`)

---

## Differences from Original Project

### What's the Same
- ✅ All code files (backend, frontend, scripts)
- ✅ Database schema (same migrations)
- ✅ Configuration structure
- ✅ Deployment process
- ✅ Systemd services

### What's Different
- 🔄 New Git repository (separate history)
- 🔄 New database (separate data)
- 🔄 New server (separate infrastructure)
- 🔄 New configuration values (database DSN, secrets, API keys)
- 🔄 New admin user credentials

---

## Troubleshooting

### Backend Won't Start
```bash
# Check logs
sudo journalctl -u research-flow-backend -n 100

# Common issues:
# 1. Database connection error → Check MYSQL_DSN in config_local.py
# 2. Missing dependencies → Run: pip install -r requirements.txt
# 3. Port already in use → Check: sudo lsof -i :8000
```

### Frontend Won't Start
```bash
# Check logs
sudo journalctl -u research-flow-frontend -n 100

# Common issues:
# 1. Build missing → Run: npm run build
# 2. Port already in use → Check: sudo lsof -i :3000
# 3. Node version → Check: node --version (should be 18+)
```

### Database Connection Errors
```bash
# Test MySQL connection
mysql -u research_flow_prod -p research_flow_prod

# Check MySQL is running
sudo systemctl status mysql

# Verify DSN format
# Should be: mysql+pymysql://user:pass@host:port/db?charset=utf8mb4
```

### Migration Errors
```bash
# Check current migration version
cd /srv/research-flow/backend
source .venv/bin/activate
alembic current

# Check migration history
alembic history

# If stuck, check alembic_version table
mysql -u research_flow_prod -p research_flow_prod -e "SELECT * FROM alembic_version;"
```

---

## Next Steps After Migration

Once the duplicate is working:

1. **Document Differences:**
   - Note any differences in server setup
   - Document new database credentials (securely)
   - Update any project-specific documentation

2. **Plan Modifications:**
   - Review `MASTER_PLAN.md` for new platform requirements
   - Identify what needs to change for analytical pipelines
   - Plan migration path from financial analysis to generic pipelines

3. **Test Thoroughly:**
   - Run full test suite (if exists)
   - Test all major workflows
   - Verify data integrity

4. **Set Up Monitoring:**
   - Configure log rotation
   - Set up health checks
   - Configure backups

---

## Quick Reference Commands

```bash
# Deployment
cd /srv/research-flow
./scripts/deploy.sh                    # Full deployment
./scripts/restart_backend.sh            # Restart backend
./scripts/restart_frontend.sh           # Restart frontend
research-flow-deploy                       # Standalone deploy (if installed)

# Service Management
sudo systemctl status research-flow-backend
sudo systemctl restart research-flow-backend
sudo systemctl restart research-flow-frontend

# Logs
sudo journalctl -u research-flow-backend -f
sudo journalctl -u research-flow-frontend -f

# Database
mysql -u research_flow_prod -p research_flow_prod
alembic upgrade head                    # Run migrations

# Health Checks
curl http://localhost:8000/health
curl http://localhost:3000
```

---

## Security Notes

1. **Never commit `config_local.py`** - It's gitignored, but double-check
2. **Use strong passwords** for database and admin user
3. **Generate new SESSION_SECRET** - Don't reuse from old server
4. **Set file permissions** - `chmod 600 app/config_local.py`
5. **Firewall configuration** - Only expose necessary ports
6. **Regular backups** - Set up database backups
7. **Keep secrets separate** - Don't hardcode in repository

---

**Migration Complete!** 🎉

The new server should now have an exact duplicate of the original project, ready for modifications for the new analytical pipelines platform.

