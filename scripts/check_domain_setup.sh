#!/bin/bash
# Check domain setup status for production
# Usage: ./scripts/check_domain_setup.sh [server_ip]

set -e

SERVER_IP="${1:-84.54.30.222}"
DOMAIN="researchflow.ru"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🔍 Checking Domain Setup for ${DOMAIN}${NC}"
echo "=========================================="
echo ""

# Check DNS
echo -e "${BLUE}1. DNS Configuration:${NC}"
DNS_IP=$(dig +short ${DOMAIN} @8.8.8.8 | tail -n1)
if [ "$DNS_IP" = "$SERVER_IP" ]; then
    echo -e "${GREEN}   ✅ DNS A record for ${DOMAIN} → ${SERVER_IP}${NC}"
else
    echo -e "${RED}   ❌ DNS A record mismatch: ${DOMAIN} → ${DNS_IP} (expected ${SERVER_IP})${NC}"
fi

WWW_DNS_IP=$(dig +short www.${DOMAIN} @8.8.8.8 | tail -n1)
if [ "$WWW_DNS_IP" = "$SERVER_IP" ]; then
    echo -e "${GREEN}   ✅ DNS A record for www.${DOMAIN} → ${SERVER_IP}${NC}"
else
    echo -e "${RED}   ❌ DNS A record mismatch: www.${DOMAIN} → ${WWW_DNS_IP} (expected ${SERVER_IP})${NC}"
fi
echo ""

# Check HTTP/HTTPS connectivity
echo -e "${BLUE}2. HTTP/HTTPS Connectivity:${NC}"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://${DOMAIN} 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "301" ] || [ "$HTTP_CODE" = "302" ]; then
    echo -e "${GREEN}   ✅ HTTP redirects to HTTPS (${HTTP_CODE})${NC}"
elif [ "$HTTP_CODE" = "000" ]; then
    echo -e "${RED}   ❌ HTTP connection failed (connection refused or timeout)${NC}"
else
    echo -e "${YELLOW}   ⚠️  HTTP returned ${HTTP_CODE} (expected 301/302 redirect)${NC}"
fi

HTTPS_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 https://${DOMAIN} 2>/dev/null || echo "000")
if [ "$HTTPS_CODE" = "200" ]; then
    echo -e "${GREEN}   ✅ HTTPS is accessible (${HTTPS_CODE})${NC}"
elif [ "$HTTPS_CODE" = "000" ]; then
    echo -e "${RED}   ❌ HTTPS connection failed (connection refused, timeout, or SSL error)${NC}"
else
    echo -e "${YELLOW}   ⚠️  HTTPS returned ${HTTPS_CODE}${NC}"
fi
echo ""

# Check SSL certificate
echo -e "${BLUE}3. SSL Certificate:${NC}"
SSL_INFO=$(echo | openssl s_client -servername ${DOMAIN} -connect ${DOMAIN}:443 2>/dev/null | openssl x509 -noout -dates 2>/dev/null || echo "")
if [ -n "$SSL_INFO" ]; then
    EXPIRY=$(echo | openssl s_client -servername ${DOMAIN} -connect ${DOMAIN}:443 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
    echo -e "${GREEN}   ✅ SSL certificate is installed${NC}"
    echo "   Certificate expires: $EXPIRY"
else
    echo -e "${RED}   ❌ SSL certificate not found or invalid${NC}"
fi
echo ""

# Check backend API
echo -e "${BLUE}4. Backend API:${NC}"
API_HEALTH=$(curl -s --max-time 5 https://${DOMAIN}/api/health 2>/dev/null || echo "failed")
if echo "$API_HEALTH" | grep -q "ok"; then
    echo -e "${GREEN}   ✅ Backend API is accessible via HTTPS${NC}"
else
    echo -e "${YELLOW}   ⚠️  Backend API check failed or not accessible${NC}"
fi

LOCAL_API_HEALTH=$(curl -s --max-time 2 http://localhost:8000/health 2>/dev/null || echo "failed")
if echo "$LOCAL_API_HEALTH" | grep -q "ok"; then
    echo -e "${GREEN}   ✅ Backend is running locally on port 8000${NC}"
else
    echo -e "${RED}   ❌ Backend not responding on localhost:8000${NC}"
fi
echo ""

# Check frontend
echo -e "${BLUE}5. Frontend:${NC}"
FRONTEND_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 https://${DOMAIN} 2>/dev/null || echo "000")
if [ "$FRONTEND_CODE" = "200" ]; then
    echo -e "${GREEN}   ✅ Frontend is accessible via HTTPS${NC}"
else
    echo -e "${YELLOW}   ⚠️  Frontend returned ${FRONTEND_CODE}${NC}"
fi

LOCAL_FRONTEND_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 2 http://localhost:3000 2>/dev/null || echo "000")
if [ "$LOCAL_FRONTEND_CODE" = "200" ]; then
    echo -e "${GREEN}   ✅ Frontend is running locally on port 3000${NC}"
else
    echo -e "${RED}   ❌ Frontend not responding on localhost:3000${NC}"
fi
echo ""

# Summary
echo -e "${BLUE}📋 Summary:${NC}"
echo "=========="

ISSUES=0

if [ "$DNS_IP" != "$SERVER_IP" ] || [ "$WWW_DNS_IP" != "$SERVER_IP" ]; then
    echo -e "${RED}❌ DNS configuration issue${NC}"
    ISSUES=$((ISSUES + 1))
fi

if [ "$HTTPS_CODE" = "000" ]; then
    echo -e "${RED}❌ HTTPS not accessible - Nginx may not be configured${NC}"
    ISSUES=$((ISSUES + 1))
fi

if [ -z "$SSL_INFO" ]; then
    echo -e "${RED}❌ SSL certificate not installed${NC}"
    ISSUES=$((ISSUES + 1))
fi

if [ "$LOCAL_API_HEALTH" = "failed" ]; then
    echo -e "${RED}❌ Backend service not running${NC}"
    ISSUES=$((ISSUES + 1))
fi

if [ "$LOCAL_FRONTEND_CODE" != "200" ]; then
    echo -e "${RED}❌ Frontend service not running${NC}"
    ISSUES=$((ISSUES + 1))
fi

if [ $ISSUES -eq 0 ]; then
    echo -e "${GREEN}✅ All checks passed! Domain is properly configured.${NC}"
    echo ""
    echo "Your site should be accessible at:"
    echo "  - https://${DOMAIN}"
    echo "  - https://www.${DOMAIN}"
else
    echo -e "${YELLOW}⚠️  Found ${ISSUES} issue(s) that need attention${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Follow the guide: docs/DOMAIN_SETUP_PRODUCTION.md"
    echo "  2. SSH into server: ssh root@${SERVER_IP}"
    echo "  3. Check service status: sudo systemctl status research-flow-backend research-flow-frontend nginx"
fi

echo ""

