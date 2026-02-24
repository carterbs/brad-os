# Plan: Stretch Session Detail Page

**Date**: 2026-01-26
**Feature**: View detailed stretch session history including individual stretches, durations, and skip status

---

## Overview

Add a detail page for viewing completed stretch sessions. When users click on a stretch activity in the calendar/history day detail dialog, they navigate to `/stretch-sessions/:id` to see:
- Session date and time
- Total duration and regions completed/skipped
- List of all stretches performed with their body region, name, duration, and completion status

---

## Current State Analysis

**What exists:**
- `stretch_sessions` table stores complete session data (`packages/server/src/db/migrations/009_create_stretch_sessions.ts:10-17`)
- `StretchSessionRecord` type with all needed fields (`packages/shared/src/types/stretching.ts`)
- `CompletedStretch` type for individual stretch details including `skippedSegments` field
- Repository method `findById(id)` already implemented (`packages/server/src/repositories/stretchSession.repository.ts`)
- API routes exist but NO single-session GET endpoint (`packages/server/src/routes/stretchSession.routes.ts`)
- Calendar `ActivityItem` component handles navigation for workouts but closes dialog for stretches (`packages/client/src/components/Calendar/ActivityItem.tsx`)
- Calendar data includes `stretchSessionId` in activity summaries (`packages/shared/src/types/calendar.ts`)

**What's missing:**
- `GET /api/stretch-sessions/:id` endpoint
- React Query hook for fetching single stretch session
- `StretchSessionDetailPage` component
- Route registration for `/stretch-sessions/:id`
- Navigation from calendar ActivityItem to stretch detail

---

## Desired End State

- User taps a stretch activity in the calendar day detail dialog
- Dialog closes and app navigates to `/stretch-sessions/:id`
- Detail page shows:
  - Header with back button and "Stretch Session" title
  - Summary card: date, time, total duration, regions completed/skipped
  - List of stretches showing: region icon/color, stretch name, duration, completion status
- User can navigate back to history page

---

## Key Decisions

### Reuse existing repository method
The `findById(id)` method already exists in the repository. We just need to expose it via an API route.

### Simple list layout (not grouped by region)
Display stretches in the order they were performed, not grouped by body region. This matches the chronological nature of the session and avoids complexity.

### Completion status indicators
- Fully completed: no indicator needed (default state)
- Partially skipped (1 segment): show "1/2" badge
- Fully skipped (2 segments): show "Skipped" badge with muted styling

### Follow existing patterns
- Route pattern: matches workout detail at `/lifting/workouts/:id`
- Page layout: follows workout detail page structure
- Back navigation: uses router history, returns to previous page

---

## What We're NOT Doing

- Stretch images on detail page (would require mapping stretchId → image URL)
- Edit or delete functionality
- Comparison between sessions
- Region grouping or collapsible sections
- Export or share functionality

---

## Implementation Approach

**TDD throughout**: Each phase writes tests first, then implementation.

```
Phase 1 (API Route)
     │
     └──→ Phase 2 (Client Hook) → Phase 3 (Detail Page) → Phase 4 (Calendar Navigation)
```

- Phase 1 is backend-only
- Phases 2-4 are frontend, sequential dependencies
- Final validation confirms full flow

**Confirmation gates**: Run `npm run validate` after each phase before proceeding.

---

## Implementation Phases

### Phase 1: API Route for Single Session

Add `GET /api/stretch-sessions/:id` endpoint.

**File**: `packages/server/src/routes/stretchSession.routes.ts`

Add route handler:
```typescript
// GET /api/stretch-sessions/:id
router.get('/:id', async (req, res, next) => {
  try {
    const session = await stretchSessionService.getById(req.params.id);
    if (!session) {
      return res.status(404).json(createErrorResponse('NOT_FOUND', 'Stretch session not found'));
    }
    res.json(createSuccessResponse(session));
  } catch (error) {
    next(error);
  }
});
```

**File**: `packages/server/src/services/stretchSession.service.ts`

Add service method:
```typescript
async getById(id: string): Promise<StretchSessionRecord | null> {
  return this.repository.findById(id);
}
```

**Tests**: Add route test verifying:
- 200 with valid ID returns session data
- 404 with invalid ID returns error

**Success**: Route tests pass, endpoint returns session data

---

### Phase 2: Client Data Layer

**File**: `packages/client/src/api/stretchSessionApi.ts`

Add API function:
```typescript
export async function getStretchSessionById(id: string): Promise<StretchSessionRecord> {
  const response = await api.get<ApiResponse<StretchSessionRecord>>(`/stretch-sessions/${id}`);
  return response.data.data;
}
```

**File**: `packages/client/src/hooks/useStretchHistory.ts`

Add React Query hook:
```typescript
export function useStretchSession(id: string) {
  return useQuery({
    queryKey: ['stretchSessions', id],
    queryFn: () => getStretchSessionById(id),
    enabled: !!id,
  });
}
```

**Tests**: Add hook test with MSW mock verifying:
- Returns session data on success
- Handles loading and error states

**Success**: Hook tests pass

---

### Phase 3: Stretch Session Detail Page

**File**: `packages/client/src/components/Stretching/StretchSessionDetailPage.tsx`

Create page component:
```typescript
export function StretchSessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: session, isLoading, error } = useStretchSession(id!);

  // Handle loading, error, not found states
  // Render session summary card
  // Render stretch list
}
```

**Subcomponents**:

`SessionSummaryCard.tsx`:
- Date formatted as "January 15, 2026"
- Time formatted as "7:30 AM"
- Duration in minutes
- Regions completed / regions skipped stats

`StretchListItem.tsx`:
- Region name with teal color indicator
- Stretch name
- Duration (60s or 120s formatted as "1 min" or "2 min")
- Completion badge if partially/fully skipped

**File**: `packages/client/src/components/App.tsx`

Add route:
```typescript
<Route path="/stretch-sessions/:id" element={<StretchSessionDetailPage />} />
```

**Styles**: Follow existing page patterns:
- Card background: `bg-white dark:bg-gray-800 rounded-lg shadow p-4`
- List items: consistent padding, border-bottom separator
- Skipped items: `opacity-60` for muted appearance

**Tests**:
- Component test: renders session data correctly
- Component test: shows skipped indicators
- Component test: handles loading state
- Component test: handles error state

**Success**: Component tests pass, page renders correctly

---

### Phase 4: Calendar Navigation Update

**File**: `packages/client/src/components/Calendar/ActivityItem.tsx`

Update click handler to navigate to stretch detail:

Current behavior:
```typescript
// Stretch: just close dialog
onClick?.();
```

New behavior:
```typescript
// Stretch: navigate to detail page
if (activity.type === 'stretch' && activity.stretchSessionId) {
  navigate(`/stretch-sessions/${activity.stretchSessionId}`);
}
onClick?.(); // Close dialog
```

**File**: `packages/shared/src/types/calendar.ts`

Verify `CalendarActivity` includes `stretchSessionId` (should already exist from current implementation).

**Tests**:
- Component test: stretch activity click navigates to detail page
- E2E test: full flow from history → click stretch → see detail

**Success**: All tests pass, navigation works end-to-end

---

## Testing Strategy

**Unit tests** (TDD, each phase):
- Route: supertest, verify response shape and 404 handling
- Hook: MSW handlers, verify query behavior
- Components: mock hook, verify render states and interactions

**E2E test** (add to `e2e/tests/calendar.spec.ts`):
1. Complete a stretch session via API
2. Navigate to History tab
3. Click on the day with the stretch
4. Click the stretch activity
5. Verify navigation to `/stretch-sessions/:id`
6. Verify session details displayed correctly
7. Click back button
8. Verify return to history page

**Manual verification**:
- Verify all stretch data displays correctly
- Test with fully completed session
- Test with session containing skipped stretches
- Test with session containing partially skipped stretches
- Verify mobile viewport layout

---

## File Changes Summary

| File | Change |
|------|--------|
| `packages/server/src/routes/stretchSession.routes.ts` | Add GET /:id route |
| `packages/server/src/services/stretchSession.service.ts` | Add getById method |
| `packages/client/src/api/stretchSessionApi.ts` | Add getStretchSessionById function |
| `packages/client/src/hooks/useStretchHistory.ts` | Add useStretchSession hook |
| `packages/client/src/components/Stretching/StretchSessionDetailPage.tsx` | New page component |
| `packages/client/src/components/Stretching/SessionSummaryCard.tsx` | New subcomponent |
| `packages/client/src/components/Stretching/StretchListItem.tsx` | New subcomponent |
| `packages/client/src/components/App.tsx` | Add route |
| `packages/client/src/components/Calendar/ActivityItem.tsx` | Update navigation |
| `ios/specs/calendar-history.md` | Already updated |

---

## References

- Stretch session types: `packages/shared/src/types/stretching.ts`
- Repository pattern: `packages/server/src/repositories/stretchSession.repository.ts`
- Calendar activity types: `packages/shared/src/types/calendar.ts`
- Workout detail page pattern: `packages/client/src/components/Lifting/WorkoutPage.tsx`
- React Query hook pattern: `packages/client/src/hooks/useStretchHistory.ts`
- Route registration: `packages/client/src/components/App.tsx`
