import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { Response } from 'supertest';
import type { Mesocycle, MesocycleWithDetails } from '../shared.js';

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

// Mock service
const mockMesocycleService = {
  list: vi.fn(),
  getActive: vi.fn(),
  getById: vi.fn(),
  create: vi.fn(),
  start: vi.fn(),
  complete: vi.fn(),
  cancel: vi.fn(),
};

vi.mock('../services/mesocycle.service.js', () => ({
  MesocycleService: vi.fn().mockImplementation(() => mockMesocycleService),
}));

// Import after mocks
import { mesocyclesApp } from './mesocycles.js';

// Helper to create test mesocycle
function createTestMesocycle(overrides: Partial<Mesocycle> = {}): Mesocycle {
  return {
    id: 'mesocycle-1',
    plan_id: 'plan-1',
    start_date: '2024-01-01',
    current_week: 1,
    status: 'pending',
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// Helper to create test mesocycle with details
function createTestMesocycleWithDetails(overrides: Partial<MesocycleWithDetails> = {}): MesocycleWithDetails {
  return {
    id: 'mesocycle-1',
    plan_id: 'plan-1',
    start_date: '2024-01-01',
    current_week: 1,
    status: 'active',
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    plan_name: 'Push Pull Legs',
    weeks: [],
    total_workouts: 18,
    completed_workouts: 0,
    ...overrides,
  };
}

describe('Mesocycles Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /mesocycles', () => {
    it('should return all mesocycles', async () => {
      const mesocycles = [
        createTestMesocycle({ id: '1' }),
        createTestMesocycle({ id: '2' }),
      ];
      mockMesocycleService.list.mockResolvedValue(mesocycles);

      const response = await request(mesocyclesApp).get('/');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: mesocycles,
      });
      expect(mockMesocycleService.list).toHaveBeenCalledTimes(1);
    });

    it('should return empty array when no mesocycles exist', async () => {
      mockMesocycleService.list.mockResolvedValue([]);

      const response = await request(mesocyclesApp).get('/');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: [],
      });
    });
  });

  describe('GET /mesocycles/active', () => {
    it('should return active mesocycle when one exists', async () => {
      const activeMesocycle = createTestMesocycleWithDetails({ status: 'active' });
      mockMesocycleService.getActive.mockResolvedValue(activeMesocycle);

      const response = await request(mesocyclesApp).get('/active');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: activeMesocycle,
      });
      expect(mockMesocycleService.getActive).toHaveBeenCalledTimes(1);
    });

    it('should return null when no active mesocycle', async () => {
      mockMesocycleService.getActive.mockResolvedValue(null);

      const response = await request(mesocyclesApp).get('/active');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: null,
      });
    });
  });

  describe('GET /mesocycles/:id', () => {
    it('should return mesocycle with details by id', async () => {
      const mesocycle = createTestMesocycleWithDetails({ id: 'mesocycle-123' });
      mockMesocycleService.getById.mockResolvedValue(mesocycle);

      const response = await request(mesocyclesApp).get('/mesocycle-123');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: mesocycle,
      });
      expect(mockMesocycleService.getById).toHaveBeenCalledWith('mesocycle-123');
    });

    it('should return 404 when mesocycle not found', async () => {
      mockMesocycleService.getById.mockResolvedValue(null);

      const response = await request(mesocyclesApp).get('/non-existent-id');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Mesocycle with id non-existent-id not found',
        },
      });
    });
  });

  describe('POST /mesocycles', () => {
    it('should create mesocycle with valid data', async () => {
      const createdMesocycle = createTestMesocycle({ id: 'new-mesocycle' });
      mockMesocycleService.create.mockResolvedValue(createdMesocycle);

      const response = await request(mesocyclesApp)
        .post('/')
        .send({
          plan_id: 1,
          start_date: '2024-01-01',
        });

      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        success: true,
        data: createdMesocycle,
      });
      expect(mockMesocycleService.create).toHaveBeenCalledWith({
        plan_id: 1,
        start_date: '2024-01-01',
      });
    });

    it('should return 404 when plan not found', async () => {
      mockMesocycleService.create.mockRejectedValue(new Error('Plan not found'));

      const response = await request(mesocyclesApp)
        .post('/')
        .send({
          plan_id: 999,
          start_date: '2024-01-01',
        });

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Plan with id 999 not found',
        },
      });
    });

    it('should return 409 when active mesocycle already exists', async () => {
      mockMesocycleService.create.mockRejectedValue(new Error('Active mesocycle already exists'));

      const response = await request(mesocyclesApp)
        .post('/')
        .send({
          plan_id: 1,
          start_date: '2024-01-01',
        });

      expect(response.status).toBe(409);
      expect(response.body).toEqual({
        success: false,
        error: {
          code: 'CONFLICT',
          message: 'Active mesocycle already exists',
        },
      });
    });

    it('should return 400 when plan has no workout days', async () => {
      mockMesocycleService.create.mockRejectedValue(new Error('Plan has no workout days'));

      const response: Response = await request(mesocyclesApp)
        .post('/')
        .send({
          plan_id: 1,
          start_date: '2024-01-01',
        });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for missing plan_id', async () => {
      const response: Response = await request(mesocyclesApp)
        .post('/')
        .send({
          start_date: '2024-01-01',
        });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for missing start_date', async () => {
      const response: Response = await request(mesocyclesApp)
        .post('/')
        .send({
          plan_id: 1,
        });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for invalid start_date format', async () => {
      const response: Response = await request(mesocyclesApp)
        .post('/')
        .send({
          plan_id: 1,
          start_date: 'invalid-date',
        });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for non-positive plan_id', async () => {
      const response: Response = await request(mesocyclesApp)
        .post('/')
        .send({
          plan_id: 0,
          start_date: '2024-01-01',
        });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('PUT /mesocycles/:id/start', () => {
    it('should start mesocycle successfully', async () => {
      const startedMesocycle = createTestMesocycle({
        id: 'mesocycle-123',
        status: 'active',
      });
      mockMesocycleService.start.mockResolvedValue(startedMesocycle);

      const response = await request(mesocyclesApp).put('/mesocycle-123/start');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: startedMesocycle,
      });
      expect(mockMesocycleService.start).toHaveBeenCalledWith('mesocycle-123');
    });

    it('should return 404 when mesocycle not found', async () => {
      mockMesocycleService.start.mockRejectedValue(new Error('Mesocycle not found'));

      const response = await request(mesocyclesApp).put('/non-existent-id/start');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Mesocycle with id non-existent-id not found',
        },
      });
    });

    it('should return 400 when mesocycle is not pending', async () => {
      mockMesocycleService.start.mockRejectedValue(new Error('Only pending mesocycles can be started'));

      const response: Response = await request(mesocyclesApp).put('/mesocycle-123/start');
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should return 409 when active mesocycle already exists', async () => {
      mockMesocycleService.start.mockRejectedValue(new Error('Active mesocycle already exists'));

      const response = await request(mesocyclesApp).put('/mesocycle-123/start');

      expect(response.status).toBe(409);
      expect(response.body).toEqual({
        success: false,
        error: {
          code: 'CONFLICT',
          message: 'Active mesocycle already exists',
        },
      });
    });
  });

  describe('PUT /mesocycles/:id/complete', () => {
    it('should complete mesocycle successfully', async () => {
      const completedMesocycle = createTestMesocycle({
        id: 'mesocycle-123',
        status: 'completed',
      });
      mockMesocycleService.complete.mockResolvedValue(completedMesocycle);

      const response = await request(mesocyclesApp).put('/mesocycle-123/complete');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: completedMesocycle,
      });
      expect(mockMesocycleService.complete).toHaveBeenCalledWith('mesocycle-123');
    });

    it('should return 404 when mesocycle not found', async () => {
      mockMesocycleService.complete.mockRejectedValue(new Error('Mesocycle not found'));

      const response = await request(mesocyclesApp).put('/non-existent-id/complete');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Mesocycle with id non-existent-id not found',
        },
      });
    });

    it('should return 400 when mesocycle is not active', async () => {
      mockMesocycleService.complete.mockRejectedValue(new Error('Mesocycle is not active'));

      const response: Response = await request(mesocyclesApp).put('/mesocycle-123/complete');
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('PUT /mesocycles/:id/cancel', () => {
    it('should cancel mesocycle successfully', async () => {
      const cancelledMesocycle = createTestMesocycle({
        id: 'mesocycle-123',
        status: 'cancelled',
      });
      mockMesocycleService.cancel.mockResolvedValue(cancelledMesocycle);

      const response = await request(mesocyclesApp).put('/mesocycle-123/cancel');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: cancelledMesocycle,
      });
      expect(mockMesocycleService.cancel).toHaveBeenCalledWith('mesocycle-123');
    });

    it('should return 404 when mesocycle not found', async () => {
      mockMesocycleService.cancel.mockRejectedValue(new Error('Mesocycle not found'));

      const response = await request(mesocyclesApp).put('/non-existent-id/cancel');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Mesocycle with id non-existent-id not found',
        },
      });
    });

    it('should return 400 when mesocycle is not active', async () => {
      mockMesocycleService.cancel.mockRejectedValue(new Error('Mesocycle is not active'));

      const response: Response = await request(mesocyclesApp).put('/mesocycle-123/cancel');
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });
  });
});
