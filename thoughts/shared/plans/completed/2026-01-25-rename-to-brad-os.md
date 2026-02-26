# Plan: Rename Repository from `lifting` to `brad-os`

## Overview

Rename the npm workspace scope from `@lifting/*` to `@brad-os/*` and all related references. Uses codemod approach with build verification as the source of truth for completeness.

## Current State Analysis

**Package structure:**
- Root: `package.json:2` - `"name": "lifting"`
- Shared: `packages/shared/package.json:2` - `"name": "@lifting/shared"`
- Server: `packages/server/package.json:2` - `"name": "@lifting/server"`
- Client: `packages/client/package.json:2` - `"name": "@lifting/client"`

**Import references:**
- 210 occurrences of `@lifting/` across 161 files (source + tests)

**Database naming:**
- `packages/server/src/db/index.ts:39-44` - `getDatabaseFilename()` returns `lifting.db`, `lifting.test.*.db`, `lifting.prod.db`

**Docker/env:**
- `docker-compose.yml:19` - `DB_PATH=/app/packages/server/data/lifting.db`
- `docker-compose.prod.yml:13` - `DB_PATH=/app/data/lifting.db`
- `docker/Dockerfile.prod:49` - `ENV DB_PATH=/app/data/lifting.db`
- `.env.example:9` - comment references `lifting.db`

**Git remote:**
- `origin git@github.com:carterbs/lifting.git`

## Desired End State

- All packages named `@brad-os/*`
- All imports use `@brad-os/shared`
- Database files named `brad-os.db`, `brad-os.test.*.db`, `brad-os.prod.db`
- Docker configs reference `brad-os.db`
- Git remote points to `carterbs/brad-os`
- Local directory renamed to `brad-os`
- `npm run validate` passes

## What We're NOT Doing

- Changing any application logic
- Renaming internal code (variables, functions, etc.)
- Docker volume renaming (keeping `lifting-data` to preserve existing data)

---

## Implementation Approach

### Parallelization Strategy

```
Phase 1: Update package.json (SEQUENTIAL - must be first)
    │
    ├─── Verify: typecheck FAILS ───┐
    │                               │
Phase 2: Codemod source files ◄─────┘
    │
    ├─── Verify: typecheck PASSES ──┐
    │                               │
    ▼                               │
Phase 3: Update non-TS files ◄──────┘
    │
    ├── [PARALLEL] ─┬── db/index.ts
    │               ├── Docker files (3)
    │               ├── .env.example
    │               └── Documentation (.md files)
    │
Phase 4: Reinstall & validate (SEQUENTIAL)
    │
Phase 5: Git/GitHub + DB migration (MANUAL)
```

---

## Phase 1: Update Package Names (Breaks Build)

**Overview:** Update the 4 package.json files to change the package scope. This intentionally breaks the build.

### Changes Required

| File | Change |
|------|--------|
| `package.json:2` | `"name": "lifting"` → `"name": "brad-os"` |
| `package.json:10` | `-w @lifting/client` → `-w @brad-os/client` |
| `package.json:10` | `-w @lifting/server` → `-w @brad-os/server` |
| `package.json:11` | `-w @lifting/shared` → `-w @brad-os/shared` |
| `packages/shared/package.json:2` | `"@lifting/shared"` → `"@brad-os/shared"` |
| `packages/server/package.json:2` | `"@lifting/server"` → `"@brad-os/server"` |
| `packages/server/package.json:16` | `"@lifting/shared": "*"` → `"@brad-os/shared": "*"` |
| `packages/client/package.json:2` | `"@lifting/client"` → `"@brad-os/client"` |
| `packages/client/package.json:18` | `"@lifting/shared": "*"` → `"@brad-os/shared": "*"` |

### Success Criteria
- [ ] All 4 package.json files updated
- [ ] `npm run typecheck` **FAILS** with "Cannot find module '@lifting/shared'"

### Confirmation Gate
Run typecheck and confirm failure before proceeding.

---

## Phase 2: Codemod Source Files

**Overview:** Use sed to update all TypeScript/TSX imports from `@lifting/` to `@brad-os/`.

### Command

```bash
# Preview what will change
rg -l '@lifting/' --type ts --type tsx packages/ e2e/

# Execute codemod
find packages e2e -type f \( -name "*.ts" -o -name "*.tsx" \) -exec \
  sed -i '' 's/@lifting\//@brad-os\//g' {} +
```

### Success Criteria
- [ ] `npm run typecheck` **PASSES**
- [ ] `npm run lint` passes
- [ ] `rg '@lifting/' --type ts --type tsx` returns no results

### Confirmation Gate
Typecheck must pass before proceeding.

---

## Phase 3: Update Non-TypeScript Files (PARALLEL)

**Overview:** Update database naming, Docker configs, and documentation. These can all run in parallel since they don't affect typecheck.

### 3a. Database Naming (`packages/server/src/db/index.ts:36-44`)

```typescript
// Line 39
return workerId ? `brad-os.test.${workerId}.db` : 'brad-os.test.db';
// Line 41
return 'brad-os.prod.db';
// Line 43
return 'brad-os.db';
```

### 3b. Docker Files (3 files - parallel)

| File | Line | Change |
|------|------|--------|
| `docker-compose.yml:19` | `DB_PATH=...lifting.db` → `brad-os.db` |
| `docker-compose.prod.yml:13` | `DB_PATH=...lifting.db` → `brad-os.db` |
| `docker/Dockerfile.prod:49` | `ENV DB_PATH=...lifting.db` → `brad-os.db` |

### 3c. Environment Example (`.env.example:9`)

```bash
# DB_PATH=/custom/path/to/brad-os.db
```

### 3d. Documentation (codemod)

```bash
# Update @lifting/ references in markdown
find . -type f -name "*.md" -not -path "./node_modules/*" -exec \
  sed -i '' 's/@lifting\//@brad-os\//g' {} +

# Update directory paths in CLAUDE.md
sed -i '' 's|/Dev/lifting|/Dev/brad-os|g' CLAUDE.md
```

### Success Criteria
- [ ] `rg 'lifting\.db' --type ts` returns no results
- [ ] `rg '@lifting/' *.md` returns no results (excluding node_modules)
- [ ] Docker files reference `brad-os.db`

---

## Phase 4: Reinstall Dependencies & Full Validation

**Overview:** Clean reinstall to ensure npm recognizes new package names, then run full validation.

### Commands (SEQUENTIAL)

```bash
# Clean install
rm -rf node_modules package-lock.json
rm -rf packages/*/node_modules
npm install

# Build shared (required by server/client)
npm run build -w @brad-os/shared

# Full validation
npm run validate
```

### Success Criteria
- [ ] `npm install` completes without errors
- [ ] `npm run validate` passes (typecheck, lint, unit tests, e2e tests)

---

## Phase 5: Git, GitHub & Database Migration (MANUAL)

**Overview:** External changes that must be done manually.

### 5a. Rename GitHub Repository
1. Go to github.com/carterbs/lifting → Settings → General
2. Change repository name to `brad-os`

### 5b. Update Git Remote

```bash
git remote set-url origin git@github.com:carterbs/brad-os.git
```

### 5c. Commit and Push

```bash
git add -A
git commit -m "Rename repository from lifting to brad-os"
git push
```

### 5d. Rename Local Directory

```bash
cd /Users/bradcarter/Documents/Dev
mv lifting brad-os
cd brad-os
```

### 5e. Migrate Local Development Database

```bash
cd packages/server/data
mv lifting.db brad-os.db
mv lifting.db-wal brad-os.db-wal 2>/dev/null || true
mv lifting.db-shm brad-os.db-shm 2>/dev/null || true
```

### 5f. Migrate Production Database (with backup & verification)

**Why this order matters:** Stopping the app cleanly triggers SQLite's WAL checkpoint, which flushes the write-ahead log back into the main `.db` file. This makes the WAL/SHM files stale and the rename safe.

**Step 1: Backup before anything**
```bash
# Create timestamped backup on host machine
docker run --rm -v lifting-data:/data -v $(pwd):/backup alpine \
  cp /data/lifting.db /backup/lifting-backup-$(date +%Y%m%d).db
```

**Step 2: Verify backup is valid**
```bash
# Check backup is readable and has data
sqlite3 lifting-backup-*.db "SELECT count(*) FROM exercises;"
sqlite3 lifting-backup-*.db "SELECT count(*) FROM workouts;"
```

**Step 3: Stop app completely**
```bash
# This triggers WAL checkpoint - critical for safe rename
docker-compose -f docker-compose.prod.yml down
```

**Step 4: Rename database files**
```bash
docker run --rm -v lifting-data:/data alpine sh -c "
  mv /data/lifting.db /data/brad-os.db && \
  mv /data/lifting.db-wal /data/brad-os.db-wal 2>/dev/null; \
  mv /data/lifting.db-shm /data/brad-os.db-shm 2>/dev/null; \
  echo 'Files after rename:' && ls -la /data/
"
```

**Step 5: Deploy new code and start**
```bash
docker-compose -f docker-compose.prod.yml up -d
```

**Step 6: Verify data loaded correctly**
```bash
# Check API returns data (adjust endpoint as needed)
curl -s http://localhost:3000/api/exercises | head -c 200

# Or check logs for any database errors
docker-compose -f docker-compose.prod.yml logs --tail=50 | grep -i error
```

**Rollback if something goes wrong:**
```bash
# Stop new app
docker-compose -f docker-compose.prod.yml down

# Restore from backup
docker run --rm -v lifting-data:/data -v $(pwd):/backup alpine \
  cp /backup/lifting-backup-*.db /data/lifting.db

# Revert code and restart with old version
git checkout HEAD~1
docker-compose -f docker-compose.prod.yml up -d
```

### Success Criteria
- [ ] `git remote -v` shows `brad-os.git`
- [ ] `pwd` shows `/Users/bradcarter/Documents/Dev/brad-os`
- [ ] Dev server starts without "database not found" errors
- [ ] Production backup file exists and is valid SQLite
- [ ] Production app starts and loads existing data
- [ ] API endpoint returns expected data count

---

## Testing Strategy

### Automated (Phase 4)
- `npm run typecheck` - TypeScript compilation
- `npm run lint` - legacy linter
- `npm test` - Unit tests (vitest)
- `npm run test:e2e` - E2E tests (Playwright)

### Manual (Phase 5)
- Start dev server: `npm run dev`
- Verify existing workout data loads
- Create a test workout, verify it saves
- Check production app loads after DB migration

---

## Rollback

**Before commit:**
```bash
git checkout -- .
npm install
```

**After database rename:**
```bash
mv brad-os.db lifting.db
```

---

## References

- Root package.json: `/Users/bradcarter/Documents/Dev/lifting/package.json`
- DB config: `/Users/bradcarter/Documents/Dev/lifting/packages/server/src/db/index.ts`
- Docker dev: `/Users/bradcarter/Documents/Dev/lifting/docker-compose.yml`
- Docker prod: `/Users/bradcarter/Documents/Dev/lifting/docker-compose.prod.yml`
