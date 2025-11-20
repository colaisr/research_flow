#!/usr/bin/env bash
# Start all services for Research Flow
# Starts backend (FastAPI) and frontend (Next.js) servers

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="$PROJECT_ROOT/backend"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
PID_FILE="$PROJECT_ROOT/.server_pids"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Starting Research Flow Services${NC}"
echo "=================================="
echo ""

# Check if servers are already running
if [ -f "$PID_FILE" ]; then
    echo -e "${YELLOW}⚠️  Servers may already be running. Check with: ./scripts/stop_all.sh${NC}"
    echo ""
fi

# Start Backend
echo "📦 Starting Backend (FastAPI)..."
cd "$BACKEND_DIR"
if [ ! -d ".venv" ]; then
    echo "❌ Virtual environment not found. Run setup first!"
    exit 1
fi

source .venv/bin/activate
nohup uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 > "$PROJECT_ROOT/backend.log" 2>&1 &
BACKEND_PID=$!
echo "   Backend PID: $BACKEND_PID"
echo "   URL: http://localhost:8000"
echo "   Logs: $PROJECT_ROOT/backend.log"
echo ""

# Wait a moment for backend to start
sleep 2

# Start Frontend
echo "🎨 Starting Frontend (Next.js)..."
cd "$FRONTEND_DIR"
if [ ! -d "node_modules" ]; then
    echo "   Installing dependencies first..."
    npm install --quiet
fi

nohup npm run dev > "$PROJECT_ROOT/frontend.log" 2>&1 &
FRONTEND_PID=$!
echo "   Frontend PID: $FRONTEND_PID"
echo "   URL: http://localhost:3000"
echo "   Logs: $PROJECT_ROOT/frontend.log"
echo ""

# Save PIDs to file
echo "$BACKEND_PID" > "$PID_FILE"
echo "$FRONTEND_PID" >> "$PID_FILE"

# Wait a moment and check if servers started
sleep 3

echo ""
echo -e "${GREEN}✅ Services Started!${NC}"
echo "===================="
echo ""
echo "Backend:  http://localhost:8000"
echo "Frontend: http://localhost:3000"
echo "API Docs: http://localhost:8000/docs"
echo ""
echo "To stop all services, run: ./scripts/stop_all.sh"
echo "To view logs: tail -f backend.log frontend.log"
echo ""

