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
const mockRecoveryService = vi.hoisted(() => ({
  getLatestRecoverySnapshot: vi.fn(),
  getRecoveryHistory: vi.fn(),
  getWeightHistory: vi.fn(),
  getHRVHistory: vi.fn(),
  getRHRHistory: vi.fn(),
}));

const mockTodayCoachDataService = vi.hoisted(() => ({
  buildTodayCoachContext: vi.fn(),
}));

const mockTodayCoachService = vi.hoisted(() => ({
  getTodayCoachRecommendation: vi.fn(),
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

vi.mock('../services/firestore-recovery.service.js', () => mockRecoveryService);
vi.mock('../services/today-coach-data.service.js', () => mockTodayCoachDataService);
vi.mock('../services/today-coach.service.js', () => mockTodayCoachService);

// Import after mocks
import { todayCoachApp } from './today-coach.js';

describe('Today Coach Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should export the todayCoachApp Express app', () => {
    expect(todayCoachApp).toBeDefined();
    expect(typeof todayCoachApp).toBe('function');
  });

  describe('POST /today-coach/recommend', () => {
    it('should return recommendation when recovery is provided in body', async () => {
      const mockRecovery = {
        date: '2024-01-15',
        hrvMs: 55,
        hrvVsBaseline: 5,
        rhrBpm: 58,
        rhrVsBaseline: -2,
        sleepHours: 7.5,
        sleepEfficiency: 92,
        deepSleepPercent: 22,
        score: 75,
        state: 'ready',
      };

      const mockContext = {
        recovery: mockRecovery,
        recoveryHistory: [],
        todaysWorkout: null,
        liftingHistory: [],
        liftingSchedule: { nextWorkoutDay: null, daysPerWeek: 3 },
        mesocycleContext: null,
        cyclingContext: null,
        stretchingContext: { lastSessionDate: null, daysSinceLastSession: null, sessionsThisWeek: 0, lastRegions: [] },
        meditationContext: { lastSessionDate: null, daysSinceLastSession: null, sessionsThisWeek: 0, totalMinutesThisWeek: 0, currentStreak: 0 },
        weightMetrics: null,
        healthTrends: null,
        timezone: 'America/Chicago',
        currentDate: '2024-01-15',
        timeContext: { timeOfDay: 'morning' as const, currentHour: 9 },
        completedActivities: {
          hasLiftedToday: false, liftedAt: null,
          hasCycledToday: false, cycledAt: null,
          hasStretchedToday: false, stretchedAt: null,
          hasMeditatedToday: false, meditatedAt: null,
        },
      };

      const mockRecommendation = {
        dailyBriefing: 'Great recovery today. Time for a solid workout.',
        sections: {
          recovery: { insight: 'Recovery score is 75/100.', status: 'good' },
          lifting: null,
          cycling: null,
          stretching: { insight: 'Consider stretching.', suggestedRegions: ['back'], priority: 'normal' },
          meditation: { insight: 'Short session recommended.', suggestedDurationMinutes: 10, priority: 'normal' },
          weight: null,
        },
        warnings: [],
      };

      mockTodayCoachDataService.buildTodayCoachContext.mockResolvedValue(mockContext);
      mockTodayCoachService.getTodayCoachRecommendation.mockResolvedValue(mockRecommendation);

      const response = await request(todayCoachApp)
        .post('/recommend')
        .send({ recovery: mockRecovery });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: mockRecommendation,
      });
    });

    it('should return 400 when no recovery data is available', async () => {
      mockRecoveryService.getLatestRecoverySnapshot.mockResolvedValue(null);

      const response: Response = await request(todayCoachApp)
        .post('/recommend')
        .send({});
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('RECOVERY_NOT_SYNCED');
    });
  });
});
