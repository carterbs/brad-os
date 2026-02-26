import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { StretchRegion } from '../shared.js';
import { type ApiResponse } from '../__tests__/utils/index.js';
import { createMockStretchRepository } from '../__tests__/utils/mock-repository.js';

// Mock firebase before importing the handler
vi.mock('../firebase.js', () => ({
  getFirestoreDb: vi.fn(),
}));

// Mock app-check middleware
vi.mock('../middleware/app-check.js', () => ({
  requireAppCheck: (_req: unknown, _res: unknown, next: () => void): void => next(),
}));

const mockStretchRepo = createMockStretchRepository();

vi.mock('../repositories/stretch.repository.js', () => ({
  StretchRepository: vi.fn().mockImplementation(() => mockStretchRepo),
}));

// Import after mocks
import { stretchesApp } from './stretches.js';

// Helper to create test stretch region
function createTestRegion(overrides: Partial<StretchRegion> = {}): StretchRegion {
  return {
    id: 'back',
    region: 'back',
    displayName: 'Back',
    iconName: 'figure.flexibility',
    stretches: [
      {
        id: 'back-childs-pose',
        name: "Child's Pose",
        description: 'Kneel on the floor and sit back on your heels.',
        bilateral: false,
      },
    ],
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('Stretches Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /stretches', () => {
    it('should return all regions with stretches', async () => {
      const regions = [
        createTestRegion({ id: 'back', region: 'back' }),
        createTestRegion({ id: 'neck', region: 'neck', displayName: 'Neck' }),
      ];
      mockStretchRepo.findAll.mockResolvedValue(regions);

      const response = await request(stretchesApp).get('/');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: regions,
      });
      expect(mockStretchRepo.findAll).toHaveBeenCalledTimes(1);
    });

    it('should return empty array when no regions exist', async () => {
      mockStretchRepo.findAll.mockResolvedValue([]);

      const response = await request(stretchesApp).get('/');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: [],
      });
    });
  });

  describe('GET /stretches/:region', () => {
    it('should return a single region with stretches', async () => {
      const region = createTestRegion();
      mockStretchRepo.findByRegion.mockResolvedValue(region);

      const response = await request(stretchesApp).get('/back');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: region,
      });
      expect(mockStretchRepo.findByRegion).toHaveBeenCalledWith('back');
    });

    it('should return 404 for non-existent region', async () => {
      mockStretchRepo.findByRegion.mockResolvedValue(null);

      const response = await request(stretchesApp).get('/invalid');

      expect(response.status).toBe(404);
      const body = response.body as ApiResponse;
      expect(body.success).toBe(false);
    });
  });
});
