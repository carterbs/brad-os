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
} from '../../repositories/index.js';
import type { DayOfWeek, Mesocycle, MesocycleWithDetails, ApiResult } from '@brad-os/shared';

describe('Mesocycle Routes', () => {
  let ctx: TestContext;
  let app: Express;
  let db: Database.Database;
  let planRepo: PlanRepository;
  let planDayRepo: PlanDayRepository;
  let planDayExerciseRepo: PlanDayExerciseRepository;
  let exerciseRepo: ExerciseRepository;
  let mesocycleRepo: MesocycleRepository;
  let workoutRepo: WorkoutRepository;

  // Helper to create a plan with days and exercises
  function createTestPlanWithDays(numDays: number = 2): {
    planId: number;
    dayIds: number[];
    exerciseId: number;
  } {
    // Use existing exercise from seeds
    const exercise = exerciseRepo.findByName('Leg Extension');
    if (!exercise) {
      throw new Error('Leg Extension exercise not found in seeds');
    }

    const plan = planRepo.create({ name: 'Test Plan', duration_weeks: 6 });

    const dayIds: number[] = [];
    for (let i = 0; i < numDays; i++) {
      const day = planDayRepo.create({
        plan_id: plan.id,
        day_of_week: (i + 1) as DayOfWeek,
        name: `Day ${i + 1}`,
        sort_order: i,
      });
      dayIds.push(day.id);

      planDayExerciseRepo.create({
        plan_day_id: day.id,
        exercise_id: exercise.id,
        sets: 3,
        reps: 10,
        weight: 100,
        rest_seconds: 90,
        sort_order: 0,
      });
    }

    return { planId: plan.id, dayIds, exerciseId: exercise.id };
  }

  // Helper to create and start a mesocycle (since create() now defaults to 'pending')
  async function createAndStartMesocycle(
    planId: number,
    startDate: string = '2024-01-01'
  ): Promise<number> {
    const createResponse = await request(app).post('/api/mesocycles').send({
      plan_id: planId,
      start_date: startDate,
    });
    const createBody = createResponse.body as ApiResult<Mesocycle>;
    if (!createBody.success) throw new Error('Failed to create mesocycle');
    const mesoId = createBody.data.id;
    await request(app).put(`/api/mesocycles/${mesoId}/start`);
    return mesoId;
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
  });

  afterEach(() => {
    teardownTestApp(ctx);
  });

  describe('GET /api/mesocycles', () => {
    it('should return 200 with empty array when no mesocycles exist', async () => {
      const response = await request(app).get('/api/mesocycles');
      const body = response.body as ApiResult<Mesocycle[]>;

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      if (body.success) {
        expect(body.data).toEqual([]);
      }
    });

    it('should return all mesocycles', async () => {
      const { planId } = createTestPlanWithDays(1);

      // Create mesocycle via API
      await request(app).post('/api/mesocycles').send({
        plan_id: planId,
        start_date: '2024-01-01',
      });

      const response = await request(app).get('/api/mesocycles');
      const body = response.body as ApiResult<Mesocycle[]>;

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      if (body.success) {
        expect(body.data).toHaveLength(1);
        expect(body.data[0]?.plan_id).toBe(planId);
      }
    });

    it('should return mesocycles ordered by start_date descending', async () => {
      const { planId } = createTestPlanWithDays(1);

      // Create first mesocycle
      await request(app).post('/api/mesocycles').send({
        plan_id: planId,
        start_date: '2024-01-01',
      });

      // Complete it so we can create another
      const mesocycles = mesocycleRepo.findAll();
      mesocycleRepo.update(mesocycles[0].id, { status: 'completed' });

      // Create second mesocycle
      await request(app).post('/api/mesocycles').send({
        plan_id: planId,
        start_date: '2024-03-01',
      });

      const response = await request(app).get('/api/mesocycles');
      const body = response.body as ApiResult<Mesocycle[]>;

      expect(response.status).toBe(200);
      if (body.success) {
        expect(body.data).toHaveLength(2);
        // Most recent first
        expect(body.data[0]?.start_date).toBe('2024-03-01');
        expect(body.data[1]?.start_date).toBe('2024-01-01');
      }
    });
  });

  describe('GET /api/mesocycles/active', () => {
    it('should return 200 with null when no active mesocycle', async () => {
      const response = await request(app).get('/api/mesocycles/active');
      const body = response.body as ApiResult<MesocycleWithDetails | null>;

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      if (body.success) {
        expect(body.data).toBeNull();
      }
    });

    it('should return active mesocycle with details', async () => {
      const { planId } = createTestPlanWithDays(2);

      await createAndStartMesocycle(planId);

      const response = await request(app).get('/api/mesocycles/active');
      const body = response.body as ApiResult<MesocycleWithDetails | null>;

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      if (body.success && body.data) {
        expect(body.data.status).toBe('active');
        expect(body.data.plan_name).toBe('Test Plan');
        expect(body.data.weeks).toHaveLength(7);
      }
    });

    it('should not return completed mesocycles', async () => {
      const { planId } = createTestPlanWithDays(1);

      const mesocycleId = await createAndStartMesocycle(planId);
      mesocycleRepo.update(mesocycleId, { status: 'completed' });

      const response = await request(app).get('/api/mesocycles/active');
      const body = response.body as ApiResult<MesocycleWithDetails | null>;

      expect(response.status).toBe(200);
      if (body.success) {
        expect(body.data).toBeNull();
      }
    });

    it('should not return pending mesocycles', async () => {
      const { planId } = createTestPlanWithDays(1);

      // Create but don't start
      await request(app).post('/api/mesocycles').send({
        plan_id: planId,
        start_date: '2024-01-01',
      });

      const response = await request(app).get('/api/mesocycles/active');
      const body = response.body as ApiResult<MesocycleWithDetails | null>;

      expect(response.status).toBe(200);
      if (body.success) {
        expect(body.data).toBeNull();
      }
    });
  });

  describe('GET /api/mesocycles/:id', () => {
    it('should return 200 with mesocycle details when found (started)', async () => {
      const { planId } = createTestPlanWithDays(2);

      const mesocycleId = await createAndStartMesocycle(planId);

      const response = await request(app).get(`/api/mesocycles/${mesocycleId}`);
      const body = response.body as ApiResult<MesocycleWithDetails>;

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      if (body.success) {
        expect(body.data.id).toBe(mesocycleId);
        expect(body.data.plan_name).toBe('Test Plan');
        expect(body.data.weeks).toHaveLength(7);
        expect(body.data.total_workouts).toBe(14); // 7 weeks * 2 days
      }
    });

    it('should return pending mesocycle with 0 workouts', async () => {
      const { planId } = createTestPlanWithDays(1);

      const createResponse = await request(app).post('/api/mesocycles').send({
        plan_id: planId,
        start_date: '2024-01-01',
      });
      const createBody = createResponse.body as ApiResult<Mesocycle>;
      if (!createBody.success) throw new Error('Failed to create mesocycle');

      const mesocycleId = createBody.data.id;

      const response = await request(app).get(`/api/mesocycles/${mesocycleId}`);
      const body = response.body as ApiResult<MesocycleWithDetails>;

      expect(response.status).toBe(200);
      if (body.success) {
        expect(body.data.status).toBe('pending');
        expect(body.data.total_workouts).toBe(0);
      }
    });

    it('should include workout summaries in weeks', async () => {
      const { planId } = createTestPlanWithDays(1);

      const mesocycleId = await createAndStartMesocycle(planId);

      const response = await request(app).get(`/api/mesocycles/${mesocycleId}`);
      const body = response.body as ApiResult<MesocycleWithDetails>;

      expect(response.status).toBe(200);
      if (body.success) {
        expect(body.data.weeks[0]?.workouts).toHaveLength(1);
        expect(body.data.weeks[0]?.workouts[0]?.plan_day_name).toBe('Day 1');
        expect(body.data.weeks[0]?.workouts[0]?.status).toBe('pending');
      }
    });

    it('should mark week 7 as deload', async () => {
      const { planId } = createTestPlanWithDays(1);

      const mesocycleId = await createAndStartMesocycle(planId);

      const response = await request(app).get(`/api/mesocycles/${mesocycleId}`);
      const body = response.body as ApiResult<MesocycleWithDetails>;

      expect(response.status).toBe(200);
      if (body.success) {
        // Weeks 1-6 not deload
        for (let i = 0; i < 6; i++) {
          expect(body.data.weeks[i]?.is_deload).toBe(false);
        }
        // Week 7 is deload
        expect(body.data.weeks[6]?.is_deload).toBe(true);
      }
    });

    it('should return 404 when mesocycle not found', async () => {
      const response = await request(app).get('/api/mesocycles/99999');
      const body = response.body as ApiResult<MesocycleWithDetails>;

      expect(response.status).toBe(404);
      expect(body.success).toBe(false);
      if (!body.success) {
        expect(body.error.code).toBe('NOT_FOUND');
      }
    });

    it('should return 404 for invalid id format', async () => {
      const response = await request(app).get('/api/mesocycles/invalid');
      const body = response.body as ApiResult<MesocycleWithDetails>;

      expect(response.status).toBe(404);
      expect(body.success).toBe(false);
    });
  });

  describe('POST /api/mesocycles', () => {
    it('should return 201 with created mesocycle in pending status', async () => {
      const { planId } = createTestPlanWithDays(2);

      const response = await request(app).post('/api/mesocycles').send({
        plan_id: planId,
        start_date: '2024-01-01',
      });
      const body = response.body as ApiResult<Mesocycle>;

      expect(response.status).toBe(201);
      expect(body.success).toBe(true);
      if (body.success) {
        expect(body.data.plan_id).toBe(planId);
        expect(body.data.status).toBe('pending');
        expect(body.data.current_week).toBe(1);
        expect(body.data.id).toBeDefined();
      }
    });

    it('should not generate workouts on create (only on start)', async () => {
      const { planId } = createTestPlanWithDays(2);

      const response = await request(app).post('/api/mesocycles').send({
        plan_id: planId,
        start_date: '2024-01-01',
      });
      const body = response.body as ApiResult<Mesocycle>;

      expect(response.status).toBe(201);

      if (body.success) {
        const workouts = workoutRepo.findByMesocycleId(body.data.id);
        // No workouts until start() is called
        expect(workouts).toHaveLength(0);
      }
    });

    it('should allow creating multiple pending mesocycles', async () => {
      const { planId } = createTestPlanWithDays(1);

      // Create first mesocycle
      await request(app).post('/api/mesocycles').send({
        plan_id: planId,
        start_date: '2024-01-01',
      });

      // Create another (should succeed since first is pending)
      const response = await request(app).post('/api/mesocycles').send({
        plan_id: planId,
        start_date: '2024-03-01',
      });
      const body = response.body as ApiResult<Mesocycle>;

      expect(response.status).toBe(201);
      expect(body.success).toBe(true);
      if (body.success) {
        expect(body.data.status).toBe('pending');
      }
    });

    it('should return 404 when plan does not exist', async () => {
      const response = await request(app).post('/api/mesocycles').send({
        plan_id: 99999,
        start_date: '2024-01-01',
      });
      const body = response.body as ApiResult<Mesocycle>;

      expect(response.status).toBe(404);
      expect(body.success).toBe(false);
      if (!body.success) {
        expect(body.error.code).toBe('NOT_FOUND');
      }
    });

    it('should return 400 when plan has no days', async () => {
      const plan = planRepo.create({ name: 'Empty Plan' });

      const response = await request(app).post('/api/mesocycles').send({
        plan_id: plan.id,
        start_date: '2024-01-01',
      });
      const body = response.body as ApiResult<Mesocycle>;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      if (!body.success) {
        expect(body.error.code).toBe('VALIDATION_ERROR');
      }
    });

    it('should return 400 when plan_id is missing', async () => {
      const response = await request(app).post('/api/mesocycles').send({
        start_date: '2024-01-01',
      });
      const body = response.body as ApiResult<Mesocycle>;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      if (!body.success) {
        expect(body.error.code).toBe('VALIDATION_ERROR');
      }
    });

    it('should return 400 when start_date is missing', async () => {
      const { planId } = createTestPlanWithDays(1);

      const response = await request(app).post('/api/mesocycles').send({
        plan_id: planId,
      });
      const body = response.body as ApiResult<Mesocycle>;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      if (!body.success) {
        expect(body.error.code).toBe('VALIDATION_ERROR');
      }
    });

    it('should return 400 when start_date format is invalid', async () => {
      const { planId } = createTestPlanWithDays(1);

      const response = await request(app).post('/api/mesocycles').send({
        plan_id: planId,
        start_date: '01-01-2024', // Invalid format
      });
      const body = response.body as ApiResult<Mesocycle>;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
    });
  });

  describe('PUT /api/mesocycles/:id/start', () => {
    it('should return 200 and start a pending mesocycle', async () => {
      const { planId } = createTestPlanWithDays(1);

      const createResponse = await request(app).post('/api/mesocycles').send({
        plan_id: planId,
        start_date: '2024-01-01',
      });
      const createBody = createResponse.body as ApiResult<Mesocycle>;
      if (!createBody.success) throw new Error('Failed to create mesocycle');

      const mesocycleId = createBody.data.id;

      const response = await request(app).put(
        `/api/mesocycles/${mesocycleId}/start`
      );
      const body = response.body as ApiResult<Mesocycle>;

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      if (body.success) {
        expect(body.data.status).toBe('active');
      }
    });

    it('should generate workouts when starting', async () => {
      const { planId } = createTestPlanWithDays(2);

      const createResponse = await request(app).post('/api/mesocycles').send({
        plan_id: planId,
        start_date: '2024-01-01',
      });
      const createBody = createResponse.body as ApiResult<Mesocycle>;
      if (!createBody.success) throw new Error('Failed to create mesocycle');

      const mesocycleId = createBody.data.id;

      // Before start - no workouts
      let workouts = workoutRepo.findByMesocycleId(mesocycleId);
      expect(workouts).toHaveLength(0);

      await request(app).put(`/api/mesocycles/${mesocycleId}/start`);

      // After start - workouts generated
      workouts = workoutRepo.findByMesocycleId(mesocycleId);
      expect(workouts).toHaveLength(14); // 7 weeks * 2 days
    });

    it('should return 409 when an active mesocycle already exists', async () => {
      const { planId } = createTestPlanWithDays(1);

      // Create and start first mesocycle
      await createAndStartMesocycle(planId);

      // Create second mesocycle (pending)
      const createResponse = await request(app).post('/api/mesocycles').send({
        plan_id: planId,
        start_date: '2024-03-01',
      });
      const createBody = createResponse.body as ApiResult<Mesocycle>;
      if (!createBody.success) throw new Error('Failed to create mesocycle');

      // Try to start second - should fail
      const response = await request(app).put(
        `/api/mesocycles/${createBody.data.id}/start`
      );
      const body = response.body as ApiResult<Mesocycle>;

      expect(response.status).toBe(409);
      expect(body.success).toBe(false);
    });

    it('should return 400 when trying to start non-pending mesocycle', async () => {
      const { planId } = createTestPlanWithDays(1);

      const mesocycleId = await createAndStartMesocycle(planId);

      // Try to start again
      const response = await request(app).put(
        `/api/mesocycles/${mesocycleId}/start`
      );
      const body = response.body as ApiResult<Mesocycle>;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
    });
  });

  describe('PUT /api/mesocycles/:id/complete', () => {
    it('should return 200 with completed mesocycle', async () => {
      const { planId } = createTestPlanWithDays(1);

      const mesocycleId = await createAndStartMesocycle(planId);

      const response = await request(app).put(
        `/api/mesocycles/${mesocycleId}/complete`
      );
      const body = response.body as ApiResult<Mesocycle>;

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      if (body.success) {
        expect(body.data.status).toBe('completed');
      }
    });

    it('should allow starting new mesocycle after completion', async () => {
      const { planId } = createTestPlanWithDays(1);

      const mesocycleId = await createAndStartMesocycle(planId);

      await request(app).put(`/api/mesocycles/${mesocycleId}/complete`);

      // Should now be able to start a new one
      const newResponse = await request(app).post('/api/mesocycles').send({
        plan_id: planId,
        start_date: '2024-03-01',
      });
      const createBody = newResponse.body as ApiResult<Mesocycle>;
      if (!createBody.success) throw new Error('Failed to create mesocycle');

      const startResponse = await request(app).put(
        `/api/mesocycles/${createBody.data.id}/start`
      );
      expect(startResponse.status).toBe(200);
    });

    it('should return 404 when mesocycle not found', async () => {
      const response = await request(app).put('/api/mesocycles/99999/complete');
      const body = response.body as ApiResult<Mesocycle>;

      expect(response.status).toBe(404);
      expect(body.success).toBe(false);
      if (!body.success) {
        expect(body.error.code).toBe('NOT_FOUND');
      }
    });

    it('should return 400 when mesocycle is not active', async () => {
      const { planId } = createTestPlanWithDays(1);

      const mesocycleId = await createAndStartMesocycle(planId);

      // Complete it first
      await request(app).put(`/api/mesocycles/${mesocycleId}/complete`);

      // Try to complete again
      const response = await request(app).put(
        `/api/mesocycles/${mesocycleId}/complete`
      );
      const body = response.body as ApiResult<Mesocycle>;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      if (!body.success) {
        expect(body.error.message).toBe('Mesocycle is not active');
      }
    });
  });

  describe('PUT /api/mesocycles/:id/cancel', () => {
    it('should return 200 with cancelled mesocycle', async () => {
      const { planId } = createTestPlanWithDays(1);

      const mesocycleId = await createAndStartMesocycle(planId);

      const response = await request(app).put(
        `/api/mesocycles/${mesocycleId}/cancel`
      );
      const body = response.body as ApiResult<Mesocycle>;

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      if (body.success) {
        expect(body.data.status).toBe('cancelled');
      }
    });

    it('should preserve workout data when cancelled', async () => {
      const { planId } = createTestPlanWithDays(1);

      const mesocycleId = await createAndStartMesocycle(planId);

      await request(app).put(`/api/mesocycles/${mesocycleId}/cancel`);

      const workouts = workoutRepo.findByMesocycleId(mesocycleId);
      expect(workouts.length).toBeGreaterThan(0);
    });

    it('should allow starting new mesocycle after cancellation', async () => {
      const { planId } = createTestPlanWithDays(1);

      const mesocycleId = await createAndStartMesocycle(planId);

      await request(app).put(`/api/mesocycles/${mesocycleId}/cancel`);

      // Should now be able to start a new one
      const newResponse = await request(app).post('/api/mesocycles').send({
        plan_id: planId,
        start_date: '2024-03-01',
      });
      const createBody = newResponse.body as ApiResult<Mesocycle>;
      if (!createBody.success) throw new Error('Failed to create mesocycle');

      const startResponse = await request(app).put(
        `/api/mesocycles/${createBody.data.id}/start`
      );
      expect(startResponse.status).toBe(200);
    });

    it('should return 404 when mesocycle not found', async () => {
      const response = await request(app).put('/api/mesocycles/99999/cancel');
      const body = response.body as ApiResult<Mesocycle>;

      expect(response.status).toBe(404);
      expect(body.success).toBe(false);
      if (!body.success) {
        expect(body.error.code).toBe('NOT_FOUND');
      }
    });

    it('should return 400 when mesocycle is not active', async () => {
      const { planId } = createTestPlanWithDays(1);

      const mesocycleId = await createAndStartMesocycle(planId);

      // Cancel it first
      await request(app).put(`/api/mesocycles/${mesocycleId}/cancel`);

      // Try to cancel again
      const response = await request(app).put(
        `/api/mesocycles/${mesocycleId}/cancel`
      );
      const body = response.body as ApiResult<Mesocycle>;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      if (!body.success) {
        expect(body.error.message).toBe('Mesocycle is not active');
      }
    });
  });
});
