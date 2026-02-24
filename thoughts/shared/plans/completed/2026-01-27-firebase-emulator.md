# Firebase Emulator Setup

## Goal

Add Firebase Emulators with seed data, App Check bypass, and integration tests so developers can run and test the full stack locally without deploying or hitting production Firebase.

## Value Proposition

After this setup, a developer can:
1. Run `npm run emulators` and have a working backend in seconds
2. Test iOS app against local functions (no deploy wait)
3. Run integration tests locally and in CI
4. Debug issues with real-ish data without polluting prod/dev

---

## Phase 1: Basic Emulator Configuration

### 1.1 Update firebase.json

Add emulator configuration for Functions, Firestore, and Hosting.

**File:** `firebase.json`

```json
{
  "emulators": {
    "functions": {
      "port": 5001
    },
    "firestore": {
      "port": 8080
    },
    "hosting": {
      "port": 5000
    },
    "ui": {
      "enabled": true,
      "port": 4000
    },
    "singleProjectMode": true
  }
}
```

### 1.2 Add NPM Scripts

**File:** `package.json`

```json
{
  "scripts": {
    "emulators": "firebase emulators:start --import=./emulator-data --export-on-exit=./emulator-data",
    "emulators:fresh": "firebase emulators:start",
    "emulators:seed": "npm run emulators:fresh -- --import=./seed-data"
  }
}
```

- `emulators` - Start with persisted data (auto-save on exit)
- `emulators:fresh` - Start with empty database
- `emulators:seed` - Start with seed data

### 1.3 Add .gitignore entries

**File:** `.gitignore`

```
# Firebase Emulator data (user's local state)
emulator-data/

# Keep seed data in git
!seed-data/
```

### Success Criteria - Phase 1
- [ ] `npm run emulators` starts Functions, Firestore, Hosting emulators
- [ ] Emulator UI accessible at http://localhost:4000
- [ ] Data persists between emulator restarts

---

## Phase 2: Seed Data

Create seed data so the app is immediately usable. This is the biggest value-add.

### 2.1 Create Seed Data Script

**File:** `scripts/generate-seed-data.ts`

Generate Firestore export format with:
- 5-6 default exercises (Bench Press, Squat, Deadlift, OHP, Rows, Pull-ups)
- 1 sample plan with 3 days (Push/Pull/Legs)
- 1 pending mesocycle ready to start
- A few stretch and meditation sessions for calendar data

### 2.2 Seed Data Structure

```
seed-data/
├── firestore_export/
│   └── firestore_export.overall_export_metadata
└── firebase-export-metadata.json
```

The seed data should use `emulator_` collection prefix so it doesn't conflict with dev/prod logic.

### 2.3 Update Collection Prefix for Emulator

**File:** `packages/functions/src/firebase.ts`

```typescript
export function getCollectionPrefix(): string {
  // Detect emulator
  if (process.env['FIRESTORE_EMULATOR_HOST']) {
    return 'emulator_';
  }
  // ... existing dev/prod logic
}
```

### Success Criteria - Phase 2
- [ ] `npm run emulators:seed` starts with pre-populated data
- [ ] Exercises, plans, mesocycle visible in Emulator UI
- [ ] iOS app can fetch and display seed data

---

## Phase 3: App Check Bypass in Emulator

Skip App Check verification when running in emulator mode.

### 3.1 Update App Check Middleware

**File:** `packages/functions/src/middleware/app-check.ts`

```typescript
export const requireAppCheck: RequestHandler = (req, res, next): void => {
  // Bypass App Check in emulator
  if (process.env['FUNCTIONS_EMULATOR'] === 'true') {
    next();
    return;
  }

  // ... existing verification logic
};
```

### 3.2 Log When Bypassing

Add a startup log so it's clear App Check is disabled:

```typescript
if (process.env['FUNCTIONS_EMULATOR'] === 'true') {
  console.log('⚠️  Running in emulator - App Check verification disabled');
}
```

### Success Criteria - Phase 3
- [ ] Requests to emulator succeed without App Check token
- [ ] Requests to deployed functions still require App Check
- [ ] Clear log message when running in emulator mode

---

## Phase 4: iOS Emulator Support

Allow iOS simulator to connect to local emulators.

### 4.1 Add Emulator Configuration

**File:** `ios/BradOS/BradOS/Services/APIConfiguration.swift`

```swift
enum APIConfiguration {
    case production
    case development
    case emulator  // NEW

    static var current: APIConfiguration {
        #if DEBUG
        // Check for emulator flag or use development
        if ProcessInfo.processInfo.environment["USE_EMULATOR"] == "true" {
            return .emulator
        }
        return .development
        #else
        return .production
        #endif
    }

    var baseURL: URL {
        switch self {
        case .production:
            return URL(string: "https://brad-os.web.app/api/prod")!
        case .development:
            return URL(string: "https://brad-os.web.app/api/dev")!
        case .emulator:
            return URL(string: "http://localhost:5000/api/dev")!
        }
    }
}
```

### 4.2 Skip App Check in Emulator Mode

**File:** `ios/BradOS/BradOS/Services/APIClient.swift`

```swift
// In performDataTask:
// Skip App Check for emulator (localhost)
if configuration.baseURL.host != "localhost" {
    // Attach App Check token
    do {
        let token = try await AppCheck.appCheck().token(forcingRefresh: false)
        request.setValue(token.token, forHTTPHeaderField: "X-Firebase-AppCheck")
    } catch {
        print("⚠️ Failed to get App Check token: \(error)")
    }
}
```

### 4.3 Add Xcode Scheme for Emulator

Create a new scheme "BradOS (Emulator)" that sets `USE_EMULATOR=true` environment variable.

### Success Criteria - Phase 4
- [ ] iOS simulator can connect to local emulator
- [ ] No App Check errors when using emulator
- [ ] Easy scheme switching between emulator/dev/prod

---

## Phase 5: Integration Tests

Add tests that run against the emulator for true end-to-end validation.

### 5.1 Create Integration Test Package

**File:** `packages/functions/src/__tests__/integration/`

Tests that:
- Start emulator programmatically (or expect it running)
- Make HTTP requests to emulator endpoints
- Verify responses and Firestore state

### 5.2 Sample Integration Tests

```typescript
// exercises.integration.test.ts
describe('Exercises API (Integration)', () => {
  it('should create and retrieve an exercise', async () => {
    // POST /api/dev/exercises
    const created = await fetch('http://localhost:5000/api/dev/exercises', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test Exercise', weight_increment: 5 })
    });

    expect(created.status).toBe(201);
    const { data } = await created.json();
    expect(data.name).toBe('Test Exercise');

    // GET /api/dev/exercises/:id
    const fetched = await fetch(`http://localhost:5000/api/dev/exercises/${data.id}`);
    expect(fetched.status).toBe(200);
  });
});
```

### 5.3 Add NPM Scripts

```json
{
  "scripts": {
    "test:integration": "vitest run --config vitest.integration.config.ts",
    "test:integration:watch": "vitest --config vitest.integration.config.ts"
  }
}
```

### 5.4 CI Configuration

Run integration tests in GitHub Actions:
1. Start emulator in background
2. Wait for emulator to be ready
3. Run integration tests
4. Stop emulator

### Success Criteria - Phase 5
- [ ] Integration tests pass locally with emulator running
- [ ] Integration tests run in CI
- [ ] Tests cover happy paths for all major endpoints

---

## Phase 6: Developer Experience Polish

### 6.1 Emulator Startup Script

**File:** `scripts/start-emulators.sh`

```bash
#!/bin/bash
# Build functions first, then start emulators
npm run build -w @brad-os/shared
npm run build -w @brad-os/functions
firebase emulators:start --import=./seed-data "$@"
```

### 6.2 Health Check Script

**File:** `scripts/wait-for-emulator.sh`

```bash
#!/bin/bash
# Wait for emulator to be ready (useful in CI)
until curl -s http://localhost:5000/api/dev/health > /dev/null; do
  echo "Waiting for emulator..."
  sleep 2
done
echo "Emulator ready!"
```

### 6.3 Update README

Document:
- How to start emulators
- How to run iOS against emulator
- How to run integration tests
- Seed data contents

### Success Criteria - Phase 6
- [ ] Single command to build and start emulators
- [ ] CI can wait for emulator readiness
- [ ] Clear documentation for new developers

---

## Files Changed Summary

### New Files
- `seed-data/` - Firestore seed data export
- `scripts/generate-seed-data.ts` - Seed data generator
- `scripts/start-emulators.sh` - Convenience startup script
- `scripts/wait-for-emulator.sh` - CI readiness check
- `packages/functions/src/__tests__/integration/` - Integration tests
- `vitest.integration.config.ts` - Integration test config

### Modified Files
- `firebase.json` - Add emulator configuration
- `package.json` - Add emulator scripts
- `.gitignore` - Ignore emulator-data, keep seed-data
- `packages/functions/src/firebase.ts` - Emulator collection prefix
- `packages/functions/src/middleware/app-check.ts` - Emulator bypass
- `ios/BradOS/BradOS/Services/APIConfiguration.swift` - Emulator URL
- `ios/BradOS/BradOS/Services/APIClient.swift` - Skip App Check for localhost

---

## Implementation Order

1. **Phase 1** - Get emulators running (30 min)
2. **Phase 3** - App Check bypass so we can test (15 min)
3. **Phase 2** - Seed data for immediate usability (1 hr)
4. **Phase 4** - iOS emulator support (30 min)
5. **Phase 5** - Integration tests (1-2 hr)
6. **Phase 6** - Polish and docs (30 min)

Total: ~4 hours

---

## Quick Start (After Implementation)

```bash
# Terminal 1: Start emulators with seed data
npm run emulators:seed

# Terminal 2: Run iOS app in simulator
# Select "BradOS (Emulator)" scheme in Xcode
# Build and run

# The app will connect to localhost and show seed data
```
