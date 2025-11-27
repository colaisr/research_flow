#!/bin/bash
# Check production database and ChromaDB status
# Usage: ./scripts/check_production_status.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="$PROJECT_ROOT/backend"

echo "🔍 Checking Production Status"
echo "=============================="
echo ""

cd "$BACKEND_DIR"

# Check if virtual environment exists
if [ ! -d ".venv" ]; then
    echo "❌ Virtual environment not found at $BACKEND_DIR/.venv"
    exit 1
fi

source .venv/bin/activate

echo "📊 1. Checking MySQL Database Migrations"
echo "----------------------------------------"
echo "Current migration status:"
alembic current || echo "⚠️  Could not check migration status"
echo ""

echo "📋 2. Checking Latest Migration"
echo "--------------------------------"
echo "Latest migration in code:"
alembic heads || echo "⚠️  Could not check migration heads"
echo ""

echo "📦 3. Checking ChromaDB Version"
echo "--------------------------------"
python3 -c "import chromadb; print(f'ChromaDB version: {chromadb.__version__}')" || echo "⚠️  Could not check ChromaDB version"
echo ""

echo "🗄️  4. Checking ChromaDB Database Schema"
echo "----------------------------------------"
if [ -f "data/rag_vectors/chroma.sqlite3" ]; then
    echo "ChromaDB SQLite database found at: data/rag_vectors/chroma.sqlite3"
    echo "Checking collections table schema:"
    sqlite3 data/rag_vectors/chroma.sqlite3 ".schema collections" 2>/dev/null || echo "⚠️  Could not read ChromaDB schema (might need sqlite3 installed)"
    echo ""
    echo "Collections table columns:"
    sqlite3 data/rag_vectors/chroma.sqlite3 "PRAGMA table_info(collections);" 2>/dev/null || echo "⚠️  Could not read table info"
else
    echo "⚠️  ChromaDB SQLite database not found (might not be initialized yet)"
fi
echo ""

echo "✅ Status check complete"
echo ""
echo "💡 If migrations are not applied, run:"
echo "   cd backend && source .venv/bin/activate && alembic upgrade head"
echo ""
echo "💡 If ChromaDB schema is outdated, you may need to:"
echo "   1. Backup: cp -r data/rag_vectors data/rag_vectors.backup"
echo "   2. Delete: rm -rf data/rag_vectors/chroma.sqlite3"
echo "   3. Restart backend (will recreate ChromaDB with correct schema)"

