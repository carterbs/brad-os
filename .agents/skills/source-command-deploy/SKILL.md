---
name: "source-command-deploy"
description: "Deploy the app to linux-machine with pre-deploy validation"
---

# source-command-deploy

Use this skill when the user asks to run the migrated source command `deploy`.

## Command Template

Deploy the lifting tracker app to the linux-machine server.

**When to use:** When the user says "deploy", "push to production", "ship it", or asks to deploy their changes.

## Process

### 1. Pre-deploy Validation

Run the full validation suite before deploying:

```bash
npm run validate
```

This checks:
- TypeScript compilation
- ESLint
- Unit tests
- E2E tests

**Do not proceed if validation fails.** Fix any issues first or ask the user how to proceed.

### 2. Check Git Status

Ensure working directory is clean:

```bash
git status
```

Warn the user if there are uncommitted changes - they won't be deployed unless committed (though rsync deploys the working directory, not git).

### 3. Deploy

Run the deploy script:

```bash
./scripts/deploy.sh
```

The script:
1. Builds the project locally (`npm run build`)
2. Syncs files to `linux-machine:~/lifting` via rsync
3. Installs production dependencies on remote
4. Rebuilds and restarts the Docker container
5. Verifies server health

### Optional Flags

- `--skip-build` - Skip local build (use if already built)
- `--skip-install` - Skip `npm ci` on remote (faster if deps unchanged)
- `--dry-run` - Preview what would be transferred

Example with flags:
```bash
./scripts/deploy.sh --skip-install
```

### 4. Post-deploy Verification

After deployment completes, inform the user:
- The app is available at `http://linux-machine:3000`
- If health check failed, provide the command to check logs:
  ```bash
  ssh linux-machine 'docker logs lifting-app-1'
  ```

## Notes

- The deploy script excludes: `node_modules`, `.git`, databases, tests, logs, and dev files
- Production uses `docker-compose.prod.yml`
- If deploy fails, check SSH connectivity to `linux-machine` first
