# Meal-plan load performance plan

## Overview

Make cached weekly meal-plan screens render effectively immediately, while keeping forced refresh visible and bounded. Do not add minimum Cloud Function instances; three to four seconds is acceptable for a cold forced refresh.

## Current State Analysis

- Only finalized sessions are cached as renderable data.
- Draft sessions require Cloud Functions before the screen can render.
- Cache hits still start shopping-list hydration inside the awaited load method.
- Recipe data loads serially and uses a new cache object per screen.
- `/mealplans/latest` reads and parses the complete session collection.

## Desired End State

- Draft and finalized meal-plan screens restore from disk without a network request.
- The cached load method returns before ingredient or recipe requests finish.
- Refresh retains the current plan and uses a separate refresh state.
- `/mealplans/latest` reads at most one Firestore document.
- Simulator and logs demonstrate an effectively immediate cache hit and an acceptable forced refresh.

## What We're NOT Doing

- Adding `minInstances` or otherwise paying to pin Cloud Functions warm.
- Introducing Datadog into the app.
- Redesigning the meal-plan UI.
- Changing widget behavior to show draft plans.

## Implementation Approach

### Phase 1: Performance contracts

- Add tests for draft screen-cache round trips.
- Add view-model tests proving cached load returns before shopping hydration.
- Add refresh tests proving current content remains visible and usable.
- Add repository and handler tests requiring `limit(1)`.

Success criteria:

- New tests fail for the current implementation for the expected reasons.

### Phase 2: iOS cache path

- Add a separate screen-session file to `MealPlanCacheService`.
- Prefer the screen cache, falling back to the existing finalized cache for migration.
- Persist every successfully loaded screen session.
- Schedule shopping hydration outside the load critical path.
- Reuse the real API-backed recipe cache across screen reconstructions and fetch ingredients/recipes concurrently.
- Add cache-source and refresh timing logs.

Success criteria:

- Draft and finalized sessions restore without API calls.
- Cache load returns while delayed shopping hydration is still running.
- Existing content stays visible during refresh.

### Phase 3: Backend query

- Add `MealPlanSessionRepository.findLatest()` with descending order and `limit(1)`.
- Switch the latest handler to the bounded method.
- Add phase timing for the Firestore read.

Success criteria:

- Tests assert one-document query behavior and handler use.

### Phase 4: Live verification

- Build and launch the app against deployed data in the iOS simulator.
- Capture cache-hit, refresh, ingredient, and recipe timings.
- Verify the screen visually and confirm no meal-plan request occurs on a cache hit.
- Run Swift package tests, function tests, `npm run validate`, and an iOS build.

Success criteria:

- Cached plan becomes visible well under one second and the load method is no longer tied to shopping hydration.
- Forced refresh remains usable and completes in the accepted three-to-four-second range under normal cold conditions.

## Validation Results

- Simulator finalized-cache migration: 32 ms to visible.
- Simulator dedicated screen-cache loads: 32 ms, 32 ms, 41 ms, and 42 ms.
- OTel cache-hit trace: no meal-plan request; recipe and ingredient hydration ran concurrently in the background.
- Pre-deploy live forced refresh: 5,683 ms end-to-end, including 5,632 ms in the old unbounded endpoint.
- Post-deploy first-use forced refresh: 944 ms end-to-end; bounded Firestore read was 444 ms.
- Post-deploy warm forced refresh: 381 ms end-to-end; bounded Firestore read was 67 ms.
- Targeted Swift package tests: 36 passed.
- Full BradOSCore Swift package suite: 447 passed.
- Targeted Cloud Function tests: 41 passed.
- iOS simulator build: passed.
- Full repository validation: typecheck, lint, tests, and architecture passed. An initial sandboxed run blocked one Supertest loopback socket; the unrestricted validation rerun passed.
