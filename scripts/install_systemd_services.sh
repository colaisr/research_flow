#!/bin/bash
# Install systemd service files
# Usage: ./install_systemd_services.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SYSTEMD_DIR="$SCRIPT_DIR/systemd"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}📦 Installing Systemd Services${NC}"
echo "=================================="
echo ""

# Get current user and group
CURRENT_USER=$(whoami)
CURRENT_GROUP=$(id -gn)

echo "Current user: $CURRENT_USER"
echo "Current group: $CURRENT_GROUP"
echo ""

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    echo -e "${RED}❌ Do not run this script as root. Run as your user and use sudo when needed.${NC}"
    exit 1
fi

# Check if service files exist
if [ ! -f "$SYSTEMD_DIR/research-flow-backend.service" ] || [ ! -f "$SYSTEMD_DIR/research-flow-frontend.service" ]; then
    echo -e "${RED}❌ Service files not found in $SYSTEMD_DIR${NC}"
    exit 1
fi

# Create temporary service files with actual user/group
TMP_BACKEND=$(mktemp)
TMP_FRONTEND=$(mktemp)

sed "s/YOUR_USERNAME/$CURRENT_USER/g; s/YOUR_GROUP/$CURRENT_GROUP/g" \
    "$SYSTEMD_DIR/research-flow-backend.service" > "$TMP_BACKEND"

sed "s/YOUR_USERNAME/$CURRENT_USER/g; s/YOUR_GROUP/$CURRENT_GROUP/g" \
    "$SYSTEMD_DIR/research-flow-frontend.service" > "$TMP_FRONTEND"

# Copy to systemd directory
echo "📋 Installing backend service..."
sudo cp "$TMP_BACKEND" /etc/systemd/system/research-flow-backend.service

echo "📋 Installing frontend service..."
sudo cp "$TMP_FRONTEND" /etc/systemd/system/research-flow-frontend.service

# Reload systemd
echo "🔄 Reloading systemd daemon..."
sudo systemctl daemon-reload

# Cleanup
rm "$TMP_BACKEND" "$TMP_FRONTEND"

echo ""
echo -e "${GREEN}✅ Systemd services installed!${NC}"
echo ""
echo "📋 Next steps:"
echo "   1. Edit service files if needed:"
echo "      sudo nano /etc/systemd/system/research-flow-backend.service"
echo "      sudo nano /etc/systemd/system/research-flow-frontend.service"
echo ""
echo "   2. Update WorkingDirectory paths if not using /srv/research-flow/"
echo ""
echo "   3. Enable and start services:"
echo "      sudo systemctl enable research-flow-backend"
echo "      sudo systemctl enable research-flow-frontend"
echo "      sudo systemctl start research-flow-backend"
echo "      sudo systemctl start research-flow-frontend"
echo ""
echo "   4. Check status:"
echo "      sudo systemctl status research-flow-backend"
echo "      sudo systemctl status research-flow-frontend"

