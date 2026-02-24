# Test barcodes.ts and mealplan-debug.ts to Clear Meal Planning hasUntested Flag

## Why

The quality grading script (`scripts/update-quality-grades.ts`) detects `handlers/barcodes.ts` and `handlers/mealplan-debug.ts` as untested handler files in the Meal Planning domain. This sets `hasUntested = true`, which downgrades the base grade from A to B+ (offset by the assertion density bonus back to A currently, but fragile). Adding test files for both handlers clears the `hasUntested` flag, making the A grade structural rather than dependent on the density bonus.

## What

Add two handler test files following the established pattern in the codebase. Also add the supporting test utilities (mock repository factory and fixture) that `barcodes.test.ts` needs.

### 1. `barcodes.test.ts` — Full CRUD Handler Tests

`barcodes.ts` uses `createResourceRouter()` which generates GET /, GET /:id, POST /, PUT /:id, DELETE /:id. The test follows the exact pattern of `meals.test.ts`:
- Mock `firebase.js`, `middleware/app-check.js`, and `repositories/barcode.repository.js`
- Use `createMockBarcodeRepository()` factory (to be added)
- Use `createBarcode()` fixture (to be added)
- Use `supertest` to exercise all 5 CRUD routes
- Validate schema enforcement (barcode_type enum, hex color regex, label/value min/max length)

### 2. `mealplan-debug.test.ts` — Smoke Test for Debug UI

`mealplan-debug.ts` is a simple Express app serving static HTML on GET /. It does NOT use `stripPathPrefix`, `express.json()`, or App Check middleware. The test is minimal:
- Import `mealplanDebugApp` directly (no firebase/app-check mocks needed)
- Use `supertest` to hit GET /
- Verify 200 status, HTML content-type, and that the response contains key HTML markers

## Files

### New: `packages/functions/src/handlers/barcodes.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { Response } from 'supertest';
import {
  type ApiResponse,
  createBarcode,
  createMockBarcodeRepository,
} from '../__tests__/utils/index.js';

// Mock firebase before importing the handler
vi.mock('../firebase.js', () => ({
  getFirestoreDb: vi.fn(),
}));

// Mock app-check middleware
vi.mock('../middleware/app-check.js', () => ({
  requireAppCheck: (_req: unknown, _res: unknown, next: () => void): void => next(),
}));

// Mock the repository
const mockBarcodeRepo = createMockBarcodeRepository();

vi.mock('../repositories/barcode.repository.js', () => ({
  BarcodeRepository: vi.fn().mockImplementation(() => mockBarcodeRepo),
}));

// Import after mocks
import { barcodesApp } from './barcodes.js';

describe('Barcodes Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /barcodes', () => {
    it('should return all barcodes', async () => {
      const barcodes = [
        createBarcode({ id: '1', label: 'Costco', sort_order: 0 }),
        createBarcode({ id: '2', label: 'Gym', sort_order: 1 }),
      ];
      mockBarcodeRepo.findAll.mockResolvedValue(barcodes);

      const response = await request(barcodesApp).get('/');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: barcodes });
      expect(mockBarcodeRepo.findAll).toHaveBeenCalledTimes(1);
    });

    it('should return empty array when no barcodes exist', async () => {
      mockBarcodeRepo.findAll.mockResolvedValue([]);

      const response = await request(barcodesApp).get('/');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: [] });
    });
  });

  describe('GET /barcodes/:id', () => {
    it('should return barcode by id', async () => {
      const barcode = createBarcode({ id: 'bc-123' });
      mockBarcodeRepo.findById.mockResolvedValue(barcode);

      const response = await request(barcodesApp).get('/bc-123');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: barcode });
      expect(mockBarcodeRepo.findById).toHaveBeenCalledWith('bc-123');
    });

    it('should return 404 when barcode not found', async () => {
      mockBarcodeRepo.findById.mockResolvedValue(null);

      const response = await request(barcodesApp).get('/non-existent');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Barcode with id non-existent not found' },
      });
    });
  });

  describe('POST /barcodes', () => {
    it('should create barcode with valid data', async () => {
      const created = createBarcode({
        id: 'new-bc',
        label: 'Costco',
        value: '12345678',
        barcode_type: 'code128',
        color: '#FF5733',
        sort_order: 0,
      });
      mockBarcodeRepo.create.mockResolvedValue(created);

      const response = await request(barcodesApp).post('/').send({
        label: 'Costco',
        value: '12345678',
        barcode_type: 'code128',
        color: '#FF5733',
        sort_order: 0,
      });

      expect(response.status).toBe(201);
      expect(response.body).toEqual({ success: true, data: created });
      expect(mockBarcodeRepo.create).toHaveBeenCalledWith({
        label: 'Costco',
        value: '12345678',
        barcode_type: 'code128',
        color: '#FF5733',
        sort_order: 0,
      });
    });

    it('should return 400 for invalid barcode_type', async () => {
      const response: Response = await request(barcodesApp).post('/').send({
        label: 'Test',
        value: '123',
        barcode_type: 'invalid',
        color: '#FF5733',
      });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for invalid hex color', async () => {
      const response: Response = await request(barcodesApp).post('/').send({
        label: 'Test',
        value: '123',
        barcode_type: 'qr',
        color: 'not-a-hex',
      });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for missing label', async () => {
      const response: Response = await request(barcodesApp).post('/').send({
        value: '123',
        barcode_type: 'qr',
        color: '#FF5733',
      });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for empty label', async () => {
      const response: Response = await request(barcodesApp).post('/').send({
        label: '',
        value: '123',
        barcode_type: 'qr',
        color: '#FF5733',
      });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for negative sort_order', async () => {
      const response: Response = await request(barcodesApp).post('/').send({
        label: 'Test',
        value: '123',
        barcode_type: 'qr',
        color: '#FF5733',
        sort_order: -1,
      });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('PUT /barcodes/:id', () => {
    it('should update barcode with valid data', async () => {
      const updated = createBarcode({ id: 'bc-123', label: 'Updated' });
      mockBarcodeRepo.update.mockResolvedValue(updated);

      const response = await request(barcodesApp).put('/bc-123').send({ label: 'Updated' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: updated });
      expect(mockBarcodeRepo.update).toHaveBeenCalledWith('bc-123', { label: 'Updated' });
    });

    it('should return 404 when barcode not found', async () => {
      mockBarcodeRepo.update.mockResolvedValue(null);

      const response = await request(barcodesApp).put('/non-existent').send({ label: 'Updated' });

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Barcode with id non-existent not found' },
      });
    });

    it('should return 400 for invalid hex color in update', async () => {
      const response: Response = await request(barcodesApp).put('/bc-123').send({ color: 'bad' });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('DELETE /barcodes/:id', () => {
    it('should delete barcode successfully', async () => {
      mockBarcodeRepo.delete.mockResolvedValue(true);

      const response = await request(barcodesApp).delete('/bc-123');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: { deleted: true } });
      expect(mockBarcodeRepo.delete).toHaveBeenCalledWith('bc-123');
    });

    it('should return 404 when barcode not found', async () => {
      mockBarcodeRepo.delete.mockResolvedValue(false);

      const response = await request(barcodesApp).delete('/non-existent');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Barcode with id non-existent not found' },
      });
    });
  });
});
```

**Test count**: 15 test cases with ~45 `expect()` calls → density ~3.0x.

### New: `packages/functions/src/handlers/mealplan-debug.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { mealplanDebugApp } from './mealplan-debug.js';

describe('Meal Plan Debug Handler', () => {
  describe('GET /mealplan-debug', () => {
    it('should serve the debug UI HTML page', async () => {
      const response = await request(mealplanDebugApp).get('/');

      expect(response.status).toBe(200);
      expect(response.type).toBe('text/html');
      expect(response.text).toContain('Meal Plan Debug UI');
    });

    it('should include the generate, critique, and finalize controls', async () => {
      const response = await request(mealplanDebugApp).get('/');

      expect(response.text).toContain('generatePlan()');
      expect(response.text).toContain('sendCritique()');
      expect(response.text).toContain('finalizePlan()');
    });

    it('should include the plan table structure', async () => {
      const response = await request(mealplanDebugApp).get('/');

      expect(response.text).toContain('<th>Day</th>');
      expect(response.text).toContain('<th>Breakfast</th>');
      expect(response.text).toContain('<th>Lunch</th>');
      expect(response.text).toContain('<th>Dinner</th>');
    });
  });
});
```

**Test count**: 3 test cases with ~10 `expect()` calls → density ~3.3x.

**Note**: `mealplan-debug.ts` does NOT use Firebase, App Check, or `stripPathPrefix` — it's a standalone Express app with CORS and a single GET route. No mocks needed.

### Modified: `packages/functions/src/__tests__/utils/mock-repository.ts`

Add a `MockBarcodeRepository` interface and `createMockBarcodeRepository()` factory. The barcode repository only has the base CRUD methods (same pattern as `MockIngredientRepository`).

Insert after the existing `MockIngredientRepository` section (around line 267):

```typescript
// ============ Barcode Repository Mock ============

export interface MockBarcodeRepository extends MockBaseRepository {}

export function createMockBarcodeRepository(): MockBarcodeRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findAll: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
}
```

Also add to the `MockRepositories` interface and `createMockRepositories()` function:
- Add `barcodeRepository: MockBarcodeRepository;` to the interface
- Add `barcodeRepository: createMockBarcodeRepository(),` to the factory

### Modified: `packages/functions/src/__tests__/utils/fixtures.ts`

Add a `createBarcode()` fixture factory. Insert after the `createIngredient()` function (around line 262), before the `createMealPlanEntry()` function:

```typescript
// ============ Barcode Fixtures ============

export function createBarcode(overrides?: Partial<Barcode>): Barcode {
  return {
    id: generateId('barcode'),
    label: 'Costco Membership',
    value: '123456789012',
    barcode_type: 'code128',
    color: '#3B82F6',
    sort_order: 0,
    ...createTimestamps(),
    ...overrides,
  };
}
```

Also add `Barcode` to the import from `'../../shared.js'` at the top of the file.

## Tests

| # | File | Test Case | What It Verifies |
|---|------|-----------|-----------------|
| 1 | barcodes.test.ts | GET / returns all barcodes | findAll called, 200 response with data array |
| 2 | barcodes.test.ts | GET / returns empty array | Empty state handled correctly |
| 3 | barcodes.test.ts | GET /:id returns barcode | findById called with correct id, 200 response |
| 4 | barcodes.test.ts | GET /:id returns 404 | NotFoundError with displayName "Barcode" |
| 5 | barcodes.test.ts | POST / creates with valid data | 201 response, create called with body |
| 6 | barcodes.test.ts | POST / rejects invalid barcode_type | Zod enum validation ('code128', 'code39', 'qr') |
| 7 | barcodes.test.ts | POST / rejects invalid hex color | Zod regex validation (`/^#[0-9A-Fa-f]{6}$/`) |
| 8 | barcodes.test.ts | POST / rejects missing label | Zod required field validation |
| 9 | barcodes.test.ts | POST / rejects empty label | Zod `.min(1)` validation |
| 10 | barcodes.test.ts | POST / rejects negative sort_order | Zod `.nonnegative()` validation |
| 11 | barcodes.test.ts | PUT /:id updates successfully | 200 response, update called with id and body |
| 12 | barcodes.test.ts | PUT /:id returns 404 | NotFoundError when update returns null |
| 13 | barcodes.test.ts | PUT /:id rejects invalid color | Update schema validates optional fields |
| 14 | barcodes.test.ts | DELETE /:id deletes successfully | 200 with `{ deleted: true }` |
| 15 | barcodes.test.ts | DELETE /:id returns 404 | NotFoundError when delete returns false |
| 16 | mealplan-debug.test.ts | GET / serves HTML | 200 status, text/html content type, page title |
| 17 | mealplan-debug.test.ts | GET / includes controls | Generate, critique, finalize JavaScript functions present |
| 18 | mealplan-debug.test.ts | GET / includes table structure | Day/Breakfast/Lunch/Dinner headers present |

**Total**: 18 test cases, ~55 `expect()` calls. Density ~3.1x (well above the 2.0 threshold).

## QA

### Step 1: Run full validation

```bash
npm run validate
```

Expected: All checks pass — typecheck, lint, test, architecture. The new test files should be discovered by vitest and included in the test run. Check `.validate/test.log` to confirm both new test files appear.

### Step 2: Verify untested file detection is cleared

Run the grade script:

```bash
npx tsx scripts/update-quality-grades.ts
```

Then inspect `docs/quality-grades.md`:
- The "Untested Files" table should NO LONGER list `handlers/barcodes.ts` or `handlers/mealplan-debug.ts`
- Only `services/lifting-context.service.ts` should remain in the untested table
- The Meal Planning row should still show grade **A** and the notes should no longer mention "2 untested file(s)"
- Backend test count for Meal Planning should increase from 12 to 14

### Step 3: Verify the test assertions are meaningful

Run just the new test files to see their output:

```bash
npx vitest run packages/functions/src/handlers/barcodes.test.ts packages/functions/src/handlers/mealplan-debug.test.ts --reporter=verbose
```

Expected: All 18 tests pass. Each test should show a clear pass/fail, no skipped tests.

### Step 4: Verify barcode schema validation edge cases

In the test output, specifically confirm:
- Invalid barcode_type `'invalid'` → 400 VALIDATION_ERROR
- Non-hex color `'not-a-hex'` → 400 VALIDATION_ERROR
- Empty label `''` → 400 VALIDATION_ERROR (min(1) enforces this)
- Negative sort_order `-1` → 400 VALIDATION_ERROR (nonnegative() enforces this)

These prove the Zod schemas from `barcode.schema.ts` are correctly wired through `createResourceRouter`.

### Step 5: Self-review

```bash
git diff main --stat  # Should show 4 files: 2 new test files + 2 modified utility files
git diff main         # Review every changed line
```

Verify:
- No `any` types
- All imports explicit (vitest, supertest, shared utils)
- No `.only` or `.skip`
- Every `it()` block has at least one `expect()`
- Mock repository and fixture patterns match existing code exactly
- `ApiResponse` imported from `../tests/utils/index.js` (not inline)

## Conventions

1. **Git Worktree Workflow** — All changes in a worktree branch, not directly on main.

2. **Subagent Usage** — Run `npm run validate` in subagents to conserve context.

3. **Vitest not Jest** — Use `import { describe, it, expect, vi, beforeEach } from 'vitest'` explicitly.

4. **No `any` types** — Use `ApiResponse` from shared test utilities for supertest response typing.

5. **Handler test pattern** — Follow `meals.test.ts` exactly:
   - `vi.mock('../firebase.js')` and `vi.mock('../middleware/app-check.js')` before handler import
   - Mock repository created at module level using factory from `__tests__/utils/`
   - `vi.mock('../repositories/*.js')` with `vi.fn().mockImplementation(() => mockRepo)`
   - Handler imported AFTER all `vi.mock()` calls (vitest hoisting requirement)
   - `beforeEach(() => vi.clearAllMocks())`

6. **Shared test factories** (architecture check #16) — Use `createMockBarcodeRepository()` and `createBarcode()` from shared utils, not inline mocks.

7. **ApiResponse from shared utils** (architecture check #17) — Import `ApiResponse` from `../tests/utils/index.js`, never define inline.

8. **Test quality** (architecture check #19) — Every `it()` block must contain `expect()` assertions. No empty test bodies.

9. **No focused tests** (architecture check #18) — No `.only` or `.skip` modifiers.

10. **Fixture pattern** — `createBarcode()` follows the standard shape: generate ID with `generateId('barcode')`, provide sensible defaults, spread `createTimestamps()`, accept `Partial<Barcode>` overrides.
