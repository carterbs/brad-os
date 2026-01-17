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
import type { DayOfWeek } from '@lifting/shared';

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
    expect(exercise).not.toBeNull();

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
        exercise_id: exercise!.id,
        sets: 3,
        reps: 10,
        weight: 100,
        rest_seconds: 90,
        sort_order: 0,
      });
    }

    return { planId: plan.id, dayIds, exerciseId: exercise!.id };
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

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual([]);
    });

    it('should return all mesocycles', async () => {
      const { planId } = createTestPlanWithDays(1);

      // Create mesocycle via API
      await request(app).post('/api/mesocycles').send({
        plan_id: planId,
        start_date: '2024-01-01',
      });

      const response = await request(app).get('/api/mesocycles');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].plan_id).toBe(planId);
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

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(2);
      // Most recent first
      expect(response.body.data[0].start_date).toBe('2024-03-01');
      expect(response.body.data[1].start_date).toBe('2024-01-01');
    });
  });

  describe('GET /api/mesocycles/active', () => {
    it('should return 200 with null when no active mesocycle', async () => {
      const response = await request(app).get('/api/mesocycles/active');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeNull();
    });

    it('should return active mesocycle with details', async () => {
      const { planId } = createTestPlanWithDays(2);

      await request(app).post('/api/mesocycles').send({
        plan_id: planId,
        start_date: '2024-01-01',
      });

      const response = await request(app).get('/api/mesocycles/active');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).not.toBeNull();
      expect(response.body.data.status).toBe('active');
      expect(response.body.data.plan_name).toBe('Test Plan');
      expect(response.body.data.weeks).toHaveLength(7);
    });

    it('should not return completed mesocycles', async () => {
      const { planId } = createTestPlanWithDays(1);

      await request(app).post('/api/mesocycles').send({
        plan_id: planId,
        start_date: '2024-01-01',
      });

      const mesocycles = mesocycleRepo.findAll();
      mesocycleRepo.update(mesocycles[0].id, { status: 'completed' });

      const response = await request(app).get('/api/mesocycles/active');

      expect(response.status).toBe(200);
      expect(response.body.data).toBeNull();
    });
  });

  describe('GET /api/mesocycles/:id', () => {
    it('should return 200 with mesocycle details when found', async () => {
      const { planId } = createTestPlanWithDays(2);

      const createResponse = await request(app).post('/api/mesocycles').send({
        plan_id: planId,
        start_date: '2024-01-01',
      });

      const mesocycleId = createResponse.body.data.id;

      const response = await request(app).get(`/api/mesocycles/${mesocycleId}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(mesocycleId);
      expect(response.body.data.plan_name).toBe('Test Plan');
      expect(response.body.data.weeks).toHaveLength(7);
      expect(response.body.data.total_workouts).toBe(14); // 7 weeks * 2 days
    });

    it('should include workout summaries in weeks', async () => {
      const { planId } = createTestPlanWithDays(1);

      const createResponse = await request(app).post('/api/mesocycles').send({
        plan_id: planId,
        start_date: '2024-01-01',
      });

      const mesocycleId = createResponse.body.data.id;

      const response = await request(app).get(`/api/mesocycles/${mesocycleId}`);

      expect(response.status).toBe(200);
      expect(response.body.data.weeks[0].workouts).toHaveLength(1);
      expect(response.body.data.weeks[0].workouts[0].plan_day_name).toBe(
        'Day 1'
      );
      expect(response.body.data.weeks[0].workouts[0].status).toBe('pending');
    });

    it('should mark week 7 as deload', async () => {
      const { planId } = createTestPlanWithDays(1);

      const createResponse = await request(app).post('/api/mesocycles').send({
        plan_id: planId,
        start_date: '2024-01-01',
      });

      const mesocycleId = createResponse.body.data.id;

      const response = await request(app).get(`/api/mesocycles/${mesocycleId}`);

      expect(response.status).toBe(200);
      // Weeks 1-6 not deload
      for (let i = 0; i < 6; i++) {
        expect(response.body.data.weeks[i].is_deload).toBe(false);
      }
      // Week 7 is deload
      expect(response.body.data.weeks[6].is_deload).toBe(true);
    });

    it('should return 404 when mesocycle not found', async () => {
      const response = await request(app).get('/api/mesocycles/99999');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('NOT_FOUND');
    });

    it('should return 404 for invalid id format', async () => {
      const response = await request(app).get('/api/mesocycles/invalid');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/mesocycles', () => {
    it('should return 201 with created mesocycle', async () => {
      const { planId } = createTestPlanWithDays(2);

      const response = await request(app).post('/api/mesocycles').send({
        plan_id: planId,
        start_date: '2024-01-01',
      });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.plan_id).toBe(planId);
      expect(response.body.data.status).toBe('active');
      expect(response.body.data.current_week).toBe(1);
      expect(response.body.data.id).toBeDefined();
    });

    it('should generate workouts for the mesocycle', async () => {
      const { planId } = createTestPlanWithDays(2);

      const response = await request(app).post('/api/mesocycles').send({
        plan_id: planId,
        start_date: '2024-01-01',
      });

      expect(response.status).toBe(201);

      const workouts = workoutRepo.findByMesocycleId(response.body.data.id);
      // 7 weeks * 2 days = 14 workouts
      expect(workouts).toHaveLength(14);
    });

    it('should return 409 when active mesocycle exists', async () => {
      const { planId } = createTestPlanWithDays(1);

      // Create first mesocycle
      await request(app).post('/api/mesocycles').send({
        plan_id: planId,
        start_date: '2024-01-01',
      });

      // Try to create another
      const response = await request(app).post('/api/mesocycles').send({
        plan_id: planId,
        start_date: '2024-03-01',
      });

      expect(response.status).toBe(409);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('CONFLICT');
      expect(response.body.error.message).toBe(
        'An active mesocycle already exists'
      );
    });

    it('should return 404 when plan does not exist', async () => {
      const response = await request(app).post('/api/mesocycles').send({
        plan_id: 99999,
        start_date: '2024-01-01',
      });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('NOT_FOUND');
    });

    it('should return 400 when plan has no days', async () => {
      const plan = planRepo.create({ name: 'Empty Plan' });

      const response = await request(app).post('/api/mesocycles').send({
        plan_id: plan.id,
        start_date: '2024-01-01',
      });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when plan_id is missing', async () => {
      const response = await request(app).post('/api/mesocycles').send({
        start_date: '2024-01-01',
      });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when start_date is missing', async () => {
      const { planId } = createTestPlanWithDays(1);

      const response = await request(app).post('/api/mesocycles').send({
        plan_id: planId,
      });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when start_date format is invalid', async () => {
      const { planId } = createTestPlanWithDays(1);

      const response = await request(app).post('/api/mesocycles').send({
        plan_id: planId,
        start_date: '01-01-2024', // Invalid format
      });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('PUT /api/mesocycles/:id/complete', () => {
    it('should return 200 with completed mesocycle', async () => {
      const { planId } = createTestPlanWithDays(1);

      const createResponse = await request(app).post('/api/mesocycles').send({
        plan_id: planId,
        start_date: '2024-01-01',
      });

      const mesocycleId = createResponse.body.data.id;

      const response = await request(app).put(
        `/api/mesocycles/${mesocycleId}/complete`
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('completed');
    });

    it('should allow creating new mesocycle after completion', async () => {
      const { planId } = createTestPlanWithDays(1);

      const createResponse = await request(app).post('/api/mesocycles').send({
        plan_id: planId,
        start_date: '2024-01-01',
      });

      const mesocycleId = createResponse.body.data.id;

      await request(app).put(`/api/mesocycles/${mesocycleId}/complete`);

      // Should now be able to create a new one
      const newResponse = await request(app).post('/api/mesocycles').send({
        plan_id: planId,
        start_date: '2024-03-01',
      });

      expect(newResponse.status).toBe(201);
    });

    it('should return 404 when mesocycle not found', async () => {
      const response = await request(app).put('/api/mesocycles/99999/complete');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('NOT_FOUND');
    });

    it('should return 400 when mesocycle is not active', async () => {
      const { planId } = createTestPlanWithDays(1);

      const createResponse = await request(app).post('/api/mesocycles').send({
        plan_id: planId,
        start_date: '2024-01-01',
      });

      const mesocycleId = createResponse.body.data.id;

      // Complete it first
      await request(app).put(`/api/mesocycles/${mesocycleId}/complete`);

      // Try to complete again
      const response = await request(app).put(
        `/api/mesocycles/${mesocycleId}/complete`
      );

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe('Mesocycle is not active');
    });
  });

  describe('PUT /api/mesocycles/:id/cancel', () => {
    it('should return 200 with cancelled mesocycle', async () => {
      const { planId } = createTestPlanWithDays(1);

      const createResponse = await request(app).post('/api/mesocycles').send({
        plan_id: planId,
        start_date: '2024-01-01',
      });

      const mesocycleId = createResponse.body.data.id;

      const response = await request(app).put(
        `/api/mesocycles/${mesocycleId}/cancel`
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('cancelled');
    });

    it('should preserve workout data when cancelled', async () => {
      const { planId } = createTestPlanWithDays(1);

      const createResponse = await request(app).post('/api/mesocycles').send({
        plan_id: planId,
        start_date: '2024-01-01',
      });

      const mesocycleId = createResponse.body.data.id;

      await request(app).put(`/api/mesocycles/${mesocycleId}/cancel`);

      const workouts = workoutRepo.findByMesocycleId(mesocycleId);
      expect(workouts.length).toBeGreaterThan(0);
    });

    it('should allow creating new mesocycle after cancellation', async () => {
      const { planId } = createTestPlanWithDays(1);

      const createResponse = await request(app).post('/api/mesocycles').send({
        plan_id: planId,
        start_date: '2024-01-01',
      });

      const mesocycleId = createResponse.body.data.id;

      await request(app).put(`/api/mesocycles/${mesocycleId}/cancel`);

      // Should now be able to create a new one
      const newResponse = await request(app).post('/api/mesocycles').send({
        plan_id: planId,
        start_date: '2024-03-01',
      });

      expect(newResponse.status).toBe(201);
    });

    it('should return 404 when mesocycle not found', async () => {
      const response = await request(app).put('/api/mesocycles/99999/cancel');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('NOT_FOUND');
    });

    it('should return 400 when mesocycle is not active', async () => {
      const { planId } = createTestPlanWithDays(1);

      const createResponse = await request(app).post('/api/mesocycles').send({
        plan_id: planId,
        start_date: '2024-01-01',
      });

      const mesocycleId = createResponse.body.data.id;

      // Cancel it first
      await request(app).put(`/api/mesocycles/${mesocycleId}/cancel`);

      // Try to cancel again
      const response = await request(app).put(
        `/api/mesocycles/${mesocycleId}/cancel`
      );

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe('Mesocycle is not active');
    });
  });
});
