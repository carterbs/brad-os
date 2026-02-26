import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import type { Response } from 'supertest';
import { type ApiResponse } from '../__tests__/utils/index.js';
import type { CyclingCoachRequest, CyclingCoachResponse } from '../shared.js';

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

const mockTrainingLoadService = vi.hoisted(() => ({
  calculateTrainingLoadMetrics: vi.fn(),
  getWeekInBlock: vi.fn(),
  determineNextSession: vi.fn(),
  getWeekBoundaries: vi.fn(),
}));

const mockSecretValue = vi.hoisted(() => ({ value: 'test-api-key' }));

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
    value: (): string => mockSecretValue.value,
  })),
}));

vi.mock('../services/firestore-cycling.service.js', () => mockCyclingService);
vi.mock('../services/firestore-recovery.service.js', () => mockRecoveryService);
vi.mock('../services/cycling-coach.service.js', () => mockCyclingCoachService);
vi.mock('../services/lifting-context.service.js', () => mockLiftingContextService);
vi.mock('../services/training-load.service.js', () => mockTrainingLoadService);

// Import after mocks
import { cyclingCoachApp } from './cycling-coach.js';

describe('Cycling Coach Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-10T12:00:00.000Z'));
    mockSecretValue.value = 'test-api-key';

    mockRecoveryService.getLatestRecoverySnapshot.mockResolvedValue({
      date: '2026-02-10',
      hrvMs: 55,
      hrvVsBaseline: 2,
      rhrBpm: 56,
      rhrVsBaseline: -1,
      sleepHours: 7.5,
      sleepEfficiency: 90,
      deepSleepPercent: 20,
      score: 72,
      state: 'ready',
    });
    mockRecoveryService.getWeightHistory.mockResolvedValue([]);
    mockRecoveryService.getRecoveryHistory.mockResolvedValue([]);

    mockCyclingService.getCyclingActivities.mockResolvedValue([]);
    mockCyclingService.getCurrentFTP.mockResolvedValue({
      value: 250,
      date: '2026-01-10',
      source: 'test',
    });
    mockCyclingService.getCurrentTrainingBlock.mockResolvedValue(null);
    mockCyclingService.getWeightGoal.mockResolvedValue(null);
    mockCyclingService.getLatestVO2Max.mockResolvedValue(null);
    mockCyclingService.getVO2MaxHistory.mockResolvedValue([]);
    mockCyclingService.getCyclingProfile.mockResolvedValue(null);
    mockCyclingService.getFTPHistory.mockResolvedValue([]);

    mockTrainingLoadService.calculateTrainingLoadMetrics.mockReturnValue({
      atl: 40,
      ctl: 35,
      tsb: 5,
    });
    mockTrainingLoadService.getWeekInBlock.mockReturnValue(3);
    mockTrainingLoadService.getWeekBoundaries.mockReturnValue({
      start: '2026-02-08',
      end: '2026-02-14',
    });
    mockTrainingLoadService.determineNextSession.mockReturnValue(null);

    mockLiftingContextService.buildLiftingContext.mockResolvedValue([]);
    mockLiftingContextService.buildLiftingSchedule.mockResolvedValue({
      today: { planned: false },
      tomorrow: { planned: false },
      yesterday: { completed: false },
    });
    mockLiftingContextService.buildMesocycleContext.mockResolvedValue(null);

    mockCyclingCoachService.generateSchedule.mockResolvedValue({
      sessions: [],
      weeklyPlan: { totalEstimatedHours: 0, phases: [] },
      rationale: 'ok',
    });
    mockCyclingCoachService.getCyclingRecommendation.mockResolvedValue({
      session: {
        type: 'threshold',
        durationMinutes: 45,
        pelotonClassTypes: ['Power Zone'],
        pelotonTip: 'Ride steady',
        targetTSS: { min: 50, max: 70 },
        targetZones: 'Zone 4',
      },
      reasoning: 'Good to go',
      coachingTips: ['Fuel pre-ride'],
      warnings: [],
      suggestFTPTest: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function firstCoachRequest(): CyclingCoachRequest {
    const calls = mockCyclingCoachService.getCyclingRecommendation.mock
      .calls as Array<[CyclingCoachRequest]>;
    const first = calls[0];
    if (!first) {
      throw new Error('Expected getCyclingRecommendation to be called');
    }
    return first[0];
  }

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
      expect(mockCyclingCoachService.generateSchedule).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionsPerWeek: 3,
          experienceLevel: 'intermediate',
        }),
        'test-api-key',
      );
    });

    it('should return 400 on invalid request body', async () => {
      const response: Response = await request(cyclingCoachApp)
        .post('/generate-schedule')
        .send({});
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
    });

    it('should return 500 when OpenAI API key is not configured', async () => {
      mockSecretValue.value = '';

      const response = await request(cyclingCoachApp)
        .post('/generate-schedule')
        .send({
          sessionsPerWeek: 3,
          preferredDays: [2, 4, 6],
          goals: ['regain_fitness'],
          experienceLevel: 'intermediate',
          weeklyHoursAvailable: 4.5,
        });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        success: false,
        error: { code: 'CONFIG_ERROR', message: 'OpenAI API key not configured' },
      });
    });
  });

  describe('POST /cycling-coach/recommend', () => {
    const recoveryPayload = {
      date: '2026-02-10',
      hrvMs: 55,
      hrvVsBaseline: 2,
      rhrBpm: 56,
      rhrVsBaseline: -1,
      sleepHours: 7.5,
      sleepEfficiency: 90,
      deepSleepPercent: 20,
      score: 72,
      state: 'ready',
    };

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

    it('should use body recovery payload and skip Firestore fallback fetch', async () => {
      const response = await request(cyclingCoachApp)
        .post('/recommend')
        .set('x-user-id', 'athlete-1')
        .set('x-timezone-offset', '300')
        .send({ recovery: recoveryPayload });

      expect(response.status).toBe(200);
      expect(mockRecoveryService.getLatestRecoverySnapshot).not.toHaveBeenCalled();
      expect(mockCyclingCoachService.getCyclingRecommendation).toHaveBeenCalledTimes(1);
    });

    it('should return 400 when FTP is missing', async () => {
      mockCyclingService.getCurrentFTP.mockResolvedValue(null);

      const response = await request(cyclingCoachApp)
        .post('/recommend')
        .send({ recovery: recoveryPayload });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        error: { code: 'FTP_REQUIRED', message: 'FTP not set. Please set your FTP first.' },
      });
    });

    it('should return 500 when OpenAI API key is unavailable', async () => {
      mockSecretValue.value = '';

      const response = await request(cyclingCoachApp)
        .post('/recommend')
        .send({ recovery: recoveryPayload });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        success: false,
        error: { code: 'CONFIG_ERROR', message: 'OpenAI API key not configured' },
      });
    });

    it('should build coach request with computed schedule, optional contexts, and stale FTP warning', async () => {
      vi.setSystemTime(new Date('2026-02-10T12:00:00.000Z')); // Tuesday
      mockCyclingService.getCurrentFTP.mockResolvedValue({
        value: 248,
        date: '2025-11-20',
        source: 'manual',
      });
      mockCyclingService.getCurrentTrainingBlock.mockResolvedValue({
        startDate: '2026-01-01',
        goals: ['regain_fitness'],
        weeklySessions: [
          { order: 1, sessionType: 'vo2max', description: 'Hard ride', pelotonClassTypes: ['Power Zone Max'], suggestedDurationMinutes: 30 },
          { order: 2, sessionType: 'fun', description: 'Fun ride', pelotonClassTypes: ['Music'], suggestedDurationMinutes: 30 },
        ],
        experienceLevel: 'intermediate',
      });
      mockCyclingService.getCyclingActivities.mockResolvedValue([
        {
          id: 'ride-1',
          stravaId: 1,
          userId: 'athlete-1',
          date: '2026-02-09T08:00:00.000Z',
          durationMinutes: 45,
          avgPower: 210,
          normalizedPower: 220,
          maxPower: 420,
          avgHeartRate: 150,
          maxHeartRate: 172,
          tss: 65,
          intensityFactor: 0.84,
          type: 'threshold',
          source: 'strava',
          ef: 1.4,
          createdAt: '2026-02-09T09:00:00.000Z',
        },
      ]);
      mockCyclingService.getWeightGoal.mockResolvedValue({
        userId: 'athlete-1',
        targetWeightLbs: 175,
        targetDate: '2026-08-01',
        startWeightLbs: 184,
        startDate: '2026-01-10',
      });
      mockRecoveryService.getWeightHistory.mockResolvedValue([
        { id: 'w1', date: '2026-02-10', weightLbs: 182 },
        { id: 'w2', date: '2026-02-09', weightLbs: 183 },
      ]);
      mockCyclingService.getLatestVO2Max.mockResolvedValue({
        value: 52,
        date: '2026-02-01',
        method: 'ftp_derived',
      });
      mockCyclingService.getVO2MaxHistory.mockResolvedValue([
        { date: '2026-02-01', value: 52 },
      ]);
      mockCyclingService.getCyclingProfile.mockResolvedValue({
        userId: 'athlete-1',
        weightKg: 82,
        maxHR: 190,
        restingHR: 50,
      });
      mockCyclingService.getFTPHistory.mockResolvedValue([
        { date: '2026-02-01', value: 248, source: 'manual' },
        { date: '2026-01-01', value: 240, source: 'test' },
      ]);
      mockRecoveryService.getRecoveryHistory.mockResolvedValue([
        {
          date: '2026-02-10',
          score: 72,
          state: 'ready',
          hrvMs: 55,
          rhrBpm: 56,
          sleepHours: 7.5,
        },
      ]);
      mockTrainingLoadService.determineNextSession.mockReturnValue({
        order: 2,
        sessionType: 'fun',
        description: 'Fun ride',
      });
      mockCyclingCoachService.getCyclingRecommendation.mockResolvedValue({
        session: {
          type: 'fun',
          durationMinutes: 30,
          pelotonClassTypes: ['Music'],
          pelotonTip: 'Enjoy the ride',
          targetTSS: { min: 30, max: 60 },
          targetZones: 'Zone 2-4',
        },
        reasoning: 'Mix in enjoyment.',
        coachingTips: ['Stay smooth'],
        warnings: [],
        suggestFTPTest: false,
      });

      const response = await request(cyclingCoachApp)
        .post('/recommend')
        .set('x-user-id', 'athlete-1')
        .set('x-timezone-offset', '300')
        .send({ recovery: recoveryPayload });
      const body = response.body as ApiResponse<CyclingCoachResponse>;

      expect(response.status).toBe(200);
      const coachRequest = firstCoachRequest();
      expect(coachRequest.schedule.sessionType).toBe('vo2max');
      expect(coachRequest.schedule.sessionsCompletedThisWeek).toBe(1);
      expect(coachRequest.athlete.ftp).toBe(248);
      expect(coachRequest.weight.goal?.targetWeightLbs).toBe(175);
      expect(coachRequest.vo2max?.current).toBe(52);
      expect(body.data?.suggestFTPTest).toBe(true);
      expect(body.data?.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'ftp_stale' }),
        ]),
      );
    });

    it('should preserve existing suggestFTPTest=true without appending stale warning', async () => {
      mockCyclingService.getCurrentFTP.mockResolvedValue({
        value: 240,
        date: '2025-11-01',
        source: 'manual',
      });
      mockCyclingCoachService.getCyclingRecommendation.mockResolvedValue({
        session: {
          type: 'threshold',
          durationMinutes: 45,
          pelotonClassTypes: ['Power Zone'],
          pelotonTip: 'Ride steady',
          targetTSS: { min: 50, max: 70 },
          targetZones: 'Zone 4',
        },
        reasoning: 'Already stale',
        coachingTips: ['Hydrate'],
        warnings: [{ type: 'existing', message: 'already there' }],
        suggestFTPTest: true,
      });

      const response = await request(cyclingCoachApp)
        .post('/recommend')
        .send({ recovery: recoveryPayload });
      const body = response.body as ApiResponse<CyclingCoachResponse>;

      expect(response.status).toBe(200);
      expect(body.data?.suggestFTPTest).toBe(true);
      expect(body.data?.warnings).toEqual([{ type: 'existing', message: 'already there' }]);
    });

    it('should map day-of-week session type for Thursday and Saturday requests', async () => {
      vi.setSystemTime(new Date('2026-02-12T12:00:00.000Z')); // Thursday
      await request(cyclingCoachApp).post('/recommend').send({ recovery: recoveryPayload });
      let coachRequest = firstCoachRequest();
      expect(coachRequest.schedule.sessionType).toBe('threshold');

      mockCyclingCoachService.getCyclingRecommendation.mockClear();
      vi.setSystemTime(new Date('2026-02-14T12:00:00.000Z')); // Saturday
      await request(cyclingCoachApp).post('/recommend').send({ recovery: recoveryPayload });
      coachRequest = firstCoachRequest();
      expect(coachRequest.schedule.sessionType).toBe('fun');
    });
  });
});
