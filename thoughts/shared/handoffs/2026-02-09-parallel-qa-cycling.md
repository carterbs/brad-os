# Parallel QA: Training Block Enhancement

## Context

The training block enhancement (Phases 1-5) has been implemented and deployed:
- Backend: Peloton-aware AI coach, generate-schedule endpoint, lifting data integration
- iOS: 5-step setup wizard, session queue UI, Peloton coach card
- Functions deployed to both dev and prod
- CyclingCoachClient fixed to use APIClient (with App Check tokens)

**Commit history:**
- `5ea176d` - Backend phases 1-3
- `0a90a4d` - iOS phases 4-5
- `c34fe22` - Fix CyclingCoachClient App Check support

## Task: Parallel Multi-Simulator QA

Run 3 agents in parallel, each on a different simulator, doing thorough QA of the cycling feature against the deployed functions.

### Simulators to Use

| Agent | Simulator | UUID |
|-------|-----------|------|
| Agent 1 | iPhone 17 Pro | `F4C4FC25-2C36-4C05-AB30-FA730666CCE5` |
| Agent 2 | iPhone 17 Pro Max | `2E8054AB-8C23-4834-9C4C-0C1D2E996106` |
| Agent 3 | iPad Pro 13-inch (M5) | `18E4D1DA-485B-49D1-98F4-BF282F584295` |

### Setup Steps (EACH agent must do this)

#### 1. Boot simulator
```bash
xcrun simctl boot <UUID>
```

#### 2. Build and install
The app is already built at `build/ios/`. Just install:
```bash
xcrun simctl install <UUID> "./build/ios/Build/Products/Debug-iphonesimulator/Brad OS.app"
```

If install fails (e.g., iPad needs rebuild), rebuild:
```bash
cd ios/BradOS && xcodegen generate
xcodebuild -project BradOS.xcodeproj -scheme BradOS -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,id=<UUID>' \
  -derivedDataPath ../../build/ios build
xcrun simctl install <UUID> "../../build/ios/Build/Products/Debug-iphonesimulator/Brad OS.app"
```

#### 3. Launch app and get debug token
```bash
xcrun simctl launch --console-pty <UUID> com.bradcarter.brad-os 2>&1 | grep -i "debug token" | head -1
```

Look for a line like:
```
[AppCheckCore] App Check debug token: 'XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX'
```

Copy the UUID token value.

#### 4. Register the debug token in Firebase

Use the Firebase App Check REST API:

```bash
# Get access token (firebase CLI auth)
ACCESS_TOKEN=$(npx firebase login:ci --no-localhost 2>/dev/null || echo "need-manual-auth")

# Or use the REST API with the Firebase CLI token:
ACCESS_TOKEN=$(cat ~/.config/firebase/tokens.json 2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin).get('tokens',{}).get('access_token',''))" 2>/dev/null)

# If the above doesn't work, get a token via:
npx firebase login --reauth
```

Then register the debug token:
```bash
PROJECT_NUMBER="515156527468"
APP_ID="1:515156527468:ios:0e349d08cd3569add60b49"
DEBUG_TOKEN="<the-token-from-step-3>"

curl -X POST \
  "https://firebaseappcheck.googleapis.com/v1beta/projects/${PROJECT_NUMBER}/apps/${APP_ID}/debugTokens" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{
    \"displayName\": \"QA Agent - $(date +%Y%m%d-%H%M%S)\",
    \"token\": \"${DEBUG_TOKEN}\"
  }"
```

**If the REST API auth is too complex**, the token can also be registered manually in the Firebase Console:
1. Go to https://console.firebase.google.com/project/brad-os/appcheck
2. Click "Brad OS" iOS app
3. Click "Manage debug tokens" (overflow menu)
4. Click "Add debug token"
5. Paste the token UUID

**Note:** There's a max of 20 debug tokens per app. Clean up old ones if needed.

### Test Plan

Each agent should test ALL of the following flows:

#### A. Training Block Setup Wizard (Critical Path)
1. Activities tab > Cycling > Skip onboarding > Block tab > "Start Training Block"
2. Step 1: Select experience level + weekly hours
3. Step 2: Set sessions per week + preferred days
4. Step 3: Select training goals
5. Step 4: **Verify AI generates a plan** (this calls the deployed function)
   - Verify plan shows Peloton class types (Power Zone, HIIT & Hills, etc.)
   - Verify "Coach's Rationale" section appears with personalized text
   - Try "Regenerate" button
6. Step 5: Set start date, tap "Start Training Block"
7. Verify block is created and Block tab shows session queue

#### B. Active Training Block Views
After creating a block:
1. Block tab should show week indicator, session queue, next up card
2. Today tab should show "Next Up" card with Peloton details
3. Session queue should show correct number of sessions matching wizard selection

#### C. AI Coach Recommendation
1. Today tab > AI Coach card > "Set Up" (or if Strava connected, verify recommendation)
2. Note: Without Strava connection, the coach needs recovery data to make recommendations
3. Verify error states are clean (no raw JSON errors, no "Missing App Check token")

#### D. Edge Cases
1. Cancel wizard mid-flow, restart - state should reset
2. Change session count (e.g., 2 to 5) - preferred days should update
3. Try different experience levels and verify plan varies
4. Back button works through all wizard steps

#### E. History Tab
1. Verify empty state renders correctly
2. "Connect Strava" button is present

### Report Format

Each agent should save:
- Screenshots to `qa-screenshots/<simulator-name>/`
- Report to `thoughts/shared/qa-parallel-<simulator-name>-2026-02-09.md`

Include:
- Pass/fail for each test case
- Screenshots of any bugs
- Error messages seen
- Whether App Check is working (API calls succeed)

### Known Issues (Not Bugs)
- Strava onboarding re-triggers when switching back to Today tab (pre-existing)
- Without Strava + recovery data, AI Coach "Set Up" card shows instead of recommendations
