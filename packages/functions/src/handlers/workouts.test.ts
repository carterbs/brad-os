import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { Response } from 'supertest';
import type { Workout, WorkoutSet } from '../shared.js';
import type { WorkoutWithExercises } from '../services/index.js';
import { NotFoundError, ValidationError } from '../middleware/error-handler.js';

// Type for API response body
interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

// Mock firebase before importing the handler
vi.mock('../firebase.js', () => ({
  getFirestoreDb: vi.fn(),
}));

// Mock app-check middleware
vi.mock('../middleware/app-check.js', () => ({
  requireAppCheck: (_req: unknown, _res: unknown, next: () => void): void => next(),
}));

// Mock repositories
const mockWorkoutRepo = {
  findAll: vi.fn(),
  findById: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};

const mockWorkoutSetRepo = {
  findByWorkoutId: vi.fn(),
  create: vi.fn(),
  delete: vi.fn(),
};

vi.mock('../repositories/index.js', () => ({
  WorkoutRepository: vi.fn().mockImplementation(() => mockWorkoutRepo),
  WorkoutSetRepository: vi.fn().mockImplementation(() => mockWorkoutSetRepo),
}));

// Mock services
const mockWorkoutService = {
  getTodaysWorkout: vi.fn(),
  getById: vi.fn(),
  start: vi.fn(),
  complete: vi.fn(),
  skip: vi.fn(),
};

const mockWorkoutSetService = {
  log: vi.fn(),
  skip: vi.fn(),
  addSetToExercise: vi.fn(),
  removeSetFromExercise: vi.fn(),
};

vi.mock('../services/index.js', () => ({
  getWorkoutService: (): typeof mockWorkoutService => mockWorkoutService,
  getWorkoutSetService: (): typeof mockWorkoutSetService => mockWorkoutSetService,
}));

// Import after mocks
import { workoutsApp } from './workouts.js';

// Helper to create test workout
function createTestWorkout(overrides: Partial<Workout> = {}): Workout {
  return {
    id: 'workout-1',
    mesocycle_id: 'mesocycle-1',
    plan_day_id: 'plan-day-1',
    week_number: 1,
    scheduled_date: '2024-01-15',
    status: 'pending',
    started_at: null,
    completed_at: null,
    ...overrides,
  };
}

// Helper to create test workout with exercises
function createTestWorkoutWithExercises(overrides: Partial<WorkoutWithExercises> = {}): WorkoutWithExercises {
  return {
    id: 'workout-1',
    mesocycle_id: 'mesocycle-1',
    plan_day_id: 'plan-day-1',
    week_number: 1,
    scheduled_date: '2024-01-15',
    status: 'pending',
    started_at: null,
    completed_at: null,
    plan_day_name: 'Push Day',
    exercises: [],
    ...overrides,
  };
}

// Helper to create test workout set
function createTestWorkoutSet(overrides: Partial<WorkoutSet> = {}): WorkoutSet {
  return {
    id: 'set-1',
    workout_id: 'workout-1',
    exercise_id: 'exercise-1',
    set_number: 1,
    target_reps: 10,
    target_weight: 100,
    actual_reps: null,
    actual_weight: null,
    status: 'pending',
    ...overrides,
  };
}

describe('Workouts Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /workouts/today', () => {
    it('should return today\'s workout when one exists', async () => {
      const workout = createTestWorkoutWithExercises();
      mockWorkoutService.getTodaysWorkout.mockResolvedValue(workout);

      const response = await request(workoutsApp).get('/today');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: workout,
      });
      expect(mockWorkoutService.getTodaysWorkout).toHaveBeenCalledTimes(1);
    });

    it('should return null when no workout for today', async () => {
      mockWorkoutService.getTodaysWorkout.mockResolvedValue(null);

      const response = await request(workoutsApp).get('/today');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: null,
      });
    });
  });

  describe('GET /workouts', () => {
    it('should return all workouts', async () => {
      const workouts = [
        createTestWorkout({ id: '1' }),
        createTestWorkout({ id: '2' }),
      ];
      mockWorkoutRepo.findAll.mockResolvedValue(workouts);

      const response = await request(workoutsApp).get('/');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: workouts,
      });
    });

    it('should return empty array when no workouts exist', async () => {
      mockWorkoutRepo.findAll.mockResolvedValue([]);

      const response = await request(workoutsApp).get('/');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: [],
      });
    });
  });

  describe('GET /workouts/:id', () => {
    it('should return workout with exercises by id', async () => {
      const workout = createTestWorkoutWithExercises({ id: 'workout-123' });
      mockWorkoutService.getById.mockResolvedValue(workout);

      const response = await request(workoutsApp).get('/workout-123');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: workout,
      });
      expect(mockWorkoutService.getById).toHaveBeenCalledWith('workout-123');
    });

    it('should return 404 when workout not found', async () => {
      mockWorkoutService.getById.mockResolvedValue(null);

      const response = await request(workoutsApp).get('/non-existent-id');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Workout with id non-existent-id not found',
        },
      });
    });
  });

  describe('POST /workouts', () => {
    it('should create workout with valid data', async () => {
      const createdWorkout = createTestWorkout({ id: 'new-workout' });
      mockWorkoutRepo.create.mockResolvedValue(createdWorkout);

      const response = await request(workoutsApp)
        .post('/')
        .send({
          mesocycle_id: 'mesocycle-1',
          plan_day_id: 'plan-day-1',
          week_number: 1,
          scheduled_date: '2024-01-15',
        });

      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        success: true,
        data: createdWorkout,
      });
    });

    it('should return 400 for missing mesocycle_id', async () => {
      const response: Response = await request(workoutsApp)
        .post('/')
        .send({
          plan_day_id: 'plan-day-1',
          week_number: 1,
          scheduled_date: '2024-01-15',
        });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for invalid date format', async () => {
      const response: Response = await request(workoutsApp)
        .post('/')
        .send({
          mesocycle_id: 'mesocycle-1',
          plan_day_id: 'plan-day-1',
          week_number: 1,
          scheduled_date: 'invalid-date',
        });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for non-positive week number', async () => {
      const response: Response = await request(workoutsApp)
        .post('/')
        .send({
          mesocycle_id: 'mesocycle-1',
          plan_day_id: 'plan-day-1',
          week_number: 0,
          scheduled_date: '2024-01-15',
        });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('PUT /workouts/:id', () => {
    it('should update workout status', async () => {
      const updatedWorkout = createTestWorkout({
        id: 'workout-123',
        status: 'in_progress',
        started_at: '2024-01-15T10:00:00.000Z',
      });
      mockWorkoutRepo.update.mockResolvedValue(updatedWorkout);

      const response = await request(workoutsApp)
        .put('/workout-123')
        .send({
          status: 'in_progress',
          started_at: '2024-01-15T10:00:00.000Z',
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: updatedWorkout,
      });
    });

    it('should return 404 when workout not found', async () => {
      mockWorkoutRepo.update.mockResolvedValue(null);

      const response = await request(workoutsApp)
        .put('/non-existent-id')
        .send({ status: 'in_progress' });

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Workout with id non-existent-id not found',
        },
      });
    });

    it('should return 400 for invalid status', async () => {
      const response: Response = await request(workoutsApp)
        .put('/workout-123')
        .send({ status: 'invalid_status' });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('PUT /workouts/:id/start', () => {
    it('should start workout successfully', async () => {
      const startedWorkout = createTestWorkout({
        id: 'workout-123',
        status: 'in_progress',
        started_at: '2024-01-15T10:00:00.000Z',
      });
      mockWorkoutService.start.mockResolvedValue(startedWorkout);

      const response = await request(workoutsApp).put('/workout-123/start');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: startedWorkout,
      });
      expect(mockWorkoutService.start).toHaveBeenCalledWith('workout-123');
    });

    it('should return 404 when workout not found', async () => {
      mockWorkoutService.start.mockRejectedValue(new NotFoundError('Workout', 'non-existent-id'));

      const response = await request(workoutsApp).put('/non-existent-id/start');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Workout with id non-existent-id not found',
        },
      });
    });

    it('should return 400 when workout already started', async () => {
      mockWorkoutService.start.mockRejectedValue(new ValidationError('Workout already started'));

      const response: Response = await request(workoutsApp).put('/workout-123/start');
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when cannot start workout', async () => {
      mockWorkoutService.start.mockRejectedValue(new ValidationError('Cannot start completed workout'));

      const response: Response = await request(workoutsApp).put('/workout-123/start');
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('PUT /workouts/:id/complete', () => {
    it('should complete workout successfully', async () => {
      const completedWorkout = createTestWorkout({
        id: 'workout-123',
        status: 'completed',
        completed_at: '2024-01-15T11:00:00.000Z',
      });
      mockWorkoutService.complete.mockResolvedValue(completedWorkout);

      const response = await request(workoutsApp).put('/workout-123/complete');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: completedWorkout,
      });
      expect(mockWorkoutService.complete).toHaveBeenCalledWith('workout-123');
    });

    it('should return 404 when workout not found', async () => {
      mockWorkoutService.complete.mockRejectedValue(new NotFoundError('Workout', 'non-existent-id'));

      const response: Response = await request(workoutsApp).put('/non-existent-id/complete');
      const body = response.body as ApiResponse;

      expect(response.status).toBe(404);
      expect(body.error?.code).toBe('NOT_FOUND');
    });

    it('should return 400 when workout not in progress', async () => {
      mockWorkoutService.complete.mockRejectedValue(new ValidationError('Cannot complete workout that is not in progress'));

      const response: Response = await request(workoutsApp).put('/workout-123/complete');
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('PUT /workouts/:id/skip', () => {
    it('should skip workout successfully', async () => {
      const skippedWorkout = createTestWorkout({
        id: 'workout-123',
        status: 'skipped',
      });
      mockWorkoutService.skip.mockResolvedValue(skippedWorkout);

      const response = await request(workoutsApp).put('/workout-123/skip');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: skippedWorkout,
      });
      expect(mockWorkoutService.skip).toHaveBeenCalledWith('workout-123');
    });

    it('should return 404 when workout not found', async () => {
      mockWorkoutService.skip.mockRejectedValue(new NotFoundError('Workout', 'non-existent-id'));

      const response: Response = await request(workoutsApp).put('/non-existent-id/skip');
      const body = response.body as ApiResponse;

      expect(response.status).toBe(404);
      expect(body.error?.code).toBe('NOT_FOUND');
    });

    it('should return 400 when workout already completed', async () => {
      mockWorkoutService.skip.mockRejectedValue(new ValidationError('Cannot skip completed workout'));

      const response: Response = await request(workoutsApp).put('/workout-123/skip');
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('DELETE /workouts/:id', () => {
    it('should delete workout successfully', async () => {
      mockWorkoutRepo.delete.mockResolvedValue(true);

      const response = await request(workoutsApp).delete('/workout-123');

      expect(response.status).toBe(204);
      expect(mockWorkoutRepo.delete).toHaveBeenCalledWith('workout-123');
    });

    it('should return 404 when workout not found', async () => {
      mockWorkoutRepo.delete.mockResolvedValue(false);

      const response: Response = await request(workoutsApp).delete('/non-existent-id');
      const body = response.body as ApiResponse;

      expect(response.status).toBe(404);
      expect(body.error?.code).toBe('NOT_FOUND');
    });
  });

  describe('GET /workouts/:workoutId/sets', () => {
    it('should return sets for workout', async () => {
      const workout = createTestWorkout({ id: 'workout-123' });
      const sets = [
        createTestWorkoutSet({ id: 'set-1', workout_id: 'workout-123' }),
        createTestWorkoutSet({ id: 'set-2', workout_id: 'workout-123' }),
      ];
      mockWorkoutRepo.findById.mockResolvedValue(workout);
      mockWorkoutSetRepo.findByWorkoutId.mockResolvedValue(sets);

      const response = await request(workoutsApp).get('/workout-123/sets');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: sets,
      });
      expect(mockWorkoutSetRepo.findByWorkoutId).toHaveBeenCalledWith('workout-123');
    });

    it('should return 404 when workout not found', async () => {
      mockWorkoutRepo.findById.mockResolvedValue(null);

      const response: Response = await request(workoutsApp).get('/non-existent-id/sets');
      const body = response.body as ApiResponse;

      expect(response.status).toBe(404);
      expect(body.error?.code).toBe('NOT_FOUND');
    });

    it('should return empty array when no sets exist', async () => {
      const workout = createTestWorkout({ id: 'workout-123' });
      mockWorkoutRepo.findById.mockResolvedValue(workout);
      mockWorkoutSetRepo.findByWorkoutId.mockResolvedValue([]);

      const response = await request(workoutsApp).get('/workout-123/sets');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: [],
      });
    });
  });

  describe('POST /workouts/:workoutId/sets', () => {
    it('should create set for workout', async () => {
      const workout = createTestWorkout({ id: 'workout-123' });
      const createdSet = createTestWorkoutSet({
        id: 'new-set',
        workout_id: 'workout-123',
      });
      mockWorkoutRepo.findById.mockResolvedValue(workout);
      mockWorkoutSetRepo.create.mockResolvedValue(createdSet);

      const response = await request(workoutsApp)
        .post('/workout-123/sets')
        .send({
          exercise_id: 'exercise-1',
          set_number: 1,
          target_reps: 10,
          target_weight: 100,
        });

      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        success: true,
        data: createdSet,
      });
    });

    it('should return 404 when workout not found', async () => {
      mockWorkoutRepo.findById.mockResolvedValue(null);

      const response: Response = await request(workoutsApp)
        .post('/non-existent-id/sets')
        .send({
          exercise_id: 'exercise-1',
          set_number: 1,
          target_reps: 10,
          target_weight: 100,
        });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(404);
      expect(body.error?.code).toBe('NOT_FOUND');
    });

    it('should return 400 for invalid set data', async () => {
      const workout = createTestWorkout({ id: 'workout-123' });
      mockWorkoutRepo.findById.mockResolvedValue(workout);

      const response: Response = await request(workoutsApp)
        .post('/workout-123/sets')
        .send({
          exercise_id: 'exercise-1',
          set_number: 0, // Invalid: must be positive
          target_reps: 10,
          target_weight: 100,
        });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('PUT /workouts/sets/:id/log (legacy)', () => {
    it('should log set with valid data', async () => {
      const loggedSet = createTestWorkoutSet({
        id: 'set-123',
        actual_reps: 10,
        actual_weight: 100,
        status: 'completed',
      });
      mockWorkoutSetService.log.mockResolvedValue(loggedSet);

      const response = await request(workoutsApp)
        .put('/sets/set-123/log')
        .send({
          actual_reps: 10,
          actual_weight: 100,
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: loggedSet,
      });
      expect(mockWorkoutSetService.log).toHaveBeenCalledWith('set-123', {
        actual_reps: 10,
        actual_weight: 100,
      });
    });

    it('should return 404 when set not found', async () => {
      mockWorkoutSetService.log.mockRejectedValue(new NotFoundError('WorkoutSet', 'non-existent-id'));

      const response: Response = await request(workoutsApp)
        .put('/sets/non-existent-id/log')
        .send({
          actual_reps: 10,
          actual_weight: 100,
        });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(404);
      expect(body.error?.code).toBe('NOT_FOUND');
    });

    it('should return 400 for invalid log data', async () => {
      const response: Response = await request(workoutsApp)
        .put('/sets/set-123/log')
        .send({
          actual_reps: -1, // Invalid: must be non-negative
          actual_weight: 100,
        });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('PUT /workouts/sets/:id/skip (legacy)', () => {
    it('should skip set successfully', async () => {
      const skippedSet = createTestWorkoutSet({
        id: 'set-123',
        status: 'skipped',
      });
      mockWorkoutSetService.skip.mockResolvedValue(skippedSet);

      const response = await request(workoutsApp).put('/sets/set-123/skip');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: skippedSet,
      });
      expect(mockWorkoutSetService.skip).toHaveBeenCalledWith('set-123');
    });

    it('should return 404 when set not found', async () => {
      mockWorkoutSetService.skip.mockRejectedValue(new NotFoundError('WorkoutSet', 'non-existent-id'));

      const response: Response = await request(workoutsApp).put('/sets/non-existent-id/skip');
      const body = response.body as ApiResponse;

      expect(response.status).toBe(404);
      expect(body.error?.code).toBe('NOT_FOUND');
    });
  });

  describe('DELETE /workouts/sets/:id', () => {
    it('should delete set successfully', async () => {
      mockWorkoutSetRepo.delete.mockResolvedValue(true);

      const response = await request(workoutsApp).delete('/sets/set-123');

      expect(response.status).toBe(204);
      expect(mockWorkoutSetRepo.delete).toHaveBeenCalledWith('set-123');
    });

    it('should return 404 when set not found', async () => {
      mockWorkoutSetRepo.delete.mockResolvedValue(false);

      const response: Response = await request(workoutsApp).delete('/sets/non-existent-id');
      const body = response.body as ApiResponse;

      expect(response.status).toBe(404);
      expect(body.error?.code).toBe('NOT_FOUND');
    });
  });

  describe('POST /workouts/:workoutId/exercises/:exerciseId/sets/add', () => {
    it('should add set to exercise successfully', async () => {
      const result = {
        currentWorkoutSet: createTestWorkoutSet(),
        futureWorkoutsAffected: 5,
        futureSetsModified: 5,
      };
      mockWorkoutSetService.addSetToExercise.mockResolvedValue(result);

      const response = await request(workoutsApp)
        .post('/workout-123/exercises/exercise-456/sets/add');

      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        success: true,
        data: result,
      });
      expect(mockWorkoutSetService.addSetToExercise).toHaveBeenCalledWith('workout-123', 'exercise-456');
    });

    it('should return 404 when workout or exercise not found', async () => {
      mockWorkoutSetService.addSetToExercise.mockRejectedValue(new NotFoundError('Workout', 'non-existent'));

      const response: Response = await request(workoutsApp)
        .post('/non-existent/exercises/exercise-456/sets/add');
      const body = response.body as ApiResponse;

      expect(response.status).toBe(404);
      expect(body.error?.code).toBe('NOT_FOUND');
    });

    it('should return 400 when cannot add set', async () => {
      mockWorkoutSetService.addSetToExercise.mockRejectedValue(new ValidationError('Cannot add set to completed workout'));

      const response: Response = await request(workoutsApp)
        .post('/workout-123/exercises/exercise-456/sets/add');
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('DELETE /workouts/:workoutId/exercises/:exerciseId/sets/remove', () => {
    it('should remove set from exercise successfully', async () => {
      const result = {
        currentWorkoutSet: null,
        futureWorkoutsAffected: 5,
        futureSetsModified: 5,
      };
      mockWorkoutSetService.removeSetFromExercise.mockResolvedValue(result);

      const response = await request(workoutsApp)
        .delete('/workout-123/exercises/exercise-456/sets/remove');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: result,
      });
      expect(mockWorkoutSetService.removeSetFromExercise).toHaveBeenCalledWith('workout-123', 'exercise-456');
    });

    it('should return 404 when workout or exercise not found', async () => {
      mockWorkoutSetService.removeSetFromExercise.mockRejectedValue(new NotFoundError('Workout', 'non-existent'));

      const response: Response = await request(workoutsApp)
        .delete('/non-existent/exercises/exercise-456/sets/remove');
      const body = response.body as ApiResponse;

      expect(response.status).toBe(404);
      expect(body.error?.code).toBe('NOT_FOUND');
    });

    it('should return 400 when no pending sets to remove', async () => {
      mockWorkoutSetService.removeSetFromExercise.mockRejectedValue(new ValidationError('No pending sets to remove'));

      const response: Response = await request(workoutsApp)
        .delete('/workout-123/exercises/exercise-456/sets/remove');
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when cannot remove set', async () => {
      mockWorkoutSetService.removeSetFromExercise.mockRejectedValue(new ValidationError('Cannot remove set from completed workout'));

      const response: Response = await request(workoutsApp)
        .delete('/workout-123/exercises/exercise-456/sets/remove');
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });
  });
});
