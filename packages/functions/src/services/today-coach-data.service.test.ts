import { describe, it, expect, vi, beforeEach } from 'vitest';

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
  });
});
