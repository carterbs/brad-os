import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mesocycleApi } from '../mesocycleApi';
import {
  NotFoundError,
  ConflictError,
  ValidationError,
} from '../exerciseApi';
import type { Mesocycle, MesocycleWithDetails } from '@lifting/shared';

describe('mesocycleApi', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getMesocycles', () => {
    it('should return list of mesocycles', async () => {
      const mesocycles: Mesocycle[] = [
        {
          id: 1,
          plan_id: 1,
          start_date: '2024-01-01',
          current_week: 1,
          status: 'active',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: mesocycles }),
      });

      const result = await mesocycleApi.getMesocycles();

      expect(mockFetch).toHaveBeenCalledWith('/api/mesocycles');
      expect(result).toEqual(mesocycles);
    });

    it('should return empty array when no mesocycles', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: [] }),
      });

      const result = await mesocycleApi.getMesocycles();
      expect(result).toEqual([]);
    });
  });

  describe('getActiveMesocycle', () => {
    it('should return active mesocycle with details', async () => {
      const mesocycle: MesocycleWithDetails = {
        id: 1,
        plan_id: 1,
        start_date: '2024-01-01',
        current_week: 1,
        status: 'active',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        plan_name: 'Test Plan',
        weeks: [],
        total_workouts: 14,
        completed_workouts: 0,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: mesocycle }),
      });

      const result = await mesocycleApi.getActiveMesocycle();

      expect(mockFetch).toHaveBeenCalledWith('/api/mesocycles/active');
      expect(result).toEqual(mesocycle);
    });

    it('should return null when no active mesocycle', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: null }),
      });

      const result = await mesocycleApi.getActiveMesocycle();
      expect(result).toBeNull();
    });
  });

  describe('getMesocycle', () => {
    it('should return mesocycle with details', async () => {
      const mesocycle: MesocycleWithDetails = {
        id: 1,
        plan_id: 1,
        start_date: '2024-01-01',
        current_week: 1,
        status: 'active',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        plan_name: 'Test Plan',
        weeks: [],
        total_workouts: 14,
        completed_workouts: 0,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: mesocycle }),
      });

      const result = await mesocycleApi.getMesocycle(1);

      expect(mockFetch).toHaveBeenCalledWith('/api/mesocycles/1');
      expect(result).toEqual(mesocycle);
    });

    it('should throw NotFoundError when mesocycle not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Mesocycle not found' },
        }),
      });

      await expect(mesocycleApi.getMesocycle(999)).rejects.toThrow(
        NotFoundError
      );
    });
  });

  describe('createMesocycle', () => {
    it('should create and start mesocycle', async () => {
      const pendingMesocycle: Mesocycle = {
        id: 1,
        plan_id: 1,
        start_date: '2024-01-01',
        current_week: 1,
        status: 'pending',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      const activeMesocycle: Mesocycle = {
        ...pendingMesocycle,
        status: 'active',
      };

      // First call: create (returns pending)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: pendingMesocycle }),
      });
      // Second call: start (returns active)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: activeMesocycle }),
      });

      const result = await mesocycleApi.createMesocycle({
        plan_id: 1,
        start_date: '2024-01-01',
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenNthCalledWith(1, '/api/mesocycles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_id: 1, start_date: '2024-01-01' }),
      });
      expect(mockFetch).toHaveBeenNthCalledWith(2, '/api/mesocycles/1/start', {
        method: 'PUT',
      });
      expect(result).toEqual(activeMesocycle);
    });

    it('should throw ConflictError when active mesocycle exists', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: () => Promise.resolve({
          success: false,
          error: {
            code: 'CONFLICT',
            message: 'An active mesocycle already exists',
          },
        }),
      });

      await expect(
        mesocycleApi.createMesocycle({ plan_id: 1, start_date: '2024-01-01' })
      ).rejects.toThrow(ConflictError);
    });

    it('should throw ValidationError when plan has no days', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Plan has no workout days configured',
          },
        }),
      });

      await expect(
        mesocycleApi.createMesocycle({ plan_id: 1, start_date: '2024-01-01' })
      ).rejects.toThrow(ValidationError);
    });

    it('should throw NotFoundError when plan not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Plan not found' },
        }),
      });

      await expect(
        mesocycleApi.createMesocycle({ plan_id: 999, start_date: '2024-01-01' })
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('completeMesocycle', () => {
    it('should complete and return mesocycle', async () => {
      const mesocycle: Mesocycle = {
        id: 1,
        plan_id: 1,
        start_date: '2024-01-01',
        current_week: 1,
        status: 'completed',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: mesocycle }),
      });

      const result = await mesocycleApi.completeMesocycle(1);

      expect(mockFetch).toHaveBeenCalledWith('/api/mesocycles/1/complete', {
        method: 'PUT',
      });
      expect(result.status).toBe('completed');
    });

    it('should throw NotFoundError when mesocycle not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Mesocycle not found' },
        }),
      });

      await expect(mesocycleApi.completeMesocycle(999)).rejects.toThrow(
        NotFoundError
      );
    });

    it('should throw ValidationError when mesocycle is not active', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Mesocycle is not active',
          },
        }),
      });

      await expect(mesocycleApi.completeMesocycle(1)).rejects.toThrow(
        ValidationError
      );
    });
  });

  describe('cancelMesocycle', () => {
    it('should cancel and return mesocycle', async () => {
      const mesocycle: Mesocycle = {
        id: 1,
        plan_id: 1,
        start_date: '2024-01-01',
        current_week: 1,
        status: 'cancelled',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: mesocycle }),
      });

      const result = await mesocycleApi.cancelMesocycle(1);

      expect(mockFetch).toHaveBeenCalledWith('/api/mesocycles/1/cancel', {
        method: 'PUT',
      });
      expect(result.status).toBe('cancelled');
    });

    it('should throw NotFoundError when mesocycle not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Mesocycle not found' },
        }),
      });

      await expect(mesocycleApi.cancelMesocycle(999)).rejects.toThrow(
        NotFoundError
      );
    });

    it('should throw ValidationError when mesocycle is not active', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Mesocycle is not active',
          },
        }),
      });

      await expect(mesocycleApi.cancelMesocycle(1)).rejects.toThrow(
        ValidationError
      );
    });
  });
});
