# Rewrite README.md Architecture and Development Sections

**Why**: The README.md architecture section references `packages/server/` (Express + SQLite) and `packages/shared/` — neither exists. The backend is Firebase Cloud Functions at `packages/functions/` with Firestore. The iOS build command uses `-workspace` and `-sdk iphonesimulator`, both wrong (project uses `-project` and the `-sdk` flag breaks the watchOS companion build). These stale references mislead anyone (human or agent) reading the README as their first entry point.

---

## What

Rewrite two sections of `README.md` and fix the iOS build command:

### 1. Replace the Architecture section (lines 44–48)

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
├── ios/BradOS/          # Native SwiftUI iOS app (XcodeGen project)
│   ├── BradOS/          # Main app target
│   ├── BradOSCore/      # Shared framework (models, services)
│   ├── BradOSWatch/     # watchOS companion
│   ├── BradOSWidget/    # Home screen widgets
│   └── project.yml      # XcodeGen spec
├── packages/functions/  # Firebase Cloud Functions (Express + Firestore)
│   └── src/
│       ├── routes/      # Express route handlers
│       ├── schemas/     # Zod validation schemas
│       ├── types/       # Shared TypeScript types
│       └── services/    # Business logic
├── docs/                # Conventions, architecture maps, guides
└── scripts/             # Dev tooling (validate, seed, lint)
```

- **iOS App** — SwiftUI app with shared APIClient, App Check auth, and HealthKit integration
- **Cloud Functions** — Express APIs deployed as Firebase Cloud Functions, backed by Firestore
- **Emulators** — Local dev uses Firebase emulator suite (Functions on :5001, Firestore on :8080)
```

This replaces the three stale bullet points with an accurate tree and description. Key corrections:
- `packages/server/` → `packages/functions/` (Firebase Cloud Functions, not a standalone Express server)
- `packages/shared/` removed (doesn't exist; types/schemas live inside `packages/functions/src/`)
- Adds iOS sub-targets (BradOSCore, BradOSWatch, BradOSWidget) that actually exist
- Adds the local emulator workflow which is how development actually works

### 2. Fix the iOS App section (lines 64–73)

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

See **[iOS Build and Run](docs/guides/ios-build-and-run.md)** for the full guide.

```bash
# Generate Xcode project from project.yml
cd ios/BradOS && xcodegen generate && cd ../..

# Build for simulator
xcodebuild -project ios/BradOS/BradOS.xcodeproj \
  -scheme BradOS \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -derivedDataPath ~/.cache/brad-os-derived-data \
  -skipPackagePluginValidation \
  build

# Install and launch
xcrun simctl install booted ~/.cache/brad-os-derived-data/Build/Products/Debug-iphonesimulator/BradOS.app
xcrun simctl launch booted com.bradcarter.brad-os
```
```

Key corrections:
- `-workspace ios/BradOS/BradOS.xcworkspace` → `-project ios/BradOS/BradOS.xcodeproj` (per `docs/conventions/ios-swift.md`)
- Remove `-sdk iphonesimulator` (breaks watchOS companion build, per `docs/guides/ios-build-and-run.md`)
- Add `-derivedDataPath` and `-skipPackagePluginValidation` (required for SwiftLint SPM plugin)
- Add XcodeGen step before building (project is generated from `project.yml`)
- Add simctl install/launch commands (the README stopped at `build` without showing how to actually run the app)
- Link to the full iOS Build and Run guide

### 3. Development section is already mostly correct — leave as-is

The current Development section (lines 52–62) already has `npm run validate`, `npm run emulators`, and correct command descriptions. The previous plan already fixed this section. No changes needed here.

---

## Files

### `README.md` (MODIFY)

Three changes:

1. **Replace lines 44–48** (Architecture section) with the tree diagram and corrected bullet points shown above.

2. **Replace lines 64–73** (iOS App section) with the corrected build commands shown above, including XcodeGen step, `-project` flag, no `-sdk` flag, `-derivedDataPath`, `-skipPackagePluginValidation`, simctl commands, and a link to the full guide.

3. **No changes to other sections.** The Features section, Screenshots section, and Development section are not in scope for this task.

**No other files are created or modified.** This is a single-file documentation fix.

---

## Tests

This is a documentation-only change — no application code is modified. No vitest unit tests are needed.

**Verify no existing tests break** by running `npm run validate` after making changes. The architecture linter checks for broken internal references, so confirm it passes.

---

## QA

### 1. Validate the build still passes
```bash
npm run validate
# All checks should pass — this is a docs-only change
```

### 2. Verify the new Architecture section matches reality
```bash
# Every path referenced in the tree must exist:
ls ios/BradOS/BradOS/           # Main app target
ls ios/BradOS/BradOSCore/       # Shared framework
ls ios/BradOS/BradOSWatch/      # watchOS companion
ls ios/BradOS/BradOSWidget/     # Widget target
ls ios/BradOS/project.yml       # XcodeGen spec
ls packages/functions/src/routes/
ls packages/functions/src/schemas/
ls packages/functions/src/types/
ls packages/functions/src/services/
ls docs/
ls scripts/

# These stale paths must NOT exist:
ls packages/server/ 2>&1 | grep "No such file"   # Should not exist
ls packages/shared/ 2>&1 | grep "No such file"   # Should not exist
```

### 3. Verify the iOS build command is correct
Cross-check against `docs/guides/ios-build-and-run.md` and `docs/conventions/ios-swift.md`:
- Uses `-project` (not `-workspace`) ✓
- No `-sdk iphonesimulator` flag ✓
- Has `-derivedDataPath ~/.cache/brad-os-derived-data` ✓
- Has `-skipPackagePluginValidation` ✓
- XcodeGen generate step before build ✓
- simctl install/launch with correct bundle ID `com.bradcarter.brad-os` ✓

### 4. Verify internal links resolve
```bash
ls docs/guides/ios-build-and-run.md       # Link from iOS App section
ls docs/guides/local-dev-quickstart.md    # Link from Development section
```

### 5. Verify stale references are fully removed
```bash
# Search for any remaining stale references in README.md:
grep -n "packages/server" README.md       # Should return nothing
grep -n "packages/shared" README.md       # Should return nothing
grep -n "SQLite" README.md                # Should return nothing
grep -n "xcworkspace" README.md           # Should return nothing
grep -n "\-sdk iphonesimulator" README.md # Should return nothing
```

### 6. Diff review
```bash
git diff main --stat
# Expected: 1 file changed
#   README.md (modified)

git diff main
# Review every changed line
```

---

## Conventions

1. **CLAUDE.md — Worktree workflow**: Make all changes in a git worktree, not directly on main.
2. **CLAUDE.md — Validation**: Run `npm run validate` before committing.
3. **CLAUDE.md — Subagent usage**: Run validation in a subagent to conserve context.
4. **CLAUDE.md — Self-review**: `git diff main` to review every changed line before committing.
5. **CLAUDE.md — QA**: Exercise what you built — verify paths exist, stale references are gone, commands match the real guides.
6. **docs/conventions/ios-swift.md**: Use `-project` not `-workspace`; bundle ID is `com.bradcarter.brad-os`.
7. **docs/guides/ios-build-and-run.md**: Do NOT pass `-sdk`; DO pass `-skipPackagePluginValidation`.
