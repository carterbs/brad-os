#!/bin/bash
set -e

# One-time setup script for the Linux server
# Run this once before first deployment

REMOTE_HOST="linux-machine"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

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

# Create application directory
log_info "Creating application directory..."
ssh "$REMOTE_HOST" << 'EOF'
    sudo mkdir -p /opt/lifting
    sudo chown $(whoami):$(whoami) /opt/lifting
EOF

# Copy and install systemd service
log_info "Installing systemd service..."
scp "$SCRIPT_DIR/lifting.service" "$REMOTE_HOST:/tmp/lifting.service"
ssh "$REMOTE_HOST" << 'EOF'
    # Update User in service file to current user
    sed -i "s/User=brad/User=$(whoami)/" /tmp/lifting.service

    sudo mv /tmp/lifting.service /etc/systemd/system/lifting.service
    sudo systemctl daemon-reload
    sudo systemctl enable lifting
EOF

log_info "Server setup complete!"
echo ""
echo "Next steps:"
echo "  1. Run ./scripts/deploy.sh to deploy the application"
echo "  2. Access the app at http://$REMOTE_HOST:3000"
echo ""
echo "Useful commands:"
echo "  ssh $REMOTE_HOST 'sudo systemctl status lifting'   # Check status"
echo "  ssh $REMOTE_HOST 'sudo journalctl -u lifting -f'   # View logs"
echo "  ssh $REMOTE_HOST 'sudo systemctl restart lifting'  # Restart"
