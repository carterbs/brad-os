# Phase 5: Mesocycle Management (TDD)

## Overview

Build the Mesocycle feature with a full Test-Driven Development approach. A mesocycle is an instance of running a training plan over a configured duration (default 6 weeks + 1 deload week). This phase implements the core workout scheduling and tracking infrastructure.

---

## Key Concepts

### Mesocycle Definition

- **Duration**: Configurable, defaults to 6 weeks of progressive overload + 1 deload week (7 weeks total)
- **Constraint**: Only ONE mesocycle can be active at a time
- **Workout Generation**: Starting a mesocycle pre-generates all workout records for the entire duration
- **States**: `active`, `completed`, `cancelled`

### Progressive Overload Schedule

Based on requirements:

- **Week 0**: User-specified starting weight and reps
- **Week 1**: +1 rep to each exercise
- **Week 2**: +5 lbs weight (reset reps to starting)
- **Week 3**: +1 rep
- **Week 4**: +5 lbs weight (reset reps)
- **Week 5**: +1 rep
- **Week 6 (Deload)**: 50% volume reduction (same weight, half the sets)

### Workout Status

- `pending` - Not yet started
- `in_progress` - Started but not completed
- `completed` - All sets logged or manually completed
- `skipped` - User explicitly skipped this workout

---

## Database Schema

### File: `packages/backend/src/db/schema.ts`

```typescript
// Add to existing schema

export const mesocycles = sqliteTable('mesocycles', {
  id: text('id').primaryKey(), // UUID
  planId: text('plan_id')
    .notNull()
    .references(() => plans.id),
  startDate: text('start_date').notNull(), // ISO date string (YYYY-MM-DD)
  endDate: text('end_date').notNull(), // Calculated from startDate + duration
  durationWeeks: integer('duration_weeks').notNull().default(6),
  deloadWeek: integer('deload_week').notNull().default(1), // 1 = yes, 0 = no
  status: text('status', { enum: ['active', 'completed', 'cancelled'] })
    .notNull()
    .default('active'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  completedAt: text('completed_at'), // When status changed to completed/cancelled
});

export const scheduledWorkouts = sqliteTable('scheduled_workouts', {
  id: text('id').primaryKey(), // UUID
  mesocycleId: text('mesocycle_id')
    .notNull()
    .references(() => mesocycles.id),
  planDayId: text('plan_day_id')
    .notNull()
    .references(() => planDays.id),
  weekNumber: integer('week_number').notNull(), // 0-indexed (0-6 for 7 weeks)
  scheduledDate: text('scheduled_date').notNull(), // ISO date string
  status: text('status', {
    enum: ['pending', 'in_progress', 'completed', 'skipped'],
  })
    .notNull()
    .default('pending'),
  startedAt: text('started_at'),
  completedAt: text('completed_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const scheduledExercises = sqliteTable('scheduled_exercises', {
  id: text('id').primaryKey(), // UUID
  scheduledWorkoutId: text('scheduled_workout_id')
    .notNull()
    .references(() => scheduledWorkouts.id),
  planExerciseId: text('plan_exercise_id')
    .notNull()
    .references(() => planExercises.id),
  exerciseId: text('exercise_id')
    .notNull()
    .references(() => exercises.id),
  targetWeight: integer('target_weight').notNull(), // Calculated based on week
  targetSets: integer('target_sets').notNull(),
  targetReps: integer('target_reps').notNull(), // Calculated based on week
  restSeconds: integer('rest_seconds').notNull(),
  order: integer('order').notNull(),
  createdAt: text('created_at').notNull(),
});

export const completedSets = sqliteTable('completed_sets', {
  id: text('id').primaryKey(), // UUID
  scheduledExerciseId: text('scheduled_exercise_id')
    .notNull()
    .references(() => scheduledExercises.id),
  setNumber: integer('set_number').notNull(),
  actualWeight: integer('actual_weight').notNull(),
  actualReps: integer('actual_reps').notNull(),
  skipped: integer('skipped').notNull().default(0), // 1 = skipped, 0 = completed
  completedAt: text('completed_at').notNull(),
});
```

---

## Implementation Tasks

### Phase 5.1: Backend Test Infrastructure & Schema

#### Task 5.1.1: Database Migration

**File**: `packages/backend/src/db/migrations/005_mesocycles.ts`

```typescript
import { sql } from 'drizzle-orm';
import { db } from '../index';

export async function up() {
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS mesocycles (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL REFERENCES plans(id),
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      duration_weeks INTEGER NOT NULL DEFAULT 6,
      deload_week INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'completed', 'cancelled')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT
    )
  `);

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS scheduled_workouts (
      id TEXT PRIMARY KEY,
      mesocycle_id TEXT NOT NULL REFERENCES mesocycles(id),
      plan_day_id TEXT NOT NULL REFERENCES plan_days(id),
      week_number INTEGER NOT NULL,
      scheduled_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'completed', 'skipped')),
      started_at TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS scheduled_exercises (
      id TEXT PRIMARY KEY,
      scheduled_workout_id TEXT NOT NULL REFERENCES scheduled_workouts(id),
      plan_exercise_id TEXT NOT NULL REFERENCES plan_exercises(id),
      exercise_id TEXT NOT NULL REFERENCES exercises(id),
      target_weight INTEGER NOT NULL,
      target_sets INTEGER NOT NULL,
      target_reps INTEGER NOT NULL,
      rest_seconds INTEGER NOT NULL,
      "order" INTEGER NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS completed_sets (
      id TEXT PRIMARY KEY,
      scheduled_exercise_id TEXT NOT NULL REFERENCES scheduled_exercises(id),
      set_number INTEGER NOT NULL,
      actual_weight INTEGER NOT NULL,
      actual_reps INTEGER NOT NULL,
      skipped INTEGER NOT NULL DEFAULT 0,
      completed_at TEXT NOT NULL
    )
  `);

  // Index for finding active mesocycle quickly
  await db.run(sql`CREATE INDEX idx_mesocycles_status ON mesocycles(status)`);

  // Index for finding workouts by mesocycle and date
  await db.run(
    sql`CREATE INDEX idx_scheduled_workouts_mesocycle ON scheduled_workouts(mesocycle_id, scheduled_date)`
  );
}

export async function down() {
  await db.run(sql`DROP TABLE IF EXISTS completed_sets`);
  await db.run(sql`DROP TABLE IF EXISTS scheduled_exercises`);
  await db.run(sql`DROP TABLE IF EXISTS scheduled_workouts`);
  await db.run(sql`DROP INDEX IF EXISTS idx_mesocycles_status`);
  await db.run(sql`DROP TABLE IF EXISTS mesocycles`);
}
```

#### Task 5.1.2: Type Definitions

**File**: `packages/shared/src/types/mesocycle.ts`

```typescript
export type MesocycleStatus = 'active' | 'completed' | 'cancelled';
export type WorkoutStatus = 'pending' | 'in_progress' | 'completed' | 'skipped';

export interface Mesocycle {
  id: string;
  planId: string;
  planName?: string; // Joined from plans table
  startDate: string;
  endDate: string;
  durationWeeks: number;
  deloadWeek: boolean;
  status: MesocycleStatus;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface ScheduledWorkout {
  id: string;
  mesocycleId: string;
  planDayId: string;
  dayName?: string; // Joined from plan_days
  weekNumber: number;
  scheduledDate: string;
  status: WorkoutStatus;
  startedAt: string | null;
  completedAt: string | null;
  exercises?: ScheduledExercise[];
}

export interface ScheduledExercise {
  id: string;
  scheduledWorkoutId: string;
  planExerciseId: string;
  exerciseId: string;
  exerciseName?: string; // Joined from exercises
  targetWeight: number;
  targetSets: number;
  targetReps: number;
  restSeconds: number;
  order: number;
  completedSets?: CompletedSet[];
}

export interface CompletedSet {
  id: string;
  scheduledExerciseId: string;
  setNumber: number;
  actualWeight: number;
  actualReps: number;
  skipped: boolean;
  completedAt: string;
}

export interface CreateMesocycleRequest {
  planId: string;
  startDate: string; // ISO date string YYYY-MM-DD
  durationWeeks?: number; // Default 6
  includeDeload?: boolean; // Default true
}

export interface MesocycleWithWorkouts extends Mesocycle {
  workouts: ScheduledWorkout[];
  weeksSummary: WeekSummary[];
}

export interface WeekSummary {
  weekNumber: number;
  startDate: string;
  endDate: string;
  isDeload: boolean;
  workouts: {
    id: string;
    dayName: string;
    scheduledDate: string;
    status: WorkoutStatus;
  }[];
  completedCount: number;
  totalCount: number;
}
```

---

### Phase 5.2: Backend Service Layer (TDD)

#### Task 5.2.1: Mesocycle Service Tests

**File**: `packages/backend/src/services/__tests__/mesocycle.service.test.ts`

Write tests FIRST for each method:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MesocycleService } from '../mesocycle.service';
import { db } from '../../db';
import {
  createTestPlan,
  createTestExercises,
  cleanupTestData,
} from '../../test/helpers';

describe('MesocycleService', () => {
  let service: MesocycleService;
  let testPlanId: string;

  beforeEach(async () => {
    service = new MesocycleService();
    // Create test plan with days and exercises
    const { planId } = await createTestPlan();
    testPlanId = planId;
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  describe('create', () => {
    it('should create a new mesocycle with default 6+1 weeks', async () => {
      const startDate = '2024-01-01';
      const result = await service.create({
        planId: testPlanId,
        startDate,
      });

      expect(result.id).toBeDefined();
      expect(result.planId).toBe(testPlanId);
      expect(result.status).toBe('active');
      expect(result.durationWeeks).toBe(6);
      expect(result.deloadWeek).toBe(true);
      expect(result.startDate).toBe(startDate);
      // End date should be 7 weeks from start (6 + 1 deload)
      expect(result.endDate).toBe('2024-02-18');
    });

    it('should generate workout records for each day in each week', async () => {
      const result = await service.create({
        planId: testPlanId,
        startDate: '2024-01-01',
      });

      const workouts = await service.getWorkoutsByMesocycle(result.id);
      // Assuming plan has 3 workout days per week, 7 weeks = 21 workouts
      expect(workouts.length).toBeGreaterThan(0);

      // Each workout should have scheduled exercises
      for (const workout of workouts) {
        expect(workout.exercises).toBeDefined();
        expect(workout.exercises!.length).toBeGreaterThan(0);
      }
    });

    it('should calculate progressive overload for each week', async () => {
      const result = await service.create({
        planId: testPlanId,
        startDate: '2024-01-01',
      });

      const workouts = await service.getWorkoutsByMesocycle(result.id);

      // Get same exercise across different weeks
      const week0Exercise = workouts.find((w) => w.weekNumber === 0)
        ?.exercises?.[0];
      const week1Exercise = workouts
        .find((w) => w.weekNumber === 1)
        ?.exercises?.find(
          (e) => e.planExerciseId === week0Exercise?.planExerciseId
        );
      const week2Exercise = workouts
        .find((w) => w.weekNumber === 2)
        ?.exercises?.find(
          (e) => e.planExerciseId === week0Exercise?.planExerciseId
        );

      // Week 1: +1 rep
      expect(week1Exercise!.targetReps).toBe(week0Exercise!.targetReps + 1);
      expect(week1Exercise!.targetWeight).toBe(week0Exercise!.targetWeight);

      // Week 2: +5 lbs, reset reps
      expect(week2Exercise!.targetWeight).toBe(week0Exercise!.targetWeight + 5);
      expect(week2Exercise!.targetReps).toBe(week0Exercise!.targetReps);
    });

    it('should apply deload week with 50% volume', async () => {
      const result = await service.create({
        planId: testPlanId,
        startDate: '2024-01-01',
      });

      const workouts = await service.getWorkoutsByMesocycle(result.id);

      const week0Exercise = workouts.find((w) => w.weekNumber === 0)
        ?.exercises?.[0];
      const deloadExercise = workouts
        .find((w) => w.weekNumber === 6)
        ?.exercises?.find(
          (e) => e.planExerciseId === week0Exercise?.planExerciseId
        );

      // Deload: same weight, half sets (rounded up)
      expect(deloadExercise!.targetWeight).toBe(
        week0Exercise!.targetWeight + 10
      ); // After 3 weight increases
      expect(deloadExercise!.targetSets).toBe(
        Math.ceil(week0Exercise!.targetSets / 2)
      );
    });

    it('should fail if another mesocycle is active', async () => {
      await service.create({
        planId: testPlanId,
        startDate: '2024-01-01',
      });

      await expect(
        service.create({
          planId: testPlanId,
          startDate: '2024-03-01',
        })
      ).rejects.toThrow('Another mesocycle is already active');
    });

    it('should fail if plan does not exist', async () => {
      await expect(
        service.create({
          planId: 'non-existent-plan-id',
          startDate: '2024-01-01',
        })
      ).rejects.toThrow('Plan not found');
    });

    it('should fail if plan has no workout days', async () => {
      const emptyPlanId = await createEmptyPlan();

      await expect(
        service.create({
          planId: emptyPlanId,
          startDate: '2024-01-01',
        })
      ).rejects.toThrow('Plan has no workout days');
    });
  });

  describe('getActive', () => {
    it('should return the active mesocycle', async () => {
      const created = await service.create({
        planId: testPlanId,
        startDate: '2024-01-01',
      });

      const active = await service.getActive();

      expect(active).toBeDefined();
      expect(active!.id).toBe(created.id);
      expect(active!.status).toBe('active');
    });

    it('should return null if no active mesocycle', async () => {
      const active = await service.getActive();
      expect(active).toBeNull();
    });

    it('should not return completed mesocycles', async () => {
      const created = await service.create({
        planId: testPlanId,
        startDate: '2024-01-01',
      });
      await service.complete(created.id);

      const active = await service.getActive();
      expect(active).toBeNull();
    });
  });

  describe('getById', () => {
    it('should return mesocycle with all workouts', async () => {
      const created = await service.create({
        planId: testPlanId,
        startDate: '2024-01-01',
      });

      const result = await service.getById(created.id);

      expect(result).toBeDefined();
      expect(result!.id).toBe(created.id);
      expect(result!.workouts).toBeDefined();
      expect(result!.weeksSummary).toBeDefined();
      expect(result!.weeksSummary.length).toBe(7); // 6 weeks + 1 deload
    });

    it('should return null for non-existent id', async () => {
      const result = await service.getById('non-existent-id');
      expect(result).toBeNull();
    });
  });

  describe('list', () => {
    it('should return all mesocycles ordered by creation date desc', async () => {
      const meso1 = await service.create({
        planId: testPlanId,
        startDate: '2024-01-01',
      });
      await service.complete(meso1.id);

      const meso2 = await service.create({
        planId: testPlanId,
        startDate: '2024-03-01',
      });

      const list = await service.list();

      expect(list.length).toBe(2);
      expect(list[0].id).toBe(meso2.id);
      expect(list[1].id).toBe(meso1.id);
    });

    it('should return empty array when no mesocycles exist', async () => {
      const list = await service.list();
      expect(list).toEqual([]);
    });
  });

  describe('complete', () => {
    it('should mark mesocycle as completed', async () => {
      const created = await service.create({
        planId: testPlanId,
        startDate: '2024-01-01',
      });

      const completed = await service.complete(created.id);

      expect(completed.status).toBe('completed');
      expect(completed.completedAt).toBeDefined();
    });

    it('should fail for non-existent mesocycle', async () => {
      await expect(service.complete('non-existent-id')).rejects.toThrow(
        'Mesocycle not found'
      );
    });

    it('should fail if already completed', async () => {
      const created = await service.create({
        planId: testPlanId,
        startDate: '2024-01-01',
      });
      await service.complete(created.id);

      await expect(service.complete(created.id)).rejects.toThrow(
        'Mesocycle is not active'
      );
    });
  });

  describe('cancel', () => {
    it('should mark mesocycle as cancelled', async () => {
      const created = await service.create({
        planId: testPlanId,
        startDate: '2024-01-01',
      });

      const cancelled = await service.cancel(created.id);

      expect(cancelled.status).toBe('cancelled');
      expect(cancelled.completedAt).toBeDefined();
    });

    it('should preserve all workout data when cancelled', async () => {
      const created = await service.create({
        planId: testPlanId,
        startDate: '2024-01-01',
      });

      await service.cancel(created.id);

      // Verify workouts still exist
      const mesocycle = await service.getById(created.id);
      expect(mesocycle!.workouts.length).toBeGreaterThan(0);
    });

    it('should allow starting new mesocycle after cancellation', async () => {
      const created = await service.create({
        planId: testPlanId,
        startDate: '2024-01-01',
      });
      await service.cancel(created.id);

      // Should not throw
      const newMeso = await service.create({
        planId: testPlanId,
        startDate: '2024-03-01',
      });

      expect(newMeso.status).toBe('active');
    });
  });
});
```

#### Task 5.2.2: Mesocycle Service Implementation

**File**: `packages/backend/src/services/mesocycle.service.ts`

```typescript
import { eq, desc, and } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { db } from '../db';
import {
  mesocycles,
  scheduledWorkouts,
  scheduledExercises,
  plans,
  planDays,
  planExercises,
  exercises,
} from '../db/schema';
import type {
  Mesocycle,
  CreateMesocycleRequest,
  MesocycleWithWorkouts,
  ScheduledWorkout,
  WeekSummary,
} from '@brad-os/shared';
import { addDays, addWeeks, format, parseISO } from 'date-fns';

export class MesocycleService {
  async create(request: CreateMesocycleRequest): Promise<Mesocycle> {
    const {
      planId,
      startDate,
      durationWeeks = 6,
      includeDeload = true,
    } = request;

    // Check for existing active mesocycle
    const active = await this.getActive();
    if (active) {
      throw new Error('Another mesocycle is already active');
    }

    // Validate plan exists
    const plan = await db.query.plans.findFirst({
      where: eq(plans.id, planId),
    });
    if (!plan) {
      throw new Error('Plan not found');
    }

    // Get plan days with exercises
    const days = await db.query.planDays.findMany({
      where: eq(planDays.planId, planId),
      with: {
        exercises: {
          with: {
            exercise: true,
          },
        },
      },
    });

    if (days.length === 0) {
      throw new Error('Plan has no workout days');
    }

    const totalWeeks = durationWeeks + (includeDeload ? 1 : 0);
    const endDate = format(
      addDays(addWeeks(parseISO(startDate), totalWeeks), -1),
      'yyyy-MM-dd'
    );

    const now = new Date().toISOString();
    const mesocycleId = uuid();

    // Create mesocycle
    await db.insert(mesocycles).values({
      id: mesocycleId,
      planId,
      startDate,
      endDate,
      durationWeeks,
      deloadWeek: includeDeload ? 1 : 0,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });

    // Generate workouts for each week
    await this.generateWorkouts(
      mesocycleId,
      days,
      startDate,
      durationWeeks,
      includeDeload
    );

    return this.getById(mesocycleId) as Promise<Mesocycle>;
  }

  private async generateWorkouts(
    mesocycleId: string,
    planDays: PlanDayWithExercises[],
    startDate: string,
    durationWeeks: number,
    includeDeload: boolean
  ): Promise<void> {
    const totalWeeks = durationWeeks + (includeDeload ? 1 : 0);
    const start = parseISO(startDate);
    const now = new Date().toISOString();

    for (let week = 0; week < totalWeeks; week++) {
      const isDeload = includeDeload && week === totalWeeks - 1;
      const weekStart = addWeeks(start, week);

      for (const day of planDays) {
        // Calculate the actual date based on day of week
        const dayOffset = this.getDayOffset(day.dayOfWeek);
        const scheduledDate = format(
          addDays(weekStart, dayOffset),
          'yyyy-MM-dd'
        );

        const workoutId = uuid();

        await db.insert(scheduledWorkouts).values({
          id: workoutId,
          mesocycleId,
          planDayId: day.id,
          weekNumber: week,
          scheduledDate,
          status: 'pending',
          createdAt: now,
          updatedAt: now,
        });

        // Generate exercises with progressive overload
        for (const planExercise of day.exercises) {
          const { targetWeight, targetReps, targetSets } =
            this.calculateProgressiveOverload(planExercise, week, isDeload);

          await db.insert(scheduledExercises).values({
            id: uuid(),
            scheduledWorkoutId: workoutId,
            planExerciseId: planExercise.id,
            exerciseId: planExercise.exerciseId,
            targetWeight,
            targetSets,
            targetReps,
            restSeconds: planExercise.restSeconds,
            order: planExercise.order,
            createdAt: now,
          });
        }
      }
    }
  }

  private calculateProgressiveOverload(
    planExercise: PlanExercise,
    weekNumber: number,
    isDeload: boolean
  ): { targetWeight: number; targetReps: number; targetSets: number } {
    const baseWeight = planExercise.weight;
    const baseReps = planExercise.reps;
    const baseSets = planExercise.sets;
    const weightIncrement = planExercise.weightIncrement ?? 5;

    if (isDeload) {
      // Deload: use final week's weight, 50% volume (half sets, rounded up)
      const weightIncrements = Math.floor(weekNumber / 2);
      return {
        targetWeight: baseWeight + weightIncrements * weightIncrement,
        targetReps: baseReps,
        targetSets: Math.ceil(baseSets / 2),
      };
    }

    // Progressive overload pattern:
    // Week 0: base
    // Week 1: +1 rep
    // Week 2: +weight, reset reps
    // Week 3: +1 rep
    // Week 4: +weight, reset reps
    // Week 5: +1 rep

    const weightIncrements = Math.floor(weekNumber / 2);
    const repIncrements = weekNumber % 2 === 1 ? 1 : 0;

    return {
      targetWeight: baseWeight + weightIncrements * weightIncrement,
      targetReps: baseReps + repIncrements,
      targetSets: baseSets,
    };
  }

  private getDayOffset(dayOfWeek: number): number {
    // dayOfWeek: 0 = Sunday, 1 = Monday, etc.
    // Assuming week starts on Sunday
    return dayOfWeek;
  }

  async getActive(): Promise<Mesocycle | null> {
    const result = await db.query.mesocycles.findFirst({
      where: eq(mesocycles.status, 'active'),
      with: {
        plan: true,
      },
    });

    if (!result) return null;

    return this.mapToMesocycle(result);
  }

  async getById(id: string): Promise<MesocycleWithWorkouts | null> {
    const result = await db.query.mesocycles.findFirst({
      where: eq(mesocycles.id, id),
      with: {
        plan: true,
      },
    });

    if (!result) return null;

    const workouts = await this.getWorkoutsByMesocycle(id);
    const weeksSummary = this.buildWeeksSummary(
      workouts,
      result.durationWeeks,
      result.deloadWeek === 1
    );

    return {
      ...this.mapToMesocycle(result),
      workouts,
      weeksSummary,
    };
  }

  async getWorkoutsByMesocycle(
    mesocycleId: string
  ): Promise<ScheduledWorkout[]> {
    const results = await db.query.scheduledWorkouts.findMany({
      where: eq(scheduledWorkouts.mesocycleId, mesocycleId),
      with: {
        planDay: true,
        exercises: {
          with: {
            exercise: true,
            completedSets: true,
          },
        },
      },
      orderBy: [scheduledWorkouts.scheduledDate, scheduledWorkouts.id],
    });

    return results.map((w) => this.mapToScheduledWorkout(w));
  }

  private buildWeeksSummary(
    workouts: ScheduledWorkout[],
    durationWeeks: number,
    hasDeload: boolean
  ): WeekSummary[] {
    const totalWeeks = durationWeeks + (hasDeload ? 1 : 0);
    const summaries: WeekSummary[] = [];

    for (let week = 0; week < totalWeeks; week++) {
      const weekWorkouts = workouts.filter((w) => w.weekNumber === week);
      const dates = weekWorkouts.map((w) => w.scheduledDate).sort();

      summaries.push({
        weekNumber: week,
        startDate: dates[0] ?? '',
        endDate: dates[dates.length - 1] ?? '',
        isDeload: hasDeload && week === totalWeeks - 1,
        workouts: weekWorkouts.map((w) => ({
          id: w.id,
          dayName: w.dayName ?? `Day ${w.planDayId}`,
          scheduledDate: w.scheduledDate,
          status: w.status,
        })),
        completedCount: weekWorkouts.filter((w) => w.status === 'completed')
          .length,
        totalCount: weekWorkouts.length,
      });
    }

    return summaries;
  }

  async list(): Promise<Mesocycle[]> {
    const results = await db.query.mesocycles.findMany({
      with: {
        plan: true,
      },
      orderBy: desc(mesocycles.createdAt),
    });

    return results.map((m) => this.mapToMesocycle(m));
  }

  async complete(id: string): Promise<Mesocycle> {
    const mesocycle = await db.query.mesocycles.findFirst({
      where: eq(mesocycles.id, id),
    });

    if (!mesocycle) {
      throw new Error('Mesocycle not found');
    }

    if (mesocycle.status !== 'active') {
      throw new Error('Mesocycle is not active');
    }

    const now = new Date().toISOString();

    await db
      .update(mesocycles)
      .set({
        status: 'completed',
        completedAt: now,
        updatedAt: now,
      })
      .where(eq(mesocycles.id, id));

    return this.getById(id) as Promise<Mesocycle>;
  }

  async cancel(id: string): Promise<Mesocycle> {
    const mesocycle = await db.query.mesocycles.findFirst({
      where: eq(mesocycles.id, id),
    });

    if (!mesocycle) {
      throw new Error('Mesocycle not found');
    }

    if (mesocycle.status !== 'active') {
      throw new Error('Mesocycle is not active');
    }

    const now = new Date().toISOString();

    await db
      .update(mesocycles)
      .set({
        status: 'cancelled',
        completedAt: now,
        updatedAt: now,
      })
      .where(eq(mesocycles.id, id));

    // Note: Workouts are NOT deleted to preserve history

    return this.getById(id) as Promise<Mesocycle>;
  }

  private mapToMesocycle(row: MesocycleRow): Mesocycle {
    return {
      id: row.id,
      planId: row.planId,
      planName: row.plan?.name,
      startDate: row.startDate,
      endDate: row.endDate,
      durationWeeks: row.durationWeeks,
      deloadWeek: row.deloadWeek === 1,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      completedAt: row.completedAt,
    };
  }

  private mapToScheduledWorkout(row: ScheduledWorkoutRow): ScheduledWorkout {
    return {
      id: row.id,
      mesocycleId: row.mesocycleId,
      planDayId: row.planDayId,
      dayName: row.planDay?.name,
      weekNumber: row.weekNumber,
      scheduledDate: row.scheduledDate,
      status: row.status,
      startedAt: row.startedAt,
      completedAt: row.completedAt,
      exercises: row.exercises?.map((e) => ({
        id: e.id,
        scheduledWorkoutId: e.scheduledWorkoutId,
        planExerciseId: e.planExerciseId,
        exerciseId: e.exerciseId,
        exerciseName: e.exercise?.name,
        targetWeight: e.targetWeight,
        targetSets: e.targetSets,
        targetReps: e.targetReps,
        restSeconds: e.restSeconds,
        order: e.order,
        completedSets: e.completedSets?.map((s) => ({
          id: s.id,
          scheduledExerciseId: s.scheduledExerciseId,
          setNumber: s.setNumber,
          actualWeight: s.actualWeight,
          actualReps: s.actualReps,
          skipped: s.skipped === 1,
          completedAt: s.completedAt,
        })),
      })),
    };
  }
}
```

---

### Phase 5.3: Backend API Routes (TDD)

#### Task 5.3.1: Route Tests

**File**: `packages/backend/src/routes/__tests__/mesocycles.routes.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../../app';
import { createTestPlan, cleanupTestData } from '../../test/helpers';

describe('Mesocycles API Routes', () => {
  let testPlanId: string;

  beforeEach(async () => {
    const { planId } = await createTestPlan();
    testPlanId = planId;
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  describe('GET /api/mesocycles', () => {
    it('should return empty array when no mesocycles', async () => {
      const response = await request(app).get('/api/mesocycles');

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it('should return all mesocycles ordered by date desc', async () => {
      // Create two mesocycles
      await request(app)
        .post('/api/mesocycles')
        .send({ planId: testPlanId, startDate: '2024-01-01' });

      // Complete first to create second
      const listRes = await request(app).get('/api/mesocycles');
      await request(app).put(`/api/mesocycles/${listRes.body[0].id}/complete`);

      await request(app)
        .post('/api/mesocycles')
        .send({ planId: testPlanId, startDate: '2024-03-01' });

      const response = await request(app).get('/api/mesocycles');

      expect(response.status).toBe(200);
      expect(response.body.length).toBe(2);
      expect(
        new Date(response.body[0].startDate) >
          new Date(response.body[1].startDate)
      ).toBe(true);
    });
  });

  describe('GET /api/mesocycles/active', () => {
    it('should return null when no active mesocycle', async () => {
      const response = await request(app).get('/api/mesocycles/active');

      expect(response.status).toBe(200);
      expect(response.body).toBeNull();
    });

    it('should return the active mesocycle', async () => {
      await request(app)
        .post('/api/mesocycles')
        .send({ planId: testPlanId, startDate: '2024-01-01' });

      const response = await request(app).get('/api/mesocycles/active');

      expect(response.status).toBe(200);
      expect(response.body).not.toBeNull();
      expect(response.body.status).toBe('active');
    });
  });

  describe('GET /api/mesocycles/:id', () => {
    it('should return 404 for non-existent mesocycle', async () => {
      const response = await request(app).get(
        '/api/mesocycles/non-existent-id'
      );

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Mesocycle not found');
    });

    it('should return mesocycle with workouts and week summary', async () => {
      const createRes = await request(app)
        .post('/api/mesocycles')
        .send({ planId: testPlanId, startDate: '2024-01-01' });

      const response = await request(app).get(
        `/api/mesocycles/${createRes.body.id}`
      );

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(createRes.body.id);
      expect(response.body.workouts).toBeDefined();
      expect(response.body.weeksSummary).toBeDefined();
      expect(response.body.weeksSummary.length).toBe(7);
    });
  });

  describe('POST /api/mesocycles', () => {
    it('should create a new mesocycle', async () => {
      const response = await request(app).post('/api/mesocycles').send({
        planId: testPlanId,
        startDate: '2024-01-01',
      });

      expect(response.status).toBe(201);
      expect(response.body.id).toBeDefined();
      expect(response.body.status).toBe('active');
      expect(response.body.planId).toBe(testPlanId);
    });

    it('should return 400 if planId is missing', async () => {
      const response = await request(app)
        .post('/api/mesocycles')
        .send({ startDate: '2024-01-01' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('planId');
    });

    it('should return 400 if startDate is missing', async () => {
      const response = await request(app)
        .post('/api/mesocycles')
        .send({ planId: testPlanId });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('startDate');
    });

    it('should return 400 if startDate is invalid format', async () => {
      const response = await request(app)
        .post('/api/mesocycles')
        .send({ planId: testPlanId, startDate: 'not-a-date' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('startDate');
    });

    it('should return 409 if another mesocycle is active', async () => {
      await request(app)
        .post('/api/mesocycles')
        .send({ planId: testPlanId, startDate: '2024-01-01' });

      const response = await request(app)
        .post('/api/mesocycles')
        .send({ planId: testPlanId, startDate: '2024-03-01' });

      expect(response.status).toBe(409);
      expect(response.body.error).toBe('Another mesocycle is already active');
    });

    it('should return 404 if plan does not exist', async () => {
      const response = await request(app)
        .post('/api/mesocycles')
        .send({ planId: 'non-existent-plan', startDate: '2024-01-01' });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Plan not found');
    });

    it('should accept custom durationWeeks', async () => {
      const response = await request(app).post('/api/mesocycles').send({
        planId: testPlanId,
        startDate: '2024-01-01',
        durationWeeks: 4,
      });

      expect(response.status).toBe(201);
      expect(response.body.durationWeeks).toBe(4);
    });

    it('should accept includeDeload option', async () => {
      const response = await request(app).post('/api/mesocycles').send({
        planId: testPlanId,
        startDate: '2024-01-01',
        includeDeload: false,
      });

      expect(response.status).toBe(201);
      expect(response.body.deloadWeek).toBe(false);
    });
  });

  describe('PUT /api/mesocycles/:id/complete', () => {
    it('should mark mesocycle as completed', async () => {
      const createRes = await request(app)
        .post('/api/mesocycles')
        .send({ planId: testPlanId, startDate: '2024-01-01' });

      const response = await request(app).put(
        `/api/mesocycles/${createRes.body.id}/complete`
      );

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('completed');
      expect(response.body.completedAt).toBeDefined();
    });

    it('should return 404 for non-existent mesocycle', async () => {
      const response = await request(app).put(
        '/api/mesocycles/non-existent-id/complete'
      );

      expect(response.status).toBe(404);
    });

    it('should return 400 if mesocycle is not active', async () => {
      const createRes = await request(app)
        .post('/api/mesocycles')
        .send({ planId: testPlanId, startDate: '2024-01-01' });

      await request(app).put(`/api/mesocycles/${createRes.body.id}/complete`);

      const response = await request(app).put(
        `/api/mesocycles/${createRes.body.id}/complete`
      );

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Mesocycle is not active');
    });
  });

  describe('PUT /api/mesocycles/:id/cancel', () => {
    it('should mark mesocycle as cancelled', async () => {
      const createRes = await request(app)
        .post('/api/mesocycles')
        .send({ planId: testPlanId, startDate: '2024-01-01' });

      const response = await request(app).put(
        `/api/mesocycles/${createRes.body.id}/cancel`
      );

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('cancelled');
    });

    it('should preserve workout data after cancellation', async () => {
      const createRes = await request(app)
        .post('/api/mesocycles')
        .send({ planId: testPlanId, startDate: '2024-01-01' });

      await request(app).put(`/api/mesocycles/${createRes.body.id}/cancel`);

      const getRes = await request(app).get(
        `/api/mesocycles/${createRes.body.id}`
      );

      expect(getRes.body.workouts.length).toBeGreaterThan(0);
    });

    it('should return 404 for non-existent mesocycle', async () => {
      const response = await request(app).put(
        '/api/mesocycles/non-existent-id/cancel'
      );

      expect(response.status).toBe(404);
    });
  });
});
```

#### Task 5.3.2: Route Implementation

**File**: `packages/backend/src/routes/mesocycles.routes.ts`

```typescript
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { MesocycleService } from '../services/mesocycle.service';

const router = Router();
const service = new MesocycleService();

const createMesocycleSchema = z.object({
  planId: z.string().min(1, 'planId is required'),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be in YYYY-MM-DD format'),
  durationWeeks: z.number().int().min(1).max(12).optional(),
  includeDeload: z.boolean().optional(),
});

// GET /api/mesocycles - List all mesocycles
router.get('/', async (req: Request, res: Response) => {
  try {
    const mesocycles = await service.list();
    res.json(mesocycles);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch mesocycles' });
  }
});

// GET /api/mesocycles/active - Get current active mesocycle
router.get('/active', async (req: Request, res: Response) => {
  try {
    const active = await service.getActive();
    res.json(active);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch active mesocycle' });
  }
});

// GET /api/mesocycles/:id - Get mesocycle with workouts
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const mesocycle = await service.getById(req.params.id);
    if (!mesocycle) {
      return res.status(404).json({ error: 'Mesocycle not found' });
    }
    res.json(mesocycle);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch mesocycle' });
  }
});

// POST /api/mesocycles - Start new mesocycle
router.post('/', async (req: Request, res: Response) => {
  try {
    const parsed = createMesocycleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.errors
          .map((e) => `${e.path.join('.')}: ${e.message}`)
          .join(', '),
      });
    }

    const mesocycle = await service.create(parsed.data);
    res.status(201).json(mesocycle);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Another mesocycle is already active') {
        return res.status(409).json({ error: error.message });
      }
      if (error.message === 'Plan not found') {
        return res.status(404).json({ error: error.message });
      }
      if (error.message === 'Plan has no workout days') {
        return res.status(400).json({ error: error.message });
      }
    }
    res.status(500).json({ error: 'Failed to create mesocycle' });
  }
});

// PUT /api/mesocycles/:id/complete - Mark as completed
router.put('/:id/complete', async (req: Request, res: Response) => {
  try {
    const mesocycle = await service.complete(req.params.id);
    res.json(mesocycle);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Mesocycle not found') {
        return res.status(404).json({ error: error.message });
      }
      if (error.message === 'Mesocycle is not active') {
        return res.status(400).json({ error: error.message });
      }
    }
    res.status(500).json({ error: 'Failed to complete mesocycle' });
  }
});

// PUT /api/mesocycles/:id/cancel - Mark as cancelled
router.put('/:id/cancel', async (req: Request, res: Response) => {
  try {
    const mesocycle = await service.cancel(req.params.id);
    res.json(mesocycle);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Mesocycle not found') {
        return res.status(404).json({ error: error.message });
      }
      if (error.message === 'Mesocycle is not active') {
        return res.status(400).json({ error: error.message });
      }
    }
    res.status(500).json({ error: 'Failed to cancel mesocycle' });
  }
});

export { router as mesocyclesRouter };
```

#### Task 5.3.3: Register Routes

**File**: `packages/backend/src/app.ts` (update)

```typescript
// Add import
import { mesocyclesRouter } from './routes/mesocycles.routes';

// Add route registration (after existing routes)
app.use('/api/mesocycles', mesocyclesRouter);
```

---

### Phase 5.4: Frontend Components (TDD)

#### Task 5.4.1: Mesocycle Types & API Client

**File**: `packages/frontend/src/api/mesocycles.ts`

```typescript
import type {
  Mesocycle,
  MesocycleWithWorkouts,
  CreateMesocycleRequest,
} from '@brad-os/shared';

const API_BASE = '/api/mesocycles';

export const mesocyclesApi = {
  async list(): Promise<Mesocycle[]> {
    const response = await fetch(API_BASE);
    if (!response.ok) throw new Error('Failed to fetch mesocycles');
    return response.json();
  },

  async getActive(): Promise<Mesocycle | null> {
    const response = await fetch(`${API_BASE}/active`);
    if (!response.ok) throw new Error('Failed to fetch active mesocycle');
    return response.json();
  },

  async getById(id: string): Promise<MesocycleWithWorkouts> {
    const response = await fetch(`${API_BASE}/${id}`);
    if (!response.ok) throw new Error('Failed to fetch mesocycle');
    return response.json();
  },

  async create(data: CreateMesocycleRequest): Promise<Mesocycle> {
    const response = await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create mesocycle');
    }
    return response.json();
  },

  async complete(id: string): Promise<Mesocycle> {
    const response = await fetch(`${API_BASE}/${id}/complete`, {
      method: 'PUT',
    });
    if (!response.ok) throw new Error('Failed to complete mesocycle');
    return response.json();
  },

  async cancel(id: string): Promise<Mesocycle> {
    const response = await fetch(`${API_BASE}/${id}/cancel`, {
      method: 'PUT',
    });
    if (!response.ok) throw new Error('Failed to cancel mesocycle');
    return response.json();
  },
};
```

#### Task 5.4.2: Mesocycle Hook Tests

**File**: `packages/frontend/src/hooks/__tests__/useMesocycle.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useMesocycle, useActiveMesocycle, useMesocycles } from '../useMesocycle';
import { mesocyclesApi } from '../../api/mesocycles';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';

vi.mock('../../api/mesocycles');

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
};

describe('useMesocycles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch and return mesocycles list', async () => {
    const mockMesocycles = [
      { id: '1', planId: 'p1', status: 'active', startDate: '2024-01-01' },
      { id: '2', planId: 'p1', status: 'completed', startDate: '2023-10-01' },
    ];
    vi.mocked(mesocyclesApi.list).mockResolvedValue(mockMesocycles);

    const { result } = renderHook(() => useMesocycles(), { wrapper });

    await waitFor(() => {
      expect(result.current.data).toEqual(mockMesocycles);
    });
  });
});

describe('useActiveMesocycle', () => {
  it('should return null when no active mesocycle', async () => {
    vi.mocked(mesocyclesApi.getActive).mockResolvedValue(null);

    const { result } = renderHook(() => useActiveMesocycle(), { wrapper });

    await waitFor(() => {
      expect(result.current.data).toBeNull();
    });
  });

  it('should return active mesocycle when one exists', async () => {
    const mockActive = { id: '1', planId: 'p1', status: 'active' };
    vi.mocked(mesocyclesApi.getActive).mockResolvedValue(mockActive);

    const { result } = renderHook(() => useActiveMesocycle(), { wrapper });

    await waitFor(() => {
      expect(result.current.data).toEqual(mockActive);
    });
  });
});

describe('useMesocycle', () => {
  it('should fetch mesocycle with workouts', async () => {
    const mockMesocycle = {
      id: '1',
      planId: 'p1',
      workouts: [],
      weeksSummary: [],
    };
    vi.mocked(mesocyclesApi.getById).mockResolvedValue(mockMesocycle);

    const { result } = renderHook(() => useMesocycle('1'), { wrapper });

    await waitFor(() => {
      expect(result.current.data).toEqual(mockMesocycle);
    });
  });

  describe('mutations', () => {
    it('should create mesocycle and invalidate queries', async () => {
      const mockCreated = { id: '1', planId: 'p1', status: 'active' };
      vi.mocked(mesocyclesApi.create).mockResolvedValue(mockCreated);

      const { result } = renderHook(() => useMesocycle(), { wrapper });

      await act(async () => {
        await result.current.createMesocycle({
          planId: 'p1',
          startDate: '2024-01-01',
        });
      });

      expect(mesocyclesApi.create).toHaveBeenCalledWith({
        planId: 'p1',
        startDate: '2024-01-01',
      });
    });

    it('should cancel mesocycle and invalidate queries', async () => {
      vi.mocked(mesocyclesApi.cancel).mockResolvedValue({ id: '1', status: 'cancelled' });

      const { result } = renderHook(() => useMesocycle('1'), { wrapper });

      await act(async () => {
        await result.current.cancelMesocycle();
      });

      expect(mesocyclesApi.cancel).toHaveBeenCalledWith('1');
    });
  });
});
```

#### Task 5.4.3: Mesocycle Hook Implementation

**File**: `packages/frontend/src/hooks/useMesocycle.ts`

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { mesocyclesApi } from '../api/mesocycles';
import type { CreateMesocycleRequest } from '@brad-os/shared';

export function useMesocycles() {
  return useQuery({
    queryKey: ['mesocycles'],
    queryFn: mesocyclesApi.list,
  });
}

export function useActiveMesocycle() {
  return useQuery({
    queryKey: ['mesocycles', 'active'],
    queryFn: mesocyclesApi.getActive,
  });
}

export function useMesocycle(id?: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['mesocycles', id],
    queryFn: () => mesocyclesApi.getById(id!),
    enabled: !!id,
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateMesocycleRequest) => mesocyclesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mesocycles'] });
    },
  });

  const completeMutation = useMutation({
    mutationFn: () => mesocyclesApi.complete(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mesocycles'] });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => mesocyclesApi.cancel(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mesocycles'] });
    },
  });

  return {
    ...query,
    createMesocycle: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    createError: createMutation.error,
    completeMesocycle: completeMutation.mutateAsync,
    isCompleting: completeMutation.isPending,
    cancelMesocycle: cancelMutation.mutateAsync,
    isCancelling: cancelMutation.isPending,
  };
}
```

#### Task 5.4.4: MesoTab Component Tests

**File**: `packages/frontend/src/components/__tests__/MesoTab.test.tsx`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MesoTab } from '../MesoTab';
import { useActiveMesocycle, useMesocycle } from '../../hooks/useMesocycle';
import { usePlans } from '../../hooks/usePlans';

vi.mock('../../hooks/useMesocycle');
vi.mock('../../hooks/usePlans');

describe('MesoTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('when no active mesocycle', () => {
    beforeEach(() => {
      vi.mocked(useActiveMesocycle).mockReturnValue({
        data: null,
        isLoading: false,
      });
      vi.mocked(usePlans).mockReturnValue({
        data: [
          { id: 'p1', name: 'Push Pull Legs' },
          { id: 'p2', name: 'Upper Lower' },
        ],
        isLoading: false,
      });
      vi.mocked(useMesocycle).mockReturnValue({
        createMesocycle: vi.fn(),
        isCreating: false,
      });
    });

    it('should display "No active plan" message', () => {
      render(<MesoTab />);
      expect(screen.getByText('No active plan')).toBeInTheDocument();
    });

    it('should show start mesocycle form', () => {
      render(<MesoTab />);
      expect(screen.getByText('Start New Mesocycle')).toBeInTheDocument();
      expect(screen.getByLabelText('Select Plan')).toBeInTheDocument();
      expect(screen.getByLabelText('Start Date')).toBeInTheDocument();
    });

    it('should populate plan dropdown with available plans', () => {
      render(<MesoTab />);
      const select = screen.getByLabelText('Select Plan');

      expect(screen.getByText('Push Pull Legs')).toBeInTheDocument();
      expect(screen.getByText('Upper Lower')).toBeInTheDocument();
    });

    it('should call createMesocycle when form is submitted', async () => {
      const mockCreate = vi.fn().mockResolvedValue({ id: 'm1' });
      vi.mocked(useMesocycle).mockReturnValue({
        createMesocycle: mockCreate,
        isCreating: false,
      });

      render(<MesoTab />);

      await userEvent.selectOptions(screen.getByLabelText('Select Plan'), 'p1');
      await userEvent.type(screen.getByLabelText('Start Date'), '2024-01-01');
      await userEvent.click(screen.getByRole('button', { name: 'Start Mesocycle' }));

      expect(mockCreate).toHaveBeenCalledWith({
        planId: 'p1',
        startDate: '2024-01-01',
      });
    });

    it('should disable submit button while creating', () => {
      vi.mocked(useMesocycle).mockReturnValue({
        createMesocycle: vi.fn(),
        isCreating: true,
      });

      render(<MesoTab />);
      expect(screen.getByRole('button', { name: /starting/i })).toBeDisabled();
    });
  });

  describe('when mesocycle is active', () => {
    const mockMesocycle = {
      id: 'm1',
      planId: 'p1',
      planName: 'Push Pull Legs',
      startDate: '2024-01-01',
      endDate: '2024-02-18',
      durationWeeks: 6,
      deloadWeek: true,
      status: 'active',
      weeksSummary: [
        {
          weekNumber: 0,
          isDeload: false,
          workouts: [
            { id: 'w1', dayName: 'Push', scheduledDate: '2024-01-01', status: 'completed' },
            { id: 'w2', dayName: 'Pull', scheduledDate: '2024-01-03', status: 'pending' },
          ],
          completedCount: 1,
          totalCount: 2,
        },
        {
          weekNumber: 1,
          isDeload: false,
          workouts: [
            { id: 'w3', dayName: 'Push', scheduledDate: '2024-01-08', status: 'pending' },
          ],
          completedCount: 0,
          totalCount: 1,
        },
      ],
    };

    beforeEach(() => {
      vi.mocked(useActiveMesocycle).mockReturnValue({
        data: { id: 'm1', status: 'active' },
        isLoading: false,
      });
      vi.mocked(useMesocycle).mockReturnValue({
        data: mockMesocycle,
        isLoading: false,
        cancelMesocycle: vi.fn(),
        isCancelling: false,
      });
    });

    it('should display mesocycle status card', () => {
      render(<MesoTab />);

      expect(screen.getByText('Push Pull Legs')).toBeInTheDocument();
      expect(screen.getByText(/Active/)).toBeInTheDocument();
      expect(screen.getByText(/Jan 1.*Feb 18/)).toBeInTheDocument();
    });

    it('should display week-by-week breakdown', () => {
      render(<MesoTab />);

      expect(screen.getByText('Week 1')).toBeInTheDocument();
      expect(screen.getByText('Week 2')).toBeInTheDocument();
    });

    it('should show workout status for each day', () => {
      render(<MesoTab />);

      // Check for completed workout indicator
      const completedWorkout = screen.getByTestId('workout-w1');
      expect(completedWorkout).toHaveAttribute('data-status', 'completed');

      // Check for pending workout indicator
      const pendingWorkout = screen.getByTestId('workout-w2');
      expect(pendingWorkout).toHaveAttribute('data-status', 'pending');
    });

    it('should display cancel button', () => {
      render(<MesoTab />);
      expect(screen.getByRole('button', { name: 'Cancel Mesocycle' })).toBeInTheDocument();
    });

    it('should show confirmation dialog when cancel is clicked', async () => {
      render(<MesoTab />);

      await userEvent.click(screen.getByRole('button', { name: 'Cancel Mesocycle' }));

      expect(screen.getByText('Are you sure?')).toBeInTheDocument();
      expect(screen.getByText(/This will cancel your current mesocycle/)).toBeInTheDocument();
    });

    it('should call cancelMesocycle when confirmed', async () => {
      const mockCancel = vi.fn().mockResolvedValue({});
      vi.mocked(useMesocycle).mockReturnValue({
        data: mockMesocycle,
        cancelMesocycle: mockCancel,
        isCancelling: false,
      });

      render(<MesoTab />);

      await userEvent.click(screen.getByRole('button', { name: 'Cancel Mesocycle' }));
      await userEvent.click(screen.getByRole('button', { name: 'Yes, Cancel' }));

      expect(mockCancel).toHaveBeenCalled();
    });

    it('should mark deload week distinctly', () => {
      const mesoWithDeload = {
        ...mockMesocycle,
        weeksSummary: [
          ...mockMesocycle.weeksSummary,
          { weekNumber: 6, isDeload: true, workouts: [], completedCount: 0, totalCount: 1 },
        ],
      };
      vi.mocked(useMesocycle).mockReturnValue({
        data: mesoWithDeload,
        isLoading: false,
      });

      render(<MesoTab />);

      expect(screen.getByText('Week 7 (Deload)')).toBeInTheDocument();
    });
  });

  describe('loading states', () => {
    it('should show loading skeleton while fetching', () => {
      vi.mocked(useActiveMesocycle).mockReturnValue({
        data: undefined,
        isLoading: true,
      });

      render(<MesoTab />);
      expect(screen.getByTestId('meso-loading-skeleton')).toBeInTheDocument();
    });
  });
});
```

#### Task 5.4.5: MesoTab Component Implementation

**File**: `packages/frontend/src/components/MesoTab.tsx`

```typescript
import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Select from '@radix-ui/react-select';
import { useActiveMesocycle, useMesocycle } from '../hooks/useMesocycle';
import { usePlans } from '../hooks/usePlans';
import { WeekCard } from './WeekCard';
import { StartMesocycleForm } from './StartMesocycleForm';
import { MesocycleStatusCard } from './MesocycleStatusCard';
import { LoadingSkeleton } from './LoadingSkeleton';
import type { CreateMesocycleRequest } from '@brad-os/shared';

export function MesoTab() {
  const { data: activeMeso, isLoading: isLoadingActive } = useActiveMesocycle();
  const {
    data: mesocycleDetails,
    isLoading: isLoadingDetails,
    cancelMesocycle,
    isCancelling,
  } = useMesocycle(activeMeso?.id);
  const { createMesocycle, isCreating } = useMesocycle();
  const { data: plans, isLoading: isLoadingPlans } = usePlans();

  const [showCancelDialog, setShowCancelDialog] = useState(false);

  const isLoading = isLoadingActive || isLoadingDetails || isLoadingPlans;

  if (isLoading) {
    return <LoadingSkeleton data-testid="meso-loading-skeleton" />;
  }

  const handleStartMesocycle = async (data: CreateMesocycleRequest) => {
    await createMesocycle(data);
  };

  const handleCancelMesocycle = async () => {
    await cancelMesocycle();
    setShowCancelDialog(false);
  };

  if (!activeMeso || !mesocycleDetails) {
    return (
      <div className="meso-tab">
        <div className="no-active-plan">
          <h2>No active plan</h2>
          <p>Start a new mesocycle to begin tracking your workouts.</p>
        </div>

        <StartMesocycleForm
          plans={plans ?? []}
          onSubmit={handleStartMesocycle}
          isSubmitting={isCreating}
        />
      </div>
    );
  }

  return (
    <div className="meso-tab">
      <MesocycleStatusCard mesocycle={mesocycleDetails} />

      <div className="weeks-breakdown">
        <h3>Weekly Breakdown</h3>
        {mesocycleDetails.weeksSummary.map((week) => (
          <WeekCard
            key={week.weekNumber}
            week={week}
          />
        ))}
      </div>

      <button
        className="cancel-button"
        onClick={() => setShowCancelDialog(true)}
      >
        Cancel Mesocycle
      </button>

      <Dialog.Root open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content">
            <Dialog.Title>Are you sure?</Dialog.Title>
            <Dialog.Description>
              This will cancel your current mesocycle. Your workout data will be preserved
              for history, but you will need to start a new mesocycle to continue tracking.
            </Dialog.Description>
            <div className="dialog-actions">
              <Dialog.Close asChild>
                <button className="button-secondary">No, Keep It</button>
              </Dialog.Close>
              <button
                className="button-danger"
                onClick={handleCancelMesocycle}
                disabled={isCancelling}
              >
                {isCancelling ? 'Cancelling...' : 'Yes, Cancel'}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
```

#### Task 5.4.6: Supporting Components

**File**: `packages/frontend/src/components/StartMesocycleForm.tsx`

```typescript
import { useState } from 'react';
import * as Select from '@radix-ui/react-select';
import type { Plan, CreateMesocycleRequest } from '@brad-os/shared';

interface Props {
  plans: Plan[];
  onSubmit: (data: CreateMesocycleRequest) => Promise<void>;
  isSubmitting: boolean;
}

export function StartMesocycleForm({ plans, onSubmit, isSubmitting }: Props) {
  const [planId, setPlanId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!planId || !startDate) {
      setError('Please select a plan and start date');
      return;
    }

    try {
      await onSubmit({ planId, startDate });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start mesocycle');
    }
  };

  return (
    <form className="start-mesocycle-form" onSubmit={handleSubmit}>
      <h3>Start New Mesocycle</h3>

      {error && <div className="error-message">{error}</div>}

      <div className="form-field">
        <label htmlFor="plan-select">Select Plan</label>
        <Select.Root value={planId} onValueChange={setPlanId}>
          <Select.Trigger id="plan-select" aria-label="Select Plan">
            <Select.Value placeholder="Choose a plan..." />
          </Select.Trigger>
          <Select.Portal>
            <Select.Content>
              <Select.Viewport>
                {plans.map((plan) => (
                  <Select.Item key={plan.id} value={plan.id}>
                    <Select.ItemText>{plan.name}</Select.ItemText>
                  </Select.Item>
                ))}
              </Select.Viewport>
            </Select.Content>
          </Select.Portal>
        </Select.Root>
      </div>

      <div className="form-field">
        <label htmlFor="start-date">Start Date</label>
        <input
          id="start-date"
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          aria-label="Start Date"
        />
      </div>

      <button
        type="submit"
        disabled={isSubmitting || !planId || !startDate}
      >
        {isSubmitting ? 'Starting...' : 'Start Mesocycle'}
      </button>
    </form>
  );
}
```

**File**: `packages/frontend/src/components/WeekCard.tsx`

```typescript
import type { WeekSummary, WorkoutStatus } from '@brad-os/shared';
import { format, parseISO } from 'date-fns';

interface Props {
  week: WeekSummary;
}

const statusColors: Record<WorkoutStatus, string> = {
  pending: '#e0e0e0',
  in_progress: '#ffd54f',
  completed: '#81c784',
  skipped: '#ef9a9a',
};

export function WeekCard({ week }: Props) {
  const weekLabel = week.isDeload
    ? `Week ${week.weekNumber + 1} (Deload)`
    : `Week ${week.weekNumber + 1}`;

  return (
    <div className="week-card" data-deload={week.isDeload}>
      <div className="week-header">
        <h4>{weekLabel}</h4>
        <span className="week-progress">
          {week.completedCount}/{week.totalCount} completed
        </span>
      </div>

      <div className="week-workouts">
        {week.workouts.map((workout) => (
          <div
            key={workout.id}
            className="workout-indicator"
            data-testid={`workout-${workout.id}`}
            data-status={workout.status}
            style={{ backgroundColor: statusColors[workout.status] }}
          >
            <span className="workout-day">{workout.dayName}</span>
            <span className="workout-date">
              {format(parseISO(workout.scheduledDate), 'MMM d')}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

**File**: `packages/frontend/src/components/MesocycleStatusCard.tsx`

```typescript
import type { MesocycleWithWorkouts } from '@brad-os/shared';
import { format, parseISO } from 'date-fns';

interface Props {
  mesocycle: MesocycleWithWorkouts;
}

export function MesocycleStatusCard({ mesocycle }: Props) {
  const totalWorkouts = mesocycle.weeksSummary.reduce(
    (sum, week) => sum + week.totalCount,
    0
  );
  const completedWorkouts = mesocycle.weeksSummary.reduce(
    (sum, week) => sum + week.completedCount,
    0
  );
  const progressPercent = totalWorkouts > 0
    ? Math.round((completedWorkouts / totalWorkouts) * 100)
    : 0;

  return (
    <div className="mesocycle-status-card">
      <div className="status-header">
        <h2>{mesocycle.planName}</h2>
        <span className={`status-badge status-${mesocycle.status}`}>
          Active
        </span>
      </div>

      <div className="status-dates">
        {format(parseISO(mesocycle.startDate), 'MMM d')} - {format(parseISO(mesocycle.endDate), 'MMM d, yyyy')}
      </div>

      <div className="status-progress">
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <span className="progress-text">
          {completedWorkouts}/{totalWorkouts} workouts ({progressPercent}%)
        </span>
      </div>
    </div>
  );
}
```

---

### Phase 5.5: E2E Tests

#### Task 5.5.1: E2E Test Setup

**File**: `packages/e2e/tests/mesocycle.e2e.test.ts`

```typescript
import puppeteer, { Browser, Page } from 'puppeteer';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  setupTestDatabase,
  seedTestPlan,
  cleanupTestData,
} from '../helpers/db';
import { startTestServer, stopTestServer } from '../helpers/server';

describe('Mesocycle E2E', () => {
  let browser: Browser;
  let page: Page;
  let testPlanId: string;

  beforeAll(async () => {
    await startTestServer();
    browser = await puppeteer.launch({ headless: true });
    await setupTestDatabase();
  });

  afterAll(async () => {
    await browser.close();
    await stopTestServer();
  });

  beforeEach(async () => {
    page = await browser.newPage();
    await cleanupTestData();
    testPlanId = await seedTestPlan();
    await page.goto('http://localhost:3000');
  });

  describe('Start a new mesocycle', () => {
    it('should display the start mesocycle form when no active mesocycle', async () => {
      // Navigate to Meso tab
      await page.click('[data-testid="tab-meso"]');

      // Verify no active plan message
      await page.waitForSelector('text/No active plan');

      // Verify form is visible
      await page.waitForSelector('[data-testid="start-mesocycle-form"]');
    });

    it('should successfully start a new mesocycle', async () => {
      await page.click('[data-testid="tab-meso"]');

      // Select plan
      await page.click('[data-testid="plan-select"]');
      await page.click(`[data-value="${testPlanId}"]`);

      // Select start date (today)
      const today = new Date().toISOString().split('T')[0];
      await page.type('[data-testid="start-date-input"]', today);

      // Submit form
      await page.click('[data-testid="start-mesocycle-button"]');

      // Wait for success - should show active mesocycle card
      await page.waitForSelector('[data-testid="mesocycle-status-card"]');

      // Verify week breakdown is shown
      await page.waitForSelector('[data-testid="week-card-0"]');
      await page.waitForSelector('[data-testid="week-card-6"]'); // Deload week
    });

    it('should show error when trying to start second mesocycle', async () => {
      // Start first mesocycle
      await page.click('[data-testid="tab-meso"]');
      await page.click('[data-testid="plan-select"]');
      await page.click(`[data-value="${testPlanId}"]`);
      const today = new Date().toISOString().split('T')[0];
      await page.type('[data-testid="start-date-input"]', today);
      await page.click('[data-testid="start-mesocycle-button"]');

      await page.waitForSelector('[data-testid="mesocycle-status-card"]');

      // Should not show start form when mesocycle is active
      const startForm = await page.$('[data-testid="start-mesocycle-form"]');
      expect(startForm).toBeNull();
    });
  });

  describe('View mesocycle progress', () => {
    it('should display week-by-week breakdown', async () => {
      // Seed active mesocycle via API
      await page.evaluate(async (planId) => {
        await fetch('/api/mesocycles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            planId,
            startDate: '2024-01-01',
          }),
        });
      }, testPlanId);

      await page.click('[data-testid="tab-meso"]');
      await page.waitForSelector('[data-testid="mesocycle-status-card"]');

      // Check all weeks are displayed
      for (let i = 0; i < 7; i++) {
        await page.waitForSelector(`[data-testid="week-card-${i}"]`);
      }

      // Check deload week is marked
      const deloadWeek = await page.$(
        '[data-testid="week-card-6"][data-deload="true"]'
      );
      expect(deloadWeek).not.toBeNull();
    });

    it('should show workout status indicators', async () => {
      // Seed mesocycle with some completed workouts
      await page.evaluate(async (planId) => {
        const res = await fetch('/api/mesocycles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            planId,
            startDate: '2024-01-01',
          }),
        });
        return res.json();
      }, testPlanId);

      await page.click('[data-testid="tab-meso"]');
      await page.waitForSelector('[data-testid="mesocycle-status-card"]');

      // Check for workout indicators with status
      const pendingWorkout = await page.$('[data-status="pending"]');
      expect(pendingWorkout).not.toBeNull();
    });

    it('should display progress percentage', async () => {
      await page.evaluate(async (planId) => {
        await fetch('/api/mesocycles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            planId,
            startDate: '2024-01-01',
          }),
        });
      }, testPlanId);

      await page.click('[data-testid="tab-meso"]');
      await page.waitForSelector('[data-testid="progress-bar"]');

      const progressText = await page.$eval(
        '[data-testid="progress-text"]',
        (el) => el.textContent
      );

      expect(progressText).toMatch(/\d+\/\d+ workouts \(\d+%\)/);
    });
  });

  describe('Cancel a mesocycle', () => {
    it('should show confirmation dialog when cancel is clicked', async () => {
      await page.evaluate(async (planId) => {
        await fetch('/api/mesocycles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            planId,
            startDate: '2024-01-01',
          }),
        });
      }, testPlanId);

      await page.click('[data-testid="tab-meso"]');
      await page.waitForSelector('[data-testid="cancel-mesocycle-button"]');

      await page.click('[data-testid="cancel-mesocycle-button"]');

      await page.waitForSelector('[data-testid="cancel-confirmation-dialog"]');
      await page.waitForSelector('text/Are you sure?');
    });

    it('should cancel mesocycle when confirmed', async () => {
      await page.evaluate(async (planId) => {
        await fetch('/api/mesocycles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            planId,
            startDate: '2024-01-01',
          }),
        });
      }, testPlanId);

      await page.click('[data-testid="tab-meso"]');
      await page.waitForSelector('[data-testid="cancel-mesocycle-button"]');

      await page.click('[data-testid="cancel-mesocycle-button"]');
      await page.waitForSelector('[data-testid="confirm-cancel-button"]');
      await page.click('[data-testid="confirm-cancel-button"]');

      // Should return to "No active plan" state
      await page.waitForSelector('text/No active plan');
      await page.waitForSelector('[data-testid="start-mesocycle-form"]');
    });

    it('should preserve workout data after cancellation', async () => {
      const mesoResponse = await page.evaluate(async (planId) => {
        const res = await fetch('/api/mesocycles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            planId,
            startDate: '2024-01-01',
          }),
        });
        return res.json();
      }, testPlanId);

      await page.click('[data-testid="tab-meso"]');
      await page.click('[data-testid="cancel-mesocycle-button"]');
      await page.waitForSelector('[data-testid="confirm-cancel-button"]');
      await page.click('[data-testid="confirm-cancel-button"]');

      // Verify data persists via API
      const cancelledMeso = await page.evaluate(async (id) => {
        const res = await fetch(`/api/mesocycles/${id}`);
        return res.json();
      }, mesoResponse.id);

      expect(cancelledMeso.status).toBe('cancelled');
      expect(cancelledMeso.workouts.length).toBeGreaterThan(0);
    });

    it('should not cancel when dialog is dismissed', async () => {
      await page.evaluate(async (planId) => {
        await fetch('/api/mesocycles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            planId,
            startDate: '2024-01-01',
          }),
        });
      }, testPlanId);

      await page.click('[data-testid="tab-meso"]');
      await page.click('[data-testid="cancel-mesocycle-button"]');
      await page.waitForSelector('[data-testid="dismiss-cancel-button"]');
      await page.click('[data-testid="dismiss-cancel-button"]');

      // Should still show active mesocycle
      await page.waitForSelector('[data-testid="mesocycle-status-card"]');
    });
  });
});
```

---

## File Structure Summary

```
packages/
├── shared/
│   └── src/
│       └── types/
│           └── mesocycle.ts              # Shared type definitions
├── backend/
│   └── src/
│       ├── db/
│       │   ├── schema.ts                 # Add mesocycle tables
│       │   └── migrations/
│       │       └── 005_mesocycles.ts     # Migration file
│       ├── services/
│       │   ├── mesocycle.service.ts      # Business logic
│       │   └── __tests__/
│       │       └── mesocycle.service.test.ts
│       ├── routes/
│       │   ├── mesocycles.routes.ts      # API routes
│       │   └── __tests__/
│       │       └── mesocycles.routes.test.ts
│       └── app.ts                        # Register routes
├── frontend/
│   └── src/
│       ├── api/
│       │   └── mesocycles.ts             # API client
│       ├── hooks/
│       │   ├── useMesocycle.ts           # React Query hooks
│       │   └── __tests__/
│       │       └── useMesocycle.test.ts
│       └── components/
│           ├── MesoTab.tsx               # Main tab component
│           ├── StartMesocycleForm.tsx    # Form component
│           ├── WeekCard.tsx              # Week display
│           ├── MesocycleStatusCard.tsx   # Status display
│           └── __tests__/
│               └── MesoTab.test.tsx
└── e2e/
    └── tests/
        └── mesocycle.e2e.test.ts         # E2E tests
```

---

## Success Criteria

1. **All unit tests pass** (100% coverage for new code)
   - [ ] MesocycleService tests: 15+ test cases
   - [ ] API route tests: 12+ test cases
   - [ ] Hook tests: 8+ test cases
   - [ ] Component tests: 15+ test cases

2. **API endpoints functional**
   - [ ] GET /api/mesocycles returns list of mesocycles
   - [ ] GET /api/mesocycles/active returns current active mesocycle or null
   - [ ] GET /api/mesocycles/:id returns mesocycle with workouts and week summary
   - [ ] POST /api/mesocycles creates new mesocycle with workout generation
   - [ ] POST /api/mesocycles fails with 409 if another is active
   - [ ] PUT /api/mesocycles/:id/complete marks as completed
   - [ ] PUT /api/mesocycles/:id/cancel marks as cancelled, preserves data

3. **Progressive overload correctly calculated**
   - [ ] Week 0: Base values
   - [ ] Odd weeks: +1 rep
   - [ ] Even weeks: +5 lbs (configurable), reset reps
   - [ ] Deload week: 50% volume (half sets)

4. **Frontend fully functional**
   - [ ] MesoTab shows "No active plan" when none active
   - [ ] StartMesocycleForm allows plan selection and date picking
   - [ ] Active mesocycle shows status card with progress
   - [ ] Week-by-week breakdown displayed
   - [ ] Workout status indicators (pending/completed/skipped)
   - [ ] Cancel button with confirmation dialog
   - [ ] Cancel preserves workout data

5. **E2E tests pass**
   - [ ] Start new mesocycle flow
   - [ ] View mesocycle progress flow
   - [ ] Cancel mesocycle flow

6. **Code quality**
   - [ ] No TypeScript errors
   - [ ] No ESLint warnings
   - [ ] All types properly defined (no `any`)
   - [ ] TDD approach followed (tests written before implementation)

---

## Commit Message

```
feat(mesocycle): implement mesocycle management with TDD

Add complete mesocycle feature for tracking training plan instances:

Backend:
- Add mesocycles, scheduled_workouts, scheduled_exercises, and
  completed_sets tables with proper relationships
- Implement MesocycleService with progressive overload calculation
- Add API routes: GET/POST mesocycles, GET active, complete, cancel
- Enforce single active mesocycle constraint
- Generate all workout records when starting mesocycle
- Preserve workout data on cancellation for history

Frontend:
- Add MesoTab component with active/inactive states
- Implement StartMesocycleForm with plan selection and date picker
- Add WeekCard for week-by-week breakdown view
- Show workout status indicators (pending/completed/skipped)
- Add cancel confirmation dialog with data preservation

Testing:
- 100% unit test coverage for service, routes, hooks, components
- E2E tests for start, view progress, and cancel flows
- Follow TDD approach: tests written before implementation

Progressive overload schedule:
- Week 0: Base values from plan
- Odd weeks: +1 rep per exercise
- Even weeks: +5 lbs weight, reset reps
- Deload (week 7): Same weight, 50% sets

Closes #XX
```

---

## Implementation Order

Execute tasks in this order to maintain TDD discipline:

1. **Phase 5.1**: Schema & Types (1-2 hours)
   - 5.1.1: Database migration
   - 5.1.2: Shared type definitions

2. **Phase 5.2**: Backend Service (3-4 hours)
   - 5.2.1: Write service tests FIRST
   - 5.2.2: Implement service to pass tests

3. **Phase 5.3**: Backend Routes (2-3 hours)
   - 5.3.1: Write route tests FIRST
   - 5.3.2: Implement routes to pass tests
   - 5.3.3: Register routes in app

4. **Phase 5.4**: Frontend (4-5 hours)
   - 5.4.1: API client
   - 5.4.2: Write hook tests FIRST
   - 5.4.3: Implement hooks
   - 5.4.4: Write component tests FIRST
   - 5.4.5: Implement MesoTab
   - 5.4.6: Implement supporting components

5. **Phase 5.5**: E2E Tests (2-3 hours)
   - 5.5.1: Write and run E2E tests

**Total estimated time**: 12-17 hours
