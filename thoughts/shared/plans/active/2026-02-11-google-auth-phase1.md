# Google OAuth Authentication — Phase 1: Auth Gating

## Overview

Add Google Sign-In via Firebase Auth to Brad OS. Phase 1 gates the app behind authentication, verifies ID tokens on the backend, and makes `req.userId` available to all handlers. Existing data continues to work — no data model changes.

**3-phase roadmap** (only Phase 1 in this plan):
1. Auth gating (this plan)
2. Per-user data scoping (future)
3. `default-user` → authenticated UID migration (future)

## Current State

- No Firebase Auth anywhere — iOS or backend
- iOS `APIClient` sends only App Check token (`X-Firebase-AppCheck` header)
- Backend has `requireAppCheck` middleware but no auth middleware
- 4 handlers have `getUserId()` reading `x-user-id` header, falling back to `"default-user"`
- `firebase-admin` v13.6.0 installed — `firebase-admin/auth` available, no new deps needed
- `GoogleService-Info.plist` missing `CLIENT_ID`/`REVERSED_CLIENT_ID` (needs re-download after enabling Google auth)

## Desired End State

- App requires Google Sign-In before showing content
- Simulator/debug builds have a "Debug Sign-In" bypass (no real Google auth needed)
- Every API request includes `Authorization: Bearer <idToken>` header
- Backend `requireAuth` middleware verifies token, sets `req.userId`
- Emulator mode bypasses verification, sets `req.userId = 'default-user'`
- 4 handlers with `getUserId()` use `req.userId` instead of `x-user-id` header

## What We're NOT Doing

- Apple Sign-In (not needed for now)
- Per-user data scoping (Phase 2)
- Data migration (Phase 3)
- Firestore security rules changes (Admin SDK bypasses rules)
- Changes to repositories or data model

---

## Pre-requisite (Manual)

1. Enable **Authentication → Google** sign-in provider in Firebase Console (`brad-os` project)
2. Re-download `GoogleService-Info.plist` — will now include `CLIENT_ID` and `REVERSED_CLIENT_ID`
3. Replace `ios/BradOS/BradOS/GoogleService-Info.plist` with new version
4. Note the `REVERSED_CLIENT_ID` value for URL scheme config

---

## Phase 1A: Backend — Auth Middleware

### New: `packages/functions/src/middleware/require-auth.ts`

Follow `app-check.ts:1-56` pattern exactly:

```typescript
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { getAuth } from 'firebase-admin/auth';
import type { ApiError } from '../shared.js';

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export const requireAuth: RequestHandler = (req, res, next): void => {
  if (process.env['FUNCTIONS_EMULATOR'] === 'true') {
    req.userId = 'default-user';
    next();
    return;
  }

  const authHeader = req.headers['authorization'];
  if (typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    const response: ApiError = { success: false, error: { code: 'AUTH_MISSING', message: 'Missing authorization token' } };
    res.status(401).json(response);
    return;
  }

  getAuth().verifyIdToken(authHeader.slice(7))
    .then((decoded) => { req.userId = decoded.uid; next(); })
    .catch(() => {
      const response: ApiError = { success: false, error: { code: 'AUTH_INVALID', message: 'Invalid authorization token' } };
      res.status(401).json(response);
    });
};
```

### Modify: `packages/functions/src/middleware/index.ts:12`

Add export:
```typescript
export { requireAuth } from './require-auth.js';
```

### Add `requireAuth` to all handlers

Insert `app.use(requireAuth)` on the line after `app.use(requireAppCheck)` in each file:

| Handler | requireAppCheck line | Insert after |
|---|---|---|
| `exercises.ts` | line 23 | line 23 |
| `plans.ts` | line 40 | line 40 |
| `workouts.ts` | line 36 | line 36 |
| `workoutSets.ts` | line 20 | line 20 |
| `mesocycles.ts` | line 22 | line 22 |
| `stretchSessions.ts` | line 16 | line 16 |
| `meditationSessions.ts` | line 16 | line 16 |
| `stretches.ts` | line 14 | line 14 |
| `guidedMeditations.ts` | line 14 | line 14 |
| `calendar.ts` | line 18 | line 18 |
| `barcodes.ts` | line 21 | line 21 |
| `meals.ts` | line 21 | line 21 |
| `mealplans.ts` | line 21 | line 21 |
| `ingredients.ts` | line 14 | line 14 |
| `recipes.ts` | line 14 | line 14 |
| `tts.ts` | line 16 | line 16 |
| `health-sync.ts` | line 30 | line 30 |
| `cycling.ts` | line 40 | line 40 |
| `cycling-coach.ts` | line 85 | line 85 |
| `today-coach.ts` | line 39 | line 39 |

Each also needs `import { requireAuth } from '../middleware/require-auth.js';` added to imports.

**Exceptions — do NOT add requireAuth:**
- `health.ts` — public health check, no App Check either
- `mealplan-debug.ts` — debug UI, no App Check either
- `strava-webhook.ts` — external webhook from Strava

### Replace `getUserId()` in 4 handlers

Replace the `getUserId` function body in each with:

```typescript
function getUserId(req: Request): string {
  return req.userId ?? 'default-user';
}
```

Files:
- `health-sync.ts:36-42`
- `cycling.ts:44-51`
- `cycling-coach.ts:91-97`
- `today-coach.ts:27-33`

### New: `packages/functions/src/middleware/require-auth.test.ts`

Tests (mock `firebase-admin/auth`):
- Missing Authorization header → 401 `AUTH_MISSING`
- Invalid/malformed token → 401 `AUTH_INVALID`
- Valid token → `req.userId` set to decoded UID, `next()` called
- Emulator mode (`FUNCTIONS_EMULATOR=true`) → `req.userId = 'default-user'`, skips verification

**Success criteria**: `npm run typecheck && npm run lint && npm test` passes

---

## Phase 1B: iOS — Auth Manager & Sign-In UI

### Modify: `ios/BradOS/project.yml`

**Packages section** (after line 15):
```yaml
GoogleSignIn:
  url: https://github.com/google/GoogleSignIn-iOS
  version: 8.0.0
```

**BradOS target dependencies** (lines 44-49, add after FirebaseAppCheck):
```yaml
- package: Firebase
  product: FirebaseAuth
- package: GoogleSignIn
  product: GoogleSignIn
- package: GoogleSignIn
  product: GoogleSignInSwift
```

**URL schemes** (lines 75-78, add to CFBundleURLSchemes array):
```yaml
CFBundleURLSchemes:
  - brados
  - $(REVERSED_CLIENT_ID)  # or hardcode the actual value from GoogleService-Info.plist
```

### New: `ios/BradOS/BradOS/Services/AuthManager.swift`

Model after `StravaAuthManager.swift:84-100`:

```swift
import Foundation
import FirebaseAuth
import GoogleSignIn
import GoogleSignInSwift

@MainActor
final class AuthManager: ObservableObject {
    @Published var isSignedIn: Bool = false
    @Published var isLoading: Bool = true  // true during initial check
    @Published var userDisplayName: String?
    @Published var userEmail: String?
    @Published var userPhotoURL: URL?
    @Published var error: String?

    private var authStateListener: AuthStateDidChangeListenerHandle?

    init() {
        #if DEBUG && targetEnvironment(simulator)
        // Check if debug bypass was previously used
        if UserDefaults.standard.bool(forKey: "debugSignIn") {
            isSignedIn = true
            userDisplayName = "Debug User"
            userEmail = "debug@brad-os.dev"
            isLoading = false
            return
        }
        #endif

        authStateListener = Auth.auth().addStateDidChangeListener { [weak self] _, user in
            Task { @MainActor in
                self?.isSignedIn = user != nil
                self?.userDisplayName = user?.displayName
                self?.userEmail = user?.email
                self?.userPhotoURL = user?.photoURL
                self?.isLoading = false
            }
        }
    }

    func signInWithGoogle() async throws {
        guard let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
              let rootVC = windowScene.windows.first?.rootViewController else {
            throw AuthError.noRootViewController
        }
        let result = try await GIDSignIn.sharedInstance.signIn(withPresenting: rootVC)
        guard let idToken = result.user.idToken?.tokenString else {
            throw AuthError.missingIDToken
        }
        let credential = GoogleAuthProvider.credential(
            withIDToken: idToken,
            accessToken: result.user.accessToken.tokenString
        )
        try await Auth.auth().signIn(with: credential)
    }

    #if DEBUG && targetEnvironment(simulator)
    func signInAsDebugUser() {
        UserDefaults.standard.set(true, forKey: "debugSignIn")
        isSignedIn = true
        userDisplayName = "Debug User"
        userEmail = "debug@brad-os.dev"
    }
    #endif

    func signOut() throws {
        try Auth.auth().signOut()
        GIDSignIn.sharedInstance.signOut()
        #if DEBUG && targetEnvironment(simulator)
        UserDefaults.standard.removeObject(forKey: "debugSignIn")
        #endif
        // Auth state listener will update isSignedIn
    }
}

enum AuthError: Error, LocalizedError {
    case noRootViewController
    case missingIDToken
    case notSignedIn

    var errorDescription: String? {
        switch self {
        case .noRootViewController: return "Unable to find root view controller"
        case .missingIDToken: return "Google Sign-In did not return an ID token"
        case .notSignedIn: return "Not signed in"
        }
    }
}
```

### New: `ios/BradOS/BradOS/Views/Auth/SignInView.swift`

- Aurora glass background
- App logo/title
- "Sign in with Google" button
- `#if DEBUG && targetEnvironment(simulator)` → additional "Debug Sign-In" button
- Error display
- Uses `@EnvironmentObject var authManager: AuthManager`

### Modify: `ios/BradOS/BradOS/App/BradOSApp.swift`

**Imports** (add after line 6):
```swift
import FirebaseAuth
import GoogleSignIn
```

**StateObject** (add after line 10):
```swift
@StateObject private var authManager = AuthManager()
```

**Body** (replace ContentView at ~line 49-73 with auth gate):
```swift
Group {
    if authManager.isLoading {
        ProgressView()
    } else if authManager.isSignedIn {
        ContentView()
            // ... existing environmentObjects ...
            .environmentObject(authManager)
    } else {
        SignInView()
            .environmentObject(authManager)
    }
}
```

**Deep link handler** (add at top of `handleDeepLink` at line 76):
```swift
GIDSignIn.sharedInstance.handle(url)
```

### Modify: `ios/BradOS/BradOS/Services/APIClient.swift`

In `performDataTask()`, after App Check token block (after line ~180), before logging:

```swift
// Attach Firebase Auth token (skip in debug bypass mode)
if let currentUser = Auth.auth().currentUser {
    do {
        let idToken = try await currentUser.getIDToken()
        request.setValue("Bearer \(idToken)", forHTTPHeaderField: "Authorization")
    } catch {
        print("⚠️ [APIClient] Failed to get auth token: \(error.localizedDescription)")
    }
}
// Note: In debug bypass mode, Auth.auth().currentUser is nil.
// No Authorization header sent → backend emulator bypass sets userId = 'default-user'.
```

### Modify: `ios/BradOS/BradOS/Views/Profile/ProfileView.swift`

Add account section at top of the VStack (before `cyclingSection`):
- User photo (AsyncImage), display name, email
- "Sign Out" button
- Uses `@EnvironmentObject var authManager: AuthManager`

**Success criteria**: `xcodegen generate` + `xcodebuild` succeeds, app launches with SignInView

---

## Testing Strategy

### Automated (Backend)
- `require-auth.test.ts` — middleware unit tests
- All existing handler tests continue to pass (emulator mode sets `req.userId = 'default-user'`)
- `npm run typecheck && npm run lint && npm test`

### Automated (iOS)
- `xcodegen generate && xcodebuild` compiles cleanly

### Manual (Simulator)
1. Launch app → see SignInView with "Debug Sign-In" button
2. Tap "Debug Sign-In" → ContentView appears
3. Kill + relaunch → session persists (UserDefaults)
4. All features work (exercises, workouts, health data, cycling, etc.)
5. Profile → "Sign Out" → returns to SignInView
6. Relaunch → SignInView (session cleared)

### Manual (Physical Device — later)
1. Launch app → see SignInView with "Sign in with Google" button
2. Tap → Google OAuth flow → ContentView
3. Verify API calls include Authorization header
4. Verify session persistence across app restarts

---

## Key Files Reference

| File | Role |
|---|---|
| `packages/functions/src/middleware/app-check.ts` | Pattern to follow for require-auth |
| `packages/functions/src/middleware/index.ts:12` | Add requireAuth export |
| `ios/BradOS/BradOS/Services/StravaAuthManager.swift` | Pattern for AuthManager |
| `ios/BradOS/BradOS/App/BradOSApp.swift:10-91` | Auth gate + deep link handler |
| `ios/BradOS/BradOS/Services/APIClient.swift:166-194` | Authorization header insertion point |
| `ios/BradOS/project.yml:10-15,44-49,75-78` | SPM deps + URL schemes |
| `ios/BradOS/BradOS/Views/Profile/ProfileView.swift:32` | Account section insertion point |
