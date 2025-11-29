# Phase 8: Deployment & Migration Checklist

This checklist covers deploying the subscription and token system to production and migrating existing users.

## Pre-Deployment Checklist

### 1. Database Backup
- [ ] **CRITICAL**: Backup production database before any changes
  ```bash
  mysqldump -u root -p research_flow_prod > backup_$(date +%Y%m%d_%H%M%S).sql
  ```
- [ ] Verify backup file size and integrity
- [ ] Store backup in safe location (not on same server)

### 2. Verify Seed Data
- [ ] Ensure subscription plans are seeded (Trial, Basic, Pro)
- [ ] Verify token packages are seeded (Small, Medium, Large)
- [ ] Check that pricing data is synced from OpenRouter
  ```bash
  cd backend
  python scripts/seed_subscription_data.py
  python scripts/sync_openrouter_pricing.py  # If exists
  ```

### 3. Code Review
- [ ] All migrations are tested locally
- [ ] All code changes are committed and pushed
- [ ] No breaking changes to existing functionality
- [ ] Feature flags are properly configured

### 4. Environment Verification
- [ ] Backend dependencies updated (`requirements.txt`)
- [ ] Frontend dependencies updated (`package.json`)
- [ ] Environment variables configured
- [ ] Database connection tested

---

## Deployment Steps

### Step 1: Deploy Code Changes

```bash
# SSH to production server
ssh user@production-server

# Navigate to project directory
cd /srv/research-flow

# Pull latest changes
git pull origin main  # or your branch

# Run deployment script (handles dependencies, migrations, build)
./scripts/deploy.sh
```

**What `deploy.sh` does:**
- ✅ Pulls latest git changes
- ✅ Updates backend Python dependencies
- ✅ Runs database migrations (`alembic upgrade head`)
- ✅ Updates frontend npm dependencies
- ✅ Builds frontend for production

### Step 2: Verify Migrations

```bash
cd backend
source .venv/bin/activate

# Check migration status
alembic current
alembic history

# Verify all migrations applied
alembic upgrade head
```

**Expected migrations:**
- `da7b933e53e9` - Add subscription and token tables
- `5376fd52db07` - Add source_name to token_consumption
- `bbf9b5bfbae2` - Add cancelled_reason to subscriptions
- Any other recent migrations

### Step 3: Seed Subscription Data (if not already done)

```bash
cd backend
source .venv/bin/activate

# Seed subscription plans and token packages
python scripts/seed_subscription_data.py
```

**Verify seed data:**
```sql
-- Check subscription plans
SELECT id, name, display_name, monthly_tokens, price_monthly, is_trial 
FROM subscription_plans 
WHERE is_active = 1;

-- Check token packages
SELECT id, display_name, token_amount, price_rub, is_active 
FROM token_packages 
WHERE is_active = 1;
```

### Step 4: Run User Migration Script

**⚠️ IMPORTANT: Run this AFTER all migrations are complete and seed data is loaded**

```bash
cd backend
source .venv/bin/activate

# Run migration script for existing users
python scripts/migrate_existing_users_to_subscriptions.py
```

**What the migration script does:**
1. Creates trial subscriptions for all active users
2. Sets token balance to 0 for all users
3. Syncs features from trial plan to user_features table
4. Creates token_consumption records from existing analysis_steps (optional)

**Expected output:**
```
============================================================
Migrating Existing Users to Subscription System
============================================================

Using trial plan ID: 1

Found X active users to migrate

Migrating user 1 (user@example.com)...
  ✅ Created organization: User Name (ID: 1)
  ✅ Created trial subscription (ID: 1)
  ✅ Created token balance (balance: 0)
  ✅ Enabled feature: rag
  ✅ Enabled feature: api_tools
  ...
  ✅ Migrated Y consumption records from analysis_steps
  ✅ User 1 migration complete

============================================================
✅ Migration complete!
============================================================
Migrated X users
```

### Step 5: Verify Migration Results

```sql
-- Check subscriptions created
SELECT COUNT(*) as total_subscriptions 
FROM user_subscriptions;

-- Should match number of active users

-- Check token balances created
SELECT COUNT(*) as total_balances 
FROM token_balances;

-- Should match number of active users

-- Check features synced
SELECT COUNT(DISTINCT user_id) as users_with_features 
FROM user_features;

-- Should match number of active users

-- Sample check: Verify one user has trial subscription
SELECT 
    u.email,
    s.status,
    s.tokens_allocated,
    s.trial_ends_at,
    p.name as plan_name
FROM users u
JOIN user_subscriptions s ON s.user_id = u.id
JOIN subscription_plans p ON p.id = s.plan_id
WHERE u.is_active = 1
LIMIT 5;
```

### Step 6: Restart Services

```bash
# Restart backend (if backend changed)
cd /srv/research-flow
./scripts/restart_backend.sh

# Restart frontend (if frontend changed)
./scripts/restart_frontend.sh

# Or restart both manually
sudo systemctl restart research-flow-backend
sudo systemctl restart research-flow-frontend
```

### Step 7: Verify Services

```bash
# Check service status
sudo systemctl status research-flow-backend
sudo systemctl status research-flow-frontend

# Check logs for errors
sudo journalctl -u research-flow-backend -n 50
sudo journalctl -u research-flow-frontend -n 50

# Health checks
curl http://localhost:8000/health
curl http://localhost:3000
```

---

## Post-Deployment Verification

### 1. Functional Testing

- [ ] **User Login**: Verify users can log in
- [ ] **Subscription Display**: Check `/consumption` page shows subscription info
- [ ] **Token Balance**: Verify token balance displays correctly (should be 0 for migrated users)
- [ ] **Trial Status**: Verify trial subscription shows correct end date
- [ ] **Feature Access**: 
  - Basic plan users should see upgrade banners on tools pages
  - Pro/Trial users should have full access
- [ ] **Token Consumption**: Run a pipeline and verify consumption is tracked
- [ ] **Billing Page**: Check `/billing` page displays plans and packages

### 2. Admin Verification

- [ ] **Admin Login**: Verify admin can log in
- [ ] **User Management**: Check `/admin/users` shows all users with subscriptions
- [ ] **Subscription Management**: Verify admin can view/edit user subscriptions
- [ ] **Pricing Management**: Check `/admin/settings` pricing tab works
- [ ] **Provider Management**: Verify provider credentials can be managed

### 3. Data Integrity

- [ ] **No Duplicate Subscriptions**: Each user should have exactly one subscription
- [ ] **Token Balances**: All users should have token balance records
- [ ] **Features Synced**: All users should have features matching their plan
- [ ] **Consumption Records**: Historical consumption migrated (if applicable)

### 4. Performance

- [ ] **API Response Times**: Check `/api/subscriptions/current` response time
- [ ] **Database Queries**: Monitor slow queries
- [ ] **Frontend Load**: Check page load times

---

## Rollback Plan

If something goes wrong:

### 1. Immediate Rollback

```bash
# Stop services
sudo systemctl stop research-flow-backend
sudo systemctl stop research-flow-frontend

# Restore database from backup
mysql -u root -p research_flow_prod < backup_YYYYMMDD_HHMMSS.sql

# Revert code (if needed)
cd /srv/research-flow
git checkout <previous-commit-hash>

# Restart services
sudo systemctl start research-flow-backend
sudo systemctl start research-flow-frontend
```

### 2. Partial Rollback (if only migration failed)

If code deployment is fine but migration failed:

```sql
-- Remove subscription data (if needed)
DELETE FROM token_consumption WHERE step_id IS NOT NULL;  -- Only migrated records
DELETE FROM user_features;
DELETE FROM token_balances;
DELETE FROM user_subscriptions;

-- Then re-run migration script
```

---

## Monitoring After Deployment

### First 24 Hours

- [ ] Monitor error logs: `sudo journalctl -u research-flow-backend -f`
- [ ] Check database for errors: Monitor slow query log
- [ ] Verify user registrations: New users should get trial subscriptions
- [ ] Monitor token consumption: Verify consumption tracking works
- [ ] Check subscription renewals: Verify renewal job runs correctly

### First Week

- [ ] Monitor subscription renewals
- [ ] Check trial expirations
- [ ] Verify feature restrictions work correctly
- [ ] Monitor token package purchases (when payment gateway integrated)
- [ ] Check for any user-reported issues

---

## Troubleshooting

### Migration Script Fails

**Error: "Trial plan not found"**
- Solution: Run `python scripts/seed_subscription_data.py` first

**Error: "User already has subscription"**
- This is expected if script is run multiple times
- Script skips users with existing subscriptions

**Error: Database connection issues**
- Verify database credentials in `app/config_local.py`
- Check database server is running
- Verify network connectivity

### Services Won't Start

**Backend service fails:**
```bash
# Check logs
sudo journalctl -u research-flow-backend -n 100

# Common issues:
# - Missing dependencies: pip install -r requirements.txt
# - Database connection: Check config_local.py
# - Port already in use: Check if another process uses port 8000
```

**Frontend service fails:**
```bash
# Check logs
sudo journalctl -u research-flow-frontend -n 100

# Common issues:
# - Missing build: Run `npm run build`
# - Port already in use: Check if another process uses port 3000
# - Missing dependencies: Run `npm ci`
```

### Users Can't See Subscriptions

- Verify migration script ran successfully
- Check user has subscription: `SELECT * FROM user_subscriptions WHERE user_id = X`
- Verify features are synced: `SELECT * FROM user_features WHERE user_id = X`
- Check frontend is calling correct API endpoints
- Verify browser cache is cleared

---

## Success Criteria

✅ All active users have trial subscriptions  
✅ All users have token balance records (balance = 0)  
✅ All users have features synced from trial plan  
✅ Historical consumption records migrated (if applicable)  
✅ Services running without errors  
✅ Users can access all functionality  
✅ Admin can manage subscriptions  
✅ Token consumption tracking works  
✅ Feature restrictions work correctly  

---

## Notes

- **Migration is idempotent**: Safe to run multiple times (skips existing records)
- **No data loss**: Original user data is preserved
- **Trial duration**: Users get 14-day trial (configurable in subscription_plans table)
- **Token allocation**: Trial users get 300,000 tokens
- **Feature access**: Trial users get all Pro features

