# Deployment Troubleshooting Guide

## Issue: `research-flow-deploy` Script Not Working Properly

### Problem

If you have a standalone copy of `research-flow-deploy` at `/usr/local/bin/research-flow-deploy`, it may:
- Be outdated (doesn't update when you pull git changes)
- Have incorrect path resolution
- Fail to find the project directory
- Not include latest features or fixes

### Solution: Install Standalone Deploy Script (Recommended)

The standalone deploy script is completely independent and does everything automatically:

```bash
cd /srv/research-flow
sudo ./scripts/install_standalone_deploy.sh
```

This installs a complete, self-contained deployment script that:
- ✅ Never gets overwritten by git pulls
- ✅ Is completely independent (doesn't depend on repo files)
- ✅ Does everything automatically (pull, update, migrate, build, restart)
- ✅ Can be customized without affecting git repo

**Usage:**
```bash
research-flow-deploy  # Run from anywhere!
```

**Alternative Options:**

**Option 1: Use Script Directly from Repo**
```bash
cd /srv/research-flow
./scripts/deploy.sh
./scripts/restart_backend.sh
./scripts/restart_frontend.sh
```

**Option 2: Use Script Directly from Repo**
```bash
cd /srv/research-flow
./scripts/deploy.sh
./scripts/restart_backend.sh
./scripts/restart_frontend.sh
```

### Verification

After installing the wrapper, test it:

```bash
# Should show the latest deploy script output
research-flow-deploy

# Or verify it points to the right location
which research-flow-deploy
cat /usr/local/bin/research-flow-deploy
```

### Common Issues

**Issue: "Not a git repository" error**
- **Cause:** Script can't find project root
- **Fix:** Ensure you're running from `/srv/research-flow` or install the wrapper

**Issue: "Permission denied"**
- **Cause:** Script not executable
- **Fix:** `chmod +x /usr/local/bin/research-flow-deploy` or reinstall wrapper

**Issue: Script runs but doesn't update frontend**
- **Cause:** Old script version missing frontend build step
- **Fix:** Install wrapper or use script directly from repo

**Issue: CSS/static asset errors after deployment**
- **Cause:** Frontend build is outdated or corrupted
- **Fix:** 
  ```bash
  cd /srv/research-flow
  ./scripts/deploy.sh  # Rebuilds frontend
  ./scripts/restart_frontend.sh
  ```

### Best Practices

1. **Use standalone deploy script** - Install once with `install_standalone_deploy.sh`, then use `research-flow-deploy` from anywhere
2. **Standalone script is independent** - It doesn't depend on repo files, so it works even if repo is moved
3. **For manual control** - Use `./scripts/deploy.sh` + `restart_backend.sh` + `restart_frontend.sh` from project directory
4. **Check health remotely** - Use `./scripts/check_production.sh` from your local machine

### Quick Fix for Current Issue

If `research-flow-deploy` is not working:

```bash
# 1. SSH into production server
ssh user@your-server

# 2. Install standalone deploy script (recommended)
cd /srv/research-flow
git pull origin main
sudo ./scripts/install_standalone_deploy.sh

# 3. Run deployment
research-flow-deploy

# Or use scripts directly from repo
cd /srv/research-flow
./scripts/deploy.sh
./scripts/restart_backend.sh
./scripts/restart_frontend.sh
```

