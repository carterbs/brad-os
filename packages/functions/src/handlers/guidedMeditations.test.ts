import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { Response } from 'supertest';
import { type ApiResponse } from '../__tests__/utils/index.js';
import { createMockGuidedMeditationRepository } from '../__tests__/utils/mock-repository.js';

// Mock firebase before importing the handler
vi.mock('../firebase.js', () => ({
  getFirestoreDb: vi.fn(),
}));

// Mock app-check middleware
vi.mock('../middleware/app-check.js', () => ({
  requireAppCheck: (_req: unknown, _res: unknown, next: () => void): void => next(),
}));

const mockGuidedMeditationRepo = createMockGuidedMeditationRepository();

vi.mock('../repositories/guided-meditation.repository.js', () => ({
  GuidedMeditationRepository: vi.fn().mockImplementation(() => mockGuidedMeditationRepo),
}));

// Import after mocks
import { guidedMeditationsApp } from './guidedMeditations.js';

// Sample test data
const sampleCategories = [
  { id: 'stress-relief', name: 'stress-relief', scriptCount: 3 },
  { id: 'sleep', name: 'sleep', scriptCount: 2 },
];

const sampleScript = {
  id: 'script-1',
  category: 'stress-relief',
  title: 'Deep Breathing',
  subtitle: 'A calming breathing exercise',
  orderIndex: 0,
  durationSeconds: 600,
  segments: [{ id: 'seg-1', text: 'Welcome', durationSeconds: 30 }],
  interjections: [],
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
};

describe('GuidedMeditations Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET / - list categories', () => {
    it('should return categories array', async () => {
      mockGuidedMeditationRepo.getCategories.mockResolvedValue(sampleCategories);

      const response = await request(guidedMeditationsApp).get('/');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: sampleCategories,
      });
      expect(mockGuidedMeditationRepo.getCategories).toHaveBeenCalledTimes(1);
    });

    it('should return empty array when no categories', async () => {
      mockGuidedMeditationRepo.getCategories.mockResolvedValue([]);

      const response = await request(guidedMeditationsApp).get('/');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: [],
      });
    });
  });

  describe('GET /categories - list categories (iOS compat alias)', () => {
    it('should return categories', async () => {
      mockGuidedMeditationRepo.getCategories.mockResolvedValue(sampleCategories);

      const response = await request(guidedMeditationsApp).get('/categories');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: sampleCategories,
      });
      expect(mockGuidedMeditationRepo.getCategories).toHaveBeenCalledTimes(1);
    });
  });

  describe('GET /category/:category - list scripts by category', () => {
    it('should return scripts for a category', async () => {
      const scripts = [sampleScript];
      mockGuidedMeditationRepo.findAllByCategory.mockResolvedValue(scripts);

      const response = await request(guidedMeditationsApp).get('/category/stress-relief');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: scripts,
      });
      expect(mockGuidedMeditationRepo.findAllByCategory).toHaveBeenCalledWith('stress-relief');
    });

    it('should return empty array for unknown category', async () => {
      mockGuidedMeditationRepo.findAllByCategory.mockResolvedValue([]);

      const response = await request(guidedMeditationsApp).get('/category/unknown');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: [],
      });
      expect(mockGuidedMeditationRepo.findAllByCategory).toHaveBeenCalledWith('unknown');
    });
  });

  describe('GET /:id - get script by id', () => {
    it('should return script when found', async () => {
      mockGuidedMeditationRepo.findById.mockResolvedValue(sampleScript);

      const response = await request(guidedMeditationsApp).get('/script-1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: sampleScript,
      });
      expect(mockGuidedMeditationRepo.findById).toHaveBeenCalledWith('script-1');
    });

    it('should return 404 when not found', async () => {
      mockGuidedMeditationRepo.findById.mockResolvedValue(null);

      const response: Response = await request(guidedMeditationsApp).get('/non-existent-id');
      const body = response.body as ApiResponse;

      expect(response.status).toBe(404);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('NOT_FOUND');
      expect(body.error?.message).toBe('GuidedMeditationScript with id non-existent-id not found');
    });
  });
});
