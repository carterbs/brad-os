# Title
Add missing Firestore repository unit tests for guided meditation, barcode, and meal-plan sessions

## Why
These are the only production repositories in `packages/functions/src/repositories/` (excluding `index.ts` and `base.repository.ts`) that currently have no unit tests. Adding them closes the repository test gap and protects CRUD/query behavior used by meditation and meal-planning handlers.

## What
Implement three new repository test files that follow the existing repository test harness pattern (`createFirestoreMocks`, `setupFirebaseMock`, `createMockDoc`, `createMockQuerySnapshot`, `createMockQuery`) and cover both custom methods and inherited `BaseRepository` behaviors.

1. Cover all methods in `GuidedMeditationRepository`:
- `create(data: CreateGuidedMeditationScriptDTO): Promise<GuidedMeditationScript>`
- `findAll(): Promise<GuidedMeditationScript[]>`
- `findAllByCategory(category: string): Promise<Omit<GuidedMeditationScript, 'segments' | 'interjections'>[]>`
- `getCategories(): Promise<GuidedMeditationCategory[]>`
- `update(id: string, data: Partial<CreateGuidedMeditationScriptDTO>): Promise<GuidedMeditationScript | null>`
- `seed(scripts: CreateGuidedMeditationScriptDTO[]): Promise<GuidedMeditationScript[]>`
- inherited behavior exercised via `findById` and `delete`

2. Cover all methods in `BarcodeRepository`:
- `create(data: CreateBarcodeDTO): Promise<Barcode>` (including `sort_order` default)
- `findAll(): Promise<Barcode[]>`
- inherited `findById`, `update`, and `delete` from `BaseRepository`

3. Cover all methods in `MealPlanSessionRepository`:
- `create(data: CreateMealPlanSessionDTO): Promise<MealPlanSession>`
- `findAll(): Promise<MealPlanSession[]>`
- `appendHistory(sessionId: string, message: ConversationMessage): Promise<MealPlanSession | null>`
- `updatePlan(sessionId: string, entries: MealPlanEntry[]): Promise<MealPlanSession | null>`
- `applyCritiqueUpdates(sessionId: string, userMessage: ConversationMessage, assistantMessage: ConversationMessage, updatedPlan: MealPlanEntry[]): Promise<void>`
- inherited `findById`, `update`, and `delete`

4. Mocking specifics to include in implementation:
- Keep `vi.resetModules()` + dynamic import in `beforeEach` so `vi.doMock` is applied before repository module load.
- For `guided-meditation.repository.ts` (imports `randomUUID` from `'crypto'`), use `vi.doMock('crypto', () => ({ randomUUID: vi.fn(...) }))`.
- For `mealplan-session.repository.ts`, mock `FieldValue.arrayUnion` from `firebase-admin/firestore` (via `vi.doMock` or spy) and assert it is called with expected message arguments.
- For `seed()` tests, override `mockDb.batch` and `mockCollection.doc` to return deterministic generated doc refs and validate `batch.set`/`batch.commit` calls.

## Files
Create the following files only:

- `packages/functions/src/repositories/guided-meditation.repository.test.ts`
  - Repository test suite using `packages/functions/src/test-utils/index.ts` helpers.
  - Covers create/query/update/seed paths, category aggregation, and base `findById`/`delete` behavior.
  - Includes deterministic UUID mocking for segment ID generation.

- `packages/functions/src/repositories/barcode.repository.test.ts`
  - Repository test suite using `packages/functions/src/test-utils/index.ts` helpers.
  - Covers barcode creation, default `sort_order`, ordered listing, and inherited base CRUD behavior (`findById`, `update`, `delete`).

- `packages/functions/src/repositories/mealplan-session.repository.test.ts`
  - Repository test suite using `packages/functions/src/test-utils/index.ts` helpers.
  - Covers session creation/listing, history append, plan updates, critique update path, and inherited base CRUD behavior.
  - Verifies `FieldValue.arrayUnion` usage for history mutations.

Do not modify repository source files unless a test reveals a real defect.

## Tests
Write tests with explicit assertions for each behavior below.

1. `guided-meditation.repository.test.ts`
- `create`
  - writes full script payload with `created_at`/`updated_at`.
  - generates segment `id` values via mocked UUIDs.
  - returns generated document `id`.
- `findAll`
  - calls `orderBy('orderIndex')` and returns mapped docs.
  - returns `[]` for empty snapshot.
- `findAllByCategory`
  - calls `where('category', '==', category)` then `orderBy('orderIndex')`.
  - returns lightweight projection without `segments`/`interjections`.
- `getCategories`
  - aggregates counts across repeated categories.
  - returns `[]` for no scripts.
- `update`
  - returns `null` when script does not exist.
  - returns existing entity and skips `doc.update` when payload has no defined fields.
  - updates scalar fields + `updated_at`.
  - regenerates segment IDs when `segments` is provided.
- `seed`
  - uses `db.batch()` and commits exactly once.
  - calls `batch.set` once per input script.
  - returns created scripts with generated doc IDs.
  - adds timestamps and generated segment IDs to seeded payloads.
- inherited
  - `findById` returns entity and returns `null` for missing doc.
  - `delete` returns `true` for existing doc and `false` for missing doc.

2. `barcode.repository.test.ts`
- `create`
  - writes expected fields and timestamps.
  - defaults `sort_order` to `0` when omitted.
  - preserves provided `sort_order` when present.
- `findAll`
  - calls `orderBy('sort_order')` and maps docs.
  - returns `[]` for empty snapshot.
- inherited
  - `findById` found/not-found behavior.
  - `update` updates defined fields and injects `updated_at`.
  - `update` returns existing entity when no fields supplied.
  - `delete` true/false behavior.

3. `mealplan-session.repository.test.ts`
- `create`
  - writes `plan`, `meals_snapshot`, `history`, `is_finalized`, plus timestamps.
  - returns generated document ID.
- `findAll`
  - calls `orderBy('created_at', 'desc')` and maps docs.
  - returns `[]` for empty snapshot.
- `appendHistory`
  - returns `null` and does not call update when session missing.
  - calls `FieldValue.arrayUnion(message)` and updates `updated_at` when found.
  - returns refreshed entity from second read.
- `updatePlan`
  - returns `null` when missing.
  - updates `plan` + `updated_at` and returns refreshed entity when found.
- `applyCritiqueUpdates`
  - calls one `doc.update` with `FieldValue.arrayUnion(userMessage, assistantMessage)`, `plan`, and `updated_at`.
  - resolves without return value.
- inherited
  - `findById` found/not-found behavior.
  - `update` and `delete` success + not-found paths.

## QA
After implementation, run and inspect all of the following:

1. Full validation (project-standard):
- `npm run validate`
- If failure occurs, inspect `.validate/test.log`, `.validate/typecheck.log`, and `.validate/lint.log` for root cause.

2. Confirm the three new repository suites are executed:
- `rg "guided-meditation\.repository\.test|barcode\.repository\.test|mealplan-session\.repository\.test" .validate/test.log`
- Verify each file appears with passing tests.

3. Verify repository coverage gap is closed:
- `cd packages/functions/src/repositories && for f in *.ts; do if [[ "$f" == *.test.ts || "$f" == "index.ts" || "$f" == "base.repository.ts" ]]; then continue; fi; base="${f%.ts}"; if [[ ! -f "${base}.test.ts" ]]; then echo "$f"; fi; done`
- Expected output: no lines.

4. Targeted behavior spot-check (from test names/results):
- Guided meditation segment IDs are regenerated on create/update/seed.
- Barcode `sort_order` defaults to `0`.
- Meal-plan session history updates use `FieldValue.arrayUnion` for append and critique paths.

## Conventions
Apply these project rules while implementing:

- Use Vitest with explicit imports (`describe`, `it`, `expect`, `vi`, `beforeEach`) per `docs/conventions/testing.md`.
- Do not skip/focus tests (`.skip`, `.only`, `fit`, `fdescribe`).
- Keep meaningful assertions in every test case; no placeholder tests.
- Reuse shared Firestore test helpers from `packages/functions/src/test-utils/` instead of ad-hoc inline mocks.
- Keep TypeScript strict: no `any`, prefer typed `Partial<Firestore>` / `Partial<CollectionReference>` / `Partial<DocumentReference>`.
- Follow existing naming/location pattern: `packages/functions/src/repositories/<repo>.repository.test.ts`.
- Keep repository modules imported only after `vi.doMock` setup when module-level imports (`crypto`, `firebase`) must be mocked.
