#!/bin/bash
# Restart backend service
# Usage: ./restart_backend.sh
# Note: Run ./scripts/deploy.sh first to update dependencies and migrations

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="$PROJECT_ROOT/backend"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}🔄 Restarting Backend${NC}"
echo "====================="
echo ""

cd "$BACKEND_DIR"

# Check if virtual environment exists
if [ ! -d ".venv" ]; then
    echo -e "${YELLOW}⚠️  Virtual environment not found. Creating...${NC}"
    python3.11 -m venv .venv
    source .venv/bin/activate
    echo "📦 Installing dependencies..."
    pip install -r requirements.txt --quiet
    echo "🗄️  Running database migrations..."
    alembic upgrade head
else
    # Activate virtual environment
    source .venv/bin/activate
    
    # Quick check: if deploy.sh was run, dependencies should be up to date
    # But we'll do a quick sync just in case
    echo "📦 Syncing dependencies (if needed)..."
    pip install -r requirements.txt --quiet
    
    # Run migrations (idempotent, safe to run multiple times)
    echo "🗄️  Running database migrations..."
    alembic upgrade head
fi

# Restart service (if systemd service exists)
if systemctl is-active --quiet max-signal-backend 2>/dev/null; then
    echo "🔄 Restarting backend service..."
    sudo systemctl restart max-signal-backend
    echo -e "${GREEN}✅ Service restarted${NC}"
    
    # Wait a moment and check status
    sleep 2
    if systemctl is-active --quiet max-signal-backend; then
        echo -e "${GREEN}✅ Backend is running${NC}"
    else
        echo -e "${RED}❌ Backend failed to start. Check logs:${NC}"
        echo "   sudo journalctl -u max-signal-backend -n 50"
        exit 1
    fi
else
    echo -e "${YELLOW}⚠️  Systemd service 'max-signal-backend' not found or not active.${NC}"
    echo "   To start manually: uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2"
fi

echo ""
echo "📋 Useful commands:"
echo "   Check status: sudo systemctl status max-signal-backend"
echo "   View logs:    sudo journalctl -u max-signal-backend -f"
echo "   Health check: curl http://localhost:8000/health"

