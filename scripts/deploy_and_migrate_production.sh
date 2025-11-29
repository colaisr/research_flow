#!/bin/bash
# Deploy subscription system and migrate existing users to production
# Usage: ./scripts/deploy_and_migrate_production.sh

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# Production server SSH alias
PROD_SERVER="rf-prod"
PROJECT_ROOT="/srv/research-flow"
BACKEND_DIR="$PROJECT_ROOT/backend"

echo -e "${GREEN}🚀 Deploying Subscription System to Production${NC}"
echo "=================================================="
echo ""

# Step 1: Deploy code changes
echo -e "${GREEN}📥 Step 1: Deploying code changes...${NC}"
ssh $PROD_SERVER "cd $PROJECT_ROOT && ./scripts/deploy.sh"
echo -e "${GREEN}✅ Code deployment complete${NC}"
echo ""

# Step 2: Seed subscription data (if not already done)
echo -e "${GREEN}🌱 Step 2: Seeding subscription data...${NC}"
if ssh $PROD_SERVER "cd $BACKEND_DIR && source .venv/bin/activate && [ -f scripts/seed_subscription_data.py ]"; then
    ssh $PROD_SERVER "cd $BACKEND_DIR && source .venv/bin/activate && python scripts/seed_subscription_data.py"
    echo -e "${GREEN}✅ Subscription data seeded${NC}"
else
    echo -e "${YELLOW}⚠️  Seed script not found - may already be seeded or needs to be committed first${NC}"
    echo "   Checking if subscription plans exist..."
    if ssh $PROD_SERVER "cd $BACKEND_DIR && source .venv/bin/activate && python -c \"from app.core.database import SessionLocal; from sqlalchemy import text; db = SessionLocal(); result = db.execute(text('SELECT COUNT(*) FROM subscription_plans')); count = result.fetchone()[0]; print(count); db.close()\"" | grep -q "^[1-9]"; then
        echo -e "${GREEN}✅ Subscription plans already exist${NC}"
    else
        echo -e "${RED}❌ No subscription plans found - seed script needed${NC}"
        exit 1
    fi
fi
echo ""

# Step 3: Run user migration
echo -e "${GREEN}👥 Step 3: Migrating existing users...${NC}"
ssh $PROD_SERVER "cd $BACKEND_DIR && source .venv/bin/activate && python scripts/migrate_existing_users_to_subscriptions.py"
echo -e "${GREEN}✅ User migration complete${NC}"
echo ""

# Step 4: Restart services
echo -e "${GREEN}🔄 Step 4: Restarting services...${NC}"
ssh $PROD_SERVER "cd $PROJECT_ROOT && ./scripts/restart_backend.sh && ./scripts/restart_frontend.sh"
echo -e "${GREEN}✅ Services restarted${NC}"
echo ""

# Step 5: Verify services
echo -e "${GREEN}✅ Step 5: Verifying services...${NC}"
echo "   Checking backend health..."
if ssh $PROD_SERVER "curl -s http://localhost:8000/health | grep -q 'ok'"; then
    echo -e "   ${GREEN}✅ Backend is healthy${NC}"
else
    echo -e "   ${RED}❌ Backend health check failed${NC}"
    exit 1
fi

echo "   Checking frontend..."
if ssh $PROD_SERVER "curl -s http://localhost:3000 | grep -q 'html'"; then
    echo -e "   ${GREEN}✅ Frontend is responding${NC}"
else
    echo -e "   ${YELLOW}⚠️  Frontend check inconclusive (may need manual verification)${NC}"
fi

echo ""
echo -e "${GREEN}✅ Deployment and migration complete!${NC}"
echo ""
echo "📋 Verification steps:"
echo "   1. Visit https://researchflow.ru and verify site loads"
echo "   2. Log in as a user and check /consumption page"
echo "   3. Verify subscription info is displayed"
echo "   4. Check admin panel for user subscriptions"
echo ""

