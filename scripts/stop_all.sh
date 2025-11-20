#!/usr/bin/env bash
# Stop all services for Max Signal Bot
# Stops backend (FastAPI) and frontend (Next.js) servers

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
PID_FILE="$PROJECT_ROOT/.server_pids"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${RED}🛑 Stopping Max Signal Bot Services${NC}"
echo "===================================="
echo ""

if [ ! -f "$PID_FILE" ]; then
    echo -e "${YELLOW}⚠️  No PID file found. Servers may not be running.${NC}"
    echo ""
    echo "Trying to find and kill processes anyway..."
    
    # Try to find and kill uvicorn processes
    pkill -f "uvicorn app.main:app" 2>/dev/null && echo "✅ Killed backend processes" || echo "   No backend processes found"
    
    # Try to find and kill Next.js processes
    pkill -f "next dev" 2>/dev/null && echo "✅ Killed frontend processes" || echo "   No frontend processes found"
    
    echo ""
    exit 0
fi

# Read PIDs from file
PIDS=$(cat "$PID_FILE")
BACKEND_PID=$(echo "$PIDS" | head -n 1)
FRONTEND_PID=$(echo "$PIDS" | tail -n 1)

# Stop Backend
if [ ! -z "$BACKEND_PID" ] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    echo "📦 Stopping Backend (PID: $BACKEND_PID)..."
    kill "$BACKEND_PID" 2>/dev/null || true
    sleep 1
    # Force kill if still running
    kill -9 "$BACKEND_PID" 2>/dev/null || true
    echo -e "   ${GREEN}✅ Backend stopped${NC}"
else
    echo "   Backend was not running (PID: $BACKEND_PID)"
fi

# Stop Frontend
if [ ! -z "$FRONTEND_PID" ] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
    echo "🎨 Stopping Frontend (PID: $FRONTEND_PID)..."
    kill "$FRONTEND_PID" 2>/dev/null || true
    sleep 1
    # Force kill if still running
    kill -9 "$FRONTEND_PID" 2>/dev/null || true
    echo -e "   ${GREEN}✅ Frontend stopped${NC}"
else
    echo "   Frontend was not running (PID: $FRONTEND_PID)"
fi

# Clean up any remaining processes
pkill -f "uvicorn app.main:app" 2>/dev/null || true
pkill -f "next dev" 2>/dev/null || true

# Remove PID file
rm -f "$PID_FILE"

echo ""
echo -e "${GREEN}✅ All services stopped${NC}"
echo ""

