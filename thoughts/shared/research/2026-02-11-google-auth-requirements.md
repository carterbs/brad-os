# Research: Adding Google OAuth Authentication to Brad OS

**Date**: 2026-02-11

## Current State

Brad OS is a **single-user personal app with no authentication**. All user identification uses a hardcoded `"default-user"` fallback.

### What Exists Today
- **App Check** for API request verification (not user auth)
- **`x-user-id` header pattern** on server — infrastructure exists but iOS app doesn't send it
- **Keychain storage** for Strava OAuth tokens (reusable pattern)
- **Firestore `userId` field** on all user-scoped collections — always `"default-user"`
- **`getUserId(req)` helper** in 4 handlers (health-sync, cycling, cycling-coach, today-coach)
- **ProfileView** exists but has no user identity UI (just settings)

### What Does NOT Exist
- Firebase Auth SDK (not imported anywhere)
- Google Sign-In SDK
- Login/logout UI
- Session management / token refresh
- User profile data model (name, email, photo)
- Auth middleware on backend (only App Check)
- Firestore security rules for per-user data

---

## Changes Required

### 1. iOS App — Firebase Auth + Google Sign-In SDK

**Dependencies** (`project.yml`):
- Add `FirebaseAuth` product from existing Firebase SPM package
- Add `GoogleSignIn` + `GoogleSignInSwift` SPM packages

**App Initialization** (`BradOSApp.swift`):
- Add `GIDSignIn.sharedInstance.restorePreviousSignIn()` for session persistence
- Configure Google Sign-In with client ID from `GoogleService-Info.plist`

**New Files Needed**:
- `AuthManager.swift` — ObservableObject managing sign-in state, wrapping Firebase Auth
- `SignInView.swift` — Google Sign-In button UI (shown when not authenticated)
- Gate the main app content behind auth state

**APIClient Changes** (`APIClient.swift`):
- After App Check token attachment, also attach Firebase Auth ID token:
  ```swift
  let idToken = try await Auth.auth().currentUser?.getIDToken()
  request.setValue("Bearer \(idToken)", forHTTPHeaderField: "Authorization")
  ```
- Token auto-refreshes via Firebase SDK (1-hour expiry, SDK handles refresh)

### 2. Backend — Auth Middleware

**New middleware** (`packages/functions/src/middleware/auth.ts`):
- Verify Firebase ID token via `getAuth().verifyIdToken(token)`
- Extract `uid` from decoded token, attach to `req` (e.g., `req.userId`)
- Replace all `getUserId(req)` calls with `req.userId` from verified token
- **Remove `x-user-id` header pattern** — it's insecure (client can spoof)

**Apply to all handlers**:
- Add `requireAuth` middleware after `requireAppCheck` in every Express app
- Update the 4 handlers that currently use `getUserId()`:
  - `health-sync.ts`
  - `cycling.ts`
  - `cycling-coach.ts`
  - `today-coach.ts`
- Update handlers that DON'T currently use userId (exercises, plans, workouts, mesocycles, etc.) to scope queries by authenticated user

### 3. Firestore — Data Migration & Structure

**User-scoped data already under `/users/{userId}/`** (health, cycling):
- `dev_users/default-user/recoverySnapshots/...`
- `dev_users/default-user/hrvHistory/...`
- `dev_users/default-user/weightHistory/...`
- `dev_users/default-user/cyclingActivities/...`
- `dev_users/default-user/ftpHistory/...`
- etc.

**Flat collections NOT yet user-scoped** (workout/fitness core):
- `dev_exercises` — needs userId field or move under `/users/{uid}/exercises/`
- `dev_plans`, `dev_plan_days`, `dev_plan_day_exercises`
- `dev_mesocycles`, `dev_workouts`, `dev_workout_sets`
- `dev_stretch_sessions`, `dev_meditation_sessions`
- `dev_meals`, `dev_recipes`, `dev_ingredients`

**Migration needed for both dev and prod**:
- Add `userId` field to all flat collection documents
- Update all repository queries to filter by `userId`
- Migrate existing `default-user` data to the authenticated user's UID
- Update `firestore.indexes.json` to include `userId` in composite indexes

**Firestore security rules** (optional but recommended):
- Currently deny-all (server uses Admin SDK)
- Could add rules for direct client access later, but not required since all access goes through Cloud Functions

### 4. Repository Layer Changes

**BaseRepository** (`packages/functions/src/repositories/base.repository.ts`):
- All CRUD methods need `userId` parameter
- Queries must filter: `.where('userId', '==', userId)`
- Creates must include `userId` field
- This is a **large change** touching every repository and handler

### 5. Firebase Console Setup

- Enable Google Sign-In provider in Firebase Console > Authentication
- Add iOS client ID to allowed OAuth clients
- Update `GoogleService-Info.plist` if needed (may already have the right client ID)
- No separate dev/prod needed — Firebase Auth is project-level, same `brad-os` project

---

## Scope Assessment

### Small (iOS auth flow):
- Add SDKs, AuthManager, SignInView, attach ID tokens to APIClient
- ~5 files, well-defined

### Medium (Backend auth middleware):
- New middleware, update 4 existing getUserId handlers
- ~6 files

### Large (User-scoping all data):
- Every repository, handler, and test needs userId
- Flat collections need migration
- Firestore indexes need updating
- ~30+ files, high risk of regressions

### Migration Strategy Options:
1. **Big bang**: Add userId everywhere at once, migrate data
2. **Incremental**: Add auth but keep single-user, then gradually scope collections
3. **New user = new data**: Don't migrate, fresh start for authenticated users

---

## Key Decisions Needed

1. **Scope flat collections by userId?** Currently exercises/plans/workouts are shared. Do they become per-user?
2. **Migration strategy**: Move `default-user` data to authenticated UID, or start fresh?
3. **Incremental vs big bang**: Ship auth first (gating the app), then scope data? Or all at once?
4. **Multiple sign-in providers?** Just Google, or also Apple Sign-In (required for App Store)?
