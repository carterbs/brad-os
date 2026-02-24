# Firebase App Check Setup Guide

## Overview

Firebase App Check protects your API by verifying requests come from the legitimate iOS app. It uses Apple's DeviceCheck to cryptographically verify the app, with automatic token rotation.

```
iOS App                              Server
┌──────────────────┐                 ┌──────────────────┐
│ Firebase SDK     │                 │ Verify App Check │
│ gets App Check   │────────────────▶│ Token Middleware │
│ token auto       │  X-Firebase-    │                  │
│                  │  AppCheck       │                  │
└──────────────────┘                 └──────────────────┘
        │                                    │
        ▼                                    ▼
┌──────────────────┐                 ┌──────────────────┐
│ Apple DeviceCheck│                 │ Firebase Admin   │
│ / App Attest     │                 │ verifyToken()    │
└──────────────────┘                 └──────────────────┘
```

---

## Status

### Code Changes (COMPLETE)

| Component | File | Status |
|-----------|------|--------|
| Server middleware | `packages/server/src/middleware/app-check.ts` | Done |
| Server routes | `packages/server/src/routes/index.ts` | Done |
| iOS dependencies | `ios/BradOS/project.yml` | Done |
| iOS App Check config | `ios/BradOS/BradOS/App/BradOSApp.swift` | Done |
| iOS API client | `ios/BradOS/BradOS/Services/APIClient.swift` | Done |

### Manual Steps (YOU NEED TO DO)

| Step | Status |
|------|--------|
| Add GoogleService-Info.plist to iOS project | Pending |
| Enable App Check in Firebase Console | Pending |
| Create DeviceCheck key in Apple Developer Portal | Pending |
| Register debug tokens for simulator testing | Pending |
| Regenerate Xcode project with XcodeGen | Pending |

---

## Manual Setup Steps

### Step 1: Add GoogleService-Info.plist (Required)

Firebase requires a configuration file to work. If you don't already have one:

1. Go to [Firebase Console](https://console.firebase.google.com/) → Your Project → Project Settings
2. Under "Your apps", find your iOS app (or add one with bundle ID `com.bradcarter.brad-os`)
3. Download `GoogleService-Info.plist`
4. Add it to `ios/BradOS/BradOS/` directory
5. Update `project.yml` to include it in the target:

```yaml
targets:
  BradOS:
    sources:
      - path: BradOS
      # Add this line:
      - path: BradOS/GoogleService-Info.plist
```

### Step 2: Create DeviceCheck Key (Apple Developer Portal)

1. Go to [Apple Developer Portal](https://developer.apple.com/account/resources/authkeys/list)
2. Navigate to: Certificates, Identifiers & Profiles → Keys
3. Click the `+` button to create a new key
4. Name it something like "Brad OS DeviceCheck"
5. Enable **DeviceCheck** checkbox
6. Click Continue → Register
7. **Download the .p8 file** (you can only download it once!)
8. Note the **Key ID** shown on the page

### Step 3: Enable App Check in Firebase Console

1. Go to [Firebase Console](https://console.firebase.google.com/) → Your Project → App Check
2. Click "Get started" if prompted
3. Click on your iOS app
4. Select **DeviceCheck** as the attestation provider
5. Enter:
   - **Key ID**: From Step 2
   - **Team ID**: Your Apple Developer Team ID (found in Apple Developer Portal → Membership)
   - **Private Key**: Contents of the .p8 file from Step 2
6. Click "Save"

### Step 4: Register Debug Token (For Simulator Testing)

1. Regenerate the Xcode project:
   ```bash
   cd ios/BradOS
   xcodegen generate
   ```

2. Build and run the app in the simulator

3. Check the Xcode console for a line like:
   ```
   [AppCheckDebugProvider] Debug token: 12345678-1234-1234-1234-123456789ABC
   ```

4. Copy this token

5. In Firebase Console → App Check → Apps → Your iOS App → Manage debug tokens

6. Click "Add debug token" and paste the token

7. Give it a name like "Brad's MacBook Simulator"

**Note**: Each simulator/device needs its own debug token registered.

### Step 5: Regenerate Xcode Project

After adding `GoogleService-Info.plist`:

```bash
cd ios/BradOS
xcodegen generate
```

Open the workspace and build:
```bash
open BradOS.xcworkspace
```

---

## Testing

### Test Protected Endpoints

After setup, test that unauthorized requests are rejected:

```bash
# Should fail (no token) - returns 401
curl http://localhost:3001/api/exercises
# Expected: {"success":false,"error":{"code":"APP_CHECK_MISSING","message":"Missing App Check token"}}

# Should fail (invalid token) - returns 401
curl -H "X-Firebase-AppCheck: fake-token" http://localhost:3001/api/exercises
# Expected: {"success":false,"error":{"code":"APP_CHECK_INVALID","message":"Invalid App Check token"}}

# Health endpoint should still work (no protection)
curl http://localhost:3001/api/health
# Expected: 200 OK
```

### Test iOS App

1. Run the app in simulator (with debug token registered)
2. Perform any API operation (e.g., view workouts)
3. Should work normally - App Check token is attached automatically

4. Run on a real device
5. Should also work - uses DeviceCheck instead of debug token

---

## Troubleshooting

### "Missing Firebase configuration" error

You haven't added `GoogleService-Info.plist` to the project. Follow Step 1.

### "App Check token failed" in Xcode console

- **Simulator**: Make sure you registered the debug token in Firebase Console (Step 4)
- **Real device**: Make sure DeviceCheck is configured correctly in Firebase Console (Step 3)

### 401 errors from API

- Check that the server has valid Firebase credentials (`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`)
- Verify App Check is enabled in Firebase Console for your app
- Ensure the debug token is registered (for simulator)

### Build errors after adding Firebase

1. Clean build folder: Product → Clean Build Folder (Cmd+Shift+K)
2. Reset package caches: File → Packages → Reset Package Caches
3. Regenerate project: `xcodegen generate`

---

## Optional: Enable Enforcement

Once everything is working, you can enable App Check enforcement at the Firebase infrastructure level:

1. Firebase Console → App Check → APIs
2. Find your Cloud Functions or hosting
3. Click "Enforce"

This adds an extra layer where Firebase itself rejects invalid requests before they even reach your code.

**Recommendation**: Keep enforcement OFF during development, enable for production.

---

## Files Changed Summary

### New Files
- `packages/server/src/middleware/app-check.ts` - Server-side token verification

### Modified Files
- `packages/server/src/middleware/index.ts` - Export requireAppCheck
- `packages/server/src/routes/index.ts` - Apply middleware to protected routes
- `ios/BradOS/project.yml` - Add Firebase SDK dependency
- `ios/BradOS/BradOS/App/BradOSApp.swift` - Configure App Check at launch
- `ios/BradOS/BradOS/Services/APIClient.swift` - Attach token to requests
