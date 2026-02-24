# Health Sync: Raise Test Coverage Above 50%

## Why

The health sync domain currently has ~25% test coverage, triggering a one-notch penalty in the quality grading system. The handler (`health-sync.ts`) has 12 endpoints but only 5 are tested; the service (`firestore-recovery.service.ts`) exports 16 public functions but only 10 are tested. The untested code follows the exact same patterns as the tested code (HRV/RHR/Sleep are structurally identical to weight), so adding tests is straightforward replication. Getting above 50% bumps the grade from C+ to B.

## What

Add tests for the 7 untested handler endpoints and 6 untested service functions. The existing weight/recovery tests serve as the template — HRV, RHR, and Sleep follow identical patterns.

### Handler Tests to Add (in `health-sync.test.ts`)

**GET /recovery/history** (3 tests):
- Returns array of snapshots with default days (7)
- Returns array with explicit days param
- Returns empty array when no history

**GET /baseline** (2 tests):
- Returns baseline when it exists
- Returns 404 when no baseline

**POST /sync with baseline** (1 test):
- Sync with baseline provided (covers the `baselineUpdated: true` branch)

**POST /hrv/bulk** (4 tests):
- Bulk sync HRV entries successfully
- Reject empty entries array
- Reject invalid date format
- Reject out-of-range avgMs

**GET /hrv** (3 tests):
- Return HRV history when days param provided
- Return latest HRV when no days param
- Return 404 when no HRV data

**POST /rhr/bulk** (4 tests):
- Bulk sync RHR entries successfully
- Reject empty entries array
- Reject invalid date format
- Reject out-of-range avgBpm

**GET /rhr** (3 tests):
- Return RHR history when days param provided
- Return latest RHR when no days param
- Return 404 when no RHR data

**POST /sleep/bulk** (4 tests):
- Bulk sync sleep entries successfully
- Reject empty entries array
- Reject invalid date format
- Reject out-of-range totalSleepMinutes

**GET /sleep** (3 tests):
- Return sleep history when days param provided
- Return latest sleep when no days param
- Return 404 when no sleep data

### Service Tests to Add (in `firestore-recovery.service.test.ts`)

**addHRVEntries** (2 tests):
- Batches writes correctly for multiple entries
- Sets correct fields including default source 'healthkit'

**getHRVHistory** (2 tests):
- Returns HRV entries filtered by date cutoff
- Returns empty array when no entries

**addRHREntries** (2 tests):
- Batches writes correctly for multiple entries
- Sets correct fields including default source 'healthkit'

**getRHRHistory** (2 tests):
- Returns RHR entries filtered by date cutoff
- Returns empty array when no entries

**addSleepEntries** (2 tests):
- Batches writes correctly for all 9 fields
- Sets correct fields including default source 'healthkit'

**getSleepHistory** (2 tests):
- Returns sleep entries filtered by date cutoff
- Returns empty array when no entries

## Files

### Modified: `packages/functions/src/handlers/health-sync.test.ts`

Currently 312 lines with 18 tests. Add ~27 new tests (bringing total to ~45 tests).

**Step 1**: Expand the `mockRecoveryService` hoisted mock to include the missing function mocks:

```typescript
const mockRecoveryService = vi.hoisted(() => ({
  // ... existing mocks ...
  addHRVEntries: vi.fn(),
  getHRVHistory: vi.fn(),
  addRHREntries: vi.fn(),
  getRHRHistory: vi.fn(),
  addSleepEntries: vi.fn(),
  getSleepHistory: vi.fn(),
}));
```

**Step 2**: Add test sections after the existing `GET /recovery` describe block. Each follows the existing pattern exactly — use `request(healthSyncApp)`, cast `response.body as ApiResponse<T>`, assert on `response.status`, `body.success`, `body.data`, and mock call verification.

**GET /recovery/history section** — Add after line 311:

```typescript
describe('GET /recovery/history', () => {
  it('should return recovery history with default days', async () => {
    const history = [
      { date: '2026-02-09', ...snapshotFields, syncedAt: '...' },
      { date: '2026-02-08', ...snapshotFields, syncedAt: '...' },
    ];
    mockRecoveryService.getRecoveryHistory.mockResolvedValue(history);

    const response = await request(healthSyncApp).get('/recovery/history');
    const body = response.body as ApiResponse<unknown[]>;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(mockRecoveryService.getRecoveryHistory).toHaveBeenCalledWith('default-user', 7);
  });

  it('should accept explicit days parameter', async () => {
    mockRecoveryService.getRecoveryHistory.mockResolvedValue([]);

    const response = await request(healthSyncApp).get('/recovery/history?days=30');
    const body = response.body as ApiResponse<unknown[]>;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockRecoveryService.getRecoveryHistory).toHaveBeenCalledWith('default-user', 30);
  });

  it('should clamp days to range 1-90', async () => {
    mockRecoveryService.getRecoveryHistory.mockResolvedValue([]);

    await request(healthSyncApp).get('/recovery/history?days=200');
    expect(mockRecoveryService.getRecoveryHistory).toHaveBeenCalledWith('default-user', 90);
  });
});
```

**GET /baseline section**:

```typescript
describe('GET /baseline', () => {
  it('should return baseline when it exists', async () => {
    const baseline = { hrvMedian: 45, hrvStdDev: 8.2, rhrMedian: 54, calculatedAt: '...', sampleCount: 30 };
    mockRecoveryService.getRecoveryBaseline.mockResolvedValue(baseline);

    const response = await request(healthSyncApp).get('/baseline');
    const body = response.body as ApiResponse;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual(baseline);
  });

  it('should return 404 when no baseline exists', async () => {
    mockRecoveryService.getRecoveryBaseline.mockResolvedValue(null);

    const response = await request(healthSyncApp).get('/baseline');
    const body = response.body as ApiResponse;

    expect(response.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error?.code).toBe('NOT_FOUND');
  });
});
```

**POST /sync with baseline** — Add to existing `POST /sync` describe:

```typescript
it('should sync with baseline when provided', async () => {
  mockRecoveryService.upsertRecoverySnapshot.mockResolvedValue(validRecovery);
  mockRecoveryService.upsertRecoveryBaseline.mockResolvedValue({});

  const response = await request(healthSyncApp).post('/sync').send({
    recovery: validRecovery,
    baseline: { hrvMedian: 45, hrvStdDev: 8.2, rhrMedian: 54, sampleCount: 30 },
  });

  const body = response.body as ApiResponse<{ baselineUpdated: boolean }>;
  expect(response.status).toBe(200);
  expect(body.data?.baselineUpdated).toBe(true);
  expect(mockRecoveryService.upsertRecoveryBaseline).toHaveBeenCalled();
});
```

**POST /hrv/bulk section** — follows POST /weight/bulk pattern exactly:

```typescript
describe('POST /hrv/bulk', () => {
  it('should bulk sync HRV entries', async () => {
    mockRecoveryService.addHRVEntries.mockResolvedValue(2);

    const response = await request(healthSyncApp).post('/hrv/bulk').send({
      entries: [
        { date: '2026-02-07', avgMs: 42, minMs: 30, maxMs: 55, sampleCount: 12 },
        { date: '2026-02-08', avgMs: 45, minMs: 32, maxMs: 58, sampleCount: 15 },
      ],
    });

    const body = response.body as ApiResponse<{ added: number }>;
    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data?.added).toBe(2);
    expect(mockRecoveryService.addHRVEntries).toHaveBeenCalledWith('default-user', expect.any(Array));
  });

  it('should reject empty entries array', async () => {
    const response = await request(healthSyncApp).post('/hrv/bulk').send({ entries: [] });
    const body = response.body as ApiResponse;
    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('should reject invalid date format', async () => {
    const response = await request(healthSyncApp).post('/hrv/bulk').send({
      entries: [{ date: '02/07/2026', avgMs: 42, minMs: 30, maxMs: 55, sampleCount: 12 }],
    });
    const body = response.body as ApiResponse;
    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it('should reject out-of-range avgMs', async () => {
    const response = await request(healthSyncApp).post('/hrv/bulk').send({
      entries: [{ date: '2026-02-07', avgMs: 500, minMs: 30, maxMs: 55, sampleCount: 12 }],
    });
    const body = response.body as ApiResponse;
    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
  });
});
```

**GET /hrv section** — follows GET /weight pattern. Note: HRV GET uses `getHRVHistory(userId, 1)` for latest, not a separate `getLatestHRV` function.

```typescript
describe('GET /hrv', () => {
  it('should return HRV history when days param provided', async () => {
    mockRecoveryService.getHRVHistory.mockResolvedValue([
      { id: '2026-02-09', date: '2026-02-09', avgMs: 42, minMs: 30, maxMs: 55, sampleCount: 12, source: 'healthkit', syncedAt: '...' },
    ]);

    const response = await request(healthSyncApp).get('/hrv?days=7');
    const body = response.body as ApiResponse;
    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('should return latest HRV when no days param', async () => {
    const entry = { id: '2026-02-09', date: '2026-02-09', avgMs: 42, minMs: 30, maxMs: 55, sampleCount: 12, source: 'healthkit', syncedAt: '...' };
    mockRecoveryService.getHRVHistory.mockResolvedValue([entry]);

    const response = await request(healthSyncApp).get('/hrv');
    const body = response.body as ApiResponse;
    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual(entry);
  });

  it('should return 404 when no HRV data', async () => {
    mockRecoveryService.getHRVHistory.mockResolvedValue([]);

    const response = await request(healthSyncApp).get('/hrv');
    const body = response.body as ApiResponse;
    expect(response.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error?.code).toBe('NOT_FOUND');
  });
});
```

**POST /rhr/bulk, GET /rhr, POST /sleep/bulk, GET /sleep** — identical pattern to HRV but with different field names:

- **RHR** fields: `{ date, avgBpm, sampleCount }`, validation range avgBpm 30-200
- **Sleep** fields: `{ date, totalSleepMinutes, inBedMinutes, coreMinutes, deepMinutes, remMinutes, awakeMinutes, sleepEfficiency }`, validation range 0-1440 for minutes, 0-110 for efficiency

Each follows the exact same test structure as the HRV tests above.

### Modified: `packages/functions/src/services/firestore-recovery.service.test.ts`

Currently 381 lines with 20 tests. Add ~12 new tests (bringing total to ~32 tests).

**Step 1**: Add the missing service function imports:

```typescript
import {
  // ... existing imports ...
  addHRVEntries,
  getHRVHistory,
  addRHREntries,
  getRHRHistory,
  addSleepEntries,
  getSleepHistory,
} from './firestore-recovery.service.js';
```

**Step 2**: Add sample data constants for HRV, RHR, Sleep (after existing `sampleWeight`):

```typescript
const sampleHRV = {
  date: '2026-02-09',
  avgMs: 42,
  minMs: 30,
  maxMs: 55,
  sampleCount: 12,
  source: 'healthkit' as const,
  syncedAt: '2026-02-09T12:00:00.000Z',
};

const sampleRHR = {
  date: '2026-02-09',
  avgBpm: 52,
  sampleCount: 24,
  source: 'healthkit' as const,
  syncedAt: '2026-02-09T12:00:00.000Z',
};

const sampleSleep = {
  date: '2026-02-09',
  totalSleepMinutes: 420,
  inBedMinutes: 480,
  coreMinutes: 180,
  deepMinutes: 90,
  remMinutes: 105,
  awakeMinutes: 45,
  sleepEfficiency: 87.5,
  source: 'healthkit' as const,
  syncedAt: '2026-02-09T12:00:00.000Z',
};
```

**Step 3**: Add test sections after the existing `getLatestWeight` describe block. Each follows the existing batch-write and query-read patterns.

**HRV History section** — follows addWeightEntries/getWeightHistory pattern:

```typescript
describe('addHRVEntries', () => {
  it('batches writes correctly for multiple entries', async () => {
    mockBatchCommit.mockResolvedValueOnce(undefined);

    const entries = [
      { date: '2026-02-07', avgMs: 40, minMs: 28, maxMs: 52, sampleCount: 10 },
      { date: '2026-02-08', avgMs: 42, minMs: 30, maxMs: 55, sampleCount: 12 },
    ];

    const result = await addHRVEntries(userId, entries);

    expect(result).toBe(2);
    expect(mockBatchSet).toHaveBeenCalledTimes(2);
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);
    expect(mockBatchSet).toHaveBeenCalledWith(
      mockDocRef,
      expect.objectContaining({ date: '2026-02-07', avgMs: 40, source: 'healthkit' }),
    );
  });

  it('defaults source to healthkit when not provided', async () => {
    mockBatchCommit.mockResolvedValueOnce(undefined);

    await addHRVEntries(userId, [
      { date: '2026-02-09', avgMs: 42, minMs: 30, maxMs: 55, sampleCount: 12 },
    ]);

    expect(mockBatchSet).toHaveBeenCalledWith(
      mockDocRef,
      expect.objectContaining({ source: 'healthkit' }),
    );
  });
});

describe('getHRVHistory', () => {
  it('returns HRV entries filtered by date cutoff', async () => {
    mockGet.mockResolvedValueOnce(
      queryResult([
        { id: '2026-02-09', data: () => ({ ...sampleHRV }) },
      ]),
    );

    const result = await getHRVHistory(userId, 7);

    expect(result).toHaveLength(1);
    expect(result[0]?.avgMs).toBe(42);
    expect(mockWhere).toHaveBeenCalledWith('date', '>=', expect.any(String));
    expect(mockOrderBy).toHaveBeenCalledWith('date', 'desc');
  });

  it('returns empty array when no entries exist', async () => {
    mockGet.mockResolvedValueOnce(queryResult([]));

    const result = await getHRVHistory(userId, 7);

    expect(result).toHaveLength(0);
  });
});
```

**RHR History section** — same pattern with RHR fields:

```typescript
describe('addRHREntries', () => {
  it('batches writes correctly for multiple entries', async () => {
    mockBatchCommit.mockResolvedValueOnce(undefined);

    const entries = [
      { date: '2026-02-07', avgBpm: 52, sampleCount: 24 },
      { date: '2026-02-08', avgBpm: 54, sampleCount: 20 },
    ];

    const result = await addRHREntries(userId, entries);

    expect(result).toBe(2);
    expect(mockBatchSet).toHaveBeenCalledTimes(2);
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);
    expect(mockBatchSet).toHaveBeenCalledWith(
      mockDocRef,
      expect.objectContaining({ date: '2026-02-07', avgBpm: 52, source: 'healthkit' }),
    );
  });

  it('defaults source to healthkit', async () => {
    mockBatchCommit.mockResolvedValueOnce(undefined);
    await addRHREntries(userId, [{ date: '2026-02-09', avgBpm: 52, sampleCount: 24 }]);
    expect(mockBatchSet).toHaveBeenCalledWith(mockDocRef, expect.objectContaining({ source: 'healthkit' }));
  });
});

describe('getRHRHistory', () => {
  it('returns RHR entries filtered by date cutoff', async () => {
    mockGet.mockResolvedValueOnce(
      queryResult([{ id: '2026-02-09', data: () => ({ ...sampleRHR }) }]),
    );

    const result = await getRHRHistory(userId, 7);

    expect(result).toHaveLength(1);
    expect(result[0]?.avgBpm).toBe(52);
    expect(mockWhere).toHaveBeenCalledWith('date', '>=', expect.any(String));
  });

  it('returns empty array when no entries exist', async () => {
    mockGet.mockResolvedValueOnce(queryResult([]));
    const result = await getRHRHistory(userId, 7);
    expect(result).toHaveLength(0);
  });
});
```

**Sleep History section** — same pattern with Sleep fields:

```typescript
describe('addSleepEntries', () => {
  it('batches writes correctly for all sleep fields', async () => {
    mockBatchCommit.mockResolvedValueOnce(undefined);

    const entries = [{
      date: '2026-02-09',
      totalSleepMinutes: 420,
      inBedMinutes: 480,
      coreMinutes: 180,
      deepMinutes: 90,
      remMinutes: 105,
      awakeMinutes: 45,
      sleepEfficiency: 87.5,
    }];

    const result = await addSleepEntries(userId, entries);

    expect(result).toBe(1);
    expect(mockBatchSet).toHaveBeenCalledWith(
      mockDocRef,
      expect.objectContaining({
        date: '2026-02-09',
        totalSleepMinutes: 420,
        deepMinutes: 90,
        sleepEfficiency: 87.5,
        source: 'healthkit',
      }),
    );
  });

  it('defaults source to healthkit', async () => {
    mockBatchCommit.mockResolvedValueOnce(undefined);
    await addSleepEntries(userId, [{
      date: '2026-02-09', totalSleepMinutes: 420, inBedMinutes: 480,
      coreMinutes: 180, deepMinutes: 90, remMinutes: 105,
      awakeMinutes: 45, sleepEfficiency: 87.5,
    }]);
    expect(mockBatchSet).toHaveBeenCalledWith(mockDocRef, expect.objectContaining({ source: 'healthkit' }));
  });
});

describe('getSleepHistory', () => {
  it('returns sleep entries filtered by date cutoff', async () => {
    mockGet.mockResolvedValueOnce(
      queryResult([{ id: '2026-02-09', data: () => ({ ...sampleSleep }) }]),
    );

    const result = await getSleepHistory(userId, 7);

    expect(result).toHaveLength(1);
    expect(result[0]?.totalSleepMinutes).toBe(420);
    expect(result[0]?.sleepEfficiency).toBe(87.5);
    expect(mockWhere).toHaveBeenCalledWith('date', '>=', expect.any(String));
  });

  it('returns empty array when no entries exist', async () => {
    mockGet.mockResolvedValueOnce(queryResult([]));
    const result = await getSleepHistory(userId, 7);
    expect(result).toHaveLength(0);
  });
});
```

## Tests

| # | File | Test Case | What It Verifies |
|---|------|-----------|-----------------|
| 1 | health-sync.test.ts | GET /recovery/history returns history with default days | Default days=7 passed to service, 200 with array |
| 2 | health-sync.test.ts | GET /recovery/history accepts explicit days | Custom days param forwarded correctly |
| 3 | health-sync.test.ts | GET /recovery/history clamps days to 1-90 | days=200 clamped to 90 |
| 4 | health-sync.test.ts | GET /baseline returns when exists | 200 with baseline data |
| 5 | health-sync.test.ts | GET /baseline returns 404 when missing | 404 NOT_FOUND response |
| 6 | health-sync.test.ts | POST /sync with baseline | baselineUpdated=true, upsertRecoveryBaseline called |
| 7 | health-sync.test.ts | POST /hrv/bulk syncs entries | 200, correct count, addHRVEntries called |
| 8 | health-sync.test.ts | POST /hrv/bulk rejects empty array | 400 VALIDATION_ERROR |
| 9 | health-sync.test.ts | POST /hrv/bulk rejects invalid date | 400 validation |
| 10 | health-sync.test.ts | POST /hrv/bulk rejects out-of-range avgMs | 400 validation (>300) |
| 11 | health-sync.test.ts | GET /hrv returns history with days | 200 array response |
| 12 | health-sync.test.ts | GET /hrv returns latest when no days | 200 single object |
| 13 | health-sync.test.ts | GET /hrv returns 404 when empty | 404 NOT_FOUND |
| 14 | health-sync.test.ts | POST /rhr/bulk syncs entries | 200, correct count |
| 15 | health-sync.test.ts | POST /rhr/bulk rejects empty array | 400 VALIDATION_ERROR |
| 16 | health-sync.test.ts | POST /rhr/bulk rejects invalid date | 400 validation |
| 17 | health-sync.test.ts | POST /rhr/bulk rejects out-of-range avgBpm | 400 validation (>200) |
| 18 | health-sync.test.ts | GET /rhr returns history with days | 200 array response |
| 19 | health-sync.test.ts | GET /rhr returns latest when no days | 200 single object |
| 20 | health-sync.test.ts | GET /rhr returns 404 when empty | 404 NOT_FOUND |
| 21 | health-sync.test.ts | POST /sleep/bulk syncs entries | 200, correct count |
| 22 | health-sync.test.ts | POST /sleep/bulk rejects empty array | 400 VALIDATION_ERROR |
| 23 | health-sync.test.ts | POST /sleep/bulk rejects invalid date | 400 validation |
| 24 | health-sync.test.ts | POST /sleep/bulk rejects out-of-range minutes | 400 validation (>1440) |
| 25 | health-sync.test.ts | GET /sleep returns history with days | 200 array response |
| 26 | health-sync.test.ts | GET /sleep returns latest when no days | 200 single object |
| 27 | health-sync.test.ts | GET /sleep returns 404 when empty | 404 NOT_FOUND |
| 28 | firestore-recovery.service.test.ts | addHRVEntries batches writes | batch.set called per entry, commit once |
| 29 | firestore-recovery.service.test.ts | addHRVEntries defaults source | source: 'healthkit' in batch.set |
| 30 | firestore-recovery.service.test.ts | getHRVHistory returns entries | where('date', '>=', cutoff) + orderBy |
| 31 | firestore-recovery.service.test.ts | getHRVHistory returns empty | Empty query result → empty array |
| 32 | firestore-recovery.service.test.ts | addRHREntries batches writes | batch.set with avgBpm, sampleCount |
| 33 | firestore-recovery.service.test.ts | addRHREntries defaults source | source: 'healthkit' |
| 34 | firestore-recovery.service.test.ts | getRHRHistory returns entries | where + orderBy with date cutoff |
| 35 | firestore-recovery.service.test.ts | getRHRHistory returns empty | Empty → [] |
| 36 | firestore-recovery.service.test.ts | addSleepEntries batches all 9 fields | All sleep fields in batch.set |
| 37 | firestore-recovery.service.test.ts | addSleepEntries defaults source | source: 'healthkit' |
| 38 | firestore-recovery.service.test.ts | getSleepHistory returns entries | where + orderBy, all fields mapped |
| 39 | firestore-recovery.service.test.ts | getSleepHistory returns empty | Empty → [] |

**Totals**: 27 new handler tests + 12 new service tests = 39 new tests. Combined with existing 45 tests = 84 total. Every endpoint and service function will have at least basic coverage.

## QA

### Step 1: Run full validation

```bash
npm run validate
```

Expected: All checks pass — typecheck, lint, test, architecture. Inspect `.validate/test.log` to confirm:
- health-sync.test.ts shows ~45 passing tests (up from 18)
- firestore-recovery.service.test.ts shows ~32 passing tests (up from 20)

### Step 2: Verify coverage improvement

```bash
npx vitest run --config vitest.coverage.config.ts --coverage
```

Inspect the text coverage report. The health-sync handler and firestore-recovery service should both show >50% line coverage. Key files to check:
- `src/handlers/health-sync.ts` — should cover all 12 endpoint handlers
- `src/services/firestore-recovery.service.ts` — should cover all 16 exported functions

### Step 3: Run the quality grading script

```bash
npx tsx scripts/update-quality-grades.ts
```

Inspect `docs/quality-grades.md`:
- The Health domain should no longer have the "low coverage" penalty
- The grade should improve from C+ to at least B

### Step 4: Verify every new test has meaningful assertions

Grep for empty test bodies to ensure no placeholders:

```bash
# In the test files, every it() block should have expect()
grep -c 'expect(' packages/functions/src/handlers/health-sync.test.ts
grep -c 'expect(' packages/functions/src/services/firestore-recovery.service.test.ts
```

Both files should show significantly more expect() calls than test cases (density > 2.0).

### Step 5: Self-review

```bash
git diff main --stat   # Should show exactly 2 modified test files
git diff main          # Read every changed line
```

Verify:
- No `any` types
- All imports explicit (vitest, supertest, shared utils)
- No `.only` or `.skip`
- Every `it()` block has at least one `expect()`
- `ApiResponse` imported from `../__tests__/utils/index.js` (not inline)
- Mock service function names match exactly what `health-sync.ts` calls

## Conventions

1. **Git Worktree Workflow** — All changes in a worktree branch, not directly on main.

2. **Subagent Usage** — Run `npm run validate` in subagents to conserve context.

3. **Vitest not Jest** — Use `import { describe, it, expect, vi, beforeEach } from 'vitest'` explicitly.

4. **No `any` types** — Use `ApiResponse` from shared test utilities for supertest response typing.

5. **Handler test pattern** — Follow existing health-sync.test.ts structure:
   - `vi.hoisted()` for mock service object (already done — extend it)
   - `vi.mock('../firebase.js')` and `vi.mock('../middleware/app-check.js')` before handler import
   - `vi.mock('../services/firestore-recovery.service.js', () => mockRecoveryService)`
   - Handler imported AFTER all `vi.mock()` calls
   - `beforeEach(() => vi.clearAllMocks())`

6. **Service test pattern** — Follow existing firestore-recovery.service.test.ts structure:
   - Reuse the existing Firestore mock chain (`mockDb`, `mockCollectionRef`, `mockDocRef`, etc.)
   - Reuse existing `beforeEach` re-wiring logic
   - Reuse existing `docExists`, `docNotFound`, `queryResult` helpers
   - Import service functions AFTER mocks

7. **Test quality** (architecture check #19) — Every `it()` block must contain `expect()` assertions. No empty test bodies.

8. **No focused tests** (architecture check #18) — No `.only` or `.skip` modifiers.

9. **ApiResponse from shared utils** (architecture check #17) — Import `ApiResponse` from `../__tests__/utils/index.js`, never define inline.

10. **Validation first** — Run `npm run validate` before committing to ensure all checks pass.
