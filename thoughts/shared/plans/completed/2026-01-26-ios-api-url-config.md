# Plan: iOS API Base URL Configuration

## Goal

Configure the iOS app to use different API base URLs:
- **Simulator:** `localhost:3000`
- **Physical device:** `192.168.5.98:<port>`

## Current State

**File:** `ios/BradOS/BradOS/Services/APIConfiguration.swift`

| Environment | Current URL |
|-------------|-------------|
| Simulator (DEBUG) | `http://localhost:3001/api` |
| Device (DEBUG) | `http://192.168.1.100:3001/api` |
| Release | `https://api.brad-os.com/api` |

## Clarification Needed: Port Number

⚠️ **Port discrepancy detected:**

The user requested `localhost:3000`, but the API server runs on **port 3001**, not 3000:
- Port 3000 = Vite dev server (serves the PWA frontend)
- Port 3001 = Express API server (handles `/api/*` requests)

The iOS app needs to call the API server directly, so it should use **port 3001**.

**Question:** Should the simulator use `localhost:3001` (API server) or `localhost:3000` (which would require reverse proxy)?

## Proposed Changes

Assuming port 3001 is correct for the API:

### Phase 1: Update APIConfiguration.swift

```swift
// Current (line 17):
?? "http://192.168.1.100:3001/api"

// Change to:
?? "http://192.168.5.98:3001/api"
```

That's it - just one line change to update the IP address.

### If port 3000 is actually needed

If the user's setup proxies API calls through port 3000, we'd also change:

```swift
// Line 12:
let urlString = "http://localhost:3000/api"  // was 3001
```

## Implementation Steps

1. [ ] Confirm correct port (3000 vs 3001)
2. [ ] Update IP address from `192.168.1.100` to `192.168.5.98`
3. [ ] Update port if needed
4. [ ] Test on simulator
5. [ ] Test on physical device

## Files Modified

- `ios/BradOS/BradOS/Services/APIConfiguration.swift` (1 or 2 lines)
