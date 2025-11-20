#!/bin/bash
# Production health check script
# Usage: ./scripts/check_production.sh [server_ip]

set -e

SERVER_IP="${1:-45.144.177.203}"
BACKEND_URL="http://${SERVER_IP}:8000"
FRONTEND_URL="http://${SERVER_IP}:3000"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🔍 Production Health Check${NC}"
echo "=============================="
echo "Server: ${SERVER_IP}"
echo ""

# Check backend health
echo -e "${BLUE}📦 Checking Backend...${NC}"
BACKEND_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${BACKEND_URL}/health" || echo "000")
if [ "$BACKEND_STATUS" = "200" ]; then
    echo -e "${GREEN}✅ Backend is healthy (HTTP ${BACKEND_STATUS})${NC}"
    BACKEND_RESPONSE=$(curl -s "${BACKEND_URL}/health")
    echo "   Response: ${BACKEND_RESPONSE}"
else
    echo -e "${RED}❌ Backend is not responding (HTTP ${BACKEND_STATUS})${NC}"
fi
echo ""

# Check frontend
echo -e "${BLUE}🎨 Checking Frontend...${NC}"
FRONTEND_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${FRONTEND_URL}" || echo "000")
if [ "$FRONTEND_STATUS" = "200" ]; then
    echo -e "${GREEN}✅ Frontend is responding (HTTP ${FRONTEND_STATUS})${NC}"
else
    echo -e "${RED}❌ Frontend is not responding (HTTP ${FRONTEND_STATUS})${NC}"
fi
echo ""

# Check for CSS file issues
echo -e "${BLUE}🎨 Checking Frontend Static Assets...${NC}"
FRONTEND_HTML=$(curl -s "${FRONTEND_URL}" || echo "")
if echo "$FRONTEND_HTML" | grep -q "next/static/css" && ! echo "$FRONTEND_HTML" | grep -q "_next/static/css"; then
    echo -e "${YELLOW}⚠️  Found potential CSS path issue (next/static vs _next/static)${NC}"
    echo "   This suggests the frontend build may be outdated"
elif echo "$FRONTEND_HTML" | grep -q "_next/static/css"; then
    echo -e "${GREEN}✅ CSS paths look correct (_next/static/css)${NC}"
    # Try to verify a CSS file loads
    CSS_FILE=$(echo "$FRONTEND_HTML" | grep -o "_next/static/css/[^\"]*\.css" | head -1)
    if [ -n "$CSS_FILE" ]; then
        CSS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${FRONTEND_URL}${CSS_FILE}" 2>/dev/null || echo "000")
        if [ "$CSS_STATUS" = "200" ]; then
            echo -e "${GREEN}✅ CSS file loads successfully (HTTP 200)${NC}"
        else
            echo -e "${YELLOW}⚠️  CSS file returned HTTP $CSS_STATUS${NC}"
        fi
    fi
else
    echo -e "${YELLOW}⚠️  Could not verify CSS paths${NC}"
fi
echo ""

# Summary
echo -e "${BLUE}📋 Summary${NC}"
echo "=============================="
if [ "$BACKEND_STATUS" = "200" ] && [ "$FRONTEND_STATUS" = "200" ]; then
    echo -e "${GREEN}✅ Both services are responding${NC}"
    echo ""
    echo -e "${YELLOW}⚠️  If you see CSS errors in browser:${NC}"
    echo "   1. SSH into server: ssh user@${SERVER_IP}"
    echo "   2. Run: cd /srv/max-signal && ./scripts/deploy.sh"
    echo "   3. Run: ./scripts/restart_frontend.sh"
else
    echo -e "${RED}❌ Some services are not responding properly${NC}"
    echo ""
    echo "Next steps:"
    echo "   1. SSH into server: ssh user@${SERVER_IP}"
    echo "   2. Check service status:"
    echo "      sudo systemctl status max-signal-backend"
    echo "      sudo systemctl status max-signal-frontend"
    echo "   3. Check logs:"
    echo "      sudo journalctl -u max-signal-backend -n 50"
    echo "      sudo journalctl -u max-signal-frontend -n 50"
fi
echo ""

