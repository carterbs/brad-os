import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { Response } from 'supertest';
import { type ApiResponse, createPlan, createPlanDay, createPlanDayExercise, createMesocycle, createExercise, createMockPlanRepository, createMockPlanDayRepository, createMockPlanDayExerciseRepository, createMockMesocycleRepository, createMockExerciseRepository } from '../__tests__/utils/index.js';

// Mock firebase before importing the handler
vi.mock('../firebase.js', () => ({
  getFirestoreDb: vi.fn(),
}));

// Mock app-check middleware
vi.mock('../middleware/app-check.js', () => ({
  requireAppCheck: (_req: unknown, _res: unknown, next: () => void): void => next(),
}));

// Mock repositories
const mockPlanRepo = createMockPlanRepository();
const mockPlanDayRepo = createMockPlanDayRepository();
const mockPlanDayExerciseRepo = createMockPlanDayExerciseRepository();
const mockMesocycleRepo = createMockMesocycleRepository();
const mockExerciseRepo = createMockExerciseRepository();

vi.mock('../repositories/index.js', () => ({
  PlanRepository: vi.fn().mockImplementation(() => mockPlanRepo),
  PlanDayRepository: vi.fn().mockImplementation(() => mockPlanDayRepo),
  PlanDayExerciseRepository: vi.fn().mockImplementation(() => mockPlanDayExerciseRepo),
  MesocycleRepository: vi.fn().mockImplementation(() => mockMesocycleRepo),
  ExerciseRepository: vi.fn().mockImplementation(() => mockExerciseRepo),
}));

// Mock services
const mockPlanModificationService = {
  syncPlanToMesocycle: vi.fn(),
};

vi.mock('../services/index.js', () => ({
  getPlanModificationService: (): typeof mockPlanModificationService => mockPlanModificationService,
}));

// Import after mocks
import { plansApp } from './plans.js';

describe('Plans Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============ Plans CRUD ============

  describe('GET /plans', () => {
    it('should return all plans', async () => {
      const plans = [
        createPlan({ id: '1', name: 'Plan A' }),
        createPlan({ id: '2', name: 'Plan B' }),
      ];
      mockPlanRepo.findAll.mockResolvedValue(plans);

      const response = await request(plansApp).get('/');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: plans,
      });
      expect(mockPlanRepo.findAll).toHaveBeenCalledTimes(1);
    });

    it('should return empty array when no plans exist', async () => {
      mockPlanRepo.findAll.mockResolvedValue([]);

      const response = await request(plansApp).get('/');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: [],
      });
    });
  });

  describe('GET /plans/:id', () => {
    it('should return plan by id', async () => {
      const plan = createPlan({ id: 'plan-123' });
      mockPlanRepo.findById.mockResolvedValue(plan);

      const response = await request(plansApp).get('/plan-123');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: plan,
      });
      expect(mockPlanRepo.findById).toHaveBeenCalledWith('plan-123');
    });

    it('should return 404 when plan not found', async () => {
      mockPlanRepo.findById.mockResolvedValue(null);

      const response = await request(plansApp).get('/non-existent-id');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Plan with id non-existent-id not found',
        },
      });
    });
  });

  describe('POST /plans', () => {
    it('should create plan with valid data', async () => {
      const createdPlan = createPlan({ id: 'new-plan', name: 'New Plan' });
      mockPlanRepo.create.mockResolvedValue(createdPlan);

      const response = await request(plansApp)
        .post('/')
        .send({ name: 'New Plan', duration_weeks: 6 });

      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        success: true,
        data: createdPlan,
      });
    });

    it('should create plan with default duration', async () => {
      const createdPlan = createPlan({ id: 'new-plan', name: 'Minimal Plan' });
      mockPlanRepo.create.mockResolvedValue(createdPlan);

      const response = await request(plansApp)
        .post('/')
        .send({ name: 'Minimal Plan' });

      expect(response.status).toBe(201);
      expect(mockPlanRepo.create).toHaveBeenCalledWith({
        name: 'Minimal Plan',
        duration_weeks: 6,
      });
    });

    it('should return 400 for empty name', async () => {
      const response: Response = await request(plansApp)
        .post('/')
        .send({ name: '' });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for missing name', async () => {
      const response: Response = await request(plansApp)
        .post('/')
        .send({ duration_weeks: 6 });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for non-positive duration', async () => {
      const response: Response = await request(plansApp)
        .post('/')
        .send({ name: 'Test', duration_weeks: 0 });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('PUT /plans/:id', () => {
    it('should update plan with valid data', async () => {
      const existingPlan = createPlan({ id: 'plan-123' });
      const updatedPlan = createPlan({ id: 'plan-123', name: 'Updated Plan' });
      mockPlanRepo.findById.mockResolvedValue(existingPlan);
      mockMesocycleRepo.findByPlanId.mockResolvedValue([]);
      mockPlanRepo.update.mockResolvedValue(updatedPlan);

      const response = await request(plansApp)
        .put('/plan-123')
        .send({ name: 'Updated Plan' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: updatedPlan,
      });
    });

    it('should sync to mesocycle when plan has active mesocycle', async () => {
      const existingPlan = createPlan({ id: 'plan-123' });
      const updatedPlan = createPlan({ id: 'plan-123', name: 'Updated Plan' });
      const activeMesocycle = createMesocycle({ plan_id: 'plan-123', status: 'active' });
      const planDays = [createPlanDay({ plan_id: 'plan-123' })];
      const planExercises = [createPlanDayExercise()];
      const exercises = [createExercise()];

      mockPlanRepo.findById.mockResolvedValue(existingPlan);
      mockMesocycleRepo.findByPlanId.mockResolvedValue([activeMesocycle]);
      mockPlanRepo.update.mockResolvedValue(updatedPlan);
      mockPlanDayRepo.findByPlanId.mockResolvedValue(planDays);
      mockPlanDayExerciseRepo.findByPlanDayId.mockResolvedValue(planExercises);
      mockExerciseRepo.findAll.mockResolvedValue(exercises);
      mockPlanModificationService.syncPlanToMesocycle.mockResolvedValue(undefined);

      const response = await request(plansApp)
        .put('/plan-123')
        .send({ name: 'Updated Plan' });

      expect(response.status).toBe(200);
      expect(mockPlanModificationService.syncPlanToMesocycle).toHaveBeenCalled();
    });

    it('should return 404 when plan not found', async () => {
      mockPlanRepo.findById.mockResolvedValue(null);

      const response: Response = await request(plansApp)
        .put('/non-existent-id')
        .send({ name: 'Updated Plan' });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(404);
      expect(body.error?.code).toBe('NOT_FOUND');
    });

    it('should return 400 for empty name', async () => {
      const response: Response = await request(plansApp)
        .put('/plan-123')
        .send({ name: '' });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('DELETE /plans/:id', () => {
    it('should delete plan successfully', async () => {
      mockPlanRepo.isInUse.mockResolvedValue(false);
      mockPlanRepo.delete.mockResolvedValue(true);

      const response = await request(plansApp).delete('/plan-123');

      expect(response.status).toBe(204);
      expect(mockPlanRepo.delete).toHaveBeenCalledWith('plan-123');
    });

    it('should return 404 when plan not found', async () => {
      mockPlanRepo.isInUse.mockResolvedValue(false);
      mockPlanRepo.delete.mockResolvedValue(false);

      const response: Response = await request(plansApp).delete('/non-existent-id');
      const body = response.body as ApiResponse;

      expect(response.status).toBe(404);
      expect(body.error?.code).toBe('NOT_FOUND');
    });

    it('should return 409 when plan has active mesocycles', async () => {
      mockPlanRepo.isInUse.mockResolvedValue(true);

      const response = await request(plansApp).delete('/plan-123');

      expect(response.status).toBe(409);
      expect(response.body).toEqual({
        success: false,
        error: {
          code: 'CONFLICT',
          message: 'Cannot delete plan that has active mesocycles',
        },
      });
      expect(mockPlanRepo.delete).not.toHaveBeenCalled();
    });
  });

  // ============ Plan Days CRUD ============

  describe('GET /plans/:planId/days', () => {
    it('should return days for plan', async () => {
      const plan = createPlan({ id: 'plan-123' });
      const days = [
        createPlanDay({ id: 'day-1', plan_id: 'plan-123' }),
        createPlanDay({ id: 'day-2', plan_id: 'plan-123' }),
      ];
      mockPlanRepo.findById.mockResolvedValue(plan);
      mockPlanDayRepo.findByPlanId.mockResolvedValue(days);

      const response = await request(plansApp).get('/plan-123/days');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: days,
      });
    });

    it('should return 404 when plan not found', async () => {
      mockPlanRepo.findById.mockResolvedValue(null);

      const response: Response = await request(plansApp).get('/non-existent-id/days');
      const body = response.body as ApiResponse;

      expect(response.status).toBe(404);
      expect(body.error?.code).toBe('NOT_FOUND');
    });

    it('should return empty array when no days exist', async () => {
      const plan = createPlan({ id: 'plan-123' });
      mockPlanRepo.findById.mockResolvedValue(plan);
      mockPlanDayRepo.findByPlanId.mockResolvedValue([]);

      const response = await request(plansApp).get('/plan-123/days');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: [],
      });
    });
  });

  describe('POST /plans/:planId/days', () => {
    it('should create day for plan', async () => {
      const plan = createPlan({ id: 'plan-123' });
      const createdDay = createPlanDay({ id: 'new-day', plan_id: 'plan-123' });
      mockPlanRepo.findById.mockResolvedValue(plan);
      mockPlanDayRepo.create.mockResolvedValue(createdDay);

      const response = await request(plansApp)
        .post('/plan-123/days')
        .send({
          day_of_week: 1,
          name: 'Push Day',
          sort_order: 0,
        });

      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        success: true,
        data: createdDay,
      });
      expect(mockPlanDayRepo.create).toHaveBeenCalledWith({
        plan_id: 'plan-123',
        day_of_week: 1,
        name: 'Push Day',
        sort_order: 0,
      });
    });

    it('should return 404 when plan not found', async () => {
      mockPlanRepo.findById.mockResolvedValue(null);

      const response: Response = await request(plansApp)
        .post('/non-existent-id/days')
        .send({
          day_of_week: 1,
          name: 'Push Day',
          sort_order: 0,
        });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(404);
      expect(body.error?.code).toBe('NOT_FOUND');
    });

    it('should return 400 for invalid day_of_week', async () => {
      const plan = createPlan({ id: 'plan-123' });
      mockPlanRepo.findById.mockResolvedValue(plan);

      const response: Response = await request(plansApp)
        .post('/plan-123/days')
        .send({
          day_of_week: 7, // Invalid: must be 0-6
          name: 'Invalid Day',
          sort_order: 0,
        });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for missing name', async () => {
      const plan = createPlan({ id: 'plan-123' });
      mockPlanRepo.findById.mockResolvedValue(plan);

      const response: Response = await request(plansApp)
        .post('/plan-123/days')
        .send({
          day_of_week: 1,
          sort_order: 0,
        });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('PUT /plans/:planId/days/:dayId', () => {
    it('should update day successfully', async () => {
      const updatedDay = createPlanDay({ id: 'day-123', name: 'Updated Day' });
      mockPlanDayRepo.update.mockResolvedValue(updatedDay);

      const response = await request(plansApp)
        .put('/plan-123/days/day-123')
        .send({ name: 'Updated Day' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: updatedDay,
      });
    });

    it('should return 404 when day not found', async () => {
      mockPlanDayRepo.update.mockResolvedValue(null);

      const response: Response = await request(plansApp)
        .put('/plan-123/days/non-existent-id')
        .send({ name: 'Updated Day' });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(404);
      expect(body.error?.code).toBe('NOT_FOUND');
    });

    it('should return 400 for invalid day_of_week', async () => {
      const response: Response = await request(plansApp)
        .put('/plan-123/days/day-123')
        .send({ day_of_week: -1 });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('DELETE /plans/:planId/days/:dayId', () => {
    it('should delete day successfully', async () => {
      mockPlanDayRepo.delete.mockResolvedValue(true);

      const response = await request(plansApp).delete('/plan-123/days/day-123');

      expect(response.status).toBe(204);
      expect(mockPlanDayRepo.delete).toHaveBeenCalledWith('day-123');
    });

    it('should return 404 when day not found', async () => {
      mockPlanDayRepo.delete.mockResolvedValue(false);

      const response: Response = await request(plansApp).delete('/plan-123/days/non-existent-id');
      const body = response.body as ApiResponse;

      expect(response.status).toBe(404);
      expect(body.error?.code).toBe('NOT_FOUND');
    });
  });

  // ============ Plan Day Exercises CRUD ============

  describe('GET /plans/:planId/days/:dayId/exercises', () => {
    it('should return exercises for day', async () => {
      const day = createPlanDay({ id: 'day-123' });
      const exercises = [
        createPlanDayExercise({ id: 'pde-1', plan_day_id: 'day-123' }),
        createPlanDayExercise({ id: 'pde-2', plan_day_id: 'day-123' }),
      ];
      mockPlanDayRepo.findById.mockResolvedValue(day);
      mockPlanDayExerciseRepo.findByPlanDayId.mockResolvedValue(exercises);

      const response = await request(plansApp).get('/plan-123/days/day-123/exercises');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: exercises,
      });
    });

    it('should return 404 when day not found', async () => {
      mockPlanDayRepo.findById.mockResolvedValue(null);

      const response: Response = await request(plansApp).get('/plan-123/days/non-existent-id/exercises');
      const body = response.body as ApiResponse;

      expect(response.status).toBe(404);
      expect(body.error?.code).toBe('NOT_FOUND');
    });

    it('should return empty array when no exercises exist', async () => {
      const day = createPlanDay({ id: 'day-123' });
      mockPlanDayRepo.findById.mockResolvedValue(day);
      mockPlanDayExerciseRepo.findByPlanDayId.mockResolvedValue([]);

      const response = await request(plansApp).get('/plan-123/days/day-123/exercises');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: [],
      });
    });
  });

  describe('POST /plans/:planId/days/:dayId/exercises', () => {
    it('should create exercise for day', async () => {
      const day = createPlanDay({ id: 'day-123' });
      const createdExercise = createPlanDayExercise({
        id: 'new-pde',
        plan_day_id: 'day-123',
      });
      mockPlanDayRepo.findById.mockResolvedValue(day);
      mockPlanDayExerciseRepo.create.mockResolvedValue(createdExercise);

      const response = await request(plansApp)
        .post('/plan-123/days/day-123/exercises')
        .send({
          exercise_id: 'exercise-1',
          sort_order: 0,
        });

      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        success: true,
        data: createdExercise,
      });
    });

    it('should create exercise with custom values', async () => {
      const day = createPlanDay({ id: 'day-123' });
      const createdExercise = createPlanDayExercise({
        id: 'new-pde',
        sets: 4,
        reps: 12,
        weight: 150,
      });
      mockPlanDayRepo.findById.mockResolvedValue(day);
      mockPlanDayExerciseRepo.create.mockResolvedValue(createdExercise);

      const response = await request(plansApp)
        .post('/plan-123/days/day-123/exercises')
        .send({
          exercise_id: 'exercise-1',
          sets: 4,
          reps: 12,
          weight: 150,
          sort_order: 0,
        });

      expect(response.status).toBe(201);
      expect(mockPlanDayExerciseRepo.create).toHaveBeenCalledWith({
        plan_day_id: 'day-123',
        exercise_id: 'exercise-1',
        sets: 4,
        reps: 12,
        weight: 150,
        rest_seconds: 60,
        sort_order: 0,
        min_reps: 8,
        max_reps: 12,
      });
    });

    it('should return 404 when day not found', async () => {
      mockPlanDayRepo.findById.mockResolvedValue(null);

      const response: Response = await request(plansApp)
        .post('/plan-123/days/non-existent-id/exercises')
        .send({
          exercise_id: 'exercise-1',
          sort_order: 0,
        });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(404);
      expect(body.error?.code).toBe('NOT_FOUND');
    });

    it('should return 400 for missing exercise_id', async () => {
      const day = createPlanDay({ id: 'day-123' });
      mockPlanDayRepo.findById.mockResolvedValue(day);

      const response: Response = await request(plansApp)
        .post('/plan-123/days/day-123/exercises')
        .send({ sort_order: 0 });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for non-positive sets', async () => {
      const day = createPlanDay({ id: 'day-123' });
      mockPlanDayRepo.findById.mockResolvedValue(day);

      const response: Response = await request(plansApp)
        .post('/plan-123/days/day-123/exercises')
        .send({
          exercise_id: 'exercise-1',
          sets: 0,
          sort_order: 0,
        });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('PUT /plans/:planId/days/:dayId/exercises/:exerciseId', () => {
    it('should update exercise successfully', async () => {
      const updatedExercise = createPlanDayExercise({
        id: 'pde-123',
        sets: 5,
        reps: 8,
      });
      mockPlanDayExerciseRepo.update.mockResolvedValue(updatedExercise);

      const response = await request(plansApp)
        .put('/plan-123/days/day-123/exercises/pde-123')
        .send({ sets: 5, reps: 8 });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: updatedExercise,
      });
    });

    it('should return 404 when exercise not found', async () => {
      mockPlanDayExerciseRepo.update.mockResolvedValue(null);

      const response: Response = await request(plansApp)
        .put('/plan-123/days/day-123/exercises/non-existent-id')
        .send({ sets: 5 });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(404);
      expect(body.error?.code).toBe('NOT_FOUND');
    });

    it('should return 400 for non-positive sets', async () => {
      const response: Response = await request(plansApp)
        .put('/plan-123/days/day-123/exercises/pde-123')
        .send({ sets: 0 });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for negative weight', async () => {
      const response: Response = await request(plansApp)
        .put('/plan-123/days/day-123/exercises/pde-123')
        .send({ weight: -10 });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('DELETE /plans/:planId/days/:dayId/exercises/:exerciseId', () => {
    it('should delete exercise successfully', async () => {
      mockPlanDayExerciseRepo.delete.mockResolvedValue(true);

      const response = await request(plansApp).delete('/plan-123/days/day-123/exercises/pde-123');

      expect(response.status).toBe(204);
      expect(mockPlanDayExerciseRepo.delete).toHaveBeenCalledWith('pde-123');
    });

    it('should return 404 when exercise not found', async () => {
      mockPlanDayExerciseRepo.delete.mockResolvedValue(false);

      const response: Response = await request(plansApp).delete('/plan-123/days/day-123/exercises/non-existent-id');
      const body = response.body as ApiResponse;

      expect(response.status).toBe(404);
      expect(body.error?.code).toBe('NOT_FOUND');
    });
  });
});
