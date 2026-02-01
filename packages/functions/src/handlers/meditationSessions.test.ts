import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { Response } from 'supertest';
import type { MeditationSessionRecord } from '../shared.js';

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

// Mock repository
const mockMeditationSessionRepo = {
  findAll: vi.fn(),
  findById: vi.fn(),
  findLatest: vi.fn(),
  create: vi.fn(),
  getStats: vi.fn(),
};

vi.mock('../repositories/meditationSession.repository.js', () => ({
  MeditationSessionRepository: vi.fn().mockImplementation(() => mockMeditationSessionRepo),
}));

// Import after mocks
import { meditationSessionsApp } from './meditationSessions.js';

// Helper to create test meditation session
function createTestMeditationSession(overrides: Partial<MeditationSessionRecord> = {}): MeditationSessionRecord {
  return {
    id: 'session-1',
    completedAt: '2024-01-15T08:00:00.000Z',
    sessionType: 'basic-breathing',
    plannedDurationSeconds: 600,
    actualDurationSeconds: 580,
    completedFully: true,
    ...overrides,
  };
}

// Helper to create valid request body
function createValidRequestBody(): Record<string, unknown> {
  return {
    completedAt: '2024-01-15T08:00:00.000Z',
    sessionType: 'basic-breathing',
    plannedDurationSeconds: 600,
    actualDurationSeconds: 580,
    completedFully: true,
  };
}

describe('MeditationSessions Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /meditation-sessions', () => {
    it('should create meditation session with valid data', async () => {
      const createdSession = createTestMeditationSession({ id: 'new-session' });
      mockMeditationSessionRepo.create.mockResolvedValue(createdSession);

      const response = await request(meditationSessionsApp)
        .post('/')
        .send(createValidRequestBody());

      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        success: true,
        data: createdSession,
      });
      expect(mockMeditationSessionRepo.create).toHaveBeenCalledTimes(1);
    });

    it('should create meditation session that was not completed fully', async () => {
      const requestBody = {
        completedAt: '2024-01-15T08:00:00.000Z',
        sessionType: 'basic-breathing',
        plannedDurationSeconds: 600,
        actualDurationSeconds: 300,
        completedFully: false,
      };
      const createdSession = createTestMeditationSession(requestBody);
      mockMeditationSessionRepo.create.mockResolvedValue(createdSession);

      const response = await request(meditationSessionsApp)
        .post('/')
        .send(requestBody);

      expect(response.status).toBe(201);
      expect(mockMeditationSessionRepo.create).toHaveBeenCalledWith(requestBody);
    });

    it('should create meditation session with zero actual duration', async () => {
      const requestBody = {
        completedAt: '2024-01-15T08:00:00.000Z',
        sessionType: 'basic-breathing',
        plannedDurationSeconds: 600,
        actualDurationSeconds: 0,
        completedFully: false,
      };
      const createdSession = createTestMeditationSession(requestBody);
      mockMeditationSessionRepo.create.mockResolvedValue(createdSession);

      const response = await request(meditationSessionsApp)
        .post('/')
        .send(requestBody);

      expect(response.status).toBe(201);
    });

    it('should return 400 for missing completedAt', async () => {
      const requestBody = createValidRequestBody();
      delete requestBody.completedAt;

      const response: Response = await request(meditationSessionsApp)
        .post('/')
        .send(requestBody);
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for invalid completedAt format', async () => {
      const requestBody = createValidRequestBody();
      requestBody.completedAt = 'invalid-date';

      const response: Response = await request(meditationSessionsApp)
        .post('/')
        .send(requestBody);
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for missing sessionType', async () => {
      const requestBody = createValidRequestBody();
      delete requestBody.sessionType;

      const response: Response = await request(meditationSessionsApp)
        .post('/')
        .send(requestBody);
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for empty sessionType', async () => {
      const requestBody = createValidRequestBody();
      requestBody.sessionType = '';

      const response: Response = await request(meditationSessionsApp)
        .post('/')
        .send(requestBody);
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for non-positive plannedDurationSeconds', async () => {
      const requestBody = createValidRequestBody();
      requestBody.plannedDurationSeconds = 0;

      const response: Response = await request(meditationSessionsApp)
        .post('/')
        .send(requestBody);
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for negative plannedDurationSeconds', async () => {
      const requestBody = createValidRequestBody();
      requestBody.plannedDurationSeconds = -1;

      const response: Response = await request(meditationSessionsApp)
        .post('/')
        .send(requestBody);
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for negative actualDurationSeconds', async () => {
      const requestBody = createValidRequestBody();
      requestBody.actualDurationSeconds = -1;

      const response: Response = await request(meditationSessionsApp)
        .post('/')
        .send(requestBody);
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for missing completedFully', async () => {
      const requestBody = createValidRequestBody();
      delete requestBody.completedFully;

      const response: Response = await request(meditationSessionsApp)
        .post('/')
        .send(requestBody);
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for non-boolean completedFully', async () => {
      const requestBody = createValidRequestBody();
      requestBody.completedFully = 'yes';

      const response: Response = await request(meditationSessionsApp)
        .post('/')
        .send(requestBody);
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for non-integer actualDurationSeconds', async () => {
      const requestBody = createValidRequestBody();
      requestBody.actualDurationSeconds = 300.5;

      const response: Response = await request(meditationSessionsApp)
        .post('/')
        .send(requestBody);
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /meditation-sessions', () => {
    it('should return all meditation sessions', async () => {
      const sessions = [
        createTestMeditationSession({ id: '1' }),
        createTestMeditationSession({ id: '2' }),
      ];
      mockMeditationSessionRepo.findAll.mockResolvedValue(sessions);

      const response = await request(meditationSessionsApp).get('/');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: sessions,
      });
      expect(mockMeditationSessionRepo.findAll).toHaveBeenCalledTimes(1);
    });

    it('should return empty array when no sessions exist', async () => {
      mockMeditationSessionRepo.findAll.mockResolvedValue([]);

      const response = await request(meditationSessionsApp).get('/');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: [],
      });
    });
  });

  describe('GET /meditation-sessions/stats', () => {
    it('should return meditation statistics', async () => {
      const stats = { totalSessions: 42, totalMinutes: 315 };
      mockMeditationSessionRepo.getStats.mockResolvedValue(stats);

      const response = await request(meditationSessionsApp).get('/stats');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: stats,
      });
      expect(mockMeditationSessionRepo.getStats).toHaveBeenCalledTimes(1);
    });

    it('should return zero stats when no sessions exist', async () => {
      const stats = { totalSessions: 0, totalMinutes: 0 };
      mockMeditationSessionRepo.getStats.mockResolvedValue(stats);

      const response = await request(meditationSessionsApp).get('/stats');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: stats,
      });
    });
  });

  describe('GET /meditation-sessions/latest', () => {
    it('should return latest meditation session', async () => {
      const latestSession = createTestMeditationSession({ id: 'latest' });
      mockMeditationSessionRepo.findLatest.mockResolvedValue(latestSession);

      const response = await request(meditationSessionsApp).get('/latest');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: latestSession,
      });
      expect(mockMeditationSessionRepo.findLatest).toHaveBeenCalledTimes(1);
    });

    it('should return null when no sessions exist', async () => {
      mockMeditationSessionRepo.findLatest.mockResolvedValue(null);

      const response = await request(meditationSessionsApp).get('/latest');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: null,
      });
    });
  });

  describe('GET /meditation-sessions/:id', () => {
    it('should return meditation session by id', async () => {
      const session = createTestMeditationSession({ id: 'session-123' });
      mockMeditationSessionRepo.findById.mockResolvedValue(session);

      const response = await request(meditationSessionsApp).get('/session-123');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: session,
      });
      expect(mockMeditationSessionRepo.findById).toHaveBeenCalledWith('session-123');
    });

    it('should return 404 when session not found', async () => {
      mockMeditationSessionRepo.findById.mockResolvedValue(null);

      const response = await request(meditationSessionsApp).get('/non-existent-id');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'MeditationSession with id non-existent-id not found',
        },
      });
    });
  });
});
