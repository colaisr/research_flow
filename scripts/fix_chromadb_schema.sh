#!/bin/bash
# Fix ChromaDB schema issue by resetting the database
# This will delete all existing ChromaDB data and recreate with correct schema
# Usage: ./scripts/fix_chromadb_schema.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="$PROJECT_ROOT/backend"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${YELLOW}🔧 Fixing ChromaDB Schema Issue${NC}"
echo "======================================"
echo ""

cd "$BACKEND_DIR"

# Check if virtual environment exists
if [ ! -d ".venv" ]; then
    echo -e "${RED}❌ Virtual environment not found at $BACKEND_DIR/.venv${NC}"
    exit 1
fi

source .venv/bin/activate

# Check if ChromaDB database exists
CHROMADB_DB="$BACKEND_DIR/data/rag_vectors/chroma.sqlite3"
if [ -f "$CHROMADB_DB" ]; then
    echo -e "${YELLOW}⚠️  Found existing ChromaDB database${NC}"
    echo "   Location: $CHROMADB_DB"
    echo ""
    
    # Create backup (just in case)
    BACKUP_DIR="$BACKEND_DIR/data/rag_vectors.backup.$(date +%Y%m%d_%H%M%S)"
    echo "📦 Creating backup..."
    mkdir -p "$(dirname "$BACKUP_DIR")"
    cp -r "$BACKEND_DIR/data/rag_vectors" "$BACKUP_DIR" 2>/dev/null || true
    echo -e "${GREEN}✅ Backup created at: $BACKUP_DIR${NC}"
    echo ""
    
    # Delete the outdated ChromaDB database
    echo "🗑️  Deleting outdated ChromaDB database..."
    rm -f "$CHROMADB_DB"
    echo -e "${GREEN}✅ ChromaDB database deleted${NC}"
    echo ""
else
    echo -e "${YELLOW}ℹ️  No existing ChromaDB database found (will be created on first use)${NC}"
    echo ""
fi

# Also delete any collection directories that might have old schema
echo "🧹 Cleaning up old collection data..."
find "$BACKEND_DIR/data/rag_vectors" -type d -name "rag_*" -exec rm -rf {} + 2>/dev/null || true
echo -e "${GREEN}✅ Old collection data cleaned${NC}"
echo ""

# Restart backend service to recreate ChromaDB with correct schema
echo "🔄 Restarting backend service..."
if systemctl is-active --quiet research-flow-backend 2>/dev/null; then
    sudo systemctl restart research-flow-backend
    echo -e "${GREEN}✅ Backend service restarted${NC}"
    
    # Wait a moment and check status
    sleep 3
    if systemctl is-active --quiet research-flow-backend; then
        echo -e "${GREEN}✅ Backend is running${NC}"
    else
        echo -e "${RED}❌ Backend failed to start. Check logs:${NC}"
        echo "   sudo journalctl -u research-flow-backend -n 50"
        exit 1
    fi
else
    echo -e "${YELLOW}⚠️  Systemd service 'research-flow-backend' not found or not active${NC}"
    echo "   You may need to start it manually"
fi

echo ""
echo -e "${GREEN}✅ ChromaDB schema fix complete!${NC}"
echo ""
echo "💡 Next steps:"
echo "   1. Try creating a new RAG in the UI"
echo "   2. If it works, you can delete the backup: rm -rf $BACKUP_DIR"
echo "   3. Existing RAGs will need to have their documents re-uploaded and re-embedded"

