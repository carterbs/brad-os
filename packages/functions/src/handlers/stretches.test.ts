import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { StretchRegion } from '../shared.js';
import {
  createMockStretchRepository,
  type ApiResponse,
} from '../__tests__/utils/index.js';

// Mock firebase before importing the handler
vi.mock('../firebase.js', () => ({
  getFirestoreDb: vi.fn(),
}));

// Mock app-check middleware
vi.mock('../middleware/app-check.js', () => ({
  requireAppCheck: (_req: unknown, _res: unknown, next: () => void): void => next(),
}));

// Mock the repository
const mockStretchRepo = createMockStretchRepository();

vi.mock('../repositories/stretch.repository.js', () => ({
  StretchRepository: vi.fn().mockImplementation(() => mockStretchRepo),
}));

// Import after mocks
import { stretchesApp } from './stretches.js';

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
        createTestRegion({ id: 'neck', region: 'neck', displayName: 'Neck', iconName: 'figure.flexibility' }),
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
    it('should resolve region documents through /:region route', async () => {
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

    it('should return 404 when region is missing', async () => {
      mockStretchRepo.findByRegion.mockResolvedValue(null);

      const response = await request(stretchesApp).get('/invalid');

      expect(response.status).toBe(404);
      const body = response.body as ApiResponse;
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('NOT_FOUND');
    });
  });

  describe('POST /stretches', () => {
    it('should create a stretch region', async () => {
      const created = createTestRegion();
      mockStretchRepo.create.mockResolvedValue(created);

      const response = await request(stretchesApp).post('/').send({
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
      });

      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        success: true,
        data: created,
      });
      expect(mockStretchRepo.create).toHaveBeenCalledWith({
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
      });
    });

    it('should return 400 for invalid stretch payload', async () => {
      const response = await request(stretchesApp).post('/').send({
        region: 'back',
        displayName: '',
        iconName: 'figure.flexibility',
        stretches: [],
      });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('PUT /stretches/:id', () => {
    it('should update a stretch region', async () => {
      const updated = createTestRegion({ displayName: 'Updated Back' });
      mockStretchRepo.update.mockResolvedValue(updated);

      const response = await request(stretchesApp)
        .put('/back')
        .send({ displayName: 'Updated Back' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: updated,
      });
      expect(mockStretchRepo.update).toHaveBeenCalledWith('back', {
        displayName: 'Updated Back',
      });
    });

    it('should return 404 for missing stretch region', async () => {
      mockStretchRepo.update.mockResolvedValue(null);

      const response = await request(stretchesApp).put('/back').send({ displayName: 'Missing' });

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'StretchRegion with id back not found',
        },
      });
    });
  });

  describe('DELETE /stretches/:id', () => {
    it('should delete a stretch region', async () => {
      mockStretchRepo.delete.mockResolvedValue(true);

      const response = await request(stretchesApp).delete('/back');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: { deleted: true },
      });
      expect(mockStretchRepo.delete).toHaveBeenCalledWith('back');
    });

    it('should return 404 for missing stretch region', async () => {
      mockStretchRepo.delete.mockResolvedValue(false);

      const response = await request(stretchesApp).delete('/missing');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'StretchRegion with id missing not found',
        },
      });
    });
  });
});
