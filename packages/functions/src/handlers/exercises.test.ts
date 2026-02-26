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
  });

  describe('GET /exercises/custom', () => {
    it('should return custom exercises', async () => {
      const customExercises = [
        createExercise({ id: '1', name: 'Custom Exercise', is_custom: true }),
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
  });

  describe('GET /exercises/:id', () => {
    it('should return exercise by id', async () => {
      const exercise = createExercise({ id: 'exercise-123', name: 'Bench Press' });
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

  describe('GET /exercises/:id/history', () => {
    it('should return exercise history with entries', async () => {
      const exercise = createExercise({ id: 'exercise-123', name: 'Bench Press' });
      const history = [
        {
          id: 'set-1',
          exercise_id: 'exercise-123',
          workout_id: 'workout-1',
          set_number: 1,
          actual_reps: 10,
          actual_weight: 100,
          scheduled_date: '2024-01-01',
          completed_at: '2024-01-01',
          week_number: 1,
          mesocycle_id: 'meso-1',
          set_rest_seconds: 60,
          status: 'completed',
        },
      ];
      mockExerciseRepo.findById.mockResolvedValue(exercise);
      mockWorkoutSetRepo.findCompletedByExerciseId.mockResolvedValue(history as Array<Record<string, unknown>> as never);

      const response = await request(exercisesApp).get('/exercise-123/history');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.exercise_id).toBe('exercise-123');
      expect(response.body.data.exercise_name).toBe('Bench Press');
      expect(response.body.data.entries).toHaveLength(1);
      expect(response.body.data.personal_record).toEqual({
        weight: 100,
        reps: 10,
        date: '2024-01-01',
      });
    });

    it('should return 404 when exercise missing for history', async () => {
      mockExerciseRepo.findById.mockResolvedValue(null);

      const response = await request(exercisesApp).get('/non-existent-id/history');

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

    it('should return 400 for missing name', async () => {
      const response: Response = await request(exercisesApp).post('/').send({ weight_increment: 5 });
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
      });
      mockExerciseRepo.update.mockResolvedValue(updatedExercise);

      const response = await request(exercisesApp)
        .put('/exercise-123')
        .send({ name: 'Updated Name' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: updatedExercise,
      });
      expect(mockExerciseRepo.update).toHaveBeenCalledWith('exercise-123', {
        name: 'Updated Name',
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

    it('should return 400 for invalid update payload', async () => {
      const response: Response = await request(exercisesApp)
        .put('/exercise-123')
        .send({ name: '' });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('DELETE /exercises/:id', () => {
    it('should return 409 when delete blocked by in-use checks', async () => {
      mockExerciseRepo.isInUse.mockResolvedValue(true);

      const response = await request(exercisesApp).delete('/exercise-1');

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

    it('should delete exercise when not in use', async () => {
      mockExerciseRepo.isInUse.mockResolvedValue(false);
      mockExerciseRepo.delete.mockResolvedValue(true);

      const response = await request(exercisesApp).delete('/exercise-1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: { deleted: true },
      });
      expect(mockExerciseRepo.delete).toHaveBeenCalledWith('exercise-1');
    });

    it('should return 404 when deleting missing exercise', async () => {
      mockExerciseRepo.isInUse.mockResolvedValue(false);
      mockExerciseRepo.delete.mockResolvedValue(false);

      const response = await request(exercisesApp).delete('/missing');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Exercise with id missing not found',
        },
      });
    });
  });
});
