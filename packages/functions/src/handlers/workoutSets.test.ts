import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { Response } from 'supertest';
import type { WorkoutSet } from '../shared.js';

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

// Mock services
const mockWorkoutSetService = {
  log: vi.fn(),
  skip: vi.fn(),
  unlog: vi.fn(),
};

vi.mock('../services/index.js', () => ({
  getWorkoutSetService: (): typeof mockWorkoutSetService => mockWorkoutSetService,
}));

// Import after mocks
import { workoutSetsApp } from './workoutSets.js';

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

describe('WorkoutSets Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('PUT /workout-sets/:id/log', () => {
    it('should log set with valid data', async () => {
      const loggedSet = createTestWorkoutSet({
        id: 'set-123',
        actual_reps: 10,
        actual_weight: 100,
        status: 'completed',
      });
      mockWorkoutSetService.log.mockResolvedValue(loggedSet);

      const response = await request(workoutSetsApp)
        .put('/set-123/log')
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

    it('should log set with zero reps (failed set)', async () => {
      const loggedSet = createTestWorkoutSet({
        id: 'set-123',
        actual_reps: 0,
        actual_weight: 100,
        status: 'completed',
      });
      mockWorkoutSetService.log.mockResolvedValue(loggedSet);

      const response = await request(workoutSetsApp)
        .put('/set-123/log')
        .send({
          actual_reps: 0,
          actual_weight: 100,
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: loggedSet,
      });
    });

    it('should log set with zero weight (bodyweight exercise)', async () => {
      const loggedSet = createTestWorkoutSet({
        id: 'set-123',
        actual_reps: 15,
        actual_weight: 0,
        status: 'completed',
      });
      mockWorkoutSetService.log.mockResolvedValue(loggedSet);

      const response = await request(workoutSetsApp)
        .put('/set-123/log')
        .send({
          actual_reps: 15,
          actual_weight: 0,
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: loggedSet,
      });
    });

    it('should return 404 when set not found', async () => {
      mockWorkoutSetService.log.mockRejectedValue(new Error('WorkoutSet not found'));

      const response = await request(workoutSetsApp)
        .put('/non-existent-id/log')
        .send({
          actual_reps: 10,
          actual_weight: 100,
        });

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'WorkoutSet with id non-existent-id not found',
        },
      });
    });

    it('should return 400 for missing actual_reps', async () => {
      const response: Response = await request(workoutSetsApp)
        .put('/set-123/log')
        .send({
          actual_weight: 100,
        });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for missing actual_weight', async () => {
      const response: Response = await request(workoutSetsApp)
        .put('/set-123/log')
        .send({
          actual_reps: 10,
        });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for negative actual_reps', async () => {
      const response: Response = await request(workoutSetsApp)
        .put('/set-123/log')
        .send({
          actual_reps: -1,
          actual_weight: 100,
        });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for negative actual_weight', async () => {
      const response: Response = await request(workoutSetsApp)
        .put('/set-123/log')
        .send({
          actual_reps: 10,
          actual_weight: -5,
        });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for non-integer actual_reps', async () => {
      const response: Response = await request(workoutSetsApp)
        .put('/set-123/log')
        .send({
          actual_reps: 10.5,
          actual_weight: 100,
        });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when cannot log set', async () => {
      mockWorkoutSetService.log.mockRejectedValue(new Error('Cannot log set that is already logged'));

      const response: Response = await request(workoutSetsApp)
        .put('/set-123/log')
        .send({
          actual_reps: 10,
          actual_weight: 100,
        });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when reps must be positive', async () => {
      mockWorkoutSetService.log.mockRejectedValue(new Error('Reps must be a non-negative number'));

      const response: Response = await request(workoutSetsApp)
        .put('/set-123/log')
        .send({
          actual_reps: 10,
          actual_weight: 100,
        });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('PUT /workout-sets/:id/skip', () => {
    it('should skip set successfully', async () => {
      const skippedSet = createTestWorkoutSet({
        id: 'set-123',
        status: 'skipped',
      });
      mockWorkoutSetService.skip.mockResolvedValue(skippedSet);

      const response = await request(workoutSetsApp).put('/set-123/skip');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: skippedSet,
      });
      expect(mockWorkoutSetService.skip).toHaveBeenCalledWith('set-123');
    });

    it('should return 404 when set not found', async () => {
      mockWorkoutSetService.skip.mockRejectedValue(new Error('WorkoutSet not found'));

      const response = await request(workoutSetsApp).put('/non-existent-id/skip');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'WorkoutSet with id non-existent-id not found',
        },
      });
    });

    it('should return 400 when cannot skip set', async () => {
      mockWorkoutSetService.skip.mockRejectedValue(new Error('Cannot skip set that is already completed'));

      const response: Response = await request(workoutSetsApp).put('/set-123/skip');
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('PUT /workout-sets/:id/unlog', () => {
    it('should unlog set successfully', async () => {
      const unloggedSet = createTestWorkoutSet({
        id: 'set-123',
        actual_reps: null,
        actual_weight: null,
        status: 'pending',
      });
      mockWorkoutSetService.unlog.mockResolvedValue(unloggedSet);

      const response = await request(workoutSetsApp).put('/set-123/unlog');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: unloggedSet,
      });
      expect(mockWorkoutSetService.unlog).toHaveBeenCalledWith('set-123');
    });

    it('should return 404 when set not found', async () => {
      mockWorkoutSetService.unlog.mockRejectedValue(new Error('WorkoutSet not found'));

      const response = await request(workoutSetsApp).put('/non-existent-id/unlog');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'WorkoutSet with id non-existent-id not found',
        },
      });
    });

    it('should return 400 when cannot unlog set', async () => {
      mockWorkoutSetService.unlog.mockRejectedValue(new Error('Cannot unlog set that is not completed'));

      const response: Response = await request(workoutSetsApp).put('/set-123/unlog');
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });
  });
});
