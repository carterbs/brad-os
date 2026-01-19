#!/bin/bash
set -e

# One-time setup script for the Linux server
# Run this once before first deployment to ensure Node.js is installed

REMOTE_HOST="linux-machine"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

echo "================================================"
echo "  Lifting Tracker - Server Setup"
echo "================================================"
echo ""

# Check SSH connection
log_info "Testing SSH connection to $REMOTE_HOST..."
if ! ssh "$REMOTE_HOST" "echo 'SSH connection successful'"; then
    log_error "Cannot connect to $REMOTE_HOST. Check your SSH config."
    exit 1
fi

# Check if Node.js is installed
log_info "Checking Node.js installation..."
NODE_VERSION=$(ssh "$REMOTE_HOST" "node --version 2>/dev/null || echo 'not installed'")

if [[ "$NODE_VERSION" == "not installed" ]]; then
    log_warn "Node.js not found. Installing Node.js 20..."
    ssh "$REMOTE_HOST" << 'EOF'
        # Install Node.js 20 via NodeSource
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt-get install -y nodejs

        # Verify installation
        node --version
        npm --version
EOF
else
    log_info "Node.js $NODE_VERSION is installed"
fi

log_info "Server setup complete!"
echo ""
echo "Next steps:"
echo "  Run ./scripts/deploy.sh to deploy the application"
echo ""
echo "The app will be available at http://$REMOTE_HOST:3000"
