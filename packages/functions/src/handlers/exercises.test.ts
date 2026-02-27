import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { Response } from 'supertest';
import {
  type ApiResponse,
  createExercise,
  createMockExerciseRepository,
  createMockWorkoutSetRepository,
} from '../__tests__/utils/index.js';

// Mock firebase before importing the handler
vi.mock('../firebase.js', () => ({
  getFirestoreDb: vi.fn(),
}));

// Mock app-check middleware
vi.mock('../middleware/app-check.js', () => ({
  requireAppCheck: (_req: unknown, _res: unknown, next: () => void): void => next(),
}));

// Mock the repositories
const mockExerciseRepo = createMockExerciseRepository();
const mockWorkoutSetRepo = createMockWorkoutSetRepository();

vi.mock('../repositories/exercise.repository.js', () => ({
  ExerciseRepository: vi.fn().mockImplementation(() => mockExerciseRepo),
}));

vi.mock('../repositories/workout-set.repository.js', () => ({
  WorkoutSetRepository: vi.fn().mockImplementation(() => mockWorkoutSetRepo),
}));

// Import after mocks
import { exercisesApp } from './exercises.js';

describe('Exercises Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /exercises', () => {
    it('should return all exercises', async () => {
      const exercises = [
        createExercise({ id: '1', name: 'Bench Press' }),
        createExercise({ id: '2', name: 'Squat' }),
      ];
      mockExerciseRepo.findAll.mockResolvedValue(exercises);

      const response = await request(exercisesApp).get('/');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: exercises,
      });
      expect(mockExerciseRepo.findAll).toHaveBeenCalledTimes(1);
    });

    it('should return empty array when no exercises exist', async () => {
      mockExerciseRepo.findAll.mockResolvedValue([]);

      const response = await request(exercisesApp).get('/');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: [],
      });
    });
  });

  describe('GET /exercises/default', () => {
    it('should return default exercises', async () => {
      const defaultExercises = [
        createExercise({ id: '1', name: 'Bench Press', is_custom: false }),
        createExercise({ id: '2', name: 'Squat', is_custom: false }),
      ];
      mockExerciseRepo.findDefaultExercises.mockResolvedValue(defaultExercises);

      const response = await request(exercisesApp).get('/default');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: defaultExercises,
      });
      expect(mockExerciseRepo.findDefaultExercises).toHaveBeenCalledTimes(1);
    });

    it('should return empty array when no default exercises exist', async () => {
      mockExerciseRepo.findDefaultExercises.mockResolvedValue([]);

      const response = await request(exercisesApp).get('/default');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: [],
      });
    });
  });

  describe('GET /exercises/custom', () => {
    it('should return custom exercises', async () => {
      const customExercises = [
        createExercise({ id: '1', name: 'Custom Exercise 1', is_custom: true }),
        createExercise({ id: '2', name: 'Custom Exercise 2', is_custom: true }),
      ];
      mockExerciseRepo.findCustomExercises.mockResolvedValue(customExercises);

      const response = await request(exercisesApp).get('/custom');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: customExercises,
      });
      expect(mockExerciseRepo.findCustomExercises).toHaveBeenCalledTimes(1);
    });

    it('should return empty array when no custom exercises exist', async () => {
      mockExerciseRepo.findCustomExercises.mockResolvedValue([]);

      const response = await request(exercisesApp).get('/custom');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: [],
      });
    });
  });

  describe('GET /exercises/:id', () => {
    it('should return exercise by id', async () => {
      const exercise = createExercise({ id: 'exercise-123' });
      mockExerciseRepo.findById.mockResolvedValue(exercise);

      const response = await request(exercisesApp).get('/exercise-123');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: exercise,
      });
      expect(mockExerciseRepo.findById).toHaveBeenCalledWith('exercise-123');
    });

    it('should return 404 when exercise not found', async () => {
      mockExerciseRepo.findById.mockResolvedValue(null);

      const response = await request(exercisesApp).get('/non-existent-id');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Exercise with id non-existent-id not found',
        },
      });
    });
  });

  describe('POST /exercises', () => {
    it('should create exercise with valid data', async () => {
      const createdExercise = createExercise({
        id: 'new-exercise',
        name: 'New Exercise',
        weight_increment: 10,
        is_custom: true,
      });
      mockExerciseRepo.create.mockResolvedValue(createdExercise);

      const response = await request(exercisesApp)
        .post('/')
        .send({
          name: 'New Exercise',
          weight_increment: 10,
          is_custom: true,
        });

      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        success: true,
        data: createdExercise,
      });
      expect(mockExerciseRepo.create).toHaveBeenCalledWith({
        name: 'New Exercise',
        weight_increment: 10,
        is_custom: true,
      });
    });

    it('should create exercise with default values', async () => {
      const createdExercise = createExercise({
        id: 'new-exercise',
        name: 'Minimal Exercise',
        weight_increment: 5,
        is_custom: true,
      });
      mockExerciseRepo.create.mockResolvedValue(createdExercise);

      const response = await request(exercisesApp)
        .post('/')
        .send({ name: 'Minimal Exercise' });

      expect(response.status).toBe(201);
      expect(mockExerciseRepo.create).toHaveBeenCalledWith({
        name: 'Minimal Exercise',
        weight_increment: 5,
        is_custom: true,
      });
    });

    it('should return 400 for empty name', async () => {
      const response: Response = await request(exercisesApp)
        .post('/')
        .send({ name: '' });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for missing name', async () => {
      const response: Response = await request(exercisesApp)
        .post('/')
        .send({ weight_increment: 5 });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for name exceeding max length', async () => {
      const response: Response = await request(exercisesApp)
        .post('/')
        .send({ name: 'a'.repeat(101) });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for negative weight increment', async () => {
      const response: Response = await request(exercisesApp)
        .post('/')
        .send({ name: 'Test', weight_increment: -5 });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for zero weight increment', async () => {
      const response: Response = await request(exercisesApp)
        .post('/')
        .send({ name: 'Test', weight_increment: 0 });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('PUT /exercises/:id', () => {
    it('should update exercise with valid data', async () => {
      const updatedExercise = createExercise({
        id: 'exercise-123',
        name: 'Updated Name',
        weight_increment: 10,
      });
      mockExerciseRepo.update.mockResolvedValue(updatedExercise);

      const response = await request(exercisesApp)
        .put('/exercise-123')
        .send({ name: 'Updated Name', weight_increment: 10 });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: updatedExercise,
      });
      expect(mockExerciseRepo.update).toHaveBeenCalledWith('exercise-123', {
        name: 'Updated Name',
        weight_increment: 10,
      });
    });

    it('should update exercise with partial data', async () => {
      const updatedExercise = createExercise({
        id: 'exercise-123',
        name: 'Only Name Updated',
      });
      mockExerciseRepo.update.mockResolvedValue(updatedExercise);

      const response = await request(exercisesApp)
        .put('/exercise-123')
        .send({ name: 'Only Name Updated' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: updatedExercise,
      });
      expect(mockExerciseRepo.update).toHaveBeenCalledWith('exercise-123', {
        name: 'Only Name Updated',
      });
    });

    it('should return 404 when exercise not found', async () => {
      mockExerciseRepo.update.mockResolvedValue(null);

      const response = await request(exercisesApp)
        .put('/non-existent-id')
        .send({ name: 'Updated Name' });

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Exercise with id non-existent-id not found',
        },
      });
    });

    it('should return 400 for empty name', async () => {
      const response: Response = await request(exercisesApp)
        .put('/exercise-123')
        .send({ name: '' });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for negative weight increment', async () => {
      const response: Response = await request(exercisesApp)
        .put('/exercise-123')
        .send({ weight_increment: -5 });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /exercises/:id/history', () => {
    it('should return exercise history with entries and personal record', async () => {
      const exercise = createExercise({ id: 'exercise-123', name: 'Bench Press' });
      mockExerciseRepo.findById.mockResolvedValue(exercise);
      mockWorkoutSetRepo.findCompletedByExerciseId.mockResolvedValue([
        {
          workout_id: 'workout-1',
          exercise_id: 'exercise-123',
          set_number: 1,
          actual_weight: 135,
          actual_reps: 8,
          scheduled_date: '2024-01-15',
          completed_at: '2024-01-15T10:00:00Z',
          week_number: 1,
          mesocycle_id: 'meso-1',
        },
        {
          workout_id: 'workout-1',
          exercise_id: 'exercise-123',
          set_number: 2,
          actual_weight: 135,
          actual_reps: 7,
          scheduled_date: '2024-01-15',
          completed_at: '2024-01-15T10:05:00Z',
          week_number: 1,
          mesocycle_id: 'meso-1',
        },
        {
          workout_id: 'workout-2',
          exercise_id: 'exercise-123',
          set_number: 1,
          actual_weight: 140,
          actual_reps: 8,
          scheduled_date: '2024-01-22',
          completed_at: '2024-01-22T10:00:00Z',
          week_number: 2,
          mesocycle_id: 'meso-1',
        },
      ]);

      const response = await request(exercisesApp).get('/exercise-123/history');

      expect(response.status).toBe(200);
      const body = response.body as ApiResponse<{ exercise_id: string; entries: unknown[]; personal_record: unknown }>;
      expect(body.success).toBe(true);
      expect(body.data?.exercise_id).toBe('exercise-123');
      expect(body.data?.entries).toHaveLength(2);
      expect(body.data?.personal_record).toEqual({
        weight: 140,
        reps: 8,
        date: '2024-01-22T10:00:00Z',
      });
    });

    it('should return empty history when no completed sets', async () => {
      const exercise = createExercise({ id: 'exercise-123' });
      mockExerciseRepo.findById.mockResolvedValue(exercise);
      mockWorkoutSetRepo.findCompletedByExerciseId.mockResolvedValue([]);

      const response = await request(exercisesApp).get('/exercise-123/history');

      expect(response.status).toBe(200);
      const body = response.body as ApiResponse<{ entries: unknown[]; personal_record: unknown }>;
      expect(body.data?.entries).toHaveLength(0);
      expect(body.data?.personal_record).toBeNull();
    });

    it('should return 404 when exercise not found', async () => {
      mockExerciseRepo.findById.mockResolvedValue(null);

      const response = await request(exercisesApp).get('/non-existent-id/history');

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /exercises/:id', () => {
    it('should delete exercise successfully', async () => {
      mockExerciseRepo.isInUse.mockResolvedValue(false);
      mockExerciseRepo.delete.mockResolvedValue(true);

      const response = await request(exercisesApp).delete('/exercise-123');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: { deleted: true },
      });
      expect(mockExerciseRepo.isInUse).toHaveBeenCalledWith('exercise-123');
      expect(mockExerciseRepo.delete).toHaveBeenCalledWith('exercise-123');
    });

    it('should return 404 when exercise not found', async () => {
      mockExerciseRepo.isInUse.mockResolvedValue(false);
      mockExerciseRepo.delete.mockResolvedValue(false);

      const response = await request(exercisesApp).delete('/non-existent-id');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Exercise with id non-existent-id not found',
        },
      });
    });

    it('should return 409 when exercise is in use', async () => {
      mockExerciseRepo.isInUse.mockResolvedValue(true);

      const response = await request(exercisesApp).delete('/exercise-123');

      expect(response.status).toBe(409);
      expect(response.body).toEqual({
        success: false,
        error: {
          code: 'CONFLICT',
          message: 'Cannot delete exercise that is used in plans',
        },
      });
      expect(mockExerciseRepo.delete).not.toHaveBeenCalled();
    });
  });
});
