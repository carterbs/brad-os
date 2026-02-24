import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { Response } from 'supertest';
import type { StretchSessionRecord, BodyRegion, CompletedStretch } from '../shared.js';
import { type ApiResponse, createStretchSession, createMockStretchSessionRepository } from '../__tests__/utils/index.js';

// Mock firebase before importing the handler
vi.mock('../firebase.js', () => ({
  getFirestoreDb: vi.fn(),
}));

// Mock app-check middleware
vi.mock('../middleware/app-check.js', () => ({
  requireAppCheck: (_req: unknown, _res: unknown, next: () => void): void => next(),
}));

// Mock repository
const mockStretchSessionRepo = createMockStretchSessionRepository();

vi.mock('../repositories/stretchSession.repository.js', () => ({
  StretchSessionRepository: vi.fn().mockImplementation(() => mockStretchSessionRepo),
}));

// Import after mocks
import { stretchSessionsApp } from './stretchSessions.js';

// Helper to create valid request body
function createValidRequestBody(): Record<string, unknown> {
  return {
    completedAt: '2024-01-15T10:30:00.000Z',
    totalDurationSeconds: 600,
    regionsCompleted: 8,
    regionsSkipped: 0,
    stretches: [
      {
        region: 'neck',
        stretchId: 'neck-forward-tilt',
        stretchName: 'Neck Forward Tilt',
        durationSeconds: 60,
        skippedSegments: 0,
      },
    ],
  };
}

describe('StretchSessions Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /stretch-sessions', () => {
    it('should create stretch session with valid data', async () => {
      const createdSession = createStretchSession({ id: 'new-session' });
      mockStretchSessionRepo.create.mockResolvedValue(createdSession);

      const response = await request(stretchSessionsApp)
        .post('/')
        .send(createValidRequestBody());

      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        success: true,
        data: createdSession,
      });
      expect(mockStretchSessionRepo.create).toHaveBeenCalledTimes(1);
    });

    it('should create stretch session with multiple stretches', async () => {
      const stretches: CompletedStretch[] = [
        {
          region: 'neck' as BodyRegion,
          stretchId: 'neck-forward-tilt',
          stretchName: 'Neck Forward Tilt',
          durationSeconds: 60,
          skippedSegments: 0,
        },
        {
          region: 'shoulders' as BodyRegion,
          stretchId: 'shoulder-stretch',
          stretchName: 'Shoulder Stretch',
          durationSeconds: 60,
          skippedSegments: 1,
        },
        {
          region: 'back' as BodyRegion,
          stretchId: 'back-stretch',
          stretchName: 'Back Stretch',
          durationSeconds: 120,
          skippedSegments: 0,
        },
      ];
      const requestBody: Partial<StretchSessionRecord> = {
        completedAt: '2024-01-15T10:30:00.000Z',
        totalDurationSeconds: 600,
        regionsCompleted: 3,
        regionsSkipped: 5,
        stretches,
      };
      const createdSession = createStretchSession(requestBody);
      mockStretchSessionRepo.create.mockResolvedValue(createdSession);

      const response = await request(stretchSessionsApp)
        .post('/')
        .send(requestBody);

      expect(response.status).toBe(201);
      expect(mockStretchSessionRepo.create).toHaveBeenCalledWith(requestBody);
    });

    it('should return 400 for missing completedAt', async () => {
      const requestBody = createValidRequestBody();
      delete requestBody.completedAt;

      const response: Response = await request(stretchSessionsApp)
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

      const response: Response = await request(stretchSessionsApp)
        .post('/')
        .send(requestBody);
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for negative totalDurationSeconds', async () => {
      const requestBody = createValidRequestBody();
      requestBody.totalDurationSeconds = -1;

      const response: Response = await request(stretchSessionsApp)
        .post('/')
        .send(requestBody);
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for negative regionsCompleted', async () => {
      const requestBody = createValidRequestBody();
      requestBody.regionsCompleted = -1;

      const response: Response = await request(stretchSessionsApp)
        .post('/')
        .send(requestBody);
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for empty stretches array', async () => {
      const requestBody = createValidRequestBody();
      requestBody.stretches = [];

      const response: Response = await request(stretchSessionsApp)
        .post('/')
        .send(requestBody);
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for invalid region in stretch', async () => {
      const requestBody = createValidRequestBody();
      const stretchesArray = requestBody.stretches as Array<Record<string, unknown>>;
      if (stretchesArray[0]) {
        stretchesArray[0].region = 'invalid_region';
      }

      const response: Response = await request(stretchSessionsApp)
        .post('/')
        .send(requestBody);
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for missing stretchId', async () => {
      const requestBody = createValidRequestBody();
      const stretchesArray = requestBody.stretches as Array<Record<string, unknown>>;
      if (stretchesArray[0]) {
        delete stretchesArray[0].stretchId;
      }

      const response: Response = await request(stretchSessionsApp)
        .post('/')
        .send(requestBody);
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for non-positive durationSeconds in stretch', async () => {
      const requestBody = createValidRequestBody();
      const stretchesArray = requestBody.stretches as Array<Record<string, unknown>>;
      if (stretchesArray[0]) {
        stretchesArray[0].durationSeconds = 0;
      }

      const response: Response = await request(stretchSessionsApp)
        .post('/')
        .send(requestBody);
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for invalid skippedSegments (greater than 2)', async () => {
      const requestBody = createValidRequestBody();
      const stretchesArray = requestBody.stretches as Array<Record<string, unknown>>;
      if (stretchesArray[0]) {
        stretchesArray[0].skippedSegments = 3;
      }

      const response: Response = await request(stretchSessionsApp)
        .post('/')
        .send(requestBody);
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should accept all valid body regions', async () => {
      const validRegions: BodyRegion[] = [
        'neck', 'shoulders', 'back', 'hip_flexors',
        'glutes', 'hamstrings', 'quads', 'calves'
      ];

      for (const region of validRegions) {
        const requestBody = createValidRequestBody();
        const stretchesArray = requestBody.stretches as Array<Record<string, unknown>>;
        if (stretchesArray[0]) {
          stretchesArray[0].region = region;
        }

        const createdSession = createStretchSession();
        mockStretchSessionRepo.create.mockResolvedValue(createdSession);

        const response = await request(stretchSessionsApp)
          .post('/')
          .send(requestBody);

        expect(response.status).toBe(201);
      }
    });
  });

  describe('GET /stretch-sessions', () => {
    it('should return all stretch sessions', async () => {
      const sessions = [
        createStretchSession({ id: '1' }),
        createStretchSession({ id: '2' }),
      ];
      mockStretchSessionRepo.findAll.mockResolvedValue(sessions);

      const response = await request(stretchSessionsApp).get('/');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: sessions,
      });
      expect(mockStretchSessionRepo.findAll).toHaveBeenCalledTimes(1);
    });

    it('should return empty array when no sessions exist', async () => {
      mockStretchSessionRepo.findAll.mockResolvedValue([]);

      const response = await request(stretchSessionsApp).get('/');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: [],
      });
    });
  });

  describe('GET /stretch-sessions/latest', () => {
    it('should return latest stretch session', async () => {
      const latestSession = createStretchSession({ id: 'latest' });
      mockStretchSessionRepo.findLatest.mockResolvedValue(latestSession);

      const response = await request(stretchSessionsApp).get('/latest');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: latestSession,
      });
      expect(mockStretchSessionRepo.findLatest).toHaveBeenCalledTimes(1);
    });

    it('should return null when no sessions exist', async () => {
      mockStretchSessionRepo.findLatest.mockResolvedValue(null);

      const response = await request(stretchSessionsApp).get('/latest');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: null,
      });
    });
  });

  describe('GET /stretch-sessions/:id', () => {
    it('should return stretch session by id', async () => {
      const session = createStretchSession({ id: 'session-123' });
      mockStretchSessionRepo.findById.mockResolvedValue(session);

      const response = await request(stretchSessionsApp).get('/session-123');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: session,
      });
      expect(mockStretchSessionRepo.findById).toHaveBeenCalledWith('session-123');
    });

    it('should return 404 when session not found', async () => {
      mockStretchSessionRepo.findById.mockResolvedValue(null);

      const response = await request(stretchSessionsApp).get('/non-existent-id');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'StretchSession with id non-existent-id not found',
        },
      });
    });
  });
});
