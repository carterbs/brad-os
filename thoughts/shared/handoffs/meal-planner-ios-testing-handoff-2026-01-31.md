# Meal Planner iOS E2E Testing Handoff

## Your Role

You are an **iOS Simulator QA tester**. Your job is to test the meal planner feature end-to-end on the iOS Simulator against the local Firebase Emulator. You use the iOS Simulator MCP tools (`ui_describe_all`, `ui_tap`, `ui_swipe`, `ui_type`, `screenshot`, `ui_view`) to interact with the app.

## Prerequisites

Before you can test, the following must be running:

### 1. Firebase Emulator (with OpenAI key + data)

```bash
cd /Users/bradcarter/Documents/Dev/brad-os

# Start emulator with OpenAI API key for critique endpoint
export OPENAI_API_KEY=$(cat .secret.local | cut -d= -f2)
npx firebase emulators:start
```

Wait for emulator to be ready (you'll see "All emulators ready" in the output).

Then in a **separate terminal**, populate the emulator with meal data:

```bash
cd /Users/bradcarter/Documents/Dev/brad-os

# Migrate meals, ingredients, recipes, conversations to Firestore
FIRESTORE_EMULATOR_HOST=localhost:8080 npx tsx packages/functions/src/scripts/migrate-mealplanner.ts

# Assign store sections to ingredients (needed for shopping list)
FIRESTORE_EMULATOR_HOST=localhost:8080 npx tsx scripts/assign-store-sections.ts
```

**Emulator ports:**
| Service | Port |
|---------|------|
| Functions | 5001 |
| Firestore | 8080 |
| Hosting | 5002 |
| Emulator UI | 4000 |

The iOS app connects to `http://localhost:5002/api/dev` when in emulator mode.

### 2. Build and Install the iOS App

The app must be built from the `meal-plan-ios` worktree (or from main after merge):

```bash
cd /Users/bradcarter/Documents/Dev/lifting-worktrees/meal-plan-ios

# Build for simulator
xcodebuild -workspace ios/BradOS/BradOS.xcworkspace \
  -scheme BradOS \
  -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -derivedDataPath ./build/ios \
  build

# Install on booted simulator
xcrun simctl install booted ./build/ios/Build/Products/Debug-iphonesimulator/BradOS.app

# Launch with USE_EMULATOR=true so it hits localhost instead of cloud
SIMCTL_CHILD_USE_EMULATOR=true xcrun simctl launch booted com.bradcarter.brad-os
```

**Important:** The `SIMCTL_CHILD_USE_EMULATOR=true` prefix is required. Without it, the app hits the cloud dev API instead of the local emulator. The `SIMCTL_CHILD_` prefix gets stripped and the app sees `USE_EMULATOR=true` via `ProcessInfo.processInfo.environment`.

### 3. Verify Emulator Connection

After the app launches, navigate to any existing feature (e.g., Activities > Lifting) to confirm the app can talk to the emulator. If you see data loading, the connection works. If you see errors, the emulator may not be running or the app wasn't launched with the emulator flag.

## Test Plan

### Test 1: Navigate to Meal Plan

1. From the home screen, tap the **Activities** tab (bottom nav)
2. Look for the **Meal Plan** card (fork.knife icon, amber color)
3. Tap it
4. **Expected**: You see the "Weekly Meal Plan" empty state with a "Generate Plan" button
5. Take a screenshot for verification

### Test 2: Generate a Meal Plan

1. Tap the **"Generate Plan"** button
2. **Expected**: Loading spinner appears ("Generating meal plan...")
3. Wait for the plan to load (may take a few seconds for algorithmic generation)
4. **Expected**: A 7-day grid appears with meals for breakfast, lunch, dinner
5. Verify all 7 days are populated (Monday through Sunday)
6. Verify each day has 3 meal slots (breakfast, lunch, dinner)
7. Friday dinner should show "Eating out" or similar (built into the generation algorithm)
8. Take a screenshot of the full plan

### Test 3: Send a Critique

1. Below the grid, find the critique input area
2. Tap the text field and type: `Swap Monday dinner for something easier`
3. Tap the **Send** button (or press return)
4. **Expected**: The send button shows a spinner while processing
5. Wait for the response (this calls OpenAI, may take 5-15 seconds)
6. **Expected after response**:
   - The Monday dinner cell briefly highlights **green** (changed slot animation)
   - The grid updates with a new Monday dinner meal
   - An explanation appears in the conversation area (e.g., "I've swapped Monday dinner to...")
   - The green highlight fades after ~2 seconds
7. Take a screenshot showing the updated plan and explanation

### Test 4: Send Another Critique (Multi-Turn)

1. Type another critique: `Make Tuesday and Wednesday lunches lower effort`
2. Send it
3. **Expected**:
   - Multiple cells may highlight green (Tuesday lunch, Wednesday lunch)
   - The plan updates with easier lunch options
   - The conversation history shows both your messages and the AI responses
   - The previous critique and response should still be visible above the new one
4. Verify the conversation history is scrollable if it grows long

### Test 5: View Shopping List

1. Look for the **Plan / Shopping** segment toggle (should be near the top of the session content)
2. Tap **"Shopping"**
3. **Expected**: A sectioned shopping list appears, grouped by store section (Produce, Dairy & Eggs, Meat & Seafood, etc.)
4. Each section shows ingredient names with quantities
5. Pantry Staples section (if present) should show "(you may already have these)"
6. Look for a **"Copy to Clipboard"** button
7. Take a screenshot of the shopping list

### Test 6: Copy Shopping List

1. Tap the **"Copy to Clipboard"** button
2. **Expected**: The button briefly changes to show "Copied!" with a checkmark
3. After ~2 seconds it reverts to the normal copy button state

### Test 7: Switch Back to Plan View

1. Tap the **"Plan"** segment
2. **Expected**: The meal plan grid reappears with the latest version (after critiques)
3. The critique input should still be available

### Test 8: Finalize the Plan

1. Scroll down to find the **"Finalize Plan"** button
2. Tap it
3. **Expected**:
   - A "Plan Finalized" badge appears (green checkmark seal)
   - The critique input disappears
   - A "Start New Plan" button appears instead
4. The shopping list should still be viewable (tap Shopping segment)
5. Take a screenshot of the finalized state

### Test 9: Start a New Plan

1. Tap **"Start New Plan"**
2. **Expected**: Returns to the empty state with the "Generate Plan" button
3. The previous session should be cleared

### Test 10: Session Persistence (if time permits)

1. Generate a new plan (don't finalize)
2. Kill the app (press Home, then swipe up to close)
3. Relaunch the app: `SIMCTL_CHILD_USE_EMULATOR=true xcrun simctl launch booted com.bradcarter.brad-os`
4. Navigate back to Meal Plan
5. **Expected**: The in-progress plan should reload from the server (session ID saved in UserDefaults)

## Known Issues / Things to Watch For

- **OpenAI latency**: Critique requests hit OpenAI and may take 5-15 seconds. The UI should show a loading state during this time.
- **First emulator start**: If the emulator has no data (no `emulator-data/` directory), the migration script MUST run before testing. After the emulator exits, it exports to `emulator-data/` so subsequent starts will have the data.
- **Shopping list requires recipe data**: The shopping list depends on ingredients and recipes being populated in Firestore. If the migration didn't run, the shopping list will be empty.
- **Green highlight timing**: The changed-cell highlight clears after 2 seconds. It may be subtle — look for a green-tinted background on the affected cells.
- **Friday dinner**: The generation algorithm intentionally sets Friday dinner to "Eating out" (null meal). This should show as a dash or "—" in the grid.

## Reporting

After testing, report:

1. **Pass/Fail** for each test
2. **Screenshots** taken at each checkpoint
3. **Any bugs found** — describe what happened vs. what was expected
4. **Any UI/UX issues** — things that look wrong, confusing, or could be improved
5. **Console messages** if you see errors (check browser console at localhost:4000 for emulator logs)
