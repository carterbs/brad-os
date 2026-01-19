# Lifting - Workout Tracker

A single-user weight training workout tracker with progressive overload.

## Development

```bash
npm install              # Install dependencies
npm run dev              # Start client (3000) + server (3001)
npm run test             # Run unit tests
npm run lint             # Run ESLint
npm run typecheck        # TypeScript check
npm run build            # Build all packages
```

## Docker

```bash
npm run docker:dev       # Development environment
npm run docker:down      # Stop containers
```

## Structure

- `packages/shared` - Shared types/utilities
- `packages/server` - Express API + SQLite
- `packages/client` - React + Radix UI
- `e2e` - Playwright E2E tests

## Deployment

Deploy to a remote Linux server via rsync over SSH.

### First-time setup

```bash
./scripts/setup-server.sh   # Install Node.js, create directories, configure systemd
```

This script:
- Installs Node.js 20 if not present
- Creates `/opt/lifting` on the remote
- Installs a systemd service for auto-start and management

### Deploy

```bash
./scripts/deploy.sh              # Full deploy (build + sync + restart)
./scripts/deploy.sh --skip-build # Skip local build
./scripts/deploy.sh --dry-run    # Preview without transferring
```

### Server management

```bash
ssh linux-machine 'sudo systemctl status lifting'    # Check status
ssh linux-machine 'sudo journalctl -u lifting -f'    # View logs
ssh linux-machine 'sudo systemctl restart lifting'   # Restart
```

The app runs at `http://linux-machine:3000`. Database is created automatically at `/opt/lifting/packages/server/data/lifting.prod.db`.

### Configuration

Edit `scripts/deploy.sh` to change:
- `REMOTE_HOST` - SSH host alias (default: `linux-machine`)
- `REMOTE_DIR` - Install location (default: `/opt/lifting`)
