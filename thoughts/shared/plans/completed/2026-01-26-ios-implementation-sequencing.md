# iOS Implementation Sequencing Plan

## Overview

This document outlines the optimal sequencing strategy for implementing the 8 iOS feature plans, maximizing parallelization while respecting dependencies.

## Dependency Analysis

| Plan | Dependencies | Notes |
|------|--------------|-------|
| **API Client** | None | Foundational - all features need this |
| **Dashboard** | API Client | Uses all three API endpoints |
| **Calendar/History** | API Client | Fetches calendar data from API |
| **Exercise Library** | API Client | Full CRUD operations via API |
| **Meditation** | API Client (Phase 7 only) | Phases 1-6 are audio/state, no API |
| **Stretching** | API Client (Phase 7 only) | Phases 1-6 are audio/state, no API |
| **Profile/Settings** | API Client | Fetches mesocycle and meditation stats |
| **Workout Tracking** | API Client | Core feature, heavy API usage |

---

## Sequencing Plan (Maximum Parallelization)

### Wave 1 - Start Immediately (3 parallel tracks)

These can all begin simultaneously:

```
┌─────────────────────────────────────────────────────────────────┐
│                         WAVE 1                                  │
├───────────────────┬───────────────────┬───────────────────────┤
│   API Client      │   Meditation      │   Stretching          │
│   (All 5 Phases)  │   (Phases 1-6)    │   (Phases 1-6)        │
├───────────────────┼───────────────────┼───────────────────────┤
│ P1: Core Infra    │ P1: Persistence   │ P1: Models/Manifest   │
│ P2: Protocol/Impl │ P2: Audio Engine  │ P2: Audio System      │
│ P3: Endpoints     │ P3: Lock Screen   │ P3: Session State     │
│ P4: Mock Client   │ P4: Breathing Fix │ P4: Lock Screen       │
│ P5: Integration   │ P5: Cue Scheduling│ P5: Setup Screen      │
│                   │ P6: Lifecycle     │ P6: Crash Recovery    │
└───────────────────┴───────────────────┴───────────────────────┘
```

**Rationale:**
- **API Client**: No dependencies, must be completed for Wave 2
- **Meditation (Phases 1-6)**: Audio, persistence, and UI work that doesn't touch the server
- **Stretching (Phases 1-6)**: Audio manifest loading, AVFoundation, session state machine

---

### Wave 2 - After API Client Complete (5 parallel tracks)

Once API Client is finished, all remaining features can run in parallel:

```
┌────────────────────────────────────────────────────────────────────────────┐
│                              WAVE 2                                        │
├─────────────┬─────────────┬───────────────┬────────────┬──────────────────┤
│  Dashboard  │  Calendar   │  Exercise     │  Profile   │  Workout         │
│  (All 4)    │  History    │  Library      │  Settings  │  Tracking        │
│             │  (All 4)    │  (All 6)      │  (All 4)   │  (All 5)         │
├─────────────┴─────────────┴───────────────┴────────────┴──────────────────┤
│  + Meditation Phase 7-8 (API Integration & Polish)                        │
│  + Stretching Phase 7-8 (API Integration & Polish)                        │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Timeline

```
TIME →
────────────────────────────────────────────────────────────────────────────

WAVE 1:
  API Client      ████████████████████
  Meditation 1-6  ██████████████████████████████
  Stretching 1-6  ████████████████████████████████

                  ↓ API Client Complete

WAVE 2:
  Dashboard       ████████████████
  Calendar        ████████████████
  Exercise Lib    ██████████████████████
  Profile/Settings████████████████
  Workout Track   ██████████████████████████
  Meditation 7-8    ████████
  Stretching 7-8    ████████

────────────────────────────────────────────────────────────────────────────
```

---

## Recommended Execution Order

### If Working Sequentially (Single Developer)

1. **API Client** (required foundation)
2. **Workout Tracking** (core feature, highest value)
3. **Dashboard** (surfaces workout + other features)
4. **Exercise Library** (supports workout tracking)
5. **Calendar/History** (uses data from all features)
6. **Profile/Settings** (aggregates statistics)
7. **Meditation** (standalone feature)
8. **Stretching** (standalone feature)

### If Working in Parallel (Multiple Sessions)

**Session A (API + Core Features):**
1. API Client (Phases 1-5)
2. Workout Tracking (Phases 1-5)
3. Dashboard (Phases 1-4)

**Session B (Audio Features):**
1. Meditation (Phases 1-6)
2. Stretching (Phases 1-6)
3. Wait for API Client, then finish Phases 7-8 for both

**Session C (Supporting Features):**
1. Wait for API Client
2. Exercise Library (Phases 1-6)
3. Calendar/History (Phases 1-4)
4. Profile/Settings (Phases 1-4)

---

## Summary Table

| Feature | Phases | Parallel Group | Blocking Dependency |
|---------|--------|----------------|---------------------|
| API Client | 5 | Wave 1 | None |
| Meditation | 8 | Wave 1 (1-6), Wave 2 (7-8) | API Client for Phase 7+ |
| Stretching | 8 | Wave 1 (1-6), Wave 2 (7-8) | API Client for Phase 7+ |
| Dashboard | 4 | Wave 2 | API Client |
| Calendar/History | 4 | Wave 2 | API Client |
| Exercise Library | 6 | Wave 2 | API Client |
| Profile/Settings | 4 | Wave 2 | API Client |
| Workout Tracking | 5 | Wave 2 | API Client |

**Maximum parallelization**: 3 tracks in Wave 1, then 7 features (with 2 finishing) in Wave 2.

---

## Related Plans

- [API Client](./2026-01-26-ios-api-client.md)
- [Dashboard](./2026-01-26-ios-dashboard.md)
- [Calendar/History](./2026-01-26-ios-calendar-history.md)
- [Exercise Library](./2026-01-26-ios-exercise-library.md)
- [Meditation](./2026-01-26-ios-meditation.md)
- [Profile/Settings](./2026-01-26-ios-profile-settings.md)
- [Stretching](./2026-01-26-ios-stretching.md)
- [Workout Tracking](./2026-01-26-ios-workout-tracking.md)
