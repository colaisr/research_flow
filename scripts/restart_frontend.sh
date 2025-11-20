#!/bin/bash
# Restart frontend service
# Usage: ./restart_frontend.sh
# Note: Run ./scripts/deploy.sh first to update dependencies and build

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
FRONTEND_DIR="$PROJECT_ROOT/frontend"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}🔄 Restarting Frontend${NC}"
echo "======================"
echo ""

cd "$FRONTEND_DIR"

# Quick check: if deploy.sh was run, dependencies and build should be ready
# But we'll verify and rebuild if needed
if [ ! -d ".next" ] || [ ! -f ".next/BUILD_ID" ]; then
    echo "📦 Installing dependencies..."
    npm ci
    echo "🏗️  Building frontend for production..."
    npm run build
else
    echo "✅ Frontend already built (from deploy.sh)"
fi

# Restart service (if systemd service exists)
if systemctl is-active --quiet research-flow-frontend 2>/dev/null; then
    echo "🔄 Restarting frontend service..."
    sudo systemctl restart research-flow-frontend
    echo -e "${GREEN}✅ Service restarted${NC}"
    
    # Wait a moment and check status
    sleep 2
    if systemctl is-active --quiet research-flow-frontend; then
        echo -e "${GREEN}✅ Frontend is running${NC}"
    else
        echo -e "${RED}❌ Frontend failed to start. Check logs:${NC}"
        echo "   sudo journalctl -u research-flow-frontend -n 50"
        exit 1
    fi
else
    echo -e "${YELLOW}⚠️  Systemd service 'research-flow-frontend' not found or not active.${NC}"
    echo "   To start manually: npm run start -- --port 3000"
fi

echo ""
echo "📋 Useful commands:"
echo "   Check status: sudo systemctl status research-flow-frontend"
echo "   View logs:    sudo journalctl -u research-flow-frontend -f"
echo "   Test:         curl http://localhost:3000"

