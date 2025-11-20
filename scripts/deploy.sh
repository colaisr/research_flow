#!/bin/bash
# Pull latest changes, update dependencies, and run migrations
# Usage: ./deploy.sh

set -e

# Resolve symlinks to get actual script location
SCRIPT_PATH="${BASH_SOURCE[0]}"
if [ -L "$SCRIPT_PATH" ]; then
    SCRIPT_PATH="$(readlink -f "$SCRIPT_PATH")"
fi
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="$PROJECT_ROOT/backend"
FRONTEND_DIR="$PROJECT_ROOT/frontend"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${GREEN}🚀 Deploying Latest Changes${NC}"
echo "=============================="
echo ""

cd "$PROJECT_ROOT"

# Check if git repo
if [ ! -d ".git" ]; then
    echo -e "${RED}❌ Not a git repository. Cannot deploy.${NC}"
    exit 1
fi

# Get current branch
CURRENT_BRANCH=$(git branch --show-current)
echo -e "${BLUE}Current branch: $CURRENT_BRANCH${NC}"
echo ""

# Step 1: Pull latest changes
echo -e "${GREEN}📥 Step 1: Pulling latest changes...${NC}"
git fetch origin
git reset --hard origin/$CURRENT_BRANCH
echo -e "${GREEN}✅ Repository updated${NC}"
echo ""

# Step 2: Update backend dependencies
echo -e "${GREEN}📦 Step 2: Updating backend dependencies...${NC}"
cd "$BACKEND_DIR"

# Check if virtual environment exists
if [ ! -d ".venv" ]; then
    echo -e "${YELLOW}⚠️  Virtual environment not found. Creating...${NC}"
    python3.11 -m venv .venv
fi

# Activate virtual environment
source .venv/bin/activate

# Update dependencies
echo "   Installing/updating Python packages from requirements.txt..."
pip install -r requirements.txt --quiet --upgrade

# Verify critical packages are installed
echo "   Verifying critical packages..."
# Map package names to their import names
declare -A PACKAGE_IMPORTS=(
    ["tinkoff-investments"]="tinkoff.invest"
    ["apimoex"]="apimoex"
    ["requests"]="requests"
    ["ccxt"]="ccxt"
    ["yfinance"]="yfinance"
)

MISSING_PACKAGES=()
for pkg_name in "${!PACKAGE_IMPORTS[@]}"; do
    import_name="${PACKAGE_IMPORTS[$pkg_name]}"
    if ! python -c "import ${import_name}" 2>/dev/null; then
        MISSING_PACKAGES+=("$pkg_name")
    fi
done

if [ ${#MISSING_PACKAGES[@]} -gt 0 ]; then
    echo -e "${YELLOW}⚠️  Missing packages detected: ${MISSING_PACKAGES[*]}${NC}"
    echo "   Attempting to reinstall..."
    pip install -r requirements.txt --upgrade
    # Check again
    FAILED_PACKAGES=()
    for pkg_name in "${MISSING_PACKAGES[@]}"; do
        import_name="${PACKAGE_IMPORTS[$pkg_name]}"
        if ! python -c "import ${import_name}" 2>/dev/null; then
            FAILED_PACKAGES+=("$pkg_name")
        fi
    done
    if [ ${#FAILED_PACKAGES[@]} -gt 0 ]; then
        echo -e "${RED}❌ Failed to install: ${FAILED_PACKAGES[*]}${NC}"
        exit 1
    fi
    echo -e "${GREEN}✅ All packages verified after reinstall${NC}"
else
    echo -e "${GREEN}✅ All critical packages verified${NC}"
fi

echo -e "${GREEN}✅ Backend dependencies updated${NC}"
echo ""

# Step 3: Run database migrations
echo -e "${GREEN}🗄️  Step 3: Running database migrations...${NC}"
alembic upgrade head
echo -e "${GREEN}✅ Migrations completed${NC}"
echo ""

# Step 4: Update frontend dependencies
echo -e "${GREEN}📦 Step 4: Updating frontend dependencies...${NC}"
cd "$FRONTEND_DIR"
echo "   Installing npm packages from package.json..."
npm ci
echo -e "${GREEN}✅ Frontend dependencies updated${NC}"
echo ""

# Step 5: Build frontend
echo -e "${GREEN}🏗️  Step 5: Building frontend for production...${NC}"
npm run build
echo -e "${GREEN}✅ Frontend build completed${NC}"
echo ""

echo -e "${GREEN}✅ Deployment preparation complete!${NC}"
echo ""
echo "📋 Next steps:"
echo "   To restart backend:  ./scripts/restart_backend.sh"
echo "   To restart frontend: ./scripts/restart_frontend.sh"
echo "   To restart both:     ./scripts/restart_backend.sh && ./scripts/restart_frontend.sh"

