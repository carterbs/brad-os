import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { Response } from 'supertest';

// Type for API response body
interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

// Mock services - use vi.hoisted to define before vi.mock hoisting
const mockCyclingService = vi.hoisted(() => ({
  getCyclingActivities: vi.fn(),
  getCurrentFTP: vi.fn(),
  getCurrentTrainingBlock: vi.fn(),
  getWeightGoal: vi.fn(),
  getLatestVO2Max: vi.fn(),
  getVO2MaxHistory: vi.fn(),
  getCyclingProfile: vi.fn(),
  getFTPHistory: vi.fn(),
  getActivityStreams: vi.fn(),
}));

const mockRecoveryService = vi.hoisted(() => ({
  getLatestRecoverySnapshot: vi.fn(),
  getWeightHistory: vi.fn(),
  getRecoveryHistory: vi.fn(),
}));

const mockCyclingCoachService = vi.hoisted(() => ({
  getCyclingRecommendation: vi.fn(),
  generateSchedule: vi.fn(),
}));

const mockLiftingContextService = vi.hoisted(() => ({
  buildLiftingContext: vi.fn(),
  buildLiftingSchedule: vi.fn(),
  buildMesocycleContext: vi.fn(),
}));

// Mock firebase before importing the handler
vi.mock('../firebase.js', () => ({
  getFirestoreDb: vi.fn(),
  getCollectionName: vi.fn((name: string) => name),
}));

// Mock app-check middleware
vi.mock('../middleware/app-check.js', () => ({
  requireAppCheck: (_req: unknown, _res: unknown, next: () => void): void =>
    next(),
}));

// Mock firebase-functions/params (defineSecret)
vi.mock('firebase-functions/params', () => ({
  defineSecret: vi.fn(() => ({
    value: (): string => 'test-api-key',
  })),
}));

vi.mock('../services/firestore-cycling.service.js', () => mockCyclingService);
vi.mock('../services/firestore-recovery.service.js', () => mockRecoveryService);
vi.mock('../services/cycling-coach.service.js', () => mockCyclingCoachService);
vi.mock('../services/lifting-context.service.js', () => mockLiftingContextService);

// Import after mocks
import { cyclingCoachApp } from './cycling-coach.js';

describe('Cycling Coach Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should export the cyclingCoachApp Express app', () => {
    expect(cyclingCoachApp).toBeDefined();
    expect(typeof cyclingCoachApp).toBe('function');
  });

  describe('POST /cycling-coach/generate-schedule', () => {
    it('should return generated schedule on valid request', async () => {
      const mockSchedule = {
        weeklySessions: [
          { order: 1, sessionType: 'vo2max', description: 'VO2max intervals' },
        ],
      };
      mockCyclingCoachService.generateSchedule.mockResolvedValue(mockSchedule);

      const response = await request(cyclingCoachApp)
        .post('/generate-schedule')
        .send({
          sessionsPerWeek: 3,
          preferredDays: [2, 4, 6],
          goals: ['regain_fitness'],
          experienceLevel: 'intermediate',
          weeklyHoursAvailable: 4.5,
          ftp: 250,
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: mockSchedule,
      });
    });

    it('should return 400 on invalid request body', async () => {
      const response: Response = await request(cyclingCoachApp)
        .post('/generate-schedule')
        .send({});
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
    });
  });

  describe('POST /cycling-coach/recommend', () => {
    it('should return 400 when no recovery data is available', async () => {
      mockRecoveryService.getLatestRecoverySnapshot.mockResolvedValue(null);

      const response: Response = await request(cyclingCoachApp)
        .post('/recommend')
        .send({});
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('RECOVERY_NOT_SYNCED');
    });
  });
});
