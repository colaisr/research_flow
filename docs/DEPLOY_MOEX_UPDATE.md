# Deploy MOEX Integration to Production

## What's New
- ✅ Tinkoff Invest API Configuration section in Settings
- ✅ MOEX instruments fetching from MOEX ISS API
- ✅ Package verification in deploy script
- ✅ New Python packages: `tinkoff-investments`, `apimoex`, `requests`

## Deployment Steps

### 1. SSH to Production Server
```bash
ssh max-signal-vm  # or your SSH alias
cd /srv/max-signal
```

### 2. Run Deployment Script
```bash
./scripts/deploy.sh
```

This will:
- Pull latest code (including Tinkoff settings UI)
- Install/update Python packages (including `tinkoff-investments`, `apimoex`, `requests`)
- **Verify critical packages are installed** (new!)
- Run database migrations
- Update frontend dependencies
- Build frontend (includes Tinkoff settings section)

### 3. Restart Services
```bash
# Restart backend (to load new packages)
./scripts/restart_backend.sh

# Restart frontend (to serve new build)
./scripts/restart_frontend.sh
```

### 4. Verify Deployment

**Check Backend:**
```bash
# Check if packages are installed
cd backend
source .venv/bin/activate
python3 -c "import tinkoff.invest; import apimoex; print('✅ Packages installed')"

# Check backend logs
sudo journalctl -u max-signal-backend -n 50
```

**Check Frontend:**
- Visit `http://YOUR_SERVER_IP:3000/settings`
- You should see:
  - ✅ "Tinkoff Invest API Configuration" section
  - ✅ "Available Instruments" section with MOEX instruments (SBER, GAZP, etc.)

**Check API:**
```bash
# Test MOEX instruments endpoint
curl http://localhost:8000/api/instruments/all | grep -i "SBER\|MOEX" | head -5
```

### 5. Configure Tinkoff Token

1. Go to Settings page in UI
2. Scroll to "Tinkoff Invest API Configuration" section
3. Enter your Tinkoff API token
4. Click "Save Tinkoff Settings"

### 6. Enable MOEX Instruments

1. Go to Settings → Available Instruments
2. Search for "SBER" or filter by type "equity"
3. Toggle on the instruments you want to use
4. They will now appear in dropdowns throughout the app

## Troubleshooting

**If Tinkoff section doesn't appear:**
- Check frontend build completed: `ls -la frontend/.next`
- Check frontend logs: `sudo journalctl -u max-signal-frontend -n 50`
- Hard refresh browser (Ctrl+Shift+R or Cmd+Shift+R)

**If MOEX instruments don't appear:**
- Check backend logs: `sudo journalctl -u max-signal-backend -n 50 | grep -i "moex\|apimoex"`
- Verify `apimoex` is installed: `cd backend && source .venv/bin/activate && python3 -c "import apimoex"`
- Check API response: `curl http://localhost:8000/api/instruments/all | jq '.[] | select(.exchange == "MOEX")' | head -20`

**If packages fail to install:**
- The deploy script now verifies packages and will fail if they can't be installed
- Check error messages in deploy output
- Manually install: `cd backend && source .venv/bin/activate && pip install tinkoff-investments apimoex requests`


