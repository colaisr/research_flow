#!/bin/bash
# Helper script to prepare project for migration to new repository
# This script creates a clean copy without git history and sensitive files
# Usage: ./scripts/migrate_to_new_repo.sh [output-directory]

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# Get output directory
OUTPUT_DIR="${1:-./max-signal-migration}"

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo -e "${BLUE}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     Project Migration Helper - Clean Copy Generator      ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if we're in a git repository
if [ ! -d "$PROJECT_ROOT/.git" ]; then
    echo -e "${RED}❌ Not a git repository. Run this from the project root.${NC}"
    exit 1
fi

cd "$PROJECT_ROOT"

# Check if output directory exists
if [ -d "$OUTPUT_DIR" ]; then
    echo -e "${YELLOW}⚠️  Output directory already exists: $OUTPUT_DIR${NC}"
    read -p "Delete and recreate? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${RED}❌ Aborted${NC}"
        exit 1
    fi
    rm -rf "$OUTPUT_DIR"
fi

echo -e "${GREEN}📦 Creating clean copy...${NC}"

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Use git archive to create clean copy (excludes git files automatically)
echo -e "${BLUE}   Creating archive from git...${NC}"
git archive --format=tar HEAD | tar -x -C "$OUTPUT_DIR"

# Remove sensitive/generated files
echo -e "${BLUE}   Removing sensitive files...${NC}"
cd "$OUTPUT_DIR"

# Remove config files (should be gitignored, but double-check)
rm -f backend/app/config_local.py
rm -f backend.log frontend.log
rm -rf backend/.venv
rm -rf frontend/node_modules
rm -rf frontend/.next
rm -rf frontend/.env*
rm -rf __pycache__ backend/__pycache__ frontend/__pycache__
rm -rf backend/app/__pycache__ backend/alembic/__pycache__
find . -name "*.pyc" -delete
find . -name ".DS_Store" -delete

# Verify .gitignore exists
if [ ! -f .gitignore ]; then
    echo -e "${YELLOW}⚠️  Warning: .gitignore not found${NC}"
else
    echo -e "${GREEN}✅ .gitignore present${NC}"
fi

# Create README for migration
cat > MIGRATION_README.md << 'EOF'
# Migration Package

This is a clean copy of the project ready for migration to a new repository.

## Next Steps

1. **Initialize new Git repository:**
   ```bash
   git init
   git branch -M main
   git remote add origin <your-new-repo-url>
   git add .
   git commit -m "Initial commit: Migrated from original project"
   git push -u origin main
   ```

2. **On new server:**
   - Clone the new repository
   - Follow the migration guide: `docs/MIGRATION_PLAN.md`
   - Or use the checklist: `docs/MIGRATION_CHECKLIST.md`

## Important Notes

- `config_local.py` is NOT included (must be created on server)
- Virtual environments are NOT included (will be created on server)
- Node modules are NOT included (will be installed on server)
- Database will be fresh (migrations will create schema)

## Files to Configure on New Server

- `backend/app/config_local.py` - Copy from `config_local.example.py` and edit
- Database credentials
- API keys (OpenRouter, Telegram)
- SESSION_SECRET (generate new one)

See `docs/MIGRATION_PLAN.md` for complete instructions.
EOF

echo ""
echo -e "${GREEN}✅ Clean copy created at: $OUTPUT_DIR${NC}"
echo ""
echo -e "${BLUE}📋 Next steps:${NC}"
echo "   1. Review the contents: ls -la $OUTPUT_DIR"
echo "   2. Initialize git: cd $OUTPUT_DIR && git init"
echo "   3. Add remote: git remote add origin <new-repo-url>"
echo "   4. Commit and push: git add . && git commit -m 'Initial commit' && git push -u origin main"
echo ""
echo -e "${BLUE}📖 For detailed migration instructions, see:${NC}"
echo "   - docs/MIGRATION_PLAN.md (complete guide)"
echo "   - docs/MIGRATION_CHECKLIST.md (quick checklist)"
echo ""

