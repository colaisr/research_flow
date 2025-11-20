# 🚀 Production Deployment - Run This Now

## Quick Deploy (One Command)

**SSH into production server and run:**

```bash
research-flow-deploy
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
sudo systemctl status research-flow-backend
sudo systemctl status research-flow-frontend

# Check health
curl http://localhost:8000/health
curl http://localhost:3000

# View logs if needed
sudo journalctl -u research-flow-frontend -n 50
```

**Test in browser:**
- Open: http://45.144.177.203:3000
- Check browser console (should have no CSS errors)
- Verify page loads with proper styling

## First-Time Setup

If `research-flow-deploy` is not installed yet:

```bash
cd /srv/research-flow
git pull origin main
sudo ./scripts/install_standalone_deploy.sh
research-flow-deploy
```

After installation, you can run `research-flow-deploy` from anywhere!

## Troubleshooting

If deployment fails:
```bash
# Check what went wrong
sudo journalctl -u research-flow-backend -n 50
sudo journalctl -u research-flow-frontend -n 50

# Manual restart if needed
sudo systemctl restart research-flow-backend
sudo systemctl restart research-flow-frontend
```

