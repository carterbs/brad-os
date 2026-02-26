# Cloud Functions Migration Plan

## Overview

Migrate the Express server package to Firebase Cloud Functions v2 using Option A: one HTTP function per router. Each function wraps an Express app handling all routes for that domain (exercises, workouts, etc.). This preserves existing code patterns while gaining serverless benefits.

## Dependencies

- Firebase project already configured (Firestore in use)
- Existing server code at `packages/server/`
- Shared package at `packages/shared/`

## Current State Analysis

### What Exists

| Component | Location | Description |
|-----------|----------|-------------|
| Express app | `packages/server/src/index.ts` | Entry point with middleware stack |
| 9 route files | `packages/server/src/routes/*.ts` | ~50 endpoints total |
| 9 services | `packages/server/src/services/*.ts` | Business logic with singleton pattern |
| 9 repositories | `packages/server/src/repositories/*.ts` | Firestore data access |
| Validation middleware | `packages/server/src/middleware/validate.ts` | Zod schema validation |
| Error handler | `packages/server/src/middleware/error-handler.ts` | Centralized error handling |
| Firebase init | `packages/server/src/firebase/index.ts` | Firestore connection |

### Route Files → Functions Mapping

| Route File | Endpoints | Function Name | Timeout Risk |
|------------|-----------|---------------|--------------|
| `health.routes.ts` | 1 | `health` | None |
| `exercise.routes.ts` | 6 | `exercises` | None |
| `plan.routes.ts` | 14 | `plans` | None |
| `mesocycle.routes.ts` | 7 | `mesocycles` | **HIGH** - start generates 336+ writes |
| `workout.routes.ts` | 14 | `workouts` | Low |
| `workout-set.routes.ts` | 3 | `workoutSets` | None |
| `stretch-session.routes.ts` | 4 | `stretchSessions` | None |
| `meditation-session.routes.ts` | 4 | `meditationSessions` | None |
| `calendar.routes.ts` | 1 | `calendar` | None |

### Critical Concern: Mesocycle Start Timeout

**Current behavior** (`mesocycle.service.ts:276-326`):
- `start()` generates 7 weeks × N days × M exercises × P sets
- For seed data: 336 sequential Firestore writes
- For large plans: 8,000+ writes possible
- No batch writes implemented - each `create()` awaits individually

**Risk**: Cloud Functions default timeout is 60 seconds. Sequential writes at ~50ms each means 336 writes ≈ 17 seconds minimum, but large plans would timeout.

## Desired End State

```
packages/
├── server/           # Kept for local development
├── functions/        # NEW: Cloud Functions package
│   ├── src/
│   │   ├── index.ts           # Function exports
│   │   ├── middleware/        # Shared middleware (copied/adapted)
│   │   ├── handlers/          # 9 Express app handlers
│   │   └── shared/            # Symlink or copy of reusable code
│   ├── package.json
│   └── tsconfig.json
└── shared/           # Existing shared types/schemas
```

**Function URLs** (Firebase hosting rewrites or direct):
```
https://<region>-<project>.cloudfunctions.net/exercises/*
https://<region>-<project>.cloudfunctions.net/workouts/*
https://<region>-<project>.cloudfunctions.net/mesocycles/*
... etc
```

## What We're NOT Doing

- Moving to callable functions (keeping HTTP for REST compatibility)
- Adding authentication in this migration (separate concern)
- Changing the iOS client URLs (will update API base URL only)
- Migrating to a different database
- Removing the local Express server (keep for development)

## Key Discoveries

### Firebase Cloud Functions v2 Patterns

**Express Integration** (from Firebase docs):
```typescript
import { onRequest } from 'firebase-functions/v2/https';
import express from 'express';

const app = express();
app.use(cors({ origin: true }));
app.get('/:id', (req, res) => { /* ... */ });
app.post('/', (req, res) => { /* ... */ });

export const widgets = onRequest(app);
```

**Timeout Configuration**:
- HTTP functions support up to 3600 seconds (60 minutes)
- Default is 60 seconds
- Configure via `onRequest({ timeoutSeconds: 300 }, app)`

**Cold Start Optimization**:
- Use `minInstances: 1` for latency-sensitive functions
- Initialize Firebase Admin SDK at global scope
- Concurrency default is 80 requests per instance

**Global Scope Initialization**:
```typescript
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Runs once per cold start, reused across invocations
initializeApp();
const db = getFirestore();
```

### Existing Code Patterns to Preserve

**Route Handler Pattern** (`exercise.routes.ts:19-34`):
```typescript
exerciseRouter.get('/', async (_req, res, next) => {
  try {
    const repository = getExerciseRepository();
    const exercises = await repository.findAll();
    res.json({ success: true, data: exercises });
  } catch (error) {
    next(error);
  }
});
```

**Service Singleton Pattern** (`services/index.ts:56-61`):
```typescript
export function getMesocycleService(): MesocycleService {
  if (!mesocycleService) {
    mesocycleService = new MesocycleService(getDatabase());
  }
  return mesocycleService;
}
```

**Error Handler** (`middleware/error-handler.ts:41-114`):
- Handles ZodError → 400
- Handles AppError subclasses → appropriate status
- Handles unknown errors → 500

---

## Implementation Approach

1. Create new `packages/functions` package alongside existing server
2. Build shared infrastructure (middleware, error handling, Firebase init)
3. Create one Express app per domain, wrap with `onRequest()`
4. Refactor mesocycle start to use Firestore batch writes
5. Configure deployment with appropriate timeouts
6. Test locally with Firebase emulator
7. Deploy and update iOS client

---

## Phase 1: Project Setup

### Overview
Create the functions package structure and configure Firebase CLI.

### Changes Required

#### 1.1 Initialize functions package

Create directory structure:
```
packages/functions/
├── src/
│   ├── index.ts
│   └── .gitkeep
├── package.json
├── tsconfig.json
└── .legacy-lint.js
```

#### 1.2 Create `packages/functions/package.json`

```json
{
  "name": "@brad-os/functions",
  "version": "1.0.0",
  "main": "lib/index.js",
  "scripts": {
    "build": "tsc",
    "build:watch": "tsc --watch",
    "serve": "npm run build && firebase emulators:start --only functions",
    "deploy": "firebase deploy --only functions",
    "logs": "firebase functions:log",
    "typecheck": "tsc --noEmit",
    "lint": "legacy-lint src --ext .ts"
  },
  "engines": {
    "node": "20"
  },
  "dependencies": {
    "firebase-admin": "^13.6.0",
    "firebase-functions": "^6.3.0",
    "express": "^4.18.3",
    "cors": "^2.8.5",
    "helmet": "^8.1.0",
    "zod": "^3.23.8",
    "@brad-os/shared": "*"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/cors": "^2.8.17",
    "typescript": "^5.4.5",
    "firebase-functions-test": "^3.4.0"
  }
}
```

#### 1.3 Create `packages/functions/tsconfig.json`

```json
{
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "target": "ES2022",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "lib",
    "rootDir": "src",
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "lib"]
}
```

#### 1.4 Update root `firebase.json`

Add functions configuration:
```json
{
  "functions": {
    "source": "packages/functions",
    "runtime": "nodejs20",
    "codebase": "default"
  }
}
```

### Success Criteria

- [ ] `npm install` succeeds in packages/functions
- [ ] `npm run build` compiles without errors
- [ ] Firebase CLI recognizes functions source

### Confirmation Gate
Run `firebase emulators:start --only functions` and verify it starts.

---

## Phase 2: Shared Infrastructure

### Overview
Copy and adapt middleware, error handling, and Firebase initialization for Cloud Functions context.

### Changes Required

#### 2.1 Create `packages/functions/src/firebase.ts`

Adapt from `packages/server/src/firebase/index.ts`:

```typescript
import { initializeApp, getApps, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

let app: App | null = null;
let db: Firestore | null = null;

// Initialize at cold start (no credentials needed in Cloud Functions)
export function initializeFirebase(): App {
  if (app) return app;

  const existingApps = getApps();
  if (existingApps.length > 0 && existingApps[0]) {
    app = existingApps[0];
    return app;
  }

  // In Cloud Functions, default credentials are automatic
  app = initializeApp();
  return app;
}

export function getFirestoreDb(): Firestore {
  if (db) return db;
  if (!app) initializeFirebase();
  db = getFirestore();
  return db;
}

// Collection name helpers (no prefix in production)
export function getCollectionName(baseName: string): string {
  // Cloud Functions run in production - no prefix needed
  // For staging/dev environments, use different Firebase projects
  return baseName;
}
```

#### 2.2 Create `packages/functions/src/middleware/error-handler.ts`

Copy from server package with minor adaptations:

```typescript
import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { ApiError } from '@brad-os/shared';

// Copy AppError, NotFoundError, ValidationError, ConflictError, ForbiddenError
// from packages/server/src/middleware/error-handler.ts

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Same implementation as server package
  // Log to Cloud Functions logger instead of console
  console.error('Error:', err);

  // ... rest of error handling logic
}
```

#### 2.3 Create `packages/functions/src/middleware/validate.ts`

Copy directly from `packages/server/src/middleware/validate.ts` - no changes needed.

#### 2.4 Create `packages/functions/src/repositories/` directory

**Option A (Recommended)**: Symlink to server repositories
```bash
cd packages/functions/src
ln -s ../../server/src/repositories repositories
```

**Option B**: Copy files if symlinks cause issues with bundling

Update imports in copied files to use local firebase.ts.

#### 2.5 Create `packages/functions/src/services/` directory

Same approach as repositories - symlink or copy from server.

### Success Criteria

- [ ] Firebase initializes without credentials (auto in Cloud Functions)
- [ ] Error handler catches and formats errors correctly
- [ ] Validation middleware works with Zod schemas
- [ ] Repositories compile and access Firestore

### Confirmation Gate
Write a simple test function that queries Firestore and returns data.

---

## Phase 3: Health & Simple Functions

### Overview
Start with simple functions to validate the pattern before complex ones.

### Changes Required

#### 3.1 Create `packages/functions/src/handlers/health.ts`

```typescript
import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors({ origin: true }));

app.get('/', (_req, res) => {
  res.json({
    success: true,
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      environment: 'cloud-functions'
    }
  });
});

export const healthApp = app;
```

#### 3.2 Create `packages/functions/src/handlers/exercises.ts`

```typescript
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { createExerciseSchema, updateExerciseSchema } from '@brad-os/shared';
import { validate } from '../middleware/validate';
import { errorHandler, NotFoundError } from '../middleware/error-handler';
import { ExerciseRepository } from '../repositories/exercise.repository';
import { getFirestoreDb } from '../firebase';

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

// Lazy repository initialization
let exerciseRepo: ExerciseRepository | null = null;
function getRepo(): ExerciseRepository {
  if (!exerciseRepo) {
    exerciseRepo = new ExerciseRepository(getFirestoreDb());
  }
  return exerciseRepo;
}

// GET /exercises
app.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const exercises = await getRepo().findAll();
    res.json({ success: true, data: exercises });
  } catch (error) {
    next(error);
  }
});

// GET /exercises/:id
app.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const exercise = await getRepo().findById(req.params.id);
    if (!exercise) {
      throw new NotFoundError('Exercise', req.params.id);
    }
    res.json({ success: true, data: exercise });
  } catch (error) {
    next(error);
  }
});

// POST /exercises
app.post('/', validate(createExerciseSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const exercise = await getRepo().create(req.body);
    res.status(201).json({ success: true, data: exercise });
  } catch (error) {
    next(error);
  }
});

// PUT /exercises/:id
app.put('/:id', validate(updateExerciseSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const exercise = await getRepo().update(req.params.id, req.body);
    if (!exercise) {
      throw new NotFoundError('Exercise', req.params.id);
    }
    res.json({ success: true, data: exercise });
  } catch (error) {
    next(error);
  }
});

// DELETE /exercises/:id
app.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const isInUse = await getRepo().isInUse(req.params.id);
    if (isInUse) {
      throw new ConflictError('Cannot delete exercise that is used in plans');
    }
    const deleted = await getRepo().delete(req.params.id);
    if (!deleted) {
      throw new NotFoundError('Exercise', req.params.id);
    }
    res.json({ success: true, data: { deleted: true } });
  } catch (error) {
    next(error);
  }
});

// Error handler must be last
app.use(errorHandler);

export const exercisesApp = app;
```

#### 3.3 Create `packages/functions/src/handlers/stretchSessions.ts`

```typescript
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { createStretchSessionSchema } from '@brad-os/shared';
import { validate } from '../middleware/validate';
import { errorHandler, NotFoundError } from '../middleware/error-handler';
import { StretchSessionRepository } from '../repositories/stretch-session.repository';
import { getFirestoreDb } from '../firebase';

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

let repo: StretchSessionRepository | null = null;
function getRepo(): StretchSessionRepository {
  if (!repo) repo = new StretchSessionRepository(getFirestoreDb());
  return repo;
}

app.post('/', validate(createStretchSessionSchema), async (req, res, next) => {
  try {
    const session = await getRepo().create(req.body);
    res.status(201).json({ success: true, data: session });
  } catch (error) {
    next(error);
  }
});

app.get('/', async (_req, res, next) => {
  try {
    const sessions = await getRepo().findAll();
    res.json({ success: true, data: sessions });
  } catch (error) {
    next(error);
  }
});

app.get('/latest', async (_req, res, next) => {
  try {
    const session = await getRepo().findLatest();
    res.json({ success: true, data: session });
  } catch (error) {
    next(error);
  }
});

app.get('/:id', async (req, res, next) => {
  try {
    const session = await getRepo().findById(req.params.id);
    if (!session) throw new NotFoundError('StretchSession', req.params.id);
    res.json({ success: true, data: session });
  } catch (error) {
    next(error);
  }
});

app.use(errorHandler);

export const stretchSessionsApp = app;
```

#### 3.4 Create `packages/functions/src/handlers/meditationSessions.ts`

Similar pattern to stretchSessions - copy and adapt endpoints.

#### 3.5 Create `packages/functions/src/index.ts`

```typescript
import { onRequest, HttpsOptions } from 'firebase-functions/v2/https';
import { initializeFirebase } from './firebase';

// Initialize Firebase at cold start
initializeFirebase();

// Import handler apps
import { healthApp } from './handlers/health';
import { exercisesApp } from './handlers/exercises';
import { stretchSessionsApp } from './handlers/stretchSessions';
import { meditationSessionsApp } from './handlers/meditationSessions';

// Common options
const defaultOptions: HttpsOptions = {
  region: 'us-central1',
  cors: true,
};

// Export functions
export const health = onRequest(defaultOptions, healthApp);
export const exercises = onRequest(defaultOptions, exercisesApp);
export const stretchSessions = onRequest(defaultOptions, stretchSessionsApp);
export const meditationSessions = onRequest(defaultOptions, meditationSessionsApp);
```

### Success Criteria

- [ ] `npm run build` compiles all handlers
- [ ] Health endpoint responds with status
- [ ] Exercises CRUD operations work
- [ ] Stretch sessions CRUD operations work
- [ ] Meditation sessions CRUD operations work

### Confirmation Gate
Test all simple functions with Firebase emulator using curl/Postman.

---

## Phase 4: Complex Functions (Plans, Workouts, Calendar)

### Overview
Implement the more complex handlers with nested routes and service dependencies.

### Changes Required

#### 4.1 Create `packages/functions/src/handlers/plans.ts`

Plans has nested resources (days, exercises). Structure as:
```typescript
// /plans - CRUD
// /plans/:planId/days - CRUD
// /plans/:planId/days/:dayId/exercises - CRUD

const app = express();
// ... implement all 14 endpoints following existing pattern
```

Copy logic from `packages/server/src/routes/plan.routes.ts`.

#### 4.2 Create `packages/functions/src/handlers/workouts.ts`

Workouts is complex with action endpoints and set management:
```typescript
// /workouts - CRUD
// /workouts/today - GET
// /workouts/:id/start - PUT
// /workouts/:id/complete - PUT
// /workouts/:id/skip - PUT
// /workouts/:workoutId/sets - nested CRUD
// /workouts/:workoutId/exercises/:exerciseId/sets/add - POST
// /workouts/:workoutId/exercises/:exerciseId/sets/remove - DELETE
```

Copy logic from `packages/server/src/routes/workout.routes.ts`.

#### 4.3 Create `packages/functions/src/handlers/workoutSets.ts`

Simple handler for set operations:
```typescript
// PUT /workout-sets/:id/log
// PUT /workout-sets/:id/skip
// PUT /workout-sets/:id/unlog
```

#### 4.4 Create `packages/functions/src/handlers/calendar.ts`

```typescript
// GET /calendar/:year/:month?tz=offset
```

Copy logic from `packages/server/src/routes/calendar.routes.ts`.

#### 4.5 Update `packages/functions/src/index.ts`

Add new exports:
```typescript
import { plansApp } from './handlers/plans';
import { workoutsApp } from './handlers/workouts';
import { workoutSetsApp } from './handlers/workoutSets';
import { calendarApp } from './handlers/calendar';

export const plans = onRequest(defaultOptions, plansApp);
export const workouts = onRequest(defaultOptions, workoutsApp);
export const workoutSets = onRequest(defaultOptions, workoutSetsApp);
export const calendar = onRequest(defaultOptions, calendarApp);
```

### Success Criteria

- [ ] Plans with nested days and exercises work
- [ ] Workouts CRUD and action endpoints work
- [ ] Workout sets log/skip/unlog work
- [ ] Calendar aggregation returns correct data

### Confirmation Gate
Test complex flows: create plan → add days → add exercises → verify via GET.

---

## Phase 5: Mesocycle Function with Batch Writes

### Overview
The mesocycle start operation is the timeout risk. Implement with Firestore batch writes to ensure it completes within timeout.

### Changes Required

#### 5.1 Create batch write utility

Create `packages/functions/src/utils/batch-writer.ts`:

```typescript
import { Firestore, WriteBatch } from 'firebase-admin/firestore';

/**
 * Firestore batch writer that automatically commits when batch limit is reached.
 * Firestore limit is 500 operations per batch.
 */
export class BatchWriter {
  private db: Firestore;
  private batch: WriteBatch;
  private operationCount: number = 0;
  private readonly MAX_OPERATIONS = 500;

  constructor(db: Firestore) {
    this.db = db;
    this.batch = db.batch();
  }

  async set(collectionPath: string, docId: string, data: Record<string, unknown>): Promise<void> {
    const docRef = this.db.collection(collectionPath).doc(docId);
    this.batch.set(docRef, data);
    this.operationCount++;

    if (this.operationCount >= this.MAX_OPERATIONS) {
      await this.flush();
    }
  }

  async create(collectionPath: string, data: Record<string, unknown>): Promise<string> {
    const docRef = this.db.collection(collectionPath).doc();
    this.batch.set(docRef, data);
    this.operationCount++;

    if (this.operationCount >= this.MAX_OPERATIONS) {
      await this.flush();
    }

    return docRef.id;
  }

  async flush(): Promise<void> {
    if (this.operationCount > 0) {
      await this.batch.commit();
      this.batch = this.db.batch();
      this.operationCount = 0;
    }
  }

  async commit(): Promise<void> {
    await this.flush();
  }
}
```

#### 5.2 Create optimized mesocycle service

Create `packages/functions/src/services/mesocycle-batch.service.ts`:

Modify the `generateWorkouts` method to use BatchWriter:

```typescript
import { BatchWriter } from '../utils/batch-writer';
import { getCollectionName } from '../firebase';

private async generateWorkouts(
  mesocycleId: string,
  planDaysWithExercises: PlanDayWithExercises[],
  startDate: Date
): Promise<void> {
  const batchWriter = new BatchWriter(this.db);
  const workoutsCollection = getCollectionName('workouts');
  const setsCollection = getCollectionName('workout_sets');

  const now = new Date().toISOString();

  for (let weekNum = 1; weekNum <= 7; weekNum++) {
    const isDeload = weekNum === 7;

    for (const { day, exercises } of planDaysWithExercises) {
      const scheduledDate = this.calculateScheduledDate(startDate, weekNum, day.day_of_week);

      // Create workout document
      const workoutId = await batchWriter.create(workoutsCollection, {
        mesocycle_id: mesocycleId,
        plan_day_id: day.id,
        week_number: weekNum,
        scheduled_date: scheduledDate,
        status: 'pending',
        created_at: now,
        updated_at: now,
      });

      // Create workout sets
      for (const { planDayExercise, exercise } of exercises) {
        const { targetReps, targetWeight, setCount } = this.calculateProgression(
          planDayExercise.base_reps,
          planDayExercise.base_weight,
          planDayExercise.sets,
          exercise.weight_increment,
          weekNum,
          isDeload
        );

        for (let setNum = 1; setNum <= setCount; setNum++) {
          await batchWriter.create(setsCollection, {
            workout_id: workoutId,
            exercise_id: exercise.id,
            set_number: setNum,
            target_reps: targetReps,
            target_weight: targetWeight,
            actual_reps: null,
            actual_weight: null,
            status: 'pending',
            created_at: now,
            updated_at: now,
          });
        }
      }
    }
  }

  // Commit any remaining operations
  await batchWriter.commit();
}
```

#### 5.3 Create `packages/functions/src/handlers/mesocycles.ts`

```typescript
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { createMesocycleSchema } from '@brad-os/shared';
import { validate } from '../middleware/validate';
import { errorHandler, NotFoundError, ValidationError, ConflictError } from '../middleware/error-handler';
import { MesocycleBatchService } from '../services/mesocycle-batch.service';
import { getFirestoreDb } from '../firebase';

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

let service: MesocycleBatchService | null = null;
function getService(): MesocycleBatchService {
  if (!service) service = new MesocycleBatchService(getFirestoreDb());
  return service;
}

// GET /mesocycles
app.get('/', async (_req, res, next) => {
  try {
    const mesocycles = await getService().findAll();
    res.json({ success: true, data: mesocycles });
  } catch (error) {
    next(error);
  }
});

// GET /mesocycles/active
app.get('/active', async (_req, res, next) => {
  try {
    const mesocycle = await getService().findActive();
    res.json({ success: true, data: mesocycle });
  } catch (error) {
    next(error);
  }
});

// GET /mesocycles/:id
app.get('/:id', async (req, res, next) => {
  try {
    const mesocycle = await getService().findById(req.params.id);
    if (!mesocycle) throw new NotFoundError('Mesocycle', req.params.id);
    res.json({ success: true, data: mesocycle });
  } catch (error) {
    next(error);
  }
});

// POST /mesocycles
app.post('/', validate(createMesocycleSchema), async (req, res, next) => {
  try {
    const mesocycle = await getService().create(req.body);
    res.status(201).json({ success: true, data: mesocycle });
  } catch (error) {
    next(error);
  }
});

// PUT /mesocycles/:id/start - THE CRITICAL ENDPOINT
app.put('/:id/start', async (req, res, next) => {
  try {
    const mesocycle = await getService().start(req.params.id);
    res.json({ success: true, data: mesocycle });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return next(new NotFoundError('Mesocycle', req.params.id));
      }
      if (error.message.includes('Cannot') || error.message.includes('already')) {
        return next(new ValidationError(error.message));
      }
    }
    next(error);
  }
});

// PUT /mesocycles/:id/complete
app.put('/:id/complete', async (req, res, next) => {
  try {
    const mesocycle = await getService().complete(req.params.id);
    res.json({ success: true, data: mesocycle });
  } catch (error) {
    next(error);
  }
});

// PUT /mesocycles/:id/cancel
app.put('/:id/cancel', async (req, res, next) => {
  try {
    const mesocycle = await getService().cancel(req.params.id);
    res.json({ success: true, data: mesocycle });
  } catch (error) {
    next(error);
  }
});

app.use(errorHandler);

export const mesocyclesApp = app;
```

#### 5.4 Update `packages/functions/src/index.ts` with extended timeout

```typescript
import { mesocyclesApp } from './handlers/mesocycles';

// Mesocycles needs extended timeout for start operation
const mesocycleOptions: HttpsOptions = {
  ...defaultOptions,
  timeoutSeconds: 300, // 5 minutes for large workout generation
};

export const mesocycles = onRequest(mesocycleOptions, mesocyclesApp);
```

### Success Criteria

- [ ] BatchWriter correctly commits in chunks of 500
- [ ] Mesocycle start completes for seed data in < 10 seconds
- [ ] Mesocycle start handles large plans (5 days, 8 exercises) without timeout
- [ ] All generated workouts and sets have correct IDs and relationships

### Confirmation Gate
Test mesocycle start with a large plan and verify:
1. Completion time is reasonable
2. All data is correctly written
3. No partial writes on failure

---

## Phase 6: Deployment Configuration

### Overview
Configure Firebase hosting rewrites and deploy functions.

### Changes Required

#### 6.1 Update `firebase.json` with hosting rewrites

```json
{
  "functions": {
    "source": "packages/functions",
    "runtime": "nodejs20"
  },
  "hosting": {
    "public": "public",
    "rewrites": [
      { "source": "/api/health/**", "function": "health" },
      { "source": "/api/exercises/**", "function": "exercises" },
      { "source": "/api/plans/**", "function": "plans" },
      { "source": "/api/mesocycles/**", "function": "mesocycles" },
      { "source": "/api/workouts/**", "function": "workouts" },
      { "source": "/api/workout-sets/**", "function": "workoutSets" },
      { "source": "/api/stretch-sessions/**", "function": "stretchSessions" },
      { "source": "/api/meditation-sessions/**", "function": "meditationSessions" },
      { "source": "/api/calendar/**", "function": "calendar" }
    ]
  }
}
```

#### 6.2 Create deployment script

Create `scripts/deploy-functions.sh`:

```bash
#!/bin/bash
set -e

echo "Building shared package..."
npm run build -w @brad-os/shared

echo "Building functions..."
cd packages/functions
npm run build

echo "Deploying to Firebase..."
firebase deploy --only functions

echo "Deployment complete!"
```

#### 6.3 Configure minimum instances for latency-sensitive functions

Update index.ts:

```typescript
// Workouts and workout sets are latency-sensitive during active workouts
const workoutOptions: HttpsOptions = {
  ...defaultOptions,
  minInstances: 1, // Keep warm to avoid cold starts
};

export const workouts = onRequest(workoutOptions, workoutsApp);
export const workoutSets = onRequest(workoutOptions, workoutSetsApp);
```

### Success Criteria

- [ ] Deploy script runs without errors
- [ ] All functions show in Firebase console
- [ ] Hosting rewrites route correctly to functions
- [ ] URLs accessible: `https://<project>.web.app/api/health`

### Confirmation Gate
Full deployment and smoke test of all endpoints.

---

## Phase 7: iOS Client Update

### Overview
Update iOS app to use Cloud Functions URLs.

### Changes Required

#### 7.1 Update `ios/BradOS/BradOS/Services/APIConfiguration.swift`

```swift
struct APIConfiguration {
    let baseURL: URL

    static var `default`: APIConfiguration {
        #if DEBUG
        #if targetEnvironment(simulator)
        // Local development - still use Express server
        let urlString = "http://localhost:3001/api"
        #else
        // Device testing - use Cloud Functions
        let urlString = "https://brad-os.web.app/api"
        #endif
        #else
        // Production - Cloud Functions
        let urlString = "https://brad-os.web.app/api"
        #endif

        guard let url = URL(string: urlString) else {
            fatalError("Invalid API base URL: \(urlString)")
        }
        return APIConfiguration(baseURL: url)
    }
}
```

### Success Criteria

- [ ] Simulator uses localhost for local dev
- [ ] Device and release builds use Cloud Functions
- [ ] All API calls work through new URLs

### Confirmation Gate
Test app on device against Cloud Functions.

---

## Testing Strategy

### Unit Tests

| Test | Location | Description |
|------|----------|-------------|
| `batch-writer.test.ts` | `packages/functions/src/utils/` | Verify batch commits at 500 ops |
| `mesocycle-batch.test.ts` | `packages/functions/src/services/` | Verify workout generation |
| Handler tests | `packages/functions/src/handlers/` | Test each Express app |

### Integration Tests

| Test | Description |
|------|-------------|
| Emulator tests | Run all handlers against Firebase emulator |
| Mesocycle stress test | Create plan with 5 days, 8 exercises, verify completion |

### Manual Testing Checklist

- [ ] Health endpoint returns status
- [ ] Exercise CRUD operations
- [ ] Plan CRUD with nested days/exercises
- [ ] Mesocycle create → start → complete flow
- [ ] Workout start → log sets → complete flow
- [ ] Calendar returns aggregated data
- [ ] Stretch session recording
- [ ] Meditation session recording

---

## Rollback Plan

If issues arise after deployment:

1. **Immediate**: Update iOS `APIConfiguration` to point back to Express server
2. **Short-term**: Keep Express server running as fallback
3. **Investigation**: Use Firebase logs to diagnose issues

The Express server remains functional and can be used while investigating Cloud Functions issues.

---

## References

- Server routes: `packages/server/src/routes/*.ts`
- Server services: `packages/server/src/services/*.ts`
- Shared schemas: `packages/shared/src/schemas/*.ts`
- Firebase docs: https://firebase.google.com/docs/functions
- Cloud Functions v2 migration: https://firebase.google.com/docs/functions/version-comparison
- Firestore batch writes: https://firebase.google.com/docs/firestore/manage-data/transactions#batched-writes
