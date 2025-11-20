# Migration Summary: Copy Project to New Repository & Server

## Overview

This migration creates an **exact duplicate** of the current Max Signal Bot project in a new repository, deployed on a new server with a separate database. This is the foundation for the new analytical pipelines platform.

## Approach

### Strategy: Clean Copy + Fresh Deployment

Instead of forking or copying git history, we create a **clean copy** of the codebase:

1. ✅ **Copy all code files** (backend, frontend, scripts, docs)
2. ✅ **Start fresh git history** (new repository, clean commits)
3. ✅ **Separate infrastructure** (new server, new database)
4. ✅ **Independent configuration** (new secrets, new API keys)

### Why This Approach?

- **Clean separation**: No shared git history or dependencies
- **Independent evolution**: Can modify new project without affecting original
- **Fresh start**: Clean database, no legacy data
- **Easy to understand**: Clear migration path documented

## Quick Start

### Option 1: Automated (Recommended)

```bash
# From current project directory
./scripts/migrate_to_new_repo.sh /path/to/new-repo

# Then initialize git in new location
cd /path/to/new-repo
git init
git remote add origin <new-repo-url>
git add .
git commit -m "Initial commit: Migrated from max_signal_bot"
git push -u origin main
```

### Option 2: Manual

```bash
# Clone current repo
git clone <current-repo-url> temp-project
cd temp-project

# Remove git history
rm -rf .git

# Remove sensitive files
rm -f backend/app/config_local.py
rm -rf backend/.venv frontend/node_modules frontend/.next

# Copy to new location
cp -r . /path/to/new-repo/
```

## Migration Phases

### Phase 1: Repository Setup (Local)
- Create clean copy of codebase
- Initialize new git repository
- Push to new remote

**Time:** 15-30 minutes

### Phase 2: Server Setup (New Server)
- Install prerequisites (Python, Node.js, MySQL)
- Create deployment directory
- Clone new repository

**Time:** 30-60 minutes

### Phase 3: Database Setup
- Create new database and user
- Run migrations
- Create admin user

**Time:** 15-30 minutes

### Phase 4: Backend Configuration
- Create virtual environment
- Install dependencies
- Configure `config_local.py`
- Run migrations

**Time:** 20-30 minutes

### Phase 5: Frontend Configuration
- Install dependencies
- Create production build
- Configure environment variables

**Time:** 10-20 minutes

### Phase 6: Systemd Services
- Create service files
- Configure user/group
- Enable and start services

**Time:** 15-20 minutes

### Phase 7: Verification
- Test health endpoints
- Configure via UI
- Run test analysis
- Verify Telegram integration

**Time:** 20-30 minutes

**Total Estimated Time:** 2-3 hours

## Key Differences from Original

| Aspect | Original | New Migration |
|--------|----------|---------------|
| Repository | `max_signal_bot` | New repository |
| Server | Original server | New server |
| Database | `max_signal_dev` | `max_signal_prod` (or custom name) |
| Git History | Original commits | Fresh start |
| Configuration | Original secrets | New secrets |
| Admin User | Original credentials | New credentials |

## What Gets Copied

✅ **Included:**
- All backend code (`backend/app/`, `backend/alembic/`)
- All frontend code (`frontend/app/`, `frontend/components/`)
- All scripts (`scripts/deploy.sh`, `scripts/systemd/`)
- All documentation (`docs/`, `README.md`)
- Configuration examples (`config_local.example.py`)
- Migration files (`alembic/versions/`)

❌ **Excluded:**
- Git history (`.git/`)
- Sensitive config (`config_local.py`)
- Virtual environments (`.venv/`, `node_modules/`)
- Build artifacts (`.next/`, `__pycache__/`)
- Log files (`*.log`)

## Critical Configuration Changes

### 1. Database Connection
```python
# OLD (original server)
MYSQL_DSN = "mysql+pymysql://max_signal_user:password@localhost:3306/max_signal_dev?charset=utf8mb4"

# NEW (new server)
MYSQL_DSN = "mysql+pymysql://max_signal_prod:NEW_PASSWORD@localhost:3306/max_signal_prod?charset=utf8mb4"
```

### 2. Session Secret
```python
# OLD
SESSION_SECRET = "original-secret"

# NEW (generate fresh)
SESSION_SECRET = "GENERATE_NEW_SECRET_HERE"  # Use: openssl rand -hex 32
```

### 3. Admin User
```bash
# Create new admin user on new server
python scripts/create_admin_user.py admin@newserver.com NEW_PASSWORD
```

### 4. API Keys
- Set via Settings UI after deployment
- OpenRouter API key (can reuse or use new)
- Telegram bot token (create new bot or reuse)

## Verification Checklist

After migration, verify:

- [ ] Backend health endpoint responds (`/health`)
- [ ] Frontend accessible (port 3000)
- [ ] Can login with new admin credentials
- [ ] Database connection works
- [ ] Migrations applied successfully
- [ ] Can run analysis
- [ ] Can publish to Telegram
- [ ] Deployment scripts work
- [ ] Services restart correctly

## Documentation

- **Complete Guide**: `docs/MIGRATION_PLAN.md` - Detailed step-by-step instructions
- **Quick Checklist**: `docs/MIGRATION_CHECKLIST.md` - Fast reference checklist
- **This Summary**: `docs/MIGRATION_SUMMARY.md` - Overview and quick start

## Next Steps After Migration

Once the duplicate is working:

1. **Test thoroughly** - Verify all functionality works
2. **Document differences** - Note any server-specific configurations
3. **Plan modifications** - Review requirements for analytical pipelines platform
4. **Set up monitoring** - Configure logs, backups, health checks
5. **Begin customization** - Start modifying for new use case

## Troubleshooting

Common issues and solutions:

### Backend won't start
- Check database connection in `config_local.py`
- Verify migrations ran: `alembic current`
- Check logs: `sudo journalctl -u max-signal-backend -n 100`

### Frontend won't start
- Verify build exists: `ls -la frontend/.next/`
- Check Node version: `node --version` (should be 18+)
- Rebuild: `cd frontend && npm run build`

### Database errors
- Test connection: `mysql -u user -p database`
- Check MySQL is running: `sudo systemctl status mysql`
- Verify DSN format in `config_local.py`

### Migration errors
- Check current version: `alembic current`
- View history: `alembic history`
- Check `alembic_version` table in database

## Support

For detailed instructions, see:
- `docs/MIGRATION_PLAN.md` - Complete migration guide
- `docs/PRODUCTION_DEPLOYMENT.md` - Production deployment reference
- `docs/MASTER_PLAN.md` - Original project architecture

---

**Ready to migrate?** Start with `docs/MIGRATION_CHECKLIST.md` for a quick step-by-step guide!

