#!/bin/bash
set -e

# Deployment script for lifting tracker
# Deploys to linux-machine via rsync over SSH

REMOTE_HOST="linux-machine"
REMOTE_DIR="~/lifting"  # Use ~ for home dir; rsync expands this correctly
LOCAL_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Parse arguments
SKIP_BUILD=false
SKIP_INSTALL=false
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-build) SKIP_BUILD=true; shift ;;
        --skip-install) SKIP_INSTALL=true; shift ;;
        --dry-run) DRY_RUN=true; shift ;;
        --help)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --skip-build    Skip local build step"
            echo "  --skip-install  Skip npm install on remote"
            echo "  --dry-run       Show what would be transferred without doing it"
            echo "  --help          Show this help message"
            exit 0
            ;;
        *) log_error "Unknown option: $1"; exit 1 ;;
    esac
done

cd "$LOCAL_DIR"

# Step 1: Build locally
if [ "$SKIP_BUILD" = false ]; then
    log_info "Building project locally..."
    npm run build
else
    log_warn "Skipping build (--skip-build)"
fi

# Step 2: Ensure remote directory exists
log_info "Ensuring remote directory exists..."
if [ "$DRY_RUN" = false ]; then
    ssh "$REMOTE_HOST" "mkdir -p $REMOTE_DIR"
fi

# Step 3: Rsync files to remote
log_info "Syncing files to $REMOTE_HOST:$REMOTE_DIR..."

RSYNC_OPTS="-avz --delete"
if [ "$DRY_RUN" = true ]; then
    RSYNC_OPTS="$RSYNC_OPTS --dry-run"
fi

rsync $RSYNC_OPTS \
    --exclude 'node_modules' \
    --exclude '.git' \
    --exclude '*.db' \
    --exclude '*.sqlite' \
    --exclude 'packages/*/src' \
    --exclude 'e2e' \
    --exclude 'playwright-report' \
    --exclude 'test-results' \
    --exclude '.env.local' \
    --exclude '*.log' \
    --exclude 'plans' \
    --exclude 'docker' \
    --exclude 'BUGS.md' \
    --exclude 'CLAUDE.md' \
    --include 'packages/shared/dist/***' \
    --include 'packages/server/dist/***' \
    --include 'packages/client/dist/***' \
    --include 'packages/shared/package.json' \
    --include 'packages/server/package.json' \
    --include 'packages/client/package.json' \
    --include 'package.json' \
    --include 'package-lock.json' \
    "$LOCAL_DIR/" "$REMOTE_HOST:$REMOTE_DIR/"

if [ "$DRY_RUN" = true ]; then
    log_warn "Dry run complete. No files were transferred."
    exit 0
fi

# Step 4: Install production dependencies on remote
if [ "$SKIP_INSTALL" = false ]; then
    log_info "Installing production dependencies on remote..."
    ssh "$REMOTE_HOST" "cd $REMOTE_DIR && npm ci --omit=dev"
else
    log_warn "Skipping npm install (--skip-install)"
fi

# Step 5: Restart the server
log_info "Restarting server on remote..."
# Use bash -l to ensure proper shell expansion of ~
# Exit code from this may be non-zero due to SSH session ending after nohup, so we ignore it
ssh "$REMOTE_HOST" 'bash -l -c "pkill -f \"node.*lifting.*index.js\" 2>/dev/null || true; cd ~/lifting && NODE_ENV=production nohup node packages/server/dist/index.js > ~/lifting/lifting.log 2>&1 &"' || true

# Step 6: Verify server is running
log_info "Waiting for server to start..."
sleep 2

if ssh "$REMOTE_HOST" "curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/exercises" | grep -q "200"; then
    log_info "Server is running and healthy!"
else
    log_warn "Server may not be running. Check logs with: ssh $REMOTE_HOST 'tail -f ~/lifting/lifting.log'"
fi

log_info "Deployment complete!"
echo ""
echo "Access the app at: http://$REMOTE_HOST:3000"
