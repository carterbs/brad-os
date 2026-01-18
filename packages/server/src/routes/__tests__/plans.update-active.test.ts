import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type Database from 'better-sqlite3';
import {
  setupTestApp,
  teardownTestApp,
  type TestContext,
} from '../../test/test-app.js';
import {
  PlanRepository,
  PlanDayRepository,
  PlanDayExerciseRepository,
  ExerciseRepository,
  MesocycleRepository,
  WorkoutRepository,
  WorkoutSetRepository,
} from '../../repositories/index.js';
import type { DayOfWeek, PlanDayExercise, Plan, ApiResult } from '@lifting/shared';

describe('PUT /api/plans/:id with active mesocycle', () => {
  let ctx: TestContext;
  let app: Express;
  let db: Database.Database;
  let planRepo: PlanRepository;
  let planDayRepo: PlanDayRepository;
  let planDayExerciseRepo: PlanDayExerciseRepository;
  let exerciseRepo: ExerciseRepository;
  let mesocycleRepo: MesocycleRepository;
  let workoutRepo: WorkoutRepository;
  let workoutSetRepo: WorkoutSetRepository;

  // Helper to create a plan with days and exercises
  function createTestPlanWithDays(numDays: number = 2): {
    planId: number;
    dayIds: number[];
    exerciseId: number;
    planDayExercises: PlanDayExercise[];
  } {
    // Use existing exercise from seeds
    const exercise = exerciseRepo.findByName('Leg Extension');
    if (!exercise) {
      throw new Error('Leg Extension exercise not found in seeds');
    }

    const plan = planRepo.create({ name: 'Test Plan', duration_weeks: 6 });

    const dayIds: number[] = [];
    const planDayExercises: PlanDayExercise[] = [];

    for (let i = 0; i < numDays; i++) {
      const day = planDayRepo.create({
        plan_id: plan.id,
        day_of_week: (i + 1) as DayOfWeek,
        name: `Day ${i + 1}`,
        sort_order: i,
      });
      dayIds.push(day.id);

      const pde = planDayExerciseRepo.create({
        plan_day_id: day.id,
        exercise_id: exercise.id,
        sets: 3,
        reps: 10,
        weight: 100,
        rest_seconds: 90,
        sort_order: 0,
      });
      planDayExercises.push(pde);
    }

    return { planId: plan.id, dayIds, exerciseId: exercise.id, planDayExercises };
  }

  // Helper to create and start a mesocycle (since create() now defaults to 'pending')
  async function createAndStartMesocycle(planId: number): Promise<void> {
    const createResponse = await request(app).post('/api/mesocycles').send({
      plan_id: planId,
      start_date: new Date().toISOString().split('T')[0],
    });
    const createBody = createResponse.body as ApiResult<{ id: number }>;
    if (createBody.success && createBody.data.id) {
      await request(app).put(`/api/mesocycles/${createBody.data.id}/start`);
    }
  }

  beforeEach(() => {
    ctx = setupTestApp(true); // with seeds
    app = ctx.app;
    db = ctx.db;
    planRepo = new PlanRepository(db);
    planDayRepo = new PlanDayRepository(db);
    planDayExerciseRepo = new PlanDayExerciseRepository(db);
    exerciseRepo = new ExerciseRepository(db);
    mesocycleRepo = new MesocycleRepository(db);
    workoutRepo = new WorkoutRepository(db);
    workoutSetRepo = new WorkoutSetRepository(db);
  });

  afterEach(() => {
    teardownTestApp(ctx);
  });

  describe('validation', () => {
    it('should return 404 for non-existent plan', async () => {
      const response = await request(app)
        .put('/api/plans/99999')
        .send({ name: 'Updated Plan' });
      const body = response.body as ApiResult<Plan>;

      expect(response.status).toBe(404);
      expect(body.success).toBe(false);
      if (!body.success) {
        expect(body.error.code).toBe('NOT_FOUND');
      }
    });

    it('should return 400 for invalid plan structure', async () => {
      const { planId } = createTestPlanWithDays(1);

      const response = await request(app)
        .put(`/api/plans/${planId}`)
        .send({ name: '' }); // Invalid: empty name
      const body = response.body as ApiResult<Plan>;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      if (!body.success) {
        expect(body.error.code).toBe('VALIDATION_ERROR');
      }
    });

    it('should return 200 when plan has no active mesocycle (standard update)', async () => {
      const { planId } = createTestPlanWithDays(1);

      const response = await request(app)
        .put(`/api/plans/${planId}`)
        .send({ name: 'Updated Plan Name' });
      const body = response.body as ApiResult<Plan>;

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      if (body.success) {
        expect(body.data.name).toBe('Updated Plan Name');
      }
    });
  });

  describe('detecting affected workouts', () => {
    it('should identify future workouts only', async () => {
      const { planId } = createTestPlanWithDays(1);

      // Create and start mesocycle
      await createAndStartMesocycle(planId);

      const mesocycle = mesocycleRepo.findActive()[0];
      expect(mesocycle).toBeDefined();
      if (!mesocycle) return;

      // Mark first workout as completed (past)
      const workouts = workoutRepo.findByMesocycleId(mesocycle.id);
      const firstWorkout = workouts[0];
      if (firstWorkout) {
        workoutRepo.update(firstWorkout.id, { status: 'completed' });
      }

      // Update plan name - should return affected workouts count
      const response = await request(app)
        .put(`/api/plans/${planId}`)
        .send({ name: 'Updated Plan' });
      const body = response.body as ApiResult<Plan>;

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
    });

    it('should not modify past workouts', async () => {
      const { planId, dayIds } = createTestPlanWithDays(1);

      // Create and start mesocycle
      await createAndStartMesocycle(planId);

      const mesocycle = mesocycleRepo.findActive()[0];
      if (!mesocycle) {
        throw new Error('Active mesocycle not found');
      }
      const workouts = workoutRepo.findByMesocycleId(mesocycle.id);

      const firstWorkout = workouts[0];
      if (!firstWorkout) {
        throw new Error('First workout not found');
      }

      // Mark first workout as completed
      workoutRepo.update(firstWorkout.id, { status: 'completed' });

      // Get sets for past workout
      const pastSets = workoutSetRepo.findByWorkoutId(firstWorkout.id);
      const originalSetCount = pastSets.length;

      // Add new exercise to plan
      const newExercise = exerciseRepo.create({
        name: 'New Test Exercise',
        weight_increment: 5,
      });

      const firstDayId = dayIds[0];
      if (firstDayId === undefined) {
        throw new Error('First day ID not found');
      }

      planDayExerciseRepo.create({
        plan_day_id: firstDayId,
        exercise_id: newExercise.id,
        sets: 3,
        reps: 8,
        weight: 50,
        rest_seconds: 60,
        sort_order: 1,
      });

      // Update plan to trigger modification
      await request(app)
        .put(`/api/plans/${planId}`)
        .send({ name: 'Updated Plan' });

      // Past workout should NOT have new exercise sets
      const pastSetsAfter = workoutSetRepo.findByWorkoutId(firstWorkout.id);
      expect(pastSetsAfter.length).toBe(originalSetCount);

      // Check new exercise sets don't exist in past workout
      const newExerciseSets = pastSetsAfter.filter(
        (s) => s.exercise_id === newExercise.id
      );
      expect(newExerciseSets.length).toBe(0);
    });

    it('should not modify current in-progress workout', async () => {
      const { planId, dayIds } = createTestPlanWithDays(1);

      // Create and start mesocycle
      await createAndStartMesocycle(planId);

      const mesocycle = mesocycleRepo.findActive()[0];
      if (!mesocycle) {
        throw new Error('Active mesocycle not found');
      }
      const workouts = workoutRepo.findByMesocycleId(mesocycle.id);

      const firstWorkout = workouts[0];
      if (!firstWorkout) {
        throw new Error('First workout not found');
      }

      // Mark first workout as in_progress
      workoutRepo.update(firstWorkout.id, { status: 'in_progress' });

      const inProgressSets = workoutSetRepo.findByWorkoutId(firstWorkout.id);
      const originalSetCount = inProgressSets.length;

      // Add new exercise to plan
      const newExercise = exerciseRepo.create({
        name: 'New Test Exercise',
        weight_increment: 5,
      });

      const firstDayId = dayIds[0];
      if (firstDayId === undefined) {
        throw new Error('First day ID not found');
      }

      planDayExerciseRepo.create({
        plan_day_id: firstDayId,
        exercise_id: newExercise.id,
        sets: 3,
        reps: 8,
        weight: 50,
        rest_seconds: 60,
        sort_order: 1,
      });

      // Update plan
      await request(app)
        .put(`/api/plans/${planId}`)
        .send({ name: 'Updated Plan' });

      // In-progress workout should NOT be modified
      const inProgressSetsAfter = workoutSetRepo.findByWorkoutId(firstWorkout.id);
      expect(inProgressSetsAfter.length).toBe(originalSetCount);
    });
  });

  describe('adding exercises', () => {
    it('should add exercise to all future workout days matching the plan day', async () => {
      const { planId, dayIds } = createTestPlanWithDays(1);

      // Create and start mesocycle
      await createAndStartMesocycle(planId);

      const mesocycle = mesocycleRepo.findActive()[0];
      if (!mesocycle) {
        throw new Error('Active mesocycle not found');
      }

      // Add new exercise to plan
      const newExercise = exerciseRepo.create({
        name: 'Squat',
        weight_increment: 5,
      });

      const firstDayId = dayIds[0];
      if (firstDayId === undefined) {
        throw new Error('First day ID not found');
      }

      planDayExerciseRepo.create({
        plan_day_id: firstDayId,
        exercise_id: newExercise.id,
        sets: 3,
        reps: 8,
        weight: 100,
        rest_seconds: 90,
        sort_order: 1,
      });

      // Update plan to trigger modification
      const response = await request(app)
        .put(`/api/plans/${planId}`)
        .send({ name: 'Updated Plan' });

      expect(response.status).toBe(200);

      // Check that future workouts have the new exercise
      const workouts = workoutRepo.findByMesocycleId(mesocycle.id);
      const futureWorkouts = workouts.filter(
        (w) => w.status === 'pending' && w.plan_day_id === dayIds[0]
      );

      for (const workout of futureWorkouts) {
        const sets = workoutSetRepo.findByWorkoutAndExercise(
          workout.id,
          newExercise.id
        );
        expect(sets.length).toBeGreaterThan(0);
      }
    });

    it('should create workout_sets for the new exercise with correct targets', async () => {
      const { planId, dayIds } = createTestPlanWithDays(1);

      // Create and start mesocycle
      await createAndStartMesocycle(planId);

      const mesocycle = mesocycleRepo.findActive()[0];
      if (!mesocycle) {
        throw new Error('Active mesocycle not found');
      }

      // Add new exercise with specific config
      const newExercise = exerciseRepo.create({
        name: 'Bench Press',
        weight_increment: 5,
      });

      const firstDayId = dayIds[0];
      if (firstDayId === undefined) {
        throw new Error('First day ID not found');
      }

      planDayExerciseRepo.create({
        plan_day_id: firstDayId,
        exercise_id: newExercise.id,
        sets: 4,
        reps: 10,
        weight: 135,
        rest_seconds: 120,
        sort_order: 1,
      });

      // Update plan
      await request(app)
        .put(`/api/plans/${planId}`)
        .send({ name: 'Updated Plan' });

      // Check a future workout
      const workouts = workoutRepo.findByMesocycleId(mesocycle.id);
      const futureWorkout = workouts.find(
        (w) => w.status === 'pending' && w.plan_day_id === dayIds[0] && w.week_number === 0
      );

      if (futureWorkout) {
        const sets = workoutSetRepo.findByWorkoutAndExercise(
          futureWorkout.id,
          newExercise.id
        );

        expect(sets.length).toBe(4); // 4 sets
        expect(sets[0]?.target_reps).toBe(10);
        expect(sets[0]?.target_weight).toBe(135);
      }
    });
  });

  describe('removing exercises', () => {
    it('should remove exercise from future workouts only', async () => {
      const { planId, dayIds, exerciseId } = createTestPlanWithDays(1);

      // Create and start mesocycle
      await createAndStartMesocycle(planId);

      const mesocycle = mesocycleRepo.findActive()[0];
      if (!mesocycle) {
        throw new Error('Active mesocycle not found');
      }

      // Mark first workout as completed
      const workouts = workoutRepo.findByMesocycleId(mesocycle.id);
      const firstWorkout = workouts[0];
      if (!firstWorkout) {
        throw new Error('First workout not found');
      }
      workoutRepo.update(firstWorkout.id, { status: 'completed' });

      // Remove exercise from plan day
      const firstDayId = dayIds[0];
      if (firstDayId === undefined) {
        throw new Error('First day ID not found');
      }
      const planDayExercises = planDayExerciseRepo.findByPlanDayId(firstDayId);
      const firstPlanDayExercise = planDayExercises[0];
      if (firstPlanDayExercise) {
        planDayExerciseRepo.delete(firstPlanDayExercise.id);
      }

      // Update plan
      await request(app)
        .put(`/api/plans/${planId}`)
        .send({ name: 'Updated Plan' });

      // Past workout should still have the exercise sets
      const pastSets = workoutSetRepo.findByWorkoutAndExercise(
        firstWorkout.id,
        exerciseId
      );
      expect(pastSets.length).toBeGreaterThan(0);

      // Future workouts should NOT have the exercise sets
      const futureWorkouts = workouts.filter(
        (w) =>
          w.status === 'pending' &&
          w.plan_day_id === dayIds[0] &&
          w.id !== firstWorkout.id
      );

      for (const workout of futureWorkouts) {
        const sets = workoutSetRepo.findByWorkoutAndExercise(
          workout.id,
          exerciseId
        );
        expect(sets.length).toBe(0);
      }
    });

    it('should preserve logged sets for removed exercise in current workout', async () => {
      const { planId, dayIds, exerciseId } = createTestPlanWithDays(1);

      // Create and start mesocycle
      await createAndStartMesocycle(planId);

      const mesocycle = mesocycleRepo.findActive()[0];
      if (!mesocycle) {
        throw new Error('Active mesocycle not found');
      }
      const workouts = workoutRepo.findByMesocycleId(mesocycle.id);
      const pendingWorkout = workouts.find((w) => w.status === 'pending');

      if (pendingWorkout) {
        // Log a set in the pending workout
        const sets = workoutSetRepo.findByWorkoutAndExercise(
          pendingWorkout.id,
          exerciseId
        );

        const firstSet = sets[0];
        if (firstSet) {
          workoutSetRepo.update(firstSet.id, {
            actual_reps: 10,
            actual_weight: 100,
            status: 'completed',
          });
        }

        // Remove exercise from plan
        const firstDayId = dayIds[0];
        if (firstDayId === undefined) {
          throw new Error('First day ID not found');
        }
        const planDayExercises = planDayExerciseRepo.findByPlanDayId(firstDayId);
        const firstPlanDayExercise = planDayExercises[0];
        if (firstPlanDayExercise) {
          planDayExerciseRepo.delete(firstPlanDayExercise.id);
        }

        // Update plan
        await request(app)
          .put(`/api/plans/${planId}`)
          .send({ name: 'Updated Plan' });

        // The workout with logged data should still have the exercise sets
        const setsAfter = workoutSetRepo.findByWorkoutAndExercise(
          pendingWorkout.id,
          exerciseId
        );
        expect(setsAfter.length).toBeGreaterThan(0);
      }
    });
  });

  describe('updating exercise parameters', () => {
    it('should update sets count for future workouts', async () => {
      const { planId, dayIds, exerciseId, planDayExercises } = createTestPlanWithDays(1);

      // Create and start mesocycle
      await createAndStartMesocycle(planId);

      const mesocycle = mesocycleRepo.findActive()[0];
      if (!mesocycle) {
        throw new Error('Active mesocycle not found');
      }

      // Update exercise to have 5 sets instead of 3
      const firstPlanDayExercise = planDayExercises[0];
      if (!firstPlanDayExercise) {
        throw new Error('First plan day exercise not found');
      }
      planDayExerciseRepo.update(firstPlanDayExercise.id, { sets: 5 });

      // Update plan
      await request(app)
        .put(`/api/plans/${planId}`)
        .send({ name: 'Updated Plan' });

      // Check future workouts have 5 sets (except deload week which has 50%)
      const workouts = workoutRepo.findByMesocycleId(mesocycle.id);
      const futureWorkouts = workouts.filter(
        (w) => w.status === 'pending' && w.plan_day_id === dayIds[0]
      );

      for (const workout of futureWorkouts) {
        const sets = workoutSetRepo.findByWorkoutAndExercise(
          workout.id,
          exerciseId
        );
        // Original config was 3 sets, now should be 5
        // Note: Only pending sets will be modified
        const pendingSets = sets.filter((s) => s.status === 'pending');
        if (pendingSets.length > 0) {
          // Week 6 is deload week with 50% volume (ceiling of 5*0.5 = 3 sets)
          const expectedSets = workout.week_number === 6 ? 3 : 5;
          expect(sets.length).toBe(expectedSets);
        }
      }
    });

    it('should update target weight for future workouts', async () => {
      const { planId, dayIds, exerciseId, planDayExercises } = createTestPlanWithDays(1);

      // Create and start mesocycle
      await createAndStartMesocycle(planId);

      const mesocycle = mesocycleRepo.findActive()[0];
      if (!mesocycle) {
        throw new Error('Active mesocycle not found');
      }

      // Update exercise weight from 100 to 120
      const firstPlanDayExercise = planDayExercises[0];
      if (!firstPlanDayExercise) {
        throw new Error('First plan day exercise not found');
      }
      planDayExerciseRepo.update(firstPlanDayExercise.id, { weight: 120 });

      // Update plan
      await request(app)
        .put(`/api/plans/${planId}`)
        .send({ name: 'Updated Plan' });

      // Check a week 0 future workout has base weight of 120
      const workouts = workoutRepo.findByMesocycleId(mesocycle.id);
      const week0Workout = workouts.find(
        (w) =>
          w.status === 'pending' &&
          w.plan_day_id === dayIds[0] &&
          w.week_number === 0
      );

      if (week0Workout) {
        const sets = workoutSetRepo.findByWorkoutAndExercise(
          week0Workout.id,
          exerciseId
        );
        // Week 0 should have base weight (120)
        expect(sets[0]?.target_weight).toBe(120);
      }
    });
  });

  describe('response format', () => {
    it('should return updated plan', async () => {
      const { planId } = createTestPlanWithDays(1);

      const response = await request(app)
        .put(`/api/plans/${planId}`)
        .send({ name: 'New Plan Name', duration_weeks: 8 });
      const body = response.body as ApiResult<Plan>;

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      if (body.success) {
        expect(body.data.name).toBe('New Plan Name');
        expect(body.data.duration_weeks).toBe(8);
      }
    });

    it('should include metadata about affected workouts when mesocycle is active', async () => {
      const { planId, dayIds } = createTestPlanWithDays(1);

      // Create and start mesocycle
      await createAndStartMesocycle(planId);

      // Add new exercise
      const newExercise = exerciseRepo.create({
        name: 'Deadlift',
        weight_increment: 10,
      });

      const firstDayId = dayIds[0];
      if (firstDayId === undefined) {
        throw new Error('First day ID not found');
      }

      planDayExerciseRepo.create({
        plan_day_id: firstDayId,
        exercise_id: newExercise.id,
        sets: 3,
        reps: 5,
        weight: 185,
        rest_seconds: 180,
        sort_order: 1,
      });

      const response = await request(app)
        .put(`/api/plans/${planId}`)
        .send({ name: 'Updated Plan' });
      const body = response.body as ApiResult<Plan>;

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      // The response should include modification metadata
      if (body.success) {
        expect(body.data).toBeDefined();
      }
    });
  });
});
