# Production Deployment Guide

## Overview

This guide covers deploying Max Signal Bot to a single VM without Docker, following the architecture outlined in `MASTER_PLAN.md`.

## Pre-Deployment Checklist

### Server Requirements
- [ ] Ubuntu/Debian Linux VM (or similar)
- [ ] Python 3.11+ installed
- [ ] Node.js 18+ and npm installed
- [ ] MySQL 8.0+ installed and running
- [ ] Git installed
- [ ] Systemd available (standard on most Linux distributions)
- [ ] Firewall configured (ports 8000, 3000, or reverse proxy ports)
- [ ] SSH access configured

### Prerequisites
- [ ] MySQL server accessible (local or remote)
- [ ] OpenRouter API key obtained
- [ ] Telegram bot created via @BotFather and bot token obtained
- [ ] Domain name (optional, for reverse proxy with SSL)
- [ ] SSL certificate (optional, if using HTTPS)

## Architecture Overview

**Current State:**
- **Backend**: FastAPI on port 8000
- **Frontend**: Next.js on port 3000
- **Database**: MySQL (local or remote)
- **Configuration**: 
  - `config_local.py` → MySQL DSN, SESSION_SECRET
  - `AppSettings` table → OpenRouter API key, Telegram bot token

**Key Changes from Dev:**
- API keys moved to database (`AppSettings` table) via Settings UI
- Telegram bot token stored in database (not `config_local.py`)
- Session secret still in `config_local.py` (server-only secret)

## Step-by-Step Deployment

### 1. Server Setup

```bash
# Create deployment directory
sudo mkdir -p /srv/max-signal
sudo chown $USER:$USER /srv/max-signal
cd /srv/max-signal

# Clone monorepo (contains both backend and frontend)
git clone <repo-url> .
```

### 2. Database Setup

**Option A: Local MySQL**
```bash
# Create production database
mysql -u root -p << EOF
CREATE DATABASE max_signal_prod CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'max_signal_prod'@'localhost' IDENTIFIED BY 'STRONG_PASSWORD_HERE';
GRANT ALL PRIVILEGES ON max_signal_prod.* TO 'max_signal_prod'@'localhost';
FLUSH PRIVILEGES;
EOF
```

**Option B: Remote MySQL**
- Create database and user on remote MySQL server
- Ensure firewall allows connections from your VM
- Use remote host in DSN: `mysql+pymysql://user:pass@remote-host:3306/max_signal_prod?charset=utf8mb4`

### 3. Backend Configuration

```bash
cd /srv/max-signal/backend

# Create virtual environment
python3.11 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create config_local.py (NEVER commit this!)
cp app/config_local.example.py app/config_local.py
```

**Edit `app/config_local.py`:**
```python
# Database (PRODUCTION)
MYSQL_DSN = "mysql+pymysql://max_signal_prod:STRONG_PASSWORD@localhost:3306/max_signal_prod?charset=utf8mb4"

# OpenRouter (will be set via Settings UI, but can set here as fallback)
OPENROUTER_API_KEY = None  # Prefer AppSettings table
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
DEFAULT_LLM_MODEL = "openai/gpt-4o-mini"

# Telegram (will be set via Settings UI)
TELEGRAM_BOT_TOKEN = None  # Prefer AppSettings table
TELEGRAM_CHANNEL_ID = None  # Not used (direct messages to users)

# Scheduler
DAYSTART_SCHEDULE = "08:00"

# Security (CRITICAL: Generate a strong random secret!)
SESSION_COOKIE_NAME = "maxsignal_session"
SESSION_SECRET = "GENERATE_RANDOM_SECRET_HERE_USE_OPENSSL_RAND_HEX_32"

# Feature flags
ENABLE_TELEGRAM_AUTO_SEND = False
ENABLE_BACKTESTING = False
```

**Generate SESSION_SECRET:**
```bash
openssl rand -hex 32
```

### 4. Run Database Migrations

```bash
cd /srv/max-signal/backend
source .venv/bin/activate
alembic upgrade head
```

### 5. Create Initial Admin User

```bash
cd /srv/max-signal/backend
source .venv/bin/activate
python scripts/create_admin_user.py <email> <password>
```

### 6. Frontend Configuration

```bash
cd /srv/max-signal/frontend

# Install dependencies
npm ci

# Set environment variable for production
# Option 1: Environment variable
export NEXT_PUBLIC_API_BASE_URL=http://localhost:8000

# Option 2: Create .env.production
echo "NEXT_PUBLIC_API_BASE_URL=http://localhost:8000" > .env.production

# Build for production
npm run build
```

**Note:** If using a reverse proxy, set `NEXT_PUBLIC_API_BASE_URL` to the public backend URL.

### 7. Create Systemd Service Files

**Backend Service** (`/etc/systemd/system/max-signal-backend.service`):
```ini
[Unit]
Description=Max Signal Bot Backend (FastAPI)
After=network.target mysql.service

[Service]
Type=simple
User=YOUR_USERNAME
WorkingDirectory=/srv/max-signal/backend
Environment="PATH=/srv/max-signal/backend/.venv/bin:/usr/local/bin:/usr/bin:/bin"
ExecStart=/srv/max-signal/backend/.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=max-signal-backend

[Install]
WantedBy=multi-user.target
```

**Frontend Service** (`/etc/systemd/system/max-signal-frontend.service`):
```ini
[Unit]
Description=Max Signal Bot Frontend (Next.js)
After=network.target max-signal-backend.service

[Service]
Type=simple
User=YOUR_USERNAME
WorkingDirectory=/srv/max-signal/frontend
Environment="NODE_ENV=production"
Environment="NEXT_PUBLIC_API_BASE_URL=http://localhost:8000"
Environment="PORT=3000"
ExecStart=/usr/bin/npm run start -- --port 3000
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=max-signal-frontend

[Install]
WantedBy=multi-user.target
```

**Replace `YOUR_USERNAME` with your actual user!**

### 8. Create Deployment Scripts

**Deploy Scripts** (in `/srv/max-signal/scripts/`):

**Important:** The deployment scripts are part of the git repository. When you pull latest changes, the scripts are automatically updated. Always use the scripts from the git repo:

```bash
cd /srv/max-signal
./scripts/deploy.sh  # Use script from git repo
```

**Installing Standalone Deploy Script (Recommended):**

The standalone deploy script is completely independent and can be placed outside the tracked folder. It does everything automatically:

```bash
cd /srv/max-signal
sudo ./scripts/install_standalone_deploy.sh
```

This installs `max-signal-deploy` to `/usr/local/bin/` which:
- ✅ Pulls latest git changes
- ✅ Updates backend dependencies
- ✅ Runs database migrations
- ✅ Updates frontend dependencies
- ✅ Builds frontend for production
- ✅ Restarts backend service
- ✅ Restarts frontend service
- ✅ Verifies services are running

**Usage:**
```bash
max-signal-deploy  # Run from anywhere!
```

**Why standalone?**
- Never gets overwritten by git pulls
- Completely independent (doesn't depend on repo files)
- Can be customized without affecting git repo
- Safe to run from anywhere (including as root)

**Configuration:**
Edit `/usr/local/bin/max-signal-deploy` to change:
- `PROJECT_ROOT` (default: `/srv/max-signal`)
- `GIT_BRANCH` (default: `main`)

1. **`deploy.sh`** - Complete deployment preparation:
   - Pulls latest changes from repository (including script updates)
   - Updates backend dependencies (`requirements.txt`)
   - **Verifies critical packages are installed** (tinkoff-investments, apimoex, etc.)
   - Runs database migrations
   - Updates frontend dependencies (`package.json`)
   - Builds frontend for production
```bash
cd /srv/max-signal
./scripts/deploy.sh
```

2. **`restart_backend.sh`** - Restarts backend service:
   - Syncs dependencies (if needed)
   - Runs migrations (idempotent)
   - Restarts systemd service
```bash
cd /srv/max-signal
./scripts/restart_backend.sh
```

3. **`restart_frontend.sh`** - Restarts frontend service:
   - Verifies build exists (rebuilds if needed)
   - Restarts systemd service
```bash
cd /srv/max-signal
./scripts/restart_frontend.sh
```

**Typical deployment flow:**
```bash
cd /srv/max-signal
# Step 1: Pull, update dependencies, run migrations, build
./scripts/deploy.sh

# Step 2: Restart backend (if backend changed)
./scripts/restart_backend.sh

# Step 3: Restart frontend (if frontend changed)
./scripts/restart_frontend.sh
```

**Scripts are already executable** (chmod +x applied in repository).

### 9. Enable and Start Services

```bash
# Enable services (start on boot)
sudo systemctl enable max-signal-backend
sudo systemctl enable max-signal-frontend

# Start services
sudo systemctl start max-signal-backend
sudo systemctl start max-signal-frontend

# Check status
sudo systemctl status max-signal-backend
sudo systemctl status max-signal-frontend
```

### 10. Initial Configuration via UI

1. **Access the application:**
   - Frontend: `http://YOUR_SERVER_IP:3000` (or domain if configured)
   - Backend API: `http://YOUR_SERVER_IP:8000`

2. **Login:**
   - Use the admin credentials created in step 5

3. **Configure Settings:**
   - Go to Settings → OpenRouter Configuration
   - Enter your OpenRouter API key
   - Go to Settings → Telegram Configuration
   - Enter your Telegram bot token
   - Verify active users count (should be 0 initially)

4. **Test Telegram Bot:**
   - Send `/start` to your Telegram bot
   - Check Settings → Telegram Configuration → Active Users (should show 1)
   - Run a test analysis
   - Publish to Telegram and verify you receive the message

## Post-Deployment Verification

### Health Checks

```bash
# Backend health
curl http://localhost:8000/health

# Frontend (should return HTML)
curl http://localhost:3000

# Check service logs
sudo journalctl -u max-signal-backend -n 50
sudo journalctl -u max-signal-frontend -n 50
```

### Test Full Flow

1. ✅ Login to frontend
2. ✅ Navigate to Analyses → Configure an analysis
3. ✅ Run an analysis (should complete successfully)
4. ✅ View run details (all steps should be visible)
5. ✅ Publish to Telegram (should send message to registered users)
6. ✅ Verify Telegram bot responds to `/start`, `/help`, `/status`

## Reverse Proxy (Optional but Recommended)

For production, consider using Nginx or Caddy as a reverse proxy for:
- SSL/TLS termination
- Domain name routing
- Port hiding
- Better security headers

**Example Nginx Config** (`/etc/nginx/sites-available/max-signal`):
```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # Frontend
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**Update frontend `.env.production`:**
```
NEXT_PUBLIC_API_BASE_URL=https://your-domain.com/api
```

## Monitoring and Maintenance

### Logs

```bash
# Backend logs
sudo journalctl -u max-signal-backend -f

# Frontend logs
sudo journalctl -u max-signal-frontend -f

# Combined logs
sudo journalctl -u max-signal-backend -u max-signal-frontend -f
```

### Database Backups

```bash
# Create backup script
cat > /srv/max-signal/backup_db.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/srv/max-signal/backups"
mkdir -p "$BACKUP_DIR"
DATE=$(date +%Y%m%d_%H%M%S)
mysqldump -u max_signal_prod -p max_signal_prod > "$BACKUP_DIR/max_signal_prod_$DATE.sql"
# Keep only last 7 days
find "$BACKUP_DIR" -name "max_signal_prod_*.sql" -mtime +7 -delete
EOF

chmod +x /srv/max-signal/backup_db.sh

# Add to crontab (daily at 2 AM)
crontab -e
# Add: 0 2 * * * /srv/max-signal/backup_db.sh
```

### Updates

**Typical deployment:**
```bash
cd /srv/max-signal
# Pull latest changes
./scripts/deploy.sh

# Restart backend (if backend changed)
./scripts/restart_backend.sh

# Restart frontend (if frontend changed)
./scripts/restart_frontend.sh
```

## Troubleshooting

### Backend won't start
- Check logs: `sudo journalctl -u max-signal-backend -n 100`
- Verify MySQL connection in `config_local.py`
- Check Python version: `python3.11 --version`
- Verify virtual environment: `ls -la /srv/max-signal/backend/.venv`

### Frontend won't start
- Check logs: `sudo journalctl -u max-signal-frontend -n 100`
- Verify Node.js version: `node --version`
- Check build: `cd /srv/max-signal/frontend && npm run build`
- Verify environment variable: `echo $NEXT_PUBLIC_API_BASE_URL`

### Database connection errors
- Verify MySQL is running: `sudo systemctl status mysql`
- Test connection: `mysql -u max_signal_prod -p max_signal_prod`
- Check DSN in `config_local.py`
- Verify firewall rules

### Telegram bot not working
- Verify bot token in Settings → Telegram Configuration
- Check bot is started: `/start` command should work
- Check backend logs for Telegram errors
- Verify bot has permission to send messages

### API key errors
- Verify OpenRouter API key in Settings → OpenRouter Configuration
- Check backend logs for API errors
- Test API key manually: `curl -H "Authorization: Bearer YOUR_KEY" https://openrouter.ai/api/v1/models`

## Security Considerations

1. **Secrets Management:**
   - `config_local.py` should have `600` permissions: `chmod 600 app/config_local.py`
   - Never commit `config_local.py` to git
   - Use strong passwords for MySQL and SESSION_SECRET

2. **Firewall:**
   ```bash
   # Only allow necessary ports
   sudo ufw allow 22/tcp    # SSH
   sudo ufw allow 80/tcp    # HTTP (if using reverse proxy)
   sudo ufw allow 443/tcp   # HTTPS (if using reverse proxy)
   # OR if direct access:
   sudo ufw allow 3000/tcp  # Frontend
   sudo ufw allow 8000/tcp  # Backend
   sudo ufw enable
   ```

3. **Database:**
   - Use strong MySQL passwords
   - Limit database user permissions
   - Regular backups
   - Consider SSL for remote MySQL connections

4. **Application:**
   - Keep dependencies updated
   - Monitor logs for errors
   - Use HTTPS in production (via reverse proxy)
   - Rate limiting (consider adding to FastAPI)

## Rollback Procedure

If deployment fails:

**Rollback:**
```bash
cd /srv/max-signal
# Reset to previous commit
git reset --hard <previous-commit-hash>

# Restart backend
./scripts/restart_backend.sh

# Restart frontend
./scripts/restart_frontend.sh
```

## Next Steps

After successful deployment:
1. ✅ Set up monitoring/alerting (e.g., UptimeRobot, Pingdom)
2. ✅ Configure scheduled database backups
3. ✅ Set up log rotation
4. ✅ Test disaster recovery procedure
5. ✅ Document any custom configurations
6. ✅ Consider adding rate limiting
7. ✅ Set up SSL certificates (Let's Encrypt via Certbot)

---

**Questions or Issues?**
- Check logs first: `sudo journalctl -u max-signal-backend -u max-signal-frontend`
- Review this guide and `MASTER_PLAN.md`
- Verify all configuration steps completed

