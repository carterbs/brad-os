import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import {
  exerciseApi,
  NotFoundError,
  ForbiddenError,
  ConflictError,
  ValidationError,
} from '../exerciseApi';
import type { Exercise, ApiResponse, ApiError } from '@brad-os/shared';

const mockExercise: Exercise = {
  id: 1,
  name: 'Bench Press',
  weight_increment: 5,
  is_custom: false,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
};

const mockCustomExercise: Exercise = {
  id: 2,
  name: 'Custom Squat',
  weight_increment: 10,
  is_custom: true,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
};

const handlers = [
  // GET /api/exercises
  http.get('/api/exercises', () => {
    const response: ApiResponse<Exercise[]> = {
      success: true,
      data: [mockExercise, mockCustomExercise],
    };
    return HttpResponse.json(response);
  }),

  // GET /api/exercises/:id
  http.get('/api/exercises/:id', ({ params }) => {
    const id = Number(params['id']);
    if (id === 1) {
      const response: ApiResponse<Exercise> = {
        success: true,
        data: mockExercise,
      };
      return HttpResponse.json(response);
    }
    if (id === 404) {
      const response: ApiError = {
        success: false,
        error: { code: 'NOT_FOUND', message: 'Exercise not found' },
      };
      return HttpResponse.json(response, { status: 404 });
    }
    const response: ApiError = {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Exercise not found' },
    };
    return HttpResponse.json(response, { status: 404 });
  }),

  // POST /api/exercises
  http.post('/api/exercises', async ({ request }) => {
    const body = await request.json() as { name?: string };
    if (body.name === undefined || body.name === null || body.name === '') {
      const response: ApiError = {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Name is required' },
      };
      return HttpResponse.json(response, { status: 400 });
    }
    if (body.name === 'Duplicate') {
      const response: ApiError = {
        success: false,
        error: { code: 'CONFLICT', message: 'Exercise already exists' },
      };
      return HttpResponse.json(response, { status: 409 });
    }
    const response: ApiResponse<Exercise> = {
      success: true,
      data: { ...mockCustomExercise, name: body.name },
    };
    return HttpResponse.json(response, { status: 201 });
  }),

  // PUT /api/exercises/:id
  http.put('/api/exercises/:id', async ({ params, request }) => {
    const id = Number(params['id']);
    const body = await request.json() as { name?: string };
    if (id === 404) {
      const response: ApiError = {
        success: false,
        error: { code: 'NOT_FOUND', message: 'Exercise not found' },
      };
      return HttpResponse.json(response, { status: 404 });
    }
    const response: ApiResponse<Exercise> = {
      success: true,
      data: { ...mockExercise, ...body },
    };
    return HttpResponse.json(response);
  }),

  // DELETE /api/exercises/:id
  http.delete('/api/exercises/:id', ({ params }) => {
    const id = Number(params['id']);
    if (id === 404) {
      const response: ApiError = {
        success: false,
        error: { code: 'NOT_FOUND', message: 'Exercise not found' },
      };
      return HttpResponse.json(response, { status: 404 });
    }
    if (id === 1) {
      const response: ApiError = {
        success: false,
        error: { code: 'FORBIDDEN', message: 'Cannot delete built-in exercises' },
      };
      return HttpResponse.json(response, { status: 403 });
    }
    return new HttpResponse(null, { status: 204 });
  }),
];

const server = setupServer(...handlers);

describe('Exercise API Client', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterAll(() => server.close());
  afterEach(() => server.resetHandlers());

  describe('getExercises', () => {
    it('should fetch all exercises', async () => {
      const exercises = await exerciseApi.getExercises();
      expect(exercises).toHaveLength(2);
      expect(exercises[0]?.name).toBe('Bench Press');
    });

    it('should handle network errors', async () => {
      server.use(
        http.get('/api/exercises', () => {
          return HttpResponse.error();
        })
      );

      await expect(exerciseApi.getExercises()).rejects.toThrow();
    });
  });

  describe('getExercise', () => {
    it('should fetch single exercise by id', async () => {
      const exercise = await exerciseApi.getExercise(1);
      expect(exercise.name).toBe('Bench Press');
      expect(exercise.id).toBe(1);
    });

    it('should throw NotFoundError for 404 response', async () => {
      await expect(exerciseApi.getExercise(404)).rejects.toThrow(NotFoundError);
    });
  });

  describe('createExercise', () => {
    it('should create exercise and return created data', async () => {
      const exercise = await exerciseApi.createExercise({
        name: 'New Exercise',
        weight_increment: 5,
      });
      expect(exercise.name).toBe('New Exercise');
      expect(exercise.is_custom).toBe(true);
    });

    it('should handle validation errors', async () => {
      await expect(
        exerciseApi.createExercise({ name: '' })
      ).rejects.toThrow(ValidationError);
    });

    it('should handle conflict errors for duplicate names', async () => {
      await expect(
        exerciseApi.createExercise({ name: 'Duplicate' })
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('updateExercise', () => {
    it('should update exercise and return updated data', async () => {
      const exercise = await exerciseApi.updateExercise(1, {
        name: 'Updated Name',
      });
      expect(exercise.name).toBe('Updated Name');
    });

    it('should throw NotFoundError for non-existent exercise', async () => {
      await expect(
        exerciseApi.updateExercise(404, { name: 'New Name' })
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('deleteExercise', () => {
    it('should delete exercise successfully', async () => {
      await expect(exerciseApi.deleteExercise(2)).resolves.toBeUndefined();
    });

    it('should throw ForbiddenError for built-in exercises', async () => {
      await expect(exerciseApi.deleteExercise(1)).rejects.toThrow(ForbiddenError);
    });

    it('should throw NotFoundError for non-existent exercise', async () => {
      await expect(exerciseApi.deleteExercise(404)).rejects.toThrow(NotFoundError);
    });
  });
});
