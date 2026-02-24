# Rewrite README.md to match current Firebase Functions + iOS architecture

## Why

The README's Architecture and Development sections are stale. They reference `packages/server/` (an Express + SQLite backend that no longer exists) and `packages/shared/` (removed). The actual backend is Firebase Cloud Functions at `packages/functions/`. The development commands are also wrong — `npm run dev` starts Firebase emulators, not a standalone Express server on port 3001. The `xcodebuild` invocation uses `-workspace` and `-sdk` flags that are incorrect. A new contributor (human or agent) reading the README gets a misleading picture of the project.

## What

Rewrite the **Architecture** and **Development** sections of `README.md`, update the **iOS App** section to match the current build flags from `docs/guides/ios-build-and-run.md`, and add a brief **CI** section. Keep the existing **Screenshots** and **Features** sections untouched — they're still accurate.

---

## Files

| File | Action | What changes |
|------|--------|-------------|
| `README.md` | Modify | Rewrite Architecture (lines 44-48), Development (lines 50-59), iOS App (lines 61-69); add CI section at end |

Only one file is modified. No new files are created.

---

## Detailed Changes

### 1. Architecture section (replace lines 44-48)

**Current (stale):**
```markdown
## Architecture

- **iOS App**: Native SwiftUI app at `ios/BradOS/`
- **API Server**: Express + SQLite backend at `packages/server/`
- **Shared Types**: Common schemas/types at `packages/shared/`
```

**Replace with:**
```markdown
## Architecture

```
brad-os/
├── ios/BradOS/          # Native SwiftUI app (iPhone, Apple Watch, Widget)
│   ├── BradOS/          # Main iOS app
│   ├── BradOSCore/      # Shared Swift package (models, networking)
│   ├── BradOSWatch/     # watchOS companion (workout tracking)
│   └── BradOSWidget/    # Home screen widget (meal plan)
├── packages/functions/  # Firebase Cloud Functions (Express + Firestore)
├── scripts/             # Build, validation, and tooling scripts
└── docs/                # Architecture maps, conventions, guides
```

- **iOS App** — SwiftUI targeting iPhone and Apple Watch. XcodeGen manages the project file from `project.yml`. BradOSCore is a local Swift package for shared models and the API client.
- **Backend** — Express apps deployed as Firebase Cloud Functions (Node 22). Each API domain (health, exercises, plans, mesocycles, workouts, meals, cycling, etc.) is a separate function with dev/prod variants. Firestore is the database.
- **Monorepo** — npm workspaces. TypeScript types, Zod schemas, and tests live alongside handlers in `packages/functions/src/`.
```

**Why each change matters:**
- `packages/server/` → `packages/functions/` — the server package was replaced by Firebase Functions
- `packages/shared/` removed — shared types now live inside `packages/functions/src/types/` and `packages/functions/src/schemas/`
- "Express + SQLite" → "Express + Firestore" — the database migrated from SQLite to Firestore
- Directory tree added — gives instant orientation to the monorepo layout
- Watch/Widget/Core mentioned — these targets exist and are non-obvious

### 2. Development section (replace lines 50-59)

**Current (stale):**
```markdown
## Development

```bash
npm install              # Install dependencies
npm run dev              # Start API server (port 3001)
npm run build            # Build all packages
npm run typecheck        # TypeScript compilation
npm run lint             # ESLint checks
npm run test             # Unit tests
```
```

**Replace with:**
```markdown
## Development

```bash
npm install              # Install dependencies
npm run dev              # Build functions + start Firebase emulators (Firestore, Functions, Hosting)
npm run validate         # Full check: typecheck + lint + test + architecture
npm run validate:quick   # Fast check: typecheck + lint only
npm run typecheck        # TypeScript compilation
npm run lint             # ESLint (use --fix to auto-fix)
npm test                 # Unit tests (vitest)
```

### Deploying

```bash
npm run deploy:functions:dev   # Deploy dev functions to Firebase
npm run deploy:functions:prod  # Deploy prod functions to Firebase
```
```

**Why each change matters:**
- `npm run dev` description corrected: it starts Firebase emulators, not "API server (port 3001)"
- `npm run build` removed from quick-reference: it's an intermediate step handled by `dev` and `deploy`, not a standalone developer command
- `npm run validate` added: this is the primary developer command per CLAUDE.md
- `npm run validate:quick` added: the fast alternative
- `npm test` (not `npm run test`): matches what developers actually type
- "(vitest)" added: clarifies the test runner
- Deploy commands added: these are the real deployment mechanism, not ad-hoc `npm run build`

### 3. iOS App section (replace lines 61-69)

**Current (stale):**
```markdown
## iOS App

```bash
# Build for simulator
xcodebuild -workspace ios/BradOS/BradOS.xcworkspace \
  -scheme BradOS \
  -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  build
```
```

**Replace with:**
```markdown
## iOS App

The iOS project uses [XcodeGen](https://github.com/yonaskolb/XcodeGen) — regenerate the Xcode project after changing `project.yml`:

```bash
cd ios/BradOS && xcodegen generate && cd ../..
```

Build for simulator:

```bash
xcodebuild -project ios/BradOS/BradOS.xcodeproj \
  -scheme BradOS \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -derivedDataPath ~/.cache/brad-os-derived-data \
  -skipPackagePluginValidation \
  build
```
```

**Why each change matters:**
- `-workspace` → `-project`: there is no `.xcworkspace`; the project uses `.xcodeproj` generated by XcodeGen
- `-sdk iphonesimulator` removed: this flag breaks the watchOS companion build (per `docs/guides/ios-build-and-run.md`)
- `-derivedDataPath` added: keeps build artifacts in a consistent location
- `-skipPackagePluginValidation` added: required for SwiftLint SPM build plugin in CLI builds
- XcodeGen note added: developers need to know the project file is generated, not hand-maintained

### 4. Add CI section (new, after iOS App)

```markdown
## CI

GitHub Actions runs on every push to `main` and PR:

1. **Validate** — `npm run validate` (typecheck + lint + test + architecture)
2. **Integration** — Firebase emulators + `npm run test:integration`
```

**Why:** The project has CI, and the README should mention it. This is deliberately brief — full details are in `.github/workflows/ci.yml` and CLAUDE.md.

---

## Tests

No tests are needed. This change is purely documentation — no code, types, schemas, or behavior changes.

---

## QA

### 1. Verify stale references are gone
```bash
# Must return 0 matches each:
grep -c "packages/server" README.md     # → 0
grep -c "packages/shared" README.md     # → 0
grep -c "port 3001" README.md           # → 0
grep -c "SQLite" README.md              # → 0
grep -c "xcworkspace" README.md         # → 0
grep -c "\-sdk iphonesimulator" README.md  # → 0
```

### 2. Verify every npm command exists
```bash
# Every command referenced in the Development section must exist in package.json:
for cmd in dev validate validate:quick typecheck lint test deploy:functions:dev deploy:functions:prod; do
  node -e "const pkg=require('./package.json'); if(!pkg.scripts['$cmd']) { console.error('MISSING: $cmd'); process.exit(1); }"
done
# All should pass
```

### 3. Verify directory tree matches reality
```bash
# Each directory in the tree must exist:
ls -d ios/BradOS/BradOS/
ls -d ios/BradOS/BradOSCore/
ls -d ios/BradOS/BradOSWatch/
ls -d ios/BradOS/BradOSWidget/
ls -d packages/functions/
ls -d scripts/
ls -d docs/
# All should succeed
```

### 4. Verify xcodebuild command matches the guide
```bash
# The build command in README should match docs/guides/ios-build-and-run.md
# Specifically: -project (not -workspace), no -sdk flag, has -skipPackagePluginValidation
grep "\-project ios/BradOS/BradOS.xcodeproj" README.md        # → match
grep "\-skipPackagePluginValidation" README.md                 # → match
grep "\-derivedDataPath" README.md                             # → match
```

### 5. Cross-reference with CLAUDE.md
Read both files and verify no contradictions:
- Both say `npm run dev` starts Firebase emulators ✓
- Both say vitest for tests ✓
- Both reference `npm run validate` as the primary check ✓
- Both mention the same CI jobs ✓

### 6. Markdown rendering check
Verify the markdown renders correctly — balanced code fences, the directory tree displays in a code block, and the table (if any) is well-formed. Check with `cat README.md` and visually inspect.

---

## Conventions

- **CLAUDE.md — Edit existing files**: Only `README.md` is modified. No new files created.
- **CLAUDE.md — Validation**: Run `npm run validate` before committing (though this is a docs-only change, it won't hurt).
- **CLAUDE.md — Self-review**: `git diff main` to review every changed line before committing.
- **CLAUDE.md — QA**: Exercise what you built — run the QA checks above, don't just eyeball it.
- **Agent legibility**: The README should give a correct first impression of the project. Detailed developer workflows stay in CLAUDE.md and `docs/`.
