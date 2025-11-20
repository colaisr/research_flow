# 🚀 Production Deployment - Run This Now

## Quick Deploy (One Command)

**SSH into production server and run:**

```bash
max-signal-deploy
```

This single command will:
1. ✅ Pull latest changes from git
2. ✅ Update backend dependencies
3. ✅ Run database migrations
4. ✅ Update frontend dependencies
5. ✅ Build frontend for production
6. ✅ Restart backend service
7. ✅ Restart frontend service
8. ✅ Validate everything is working

## What Gets Fixed

- ✅ CSS 400 errors (frontend rebuild fixes static asset paths)
- ✅ Outdated frontend build (fresh build with latest code)
- ✅ Service restarts (ensures new code is loaded)

## After Deployment

**Verify it worked:**
```bash
# Check services
sudo systemctl status max-signal-backend
sudo systemctl status max-signal-frontend

# Check health
curl http://localhost:8000/health
curl http://localhost:3000

# View logs if needed
sudo journalctl -u max-signal-frontend -n 50
```

**Test in browser:**
- Open: http://45.144.177.203:3000
- Check browser console (should have no CSS errors)
- Verify page loads with proper styling

## First-Time Setup

If `max-signal-deploy` is not installed yet:

```bash
cd /srv/max-signal
git pull origin main
sudo ./scripts/install_standalone_deploy.sh
max-signal-deploy
```

After installation, you can run `max-signal-deploy` from anywhere!

## Troubleshooting

If deployment fails:
```bash
# Check what went wrong
sudo journalctl -u max-signal-backend -n 50
sudo journalctl -u max-signal-frontend -n 50

# Manual restart if needed
sudo systemctl restart max-signal-backend
sudo systemctl restart max-signal-frontend
```

