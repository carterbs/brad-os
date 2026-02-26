import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock all external dependencies before importing
const mockCyclingService = vi.hoisted(() => ({
  getCurrentFTP: vi.fn(),
  getCurrentTrainingBlock: vi.fn(),
  getCyclingActivities: vi.fn(),
  getLatestVO2Max: vi.fn(),
  getVO2MaxHistory: vi.fn(),
  getActivityStreams: vi.fn(),
  getWeightGoal: vi.fn(),
}));

const mockRecoveryService = vi.hoisted(() => ({
  getRecoveryHistory: vi.fn(),
  getWeightHistory: vi.fn(),
  getHRVHistory: vi.fn(),
  getRHRHistory: vi.fn(),
}));

const mockTrainingLoadService = vi.hoisted(() => ({
  calculateTrainingLoadMetrics: vi.fn(),
  getWeekInBlock: vi.fn(),
  determineNextSession: vi.fn(),
  getWeekBoundaries: vi.fn(),
}));

const mockLiftingContextService = vi.hoisted(() => ({
  buildLiftingContext: vi.fn(),
  buildLiftingSchedule: vi.fn(),
  buildMesocycleContext: vi.fn(),
}));

const mockWorkoutRepo = vi.hoisted(() => ({
  findByDate: vi.fn(),
  findByCompletedAtRange: vi.fn(),
}));

const mockPlanDayRepo = vi.hoisted(() => ({
  findById: vi.fn(),
}));

const mockWorkoutSetRepo = vi.hoisted(() => ({
  findByWorkoutId: vi.fn(),
}));

const mockStretchSessionRepo = vi.hoisted(() => ({
  findLatest: vi.fn(),
  findInDateRange: vi.fn(),
}));

const mockMeditationSessionRepo = vi.hoisted(() => ({
  findLatest: vi.fn(),
  findInDateRange: vi.fn(),
}));

vi.mock('./firestore-cycling.service.js', () => mockCyclingService);
vi.mock('./firestore-recovery.service.js', () => mockRecoveryService);
vi.mock('./training-load.service.js', () => mockTrainingLoadService);
vi.mock('./lifting-context.service.js', () => mockLiftingContextService);

vi.mock('../repositories/index.js', () => ({
  getWorkoutRepository: (): typeof mockWorkoutRepo => mockWorkoutRepo,
  getPlanDayRepository: (): typeof mockPlanDayRepo => mockPlanDayRepo,
  getWorkoutSetRepository: (): typeof mockWorkoutSetRepo => mockWorkoutSetRepo,
  getStretchSessionRepository: (): typeof mockStretchSessionRepo => mockStretchSessionRepo,
  getMeditationSessionRepository: (): typeof mockMeditationSessionRepo => mockMeditationSessionRepo,
}));

// Mock firebase
vi.mock('../firebase.js', () => ({
  getFirestoreDb: vi.fn(),
  getCollectionName: vi.fn((name: string) => name),
}));

// Mock firebase-functions/logger
vi.mock('firebase-functions/logger', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

import { buildTodayCoachContext } from './today-coach-data.service.js';

describe('Today Coach Data Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-10T12:00:00.000Z'));

    // Set up default mock return values for parallel fetches
    mockRecoveryService.getRecoveryHistory.mockResolvedValue([]);
    mockRecoveryService.getWeightHistory.mockResolvedValue([]);
    mockRecoveryService.getHRVHistory.mockResolvedValue([]);
    mockRecoveryService.getRHRHistory.mockResolvedValue([]);

    mockCyclingService.getCurrentFTP.mockResolvedValue(null);
    mockCyclingService.getCurrentTrainingBlock.mockResolvedValue(null);
    mockCyclingService.getCyclingActivities.mockResolvedValue([]);
    mockCyclingService.getLatestVO2Max.mockResolvedValue(null);
    mockCyclingService.getVO2MaxHistory.mockResolvedValue([]);
    mockCyclingService.getWeightGoal.mockResolvedValue(null);

    mockWorkoutRepo.findByDate.mockResolvedValue([]);
    mockWorkoutRepo.findByCompletedAtRange.mockResolvedValue([]);
    mockPlanDayRepo.findById.mockResolvedValue(null);
    mockWorkoutSetRepo.findByWorkoutId.mockResolvedValue([]);

    mockStretchSessionRepo.findLatest.mockResolvedValue(null);
    mockStretchSessionRepo.findInDateRange.mockResolvedValue([]);

    mockMeditationSessionRepo.findLatest.mockResolvedValue(null);
    mockMeditationSessionRepo.findInDateRange.mockResolvedValue([]);

    mockLiftingContextService.buildLiftingContext.mockResolvedValue([]);
    mockLiftingContextService.buildLiftingSchedule.mockResolvedValue({ nextWorkoutDay: null, daysPerWeek: 0 });
    mockLiftingContextService.buildMesocycleContext.mockResolvedValue(null);

    mockTrainingLoadService.calculateTrainingLoadMetrics.mockReturnValue({ atl: 0, ctl: 0, tsb: 0 });
    mockTrainingLoadService.getWeekInBlock.mockReturnValue(1);
    mockTrainingLoadService.determineNextSession.mockReturnValue(null);
    mockTrainingLoadService.getWeekBoundaries.mockReturnValue({ start: '2024-01-14', end: '2024-01-20' });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('buildTodayCoachContext', () => {
    const testRecovery = {
      date: '2024-01-15',
      hrvMs: 55,
      hrvVsBaseline: 5,
      rhrBpm: 58,
      rhrVsBaseline: -2,
      sleepHours: 7.5,
      sleepEfficiency: 92,
      deepSleepPercent: 22,
      score: 75,
      state: 'ready' as const,
    };

    it('should return a fully populated TodayCoachRequest', async () => {
      const result = await buildTodayCoachContext('test-user', testRecovery, 300);

      expect(result).toBeDefined();
      expect(result.recovery).toEqual(testRecovery);
      expect(result.currentDate).toBeDefined();
      expect(result.timeContext).toBeDefined();
      expect(result.timeContext.timeOfDay).toBeDefined();
      expect(result.completedActivities).toBeDefined();
    });

    it('should set cycling context to null when no FTP exists', async () => {
      mockCyclingService.getCurrentFTP.mockResolvedValue(null);

      const result = await buildTodayCoachContext('test-user', testRecovery, 300);

      expect(result.cyclingContext).toBeNull();
    });

    it('should set todaysWorkout to null when no workout is scheduled', async () => {
      mockWorkoutRepo.findByDate.mockResolvedValue([]);
      mockWorkoutRepo.findByCompletedAtRange.mockResolvedValue([]);

      const result = await buildTodayCoachContext('test-user', testRecovery, 300);

      expect(result.todaysWorkout).toBeNull();
    });

    it('should include stretching context with defaults when no sessions exist', async () => {
      const result = await buildTodayCoachContext('test-user', testRecovery, 300);

      expect(result.stretchingContext).toBeDefined();
      expect(result.stretchingContext.sessionsThisWeek).toBe(0);
      expect(result.stretchingContext.lastSessionDate).toBeNull();
    });

    it('should include meditation context with defaults when no sessions exist', async () => {
      const result = await buildTodayCoachContext('test-user', testRecovery, 300);

      expect(result.meditationContext).toBeDefined();
      expect(result.meditationContext.currentStreak).toBe(0);
      expect(result.meditationContext.sessionsThisWeek).toBe(0);
    });

    it('should set weightMetrics to null when no weight data exists', async () => {
      const result = await buildTodayCoachContext('test-user', testRecovery, 300);

      expect(result.weightMetrics).toBeNull();
    });

    it('should call recovery service with correct user ID', async () => {
      await buildTodayCoachContext('custom-user-id', testRecovery, 300);

      expect(mockRecoveryService.getRecoveryHistory).toHaveBeenCalledWith('custom-user-id', 7);
      expect(mockRecoveryService.getWeightHistory).toHaveBeenCalledWith('custom-user-id', 30);
    });

    it.each([
      { timezoneOffset: 420, expectedTimeOfDay: 'early_morning', expectedHour: 5 },
      { timezoneOffset: 240, expectedTimeOfDay: 'morning', expectedHour: 8 },
      { timezoneOffset: 60, expectedTimeOfDay: 'midday', expectedHour: 11 },
      { timezoneOffset: -120, expectedTimeOfDay: 'afternoon', expectedHour: 14 },
      { timezoneOffset: -300, expectedTimeOfDay: 'evening', expectedHour: 17 },
      { timezoneOffset: -660, expectedTimeOfDay: 'night', expectedHour: 23 },
    ])('should compute time context for $expectedTimeOfDay', async ({ timezoneOffset, expectedTimeOfDay, expectedHour }) => {
      const result = await buildTodayCoachContext('test-user', testRecovery, timezoneOffset);

      expect(result.timeContext.timeOfDay).toBe(expectedTimeOfDay);
      expect(result.timeContext.currentHour).toBe(expectedHour);
    });

    it('should build scheduled workout context with plan day and unique exercise count', async () => {
      mockWorkoutRepo.findByDate.mockResolvedValue([
        {
          id: 'workout-1',
          mesocycle_id: 'meso-1',
          plan_day_id: 'plan-day-1',
          week_number: 7,
          scheduled_date: '2026-02-10',
          status: 'pending',
          started_at: null,
          completed_at: null,
        },
      ]);
      mockPlanDayRepo.findById.mockResolvedValue({ id: 'plan-day-1', name: 'Leg Day' });
      mockWorkoutSetRepo.findByWorkoutId.mockResolvedValue([
        { id: 'set-1', exercise_id: 'sq' },
        { id: 'set-2', exercise_id: 'sq' },
        { id: 'set-3', exercise_id: 'rdl' },
      ]);

      const result = await buildTodayCoachContext('test-user', testRecovery, 0);

      expect(result.todaysWorkout).toEqual({
        planDayName: 'Leg Day',
        weekNumber: 7,
        isDeload: true,
        exerciseCount: 2,
        status: 'pending',
        completedAt: null,
      });
    });

    it('should fallback to completed-today workout when no pending workout is scheduled', async () => {
      mockWorkoutRepo.findByDate.mockResolvedValue([]);
      mockWorkoutRepo.findByCompletedAtRange.mockResolvedValueOnce([
        {
          id: 'workout-2',
          mesocycle_id: 'meso-1',
          plan_day_id: 'plan-day-2',
          week_number: 4,
          scheduled_date: '2026-02-08',
          status: 'completed',
          started_at: '2026-02-10T08:00:00.000Z',
          completed_at: '2026-02-10T08:45:00.000Z',
        },
      ]);
      mockPlanDayRepo.findById.mockResolvedValue({ id: 'plan-day-2', name: 'Upper Day' });
      mockWorkoutSetRepo.findByWorkoutId.mockResolvedValue([{ id: 'set-1', exercise_id: 'ohp' }]);

      const result = await buildTodayCoachContext('test-user', testRecovery, 0);

      expect(result.todaysWorkout?.status).toBe('completed');
      expect(result.completedActivities.hasLiftedToday).toBe(true);
      expect(result.completedActivities.liftedAt).toBe('2026-02-10T08:45:00.000Z');
    });

    it('should fallback to yesterday completion and default plan-day label', async () => {
      mockWorkoutRepo.findByDate.mockResolvedValue([]);
      mockWorkoutRepo.findByCompletedAtRange
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            id: 'workout-3',
            mesocycle_id: 'meso-1',
            plan_day_id: '',
            week_number: 2,
            scheduled_date: '2026-02-09',
            status: 'completed',
            started_at: '2026-02-09T07:00:00.000Z',
            completed_at: '2026-02-09T07:40:00.000Z',
          },
        ]);

      const result = await buildTodayCoachContext('test-user', testRecovery, 0);

      expect(mockWorkoutRepo.findByCompletedAtRange).toHaveBeenCalledTimes(2);
      expect(result.todaysWorkout?.planDayName).toBe('Workout');
      expect(result.todaysWorkout?.status).toBe('completed');
    });

    it('should compute weight metrics from goal when no weight history exists', async () => {
      mockRecoveryService.getWeightHistory.mockResolvedValue([]);
      mockCyclingService.getWeightGoal.mockResolvedValue({
        userId: 'test-user',
        targetWeightLbs: 175,
        targetDate: '2026-07-01',
        startWeightLbs: 190,
        startDate: '2026-01-01',
      });

      const result = await buildTodayCoachContext('test-user', testRecovery, 0);

      expect(result.weightMetrics).toEqual({
        currentLbs: 0,
        trend7DayLbs: 0,
        trend30DayLbs: 0,
        goal: {
          userId: 'test-user',
          targetWeightLbs: 175,
          targetDate: '2026-07-01',
          startWeightLbs: 190,
          startDate: '2026-01-01',
        },
      });
    });

    it('should build rich cycling context including stream, EF trend, and VO2 max data', async () => {
      mockCyclingService.getCurrentFTP.mockResolvedValue({ value: 250, date: '2025-12-15' });
      mockCyclingService.getCurrentTrainingBlock.mockResolvedValue({
        id: 'block-1',
        startDate: '2026-01-06',
        weeklySessions: [{ order: 2, sessionType: 'threshold', description: 'Threshold day' }],
      });
      mockCyclingService.getCyclingActivities.mockResolvedValue([
        {
          id: 'ride-recent',
          stravaId: 1,
          userId: 'test-user',
          date: '2026-02-10T08:00:00.000Z',
          durationMinutes: 45,
          avgPower: 210,
          normalizedPower: 220,
          maxPower: 450,
          avgHeartRate: 150,
          maxHeartRate: 175,
          tss: 70,
          intensityFactor: 0.88,
          type: 'threshold',
          source: 'strava',
          ef: 1.5,
          hrCompleteness: 92,
          createdAt: '2026-02-10T09:00:00.000Z',
        },
        {
          id: 'ride-2',
          stravaId: 2,
          userId: 'test-user',
          date: '2026-02-05T08:00:00.000Z',
          durationMinutes: 40,
          avgPower: 200,
          normalizedPower: 205,
          maxPower: 430,
          avgHeartRate: 148,
          maxHeartRate: 172,
          tss: 60,
          intensityFactor: 0.84,
          type: 'threshold',
          source: 'strava',
          ef: 1.45,
          createdAt: '2026-02-05T09:00:00.000Z',
        },
        {
          id: 'ride-3',
          stravaId: 3,
          userId: 'test-user',
          date: '2026-02-03T08:00:00.000Z',
          durationMinutes: 35,
          avgPower: 190,
          normalizedPower: 195,
          maxPower: 420,
          avgHeartRate: 146,
          maxHeartRate: 170,
          tss: 55,
          intensityFactor: 0.82,
          type: 'threshold',
          source: 'strava',
          ef: 1.4,
          createdAt: '2026-02-03T09:00:00.000Z',
        },
        {
          id: 'ride-old-1',
          stravaId: 4,
          userId: 'test-user',
          date: '2025-12-22T08:00:00.000Z',
          durationMinutes: 45,
          avgPower: 175,
          normalizedPower: 180,
          maxPower: 380,
          avgHeartRate: 150,
          maxHeartRate: 171,
          tss: 50,
          intensityFactor: 0.76,
          type: 'threshold',
          source: 'strava',
          ef: 1.1,
          createdAt: '2025-12-22T09:00:00.000Z',
        },
        {
          id: 'ride-old-2',
          stravaId: 5,
          userId: 'test-user',
          date: '2025-12-18T08:00:00.000Z',
          durationMinutes: 50,
          avgPower: 170,
          normalizedPower: 175,
          maxPower: 360,
          avgHeartRate: 150,
          maxHeartRate: 170,
          tss: 45,
          intensityFactor: 0.72,
          type: 'threshold',
          source: 'strava',
          ef: 1.05,
          createdAt: '2025-12-18T09:00:00.000Z',
        },
      ]);
      mockTrainingLoadService.calculateTrainingLoadMetrics.mockReturnValue({ atl: 52, ctl: 48, tsb: -4 });
      mockTrainingLoadService.getWeekInBlock.mockReturnValue(6);
      mockTrainingLoadService.getWeekBoundaries.mockReturnValue({ start: '2026-02-08', end: '2026-02-14' });
      mockTrainingLoadService.determineNextSession.mockReturnValue({
        order: 2,
        sessionType: 'threshold',
        description: 'Threshold day',
      });
      mockCyclingService.getLatestVO2Max.mockResolvedValue({
        value: 52.4,
        date: '2026-02-01',
        method: 'ftp_derived',
      });
      mockCyclingService.getVO2MaxHistory.mockResolvedValue([
        { date: '2026-02-01', value: 52.4 },
        { date: '2026-01-10', value: 51.8 },
      ]);
      mockCyclingService.getActivityStreams.mockResolvedValue({
        activityId: 'ride-recent',
        stravaActivityId: 1,
        watts: Array.from({ length: 1300 }, (_v, i) => (i % 180) + 140),
        heartrate: Array.from({ length: 1300 }, () => 152),
        cadence: Array.from({ length: 1300 }, (_v, i) => (i % 5 === 0 ? 0 : 90)),
        time: Array.from({ length: 1300 }, (_v, i) => i),
        sampleCount: 1300,
        createdAt: '2026-02-10T10:00:00.000Z',
      });

      const result = await buildTodayCoachContext('test-user', testRecovery, 0);

      expect(result.cyclingContext).not.toBeNull();
      expect(result.cyclingContext?.weekInBlock).toBe(6);
      expect(result.cyclingContext?.nextSession).toEqual({
        type: 'threshold',
        description: 'Threshold day',
      });
      expect(result.cyclingContext?.vo2max?.current).toBe(52.4);
      expect(result.cyclingContext?.efTrend?.trend).toBe('improving');
      expect(result.cyclingContext?.lastRideStreams).not.toBeNull();
      expect(result.cyclingContext?.lastRideStreams?.peak5MinPower).not.toBeNull();
      expect(result.cyclingContext?.lastRideStreams?.peak20MinPower).not.toBeNull();
      expect(result.cyclingContext?.lastRideStreams?.avgCadence).toBe(90);
    });

    it('should leave stream summary null when power stream data is unavailable', async () => {
      mockCyclingService.getCurrentFTP.mockResolvedValue({ value: 250, date: '2026-02-01' });
      mockCyclingService.getCyclingActivities.mockResolvedValue([
        {
          id: 'ride-recent',
          stravaId: 1,
          userId: 'test-user',
          date: '2026-02-10T07:00:00.000Z',
          durationMinutes: 30,
          avgPower: 180,
          normalizedPower: 185,
          maxPower: 300,
          avgHeartRate: 140,
          maxHeartRate: 165,
          tss: 40,
          intensityFactor: 0.72,
          type: 'recovery',
          source: 'strava',
          createdAt: '2026-02-10T08:00:00.000Z',
        },
      ]);
      mockCyclingService.getActivityStreams.mockResolvedValue({
        activityId: 'ride-recent',
        stravaActivityId: 1,
        sampleCount: 10,
        createdAt: '2026-02-10T08:01:00.000Z',
      });

      const result = await buildTodayCoachContext('test-user', testRecovery, 0);

      expect(result.cyclingContext?.lastRideStreams).toBeNull();
    });

    it('should compute stretching and meditation contexts with region extraction and streak', async () => {
      mockStretchSessionRepo.findLatest.mockResolvedValue({
        id: 'stretch-1',
        completedAt: '2026-02-08T07:00:00.000Z',
        totalDurationSeconds: 600,
        regionsCompleted: 2,
        regionsSkipped: 0,
        stretches: [
          { region: 'hamstrings', stretchId: 'h-1', stretchName: 'Hamstring', durationSeconds: 60, skippedSegments: 0 },
          { region: 'hamstrings', stretchId: 'h-2', stretchName: 'Hamstring 2', durationSeconds: 60, skippedSegments: 0 },
          { region: 'hips', stretchId: 'hip-1', stretchName: 'Hip', durationSeconds: 60, skippedSegments: 0 },
        ],
      });
      mockStretchSessionRepo.findInDateRange
        .mockResolvedValueOnce([{ completedAt: '2026-02-08T07:00:00.000Z' }])
        .mockResolvedValueOnce([{ completedAt: '2026-02-10T06:50:00.000Z' }]);

      mockMeditationSessionRepo.findLatest.mockResolvedValue({
        id: 'med-1',
        completedAt: '2026-02-10T06:00:00.000Z',
        sessionType: 'basic-breathing',
        plannedDurationSeconds: 600,
        actualDurationSeconds: 600,
        completedFully: true,
      });
      mockMeditationSessionRepo.findInDateRange
        .mockResolvedValueOnce([
          {
            id: 'med-week-1',
            completedAt: '2026-02-10T06:00:00.000Z',
            sessionType: 'basic-breathing',
            plannedDurationSeconds: 600,
            actualDurationSeconds: 600,
            completedFully: true,
          },
          {
            id: 'med-week-2',
            completedAt: '2026-02-09T06:00:00.000Z',
            sessionType: 'basic-breathing',
            plannedDurationSeconds: 300,
            actualDurationSeconds: 300,
            completedFully: true,
          },
        ])
        .mockResolvedValueOnce([
          {
            id: 'streak-1',
            completedAt: '2026-02-10T06:00:00.000Z',
            sessionType: 'basic-breathing',
            plannedDurationSeconds: 600,
            actualDurationSeconds: 600,
            completedFully: true,
          },
          {
            id: 'streak-2',
            completedAt: '2026-02-09T06:00:00.000Z',
            sessionType: 'basic-breathing',
            plannedDurationSeconds: 600,
            actualDurationSeconds: 600,
            completedFully: true,
          },
          {
            id: 'streak-3',
            completedAt: '2026-02-08T06:00:00.000Z',
            sessionType: 'basic-breathing',
            plannedDurationSeconds: 600,
            actualDurationSeconds: 600,
            completedFully: true,
          },
          {
            id: 'streak-break',
            completedAt: '2026-02-06T06:00:00.000Z',
            sessionType: 'basic-breathing',
            plannedDurationSeconds: 600,
            actualDurationSeconds: 600,
            completedFully: true,
          },
        ])
        .mockResolvedValueOnce([{ completedAt: '2026-02-10T06:00:00.000Z' }]);

      const result = await buildTodayCoachContext('test-user', testRecovery, 0);

      expect(result.stretchingContext.daysSinceLastSession).toBe(2);
      expect(new Set(result.stretchingContext.lastRegions)).toEqual(new Set(['hamstrings', 'hips']));
      expect(result.completedActivities.hasStretchedToday).toBe(true);
      expect(result.meditationContext.totalMinutesThisWeek).toBe(15);
      expect(result.meditationContext.currentStreak).toBe(3);
      expect(result.completedActivities.hasMeditatedToday).toBe(true);
    });

    it('should compute health trends and include mapped recovery history entries', async () => {
      mockRecoveryService.getRecoveryHistory.mockResolvedValue([
        {
          date: '2026-02-10',
          score: 78,
          state: 'ready',
          hrvMs: 62,
          rhrBpm: 52,
          sleepHours: 7.9,
        },
      ]);
      mockRecoveryService.getHRVHistory.mockResolvedValue([
        { id: 'h1', date: '2026-02-10', avgMs: 70 },
        { id: 'h2', date: '2026-02-09', avgMs: 70 },
        { id: 'h3', date: '2026-02-08', avgMs: 70 },
        { id: 'h4', date: '2026-02-07', avgMs: 70 },
        { id: 'h5', date: '2026-02-06', avgMs: 70 },
        { id: 'h6', date: '2026-02-05', avgMs: 70 },
        { id: 'h7', date: '2026-02-04', avgMs: 70 },
        { id: 'h8', date: '2026-02-03', avgMs: 40 },
      ]);
      mockRecoveryService.getRHRHistory.mockResolvedValue([
        { id: 'r1', date: '2026-02-10', avgBpm: 50 },
        { id: 'r2', date: '2026-02-09', avgBpm: 50 },
        { id: 'r3', date: '2026-02-08', avgBpm: 50 },
        { id: 'r4', date: '2026-02-07', avgBpm: 50 },
        { id: 'r5', date: '2026-02-06', avgBpm: 50 },
        { id: 'r6', date: '2026-02-05', avgBpm: 50 },
        { id: 'r7', date: '2026-02-04', avgBpm: 50 },
        { id: 'r8', date: '2026-02-03', avgBpm: 80 },
      ]);

      const result = await buildTodayCoachContext('test-user', testRecovery, 0);

      expect(result.recoveryHistory).toEqual([
        {
          date: '2026-02-10',
          score: 78,
          state: 'ready',
          hrvMs: 62,
          rhrBpm: 52,
          sleepHours: 7.9,
        },
      ]);
      expect(result.healthTrends?.hrvTrend).toBe('rising');
      expect(result.healthTrends?.rhrTrend).toBe('declining');
    });

    it('should handle partial health history when one metric stream is unavailable', async () => {
      mockRecoveryService.getHRVHistory.mockResolvedValue([]);
      mockRecoveryService.getRHRHistory.mockResolvedValue([
        { id: 'r1', date: '2026-02-10', avgBpm: 56 },
        { id: 'r2', date: '2026-02-09', avgBpm: 57 },
      ]);

      const result = await buildTodayCoachContext('test-user', testRecovery, 0);

      expect(result.healthTrends).toEqual({
        hrv7DayAvgMs: null,
        hrv30DayAvgMs: null,
        hrvTrend: null,
        rhr7DayAvgBpm: 56.5,
        rhr30DayAvgBpm: 56.5,
        rhrTrend: 'stable',
      });
    });
  });
});
