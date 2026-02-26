import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import type {
  CalendarActivity,
  CyclingActivity,
  CyclingActivitySummary,
  WorkoutActivitySummary,
} from '../types/calendar.js';
import { CalendarService, utcToLocalDate, compareCalendarActivities } from './calendar.service.js';
import { WorkoutRepository } from '../repositories/workout.repository.js';
import { WorkoutSetRepository } from '../repositories/workout-set.repository.js';
import { PlanDayRepository } from '../repositories/plan-day.repository.js';
import { StretchSessionRepository } from '../repositories/stretchSession.repository.js';
import { MeditationSessionRepository } from '../repositories/meditationSession.repository.js';
import {
  createMockMeditationSessionRepository,
  createMockPlanDayRepository,
  createMockStretchSessionRepository,
  createMockWorkoutRepository,
  createMockWorkoutSetRepository,
} from '../__tests__/utils/mock-repository.js';
import { createWorkout, createWorkoutSet, createStretchSession, createMeditationSession, createPlanDay } from '../__tests__/utils/index.js';

const mockCyclingService = {
  getCyclingActivities: vi.fn(),
};

vi.mock('../services/firestore-cycling.service.js', () => ({
  getCyclingActivities: (...args: unknown[]): unknown => mockCyclingService.getCyclingActivities(...args),
}));

// Mock repositories
vi.mock('../repositories/workout.repository.js');
vi.mock('../repositories/workout-set.repository.js');
vi.mock('../repositories/plan-day.repository.js');
vi.mock('../repositories/stretchSession.repository.js');
vi.mock('../repositories/meditationSession.repository.js');

// Helper function for creating test activities
function createTestActivity(overrides: Partial<CalendarActivity> = {}): CalendarActivity {
  return {
    id: 'test-activity-1',
    type: 'workout',
    date: '2024-01-15',
    completedAt: '2024-01-15T10:00:00Z',
    summary: {},
    ...overrides,
  };
}

describe('CalendarService', () => {
  let service: CalendarService;
  let mockWorkoutRepo: ReturnType<typeof createMockWorkoutRepository>;
  let mockWorkoutSetRepo: ReturnType<typeof createMockWorkoutSetRepository>;
  let mockPlanDayRepo: ReturnType<typeof createMockPlanDayRepository>;
  let mockStretchSessionRepo: ReturnType<typeof createMockStretchSessionRepository>;
  let mockMeditationSessionRepo: ReturnType<typeof createMockMeditationSessionRepository>;
  let mockCyclingRepo: {
    getCyclingActivities: Mock;
  };

  // Shared default overrides matching original inline factory defaults
  const workoutDefaults = {
    id: 'workout-1',
    mesocycle_id: 'meso-1',
    plan_day_id: 'plan-day-1',
    week_number: 1,
    scheduled_date: '2024-01-15',
    status: 'completed' as const,
    started_at: '2024-01-15T10:00:00Z',
    completed_at: '2024-01-15T11:00:00Z',
  };

  const workoutSetDefaults = {
    id: 'set-1',
    workout_id: 'workout-1',
    exercise_id: 'exercise-1',
    set_number: 1,
    target_reps: 8,
    target_weight: 100,
    actual_reps: 8,
    actual_weight: 100,
    status: 'completed' as const,
  };

  const stretchSessionDefaults = {
    id: 'stretch-1',
    completedAt: '2024-01-15T14:00:00Z',
    totalDurationSeconds: 600,
    regionsCompleted: 5,
    regionsSkipped: 1,
    stretches: [] as [],
  };

  const meditationSessionDefaults = {
    id: 'meditation-1',
    completedAt: '2024-01-15T07:00:00Z',
    sessionType: 'basic-breathing' as const,
    plannedDurationSeconds: 600,
    actualDurationSeconds: 600,
    completedFully: true,
  };

  const cyclingActivityDefaults: CyclingActivity = {
    id: 'cycling-activity-1',
    stravaId: 12345,
    userId: 'default-user',
    date: '2024-01-15T12:00:00Z',
    durationMinutes: 52,
    avgPower: 230,
    normalizedPower: 245,
    maxPower: 310,
    avgHeartRate: 145,
    maxHeartRate: 170,
    tss: 67,
    intensityFactor: 0.78,
    type: 'threshold',
    source: 'strava',
    createdAt: '2024-01-15T12:05:00Z',
  };

  // Fixtures
  const mockPlanDay = createPlanDay({
    id: 'plan-day-1',
    plan_id: 'plan-1',
    day_of_week: 1,
    name: 'Push Day',
    sort_order: 0,
  });

  beforeEach(() => {
    vi.clearAllMocks();

    mockWorkoutRepo = createMockWorkoutRepository();
    mockWorkoutSetRepo = createMockWorkoutSetRepository();
    mockPlanDayRepo = createMockPlanDayRepository();
    mockStretchSessionRepo = createMockStretchSessionRepository();
    mockMeditationSessionRepo = createMockMeditationSessionRepository();

    mockCyclingRepo = {
      getCyclingActivities: vi.fn(),
    };
    mockCyclingService.getCyclingActivities = mockCyclingRepo.getCyclingActivities;

    vi.mocked(WorkoutRepository).mockImplementation(() => mockWorkoutRepo as unknown as WorkoutRepository);
    vi.mocked(WorkoutSetRepository).mockImplementation(() => mockWorkoutSetRepo as unknown as WorkoutSetRepository);
    vi.mocked(PlanDayRepository).mockImplementation(() => mockPlanDayRepo as unknown as PlanDayRepository);
    vi.mocked(StretchSessionRepository).mockImplementation(() => mockStretchSessionRepo as unknown as StretchSessionRepository);
    vi.mocked(MeditationSessionRepository).mockImplementation(() => mockMeditationSessionRepo as unknown as MeditationSessionRepository);

    service = new CalendarService({} as Firestore);
    mockCyclingRepo.getCyclingActivities.mockResolvedValue([]);
  });

  describe('utcToLocalDate', () => {
    it('should handle positive timezone offset (east of UTC)', () => {
      // UTC midnight, +9 hours (Japan)
      const result = utcToLocalDate('2024-01-15T00:00:00Z', 540);
      // 00:00 UTC + 9 hours = 09:00 local, same day
      expect(result).toBe('2024-01-15');
    });

    it('should handle negative timezone offset (west of UTC)', () => {
      // UTC 03:00, -5 hours (EST)
      const result = utcToLocalDate('2024-01-15T03:00:00Z', -300);
      // 03:00 UTC - 5 hours = 22:00 previous day local
      expect(result).toBe('2024-01-14');
    });

    it('should handle zero timezone offset (UTC)', () => {
      const result = utcToLocalDate('2024-01-15T12:00:00Z', 0);
      expect(result).toBe('2024-01-15');
    });

    it('should handle date boundary crossing forward', () => {
      // UTC 20:00, +5 hours
      const result = utcToLocalDate('2024-01-15T20:00:00Z', 300);
      // 20:00 UTC + 5 hours = 01:00 next day
      expect(result).toBe('2024-01-16');
    });

    it('should handle date boundary crossing backward', () => {
      // UTC 02:00, -4 hours
      const result = utcToLocalDate('2024-01-15T02:00:00Z', -240);
      // 02:00 UTC - 4 hours = 22:00 previous day
      expect(result).toBe('2024-01-14');
    });

    it('should handle month boundary', () => {
      // Last day of January, crossing to February
      const result = utcToLocalDate('2024-01-31T23:00:00Z', 120);
      expect(result).toBe('2024-02-01');
    });

    it('should handle year boundary', () => {
      // Last day of December, crossing to new year
      const result = utcToLocalDate('2024-12-31T23:00:00Z', 120);
      expect(result).toBe('2025-01-01');
    });

    it('should format single digit months and days with leading zeros', () => {
      const result = utcToLocalDate('2024-01-05T12:00:00Z', 0);
      expect(result).toBe('2024-01-05');
    });

    it('should handle backward year boundary', () => {
      // Jan 1 at 02:00 UTC, -5 hours (EST) → Dec 31 previous year at 21:00
      const result = utcToLocalDate('2025-01-01T02:00:00Z', -300);
      expect(result).toBe('2024-12-31');
    });

    it('should handle fractional timezone offset (UTC+5:30)', () => {
      // 18:45 UTC + 5:30 = 00:15 next day in India (IST)
      const result = utcToLocalDate('2024-06-15T18:45:00Z', 330);
      expect(result).toBe('2024-06-16');
    });

    it('should handle extreme timezone offsets (UTC+14)', () => {
      // 11:00 UTC + 14 hours = 01:00 next day (Line Islands)
      const result = utcToLocalDate('2024-03-15T11:00:00Z', 840);
      expect(result).toBe('2024-03-16');
    });
  });

  describe('compareCalendarActivities', () => {
    it('should sort by completedAt ascending (null as empty string)', () => {
      const a1 = createTestActivity({ id: 'a1', completedAt: null });
      const a2 = createTestActivity({ id: 'a2', completedAt: '2024-01-15T10:00:00Z' });

      const result = compareCalendarActivities(a1, a2);
      expect(result).toBeLessThan(0); // a1 (null/'') should come before a2
    });

    it('should use id as tie-breaker when completedAt is identical', () => {
      const a1 = createTestActivity({ id: 'activity-1', completedAt: '2024-01-15T10:00:00Z' });
      const a2 = createTestActivity({ id: 'activity-2', completedAt: '2024-01-15T10:00:00Z' });

      const result = compareCalendarActivities(a1, a2);
      expect(result).toBeLessThan(0); // 'activity-1' < 'activity-2'
    });

    it('should return 0 for identical activities', () => {
      const a = createTestActivity({ id: 'same-id', completedAt: '2024-01-15T10:00:00Z' });

      const result = compareCalendarActivities(a, a);
      expect(result).toBe(0);
    });

    it('should maintain deterministic order for multiple activities with same timestamp', () => {
      const activities = [
        createTestActivity({ id: 'c', completedAt: '2024-01-15T10:00:00Z', type: 'workout' }),
        createTestActivity({ id: 'a', completedAt: '2024-01-15T10:00:00Z', type: 'stretch' }),
        createTestActivity({ id: 'b', completedAt: '2024-01-15T10:00:00Z', type: 'meditation' }),
      ];

      const sorted = [...activities].sort(compareCalendarActivities);

      expect(sorted[0]?.id).toBe('a');
      expect(sorted[1]?.id).toBe('b');
      expect(sorted[2]?.id).toBe('c');
    });
  });

  describe('getMonthData', () => {
    it('should return activities grouped by date', async () => {
      const workout = createWorkout(workoutDefaults);
      const sets = [createWorkoutSet(workoutSetDefaults)];
      const stretchSession = createStretchSession(stretchSessionDefaults);
      const meditationSession = createMeditationSession(meditationSessionDefaults);

      mockWorkoutRepo.findCompletedInDateRange.mockResolvedValue([workout]);
      mockWorkoutSetRepo.findByWorkoutId.mockResolvedValue(sets);
      mockPlanDayRepo.findById.mockResolvedValue(mockPlanDay);
      mockStretchSessionRepo.findInDateRange.mockResolvedValue([stretchSession]);
      mockMeditationSessionRepo.findInDateRange.mockResolvedValue([meditationSession]);

      const result = await service.getMonthData(2024, 1);

      expect(result.days['2024-01-15']).toBeDefined();
      expect(result.days['2024-01-15']?.activities).toHaveLength(3);
    });

    it('should include workout activities with summary', async () => {
      const workout = createWorkout({ ...workoutDefaults, week_number: 2 });
      const sets = [
        createWorkoutSet({ ...workoutSetDefaults, exercise_id: 'ex-1', status: 'completed' }),
        createWorkoutSet({ ...workoutSetDefaults, exercise_id: 'ex-1', status: 'completed' }),
        createWorkoutSet({ ...workoutSetDefaults, exercise_id: 'ex-2', status: 'completed' }),
      ];

      mockWorkoutRepo.findCompletedInDateRange.mockResolvedValue([workout]);
      mockWorkoutSetRepo.findByWorkoutId.mockResolvedValue(sets);
      mockPlanDayRepo.findById.mockResolvedValue(mockPlanDay);
      mockStretchSessionRepo.findInDateRange.mockResolvedValue([]);
      mockMeditationSessionRepo.findInDateRange.mockResolvedValue([]);

      const result = await service.getMonthData(2024, 1);

      const workoutActivity = result.days['2024-01-15']?.activities.find(
        (a) => a.type === 'workout'
      );
      expect(workoutActivity?.summary).toEqual(
        expect.objectContaining({
          dayName: 'Push Day',
          exerciseCount: 2,
          setsCompleted: 3,
          totalSets: 3,
          weekNumber: 2,
          isDeload: false,
        })
      );
    });

    it('should include stretch activities with summary', async () => {
      const stretchSession = createStretchSession({
        ...stretchSessionDefaults,
        totalDurationSeconds: 720,
        regionsCompleted: 6,
        regionsSkipped: 2,
      });

      mockWorkoutRepo.findCompletedInDateRange.mockResolvedValue([]);
      mockStretchSessionRepo.findInDateRange.mockResolvedValue([stretchSession]);
      mockMeditationSessionRepo.findInDateRange.mockResolvedValue([]);

      const result = await service.getMonthData(2024, 1);

      const stretchActivity = result.days['2024-01-15']?.activities.find(
        (a) => a.type === 'stretch'
      );
      expect(stretchActivity?.summary).toEqual(
        expect.objectContaining({
          totalDurationSeconds: 720,
          regionsCompleted: 6,
          regionsSkipped: 2,
        })
      );
    });

    it('should include cycling activities in days map', async () => {
      const cyclingActivity: CyclingActivity = { ...cyclingActivityDefaults };

      mockWorkoutRepo.findCompletedInDateRange.mockResolvedValue([]);
      mockStretchSessionRepo.findInDateRange.mockResolvedValue([]);
      mockMeditationSessionRepo.findInDateRange.mockResolvedValue([]);
      mockCyclingRepo.getCyclingActivities.mockResolvedValue([cyclingActivity]);

      const result = await service.getMonthData(2024, 1);

      expect(result.days['2024-01-15']).toBeDefined();
      expect(result.days['2024-01-15']?.activities).toHaveLength(1);
      const cyclingActivityEntry = result.days['2024-01-15']?.activities[0];
      expect(cyclingActivityEntry?.type).toBe('cycling');
      expect(cyclingActivityEntry?.summary).toEqual(
        expect.objectContaining({
          durationMinutes: 52,
          tss: 67,
          cyclingType: 'threshold',
        } as CyclingActivitySummary)
      );
    });

    it('should set hasCycling flag and increment totals when cycling exists', async () => {
      const cyclingActivity: CyclingActivity = {
        ...cyclingActivityDefaults,
        id: 'cycling-1',
      };

      const workout = createWorkout(workoutDefaults);
      const sets = [createWorkoutSet(workoutSetDefaults)];

      mockWorkoutRepo.findCompletedInDateRange.mockResolvedValue([workout]);
      mockWorkoutSetRepo.findByWorkoutId.mockResolvedValue(sets);
      mockPlanDayRepo.findById.mockResolvedValue(mockPlanDay);
      mockStretchSessionRepo.findInDateRange.mockResolvedValue([]);
      mockMeditationSessionRepo.findInDateRange.mockResolvedValue([]);
      mockCyclingRepo.getCyclingActivities.mockResolvedValue([cyclingActivity]);

      const result = await service.getMonthData(2024, 1);

      const summary = result.days['2024-01-15']?.summary;
      expect(summary?.hasCycling).toBe(true);
      expect(summary?.totalActivities).toBe(2);
      expect(summary?.completedActivities).toBe(2);
    });

    it('should prefix cycling activity IDs with cycling-', async () => {
      const cyclingActivity: CyclingActivity = {
        ...cyclingActivityDefaults,
        id: 'strava-id-123',
      };

      mockWorkoutRepo.findCompletedInDateRange.mockResolvedValue([]);
      mockStretchSessionRepo.findInDateRange.mockResolvedValue([]);
      mockMeditationSessionRepo.findInDateRange.mockResolvedValue([]);
      mockCyclingRepo.getCyclingActivities.mockResolvedValue([cyclingActivity]);

      const result = await service.getMonthData(2024, 1);

      const activity = result.days['2024-01-15']?.activities[0];
      expect(activity?.id).toBe('cycling-strava-id-123');
    });

    it('should convert cycling UTC timestamp to local day using timezone offset', async () => {
      const cyclingActivity: CyclingActivity = {
        ...cyclingActivityDefaults,
        date: '2024-01-15T03:00:00Z',
      };

      mockWorkoutRepo.findCompletedInDateRange.mockResolvedValue([]);
      mockStretchSessionRepo.findInDateRange.mockResolvedValue([]);
      mockMeditationSessionRepo.findInDateRange.mockResolvedValue([]);
      mockCyclingRepo.getCyclingActivities.mockResolvedValue([cyclingActivity]);

      const result = await service.getMonthData(2024, 1, -300);

      expect(result.days['2024-01-14']).toBeDefined();
      expect(result.days['2024-01-15']).toBeUndefined();
    });

    it('should call getCyclingActivities with default user', async () => {
      mockWorkoutRepo.findCompletedInDateRange.mockResolvedValue([]);
      mockStretchSessionRepo.findInDateRange.mockResolvedValue([]);
      mockMeditationSessionRepo.findInDateRange.mockResolvedValue([]);
      mockCyclingRepo.getCyclingActivities.mockResolvedValue([]);

      await service.getMonthData(2024, 1);

      expect(mockCyclingRepo.getCyclingActivities).toHaveBeenCalledWith('default-user');
    });

    it('should include meditation activities with summary', async () => {
      const meditationSession = createMeditationSession({
        ...meditationSessionDefaults,
        sessionType: 'body-scan',
        actualDurationSeconds: 1200,
      });

      mockWorkoutRepo.findCompletedInDateRange.mockResolvedValue([]);
      mockStretchSessionRepo.findInDateRange.mockResolvedValue([]);
      mockMeditationSessionRepo.findInDateRange.mockResolvedValue([meditationSession]);

      const result = await service.getMonthData(2024, 1);

      const meditationActivity = result.days['2024-01-15']?.activities.find(
        (a) => a.type === 'meditation'
      );
      expect(meditationActivity?.summary).toEqual(
        expect.objectContaining({
          durationSeconds: 1200,
          meditationType: 'body-scan',
        })
      );
    });

    it('should include all activity types in day summary', async () => {
      const workout = createWorkout(workoutDefaults);
      const sets = [createWorkoutSet(workoutSetDefaults)];
      const stretchSession = createStretchSession(stretchSessionDefaults);
      const meditationSession = createMeditationSession(meditationSessionDefaults);

      mockWorkoutRepo.findCompletedInDateRange.mockResolvedValue([workout]);
      mockWorkoutSetRepo.findByWorkoutId.mockResolvedValue(sets);
      mockPlanDayRepo.findById.mockResolvedValue(mockPlanDay);
      mockStretchSessionRepo.findInDateRange.mockResolvedValue([stretchSession]);
      mockMeditationSessionRepo.findInDateRange.mockResolvedValue([meditationSession]);

      const result = await service.getMonthData(2024, 1);

      const daySummary = result.days['2024-01-15']?.summary;
      expect(daySummary?.hasWorkout).toBe(true);
      expect(daySummary?.hasStretch).toBe(true);
      expect(daySummary?.hasMeditation).toBe(true);
      expect(daySummary?.totalActivities).toBe(3);
      expect(daySummary?.completedActivities).toBe(3);
    });

    it('should group multiple activities on same date', async () => {
      const workout1 = createWorkout({ ...workoutDefaults, id: 'w1', completed_at: '2024-01-15T09:00:00Z' });
      const workout2 = createWorkout({ ...workoutDefaults, id: 'w2', completed_at: '2024-01-15T17:00:00Z' });
      const sets = [createWorkoutSet(workoutSetDefaults)];

      mockWorkoutRepo.findCompletedInDateRange.mockResolvedValue([workout1, workout2]);
      mockWorkoutSetRepo.findByWorkoutId.mockResolvedValue(sets);
      mockPlanDayRepo.findById.mockResolvedValue(mockPlanDay);
      mockStretchSessionRepo.findInDateRange.mockResolvedValue([]);
      mockMeditationSessionRepo.findInDateRange.mockResolvedValue([]);

      const result = await service.getMonthData(2024, 1);

      expect(result.days['2024-01-15']?.activities).toHaveLength(2);
    });

    it('should sort activities within a day by completion time', async () => {
      const workout = createWorkout({ ...workoutDefaults, completed_at: '2024-01-15T14:00:00Z' });
      const sets = [createWorkoutSet(workoutSetDefaults)];
      const stretchSession = createStretchSession({ ...stretchSessionDefaults, completedAt: '2024-01-15T16:00:00Z' });
      const meditationSession = createMeditationSession({ ...meditationSessionDefaults, completedAt: '2024-01-15T07:00:00Z' });

      mockWorkoutRepo.findCompletedInDateRange.mockResolvedValue([workout]);
      mockWorkoutSetRepo.findByWorkoutId.mockResolvedValue(sets);
      mockPlanDayRepo.findById.mockResolvedValue(mockPlanDay);
      mockStretchSessionRepo.findInDateRange.mockResolvedValue([stretchSession]);
      mockMeditationSessionRepo.findInDateRange.mockResolvedValue([meditationSession]);

      const result = await service.getMonthData(2024, 1);

      const activities = result.days['2024-01-15']?.activities ?? [];
      expect(activities[0]?.type).toBe('meditation');
      expect(activities[1]?.type).toBe('workout');
      expect(activities[2]?.type).toBe('stretch');
    });

    it('should return correct date boundaries for month', async () => {
      mockWorkoutRepo.findCompletedInDateRange.mockResolvedValue([]);
      mockStretchSessionRepo.findInDateRange.mockResolvedValue([]);
      mockMeditationSessionRepo.findInDateRange.mockResolvedValue([]);

      const result = await service.getMonthData(2024, 1);

      expect(result.startDate).toBe('2024-01-01');
      expect(result.endDate).toBe('2024-01-31');
    });

    it('should handle February in leap year', async () => {
      mockWorkoutRepo.findCompletedInDateRange.mockResolvedValue([]);
      mockStretchSessionRepo.findInDateRange.mockResolvedValue([]);
      mockMeditationSessionRepo.findInDateRange.mockResolvedValue([]);

      const result = await service.getMonthData(2024, 2);

      expect(result.startDate).toBe('2024-02-01');
      expect(result.endDate).toBe('2024-02-29');
    });

    it('should handle February in non-leap year', async () => {
      mockWorkoutRepo.findCompletedInDateRange.mockResolvedValue([]);
      mockStretchSessionRepo.findInDateRange.mockResolvedValue([]);
      mockMeditationSessionRepo.findInDateRange.mockResolvedValue([]);

      const result = await service.getMonthData(2023, 2);

      expect(result.startDate).toBe('2023-02-01');
      expect(result.endDate).toBe('2023-02-28');
    });

    it('should handle December correctly', async () => {
      mockWorkoutRepo.findCompletedInDateRange.mockResolvedValue([]);
      mockStretchSessionRepo.findInDateRange.mockResolvedValue([]);
      mockMeditationSessionRepo.findInDateRange.mockResolvedValue([]);

      const result = await service.getMonthData(2024, 12);

      expect(result.startDate).toBe('2024-12-01');
      expect(result.endDate).toBe('2024-12-31');
    });

    it('should use scheduled_date as fallback if completed_at is empty', async () => {
      const workout = createWorkout({
        ...workoutDefaults,
        scheduled_date: '2024-01-20',
        completed_at: '',
      });
      const sets = [createWorkoutSet(workoutSetDefaults)];

      mockWorkoutRepo.findCompletedInDateRange.mockResolvedValue([workout]);
      mockWorkoutSetRepo.findByWorkoutId.mockResolvedValue(sets);
      mockPlanDayRepo.findById.mockResolvedValue(mockPlanDay);
      mockStretchSessionRepo.findInDateRange.mockResolvedValue([]);
      mockMeditationSessionRepo.findInDateRange.mockResolvedValue([]);

      const result = await service.getMonthData(2024, 1);

      expect(result.days['2024-01-20']).toBeDefined();
    });

    it('should return empty days object if no activities', async () => {
      mockWorkoutRepo.findCompletedInDateRange.mockResolvedValue([]);
      mockStretchSessionRepo.findInDateRange.mockResolvedValue([]);
      mockMeditationSessionRepo.findInDateRange.mockResolvedValue([]);

      const result = await service.getMonthData(2024, 1);

      expect(Object.keys(result.days)).toHaveLength(0);
    });

    it('should pass timezone offset to repositories', async () => {
      mockWorkoutRepo.findCompletedInDateRange.mockResolvedValue([]);
      mockStretchSessionRepo.findInDateRange.mockResolvedValue([]);
      mockMeditationSessionRepo.findInDateRange.mockResolvedValue([]);

      await service.getMonthData(2024, 1, -300);

      expect(mockWorkoutRepo.findCompletedInDateRange).toHaveBeenCalledWith(
        '2024-01-01',
        '2024-01-31',
        -300
      );
      expect(mockStretchSessionRepo.findInDateRange).toHaveBeenCalledWith(
        '2024-01-01',
        '2024-01-31',
        -300
      );
      expect(mockMeditationSessionRepo.findInDateRange).toHaveBeenCalledWith(
        '2024-01-01',
        '2024-01-31',
        -300
      );
    });

    it('should mark deload week workouts correctly', async () => {
      const deloadWorkout = createWorkout({ ...workoutDefaults, week_number: 7 });
      const sets = [createWorkoutSet(workoutSetDefaults)];

      mockWorkoutRepo.findCompletedInDateRange.mockResolvedValue([deloadWorkout]);
      mockWorkoutSetRepo.findByWorkoutId.mockResolvedValue(sets);
      mockPlanDayRepo.findById.mockResolvedValue(mockPlanDay);
      mockStretchSessionRepo.findInDateRange.mockResolvedValue([]);
      mockMeditationSessionRepo.findInDateRange.mockResolvedValue([]);

      const result = await service.getMonthData(2024, 1);

      const workoutActivity = result.days['2024-01-15']?.activities.find(
        (a) => a.type === 'workout'
      );
      expect(workoutActivity).toBeDefined();
      const summary = workoutActivity?.summary as WorkoutActivitySummary | undefined;
      expect(summary?.isDeload).toBe(true);
    });

    it('should convert UTC timestamps to local dates using timezone offset', async () => {
      // Activity at UTC 03:00, with -5 hour offset (EST)
      // Should appear on previous day
      const stretchSession = createStretchSession({
        ...stretchSessionDefaults,
        completedAt: '2024-01-15T03:00:00Z',
      });

      mockWorkoutRepo.findCompletedInDateRange.mockResolvedValue([]);
      mockStretchSessionRepo.findInDateRange.mockResolvedValue([stretchSession]);
      mockMeditationSessionRepo.findInDateRange.mockResolvedValue([]);

      const result = await service.getMonthData(2024, 1, -300);

      // 03:00 UTC - 5 hours = 22:00 on 2024-01-14
      expect(result.days['2024-01-14']).toBeDefined();
      expect(result.days['2024-01-15']).toBeUndefined();
    });

    it('should handle plan day not found gracefully', async () => {
      const workout = createWorkout(workoutDefaults);
      const sets = [createWorkoutSet(workoutSetDefaults)];

      mockWorkoutRepo.findCompletedInDateRange.mockResolvedValue([workout]);
      mockWorkoutSetRepo.findByWorkoutId.mockResolvedValue(sets);
      mockPlanDayRepo.findById.mockResolvedValue(null);
      mockStretchSessionRepo.findInDateRange.mockResolvedValue([]);
      mockMeditationSessionRepo.findInDateRange.mockResolvedValue([]);

      const result = await service.getMonthData(2024, 1);

      const workoutActivity = result.days['2024-01-15']?.activities.find(
        (a) => a.type === 'workout'
      );
      expect(workoutActivity).toBeDefined();
      const summary = workoutActivity?.summary as WorkoutActivitySummary | undefined;
      expect(summary?.dayName).toBe('Unknown');
    });

    it('should use scheduled_date as fallback if completed_at is null', async () => {
      const workout = createWorkout({
        ...workoutDefaults,
        scheduled_date: '2024-01-20',
        completed_at: null,
      });
      const sets = [createWorkoutSet(workoutSetDefaults)];

      mockWorkoutRepo.findCompletedInDateRange.mockResolvedValue([workout]);
      mockWorkoutSetRepo.findByWorkoutId.mockResolvedValue(sets);
      mockPlanDayRepo.findById.mockResolvedValue(mockPlanDay);
      mockStretchSessionRepo.findInDateRange.mockResolvedValue([]);
      mockMeditationSessionRepo.findInDateRange.mockResolvedValue([]);

      const result = await service.getMonthData(2024, 1);

      expect(result.days['2024-01-20']).toBeDefined();
      expect(result.days['2024-01-15']).toBeUndefined();
    });

    it('should handle workout with no sets', async () => {
      const workout = createWorkout(workoutDefaults);

      mockWorkoutRepo.findCompletedInDateRange.mockResolvedValue([workout]);
      mockWorkoutSetRepo.findByWorkoutId.mockResolvedValue([]);
      mockPlanDayRepo.findById.mockResolvedValue(mockPlanDay);
      mockStretchSessionRepo.findInDateRange.mockResolvedValue([]);
      mockMeditationSessionRepo.findInDateRange.mockResolvedValue([]);

      const result = await service.getMonthData(2024, 1);

      const workoutActivity = result.days['2024-01-15']?.activities.find(
        (a) => a.type === 'workout'
      );
      const summary = workoutActivity?.summary as WorkoutActivitySummary | undefined;
      expect(summary?.exerciseCount).toBe(0);
      expect(summary?.setsCompleted).toBe(0);
      expect(summary?.totalSets).toBe(0);
    });

    it('should count only completed sets in setsCompleted', async () => {
      const workout = createWorkout(workoutDefaults);
      const sets = [
        createWorkoutSet({ ...workoutSetDefaults, id: 's-1', status: 'completed' }),
        createWorkoutSet({ ...workoutSetDefaults, id: 's-2', status: 'skipped' }),
        createWorkoutSet({ ...workoutSetDefaults, id: 's-3', status: 'completed' }),
        createWorkoutSet({ ...workoutSetDefaults, id: 's-4', status: 'pending' }),
      ];

      mockWorkoutRepo.findCompletedInDateRange.mockResolvedValue([workout]);
      mockWorkoutSetRepo.findByWorkoutId.mockResolvedValue(sets);
      mockPlanDayRepo.findById.mockResolvedValue(mockPlanDay);
      mockStretchSessionRepo.findInDateRange.mockResolvedValue([]);
      mockMeditationSessionRepo.findInDateRange.mockResolvedValue([]);

      const result = await service.getMonthData(2024, 1);

      const workoutActivity = result.days['2024-01-15']?.activities.find(
        (a) => a.type === 'workout'
      );
      const summary = workoutActivity?.summary as WorkoutActivitySummary | undefined;
      expect(summary?.setsCompleted).toBe(2);
      expect(summary?.totalSets).toBe(4);
    });

    it('should prefix activity IDs with type name', async () => {
      const workout = createWorkout({ ...workoutDefaults, id: 'w-abc' });
      const sets = [createWorkoutSet(workoutSetDefaults)];
      const stretchSession = createStretchSession({ ...stretchSessionDefaults, id: 's-xyz' });
      const meditationSession = createMeditationSession({ ...meditationSessionDefaults, id: 'm-123' });

      mockWorkoutRepo.findCompletedInDateRange.mockResolvedValue([workout]);
      mockWorkoutSetRepo.findByWorkoutId.mockResolvedValue(sets);
      mockPlanDayRepo.findById.mockResolvedValue(mockPlanDay);
      mockStretchSessionRepo.findInDateRange.mockResolvedValue([stretchSession]);
      mockMeditationSessionRepo.findInDateRange.mockResolvedValue([meditationSession]);

      const result = await service.getMonthData(2024, 1);

      const activities = result.days['2024-01-15']?.activities ?? [];
      const ids = activities.map((a) => a.id);
      expect(ids).toContain('workout-w-abc');
      expect(ids).toContain('stretch-s-xyz');
      expect(ids).toContain('meditation-m-123');
    });

    it('should create separate day entries for activities on different dates', async () => {
      const stretch1 = createStretchSession({
        ...stretchSessionDefaults,
        id: 'str-1',
        completedAt: '2024-01-10T12:00:00Z',
      });
      const stretch2 = createStretchSession({
        ...stretchSessionDefaults,
        id: 'str-2',
        completedAt: '2024-01-20T12:00:00Z',
      });

      mockWorkoutRepo.findCompletedInDateRange.mockResolvedValue([]);
      mockStretchSessionRepo.findInDateRange.mockResolvedValue([stretch1, stretch2]);
      mockMeditationSessionRepo.findInDateRange.mockResolvedValue([]);

      const result = await service.getMonthData(2024, 1);

      expect(Object.keys(result.days)).toHaveLength(2);
      expect(result.days['2024-01-10']?.activities).toHaveLength(1);
      expect(result.days['2024-01-20']?.activities).toHaveLength(1);
    });

    it('should sort activities with null completedAt before those with timestamps', async () => {
      const workout = createWorkout({
        ...workoutDefaults,
        completed_at: null,
        scheduled_date: '2024-01-15',
      });
      const sets = [createWorkoutSet(workoutSetDefaults)];
      const stretchSession = createStretchSession({
        ...stretchSessionDefaults,
        completedAt: '2024-01-15T14:00:00Z',
      });

      mockWorkoutRepo.findCompletedInDateRange.mockResolvedValue([workout]);
      mockWorkoutSetRepo.findByWorkoutId.mockResolvedValue(sets);
      mockPlanDayRepo.findById.mockResolvedValue(mockPlanDay);
      mockStretchSessionRepo.findInDateRange.mockResolvedValue([stretchSession]);
      mockMeditationSessionRepo.findInDateRange.mockResolvedValue([]);

      const result = await service.getMonthData(2024, 1);

      const activities = result.days['2024-01-15']?.activities ?? [];
      expect(activities).toHaveLength(2);
      // null completedAt coerced to '' sorts before '2024-01-15T14:00:00Z'
      expect(activities[0]?.type).toBe('workout');
      expect(activities[1]?.type).toBe('stretch');
    });

    it('should return correct boundaries for 30-day month', async () => {
      mockWorkoutRepo.findCompletedInDateRange.mockResolvedValue([]);
      mockStretchSessionRepo.findInDateRange.mockResolvedValue([]);
      mockMeditationSessionRepo.findInDateRange.mockResolvedValue([]);

      const result = await service.getMonthData(2024, 4);

      expect(result.startDate).toBe('2024-04-01');
      expect(result.endDate).toBe('2024-04-30');
    });

    it('should only set hasWorkout flag when day has only workouts', async () => {
      const workout = createWorkout(workoutDefaults);
      const sets = [createWorkoutSet(workoutSetDefaults)];

      mockWorkoutRepo.findCompletedInDateRange.mockResolvedValue([workout]);
      mockWorkoutSetRepo.findByWorkoutId.mockResolvedValue(sets);
      mockPlanDayRepo.findById.mockResolvedValue(mockPlanDay);
      mockStretchSessionRepo.findInDateRange.mockResolvedValue([]);
      mockMeditationSessionRepo.findInDateRange.mockResolvedValue([]);

      const result = await service.getMonthData(2024, 1);

      const daySummary = result.days['2024-01-15']?.summary;
      expect(daySummary?.hasWorkout).toBe(true);
      expect(daySummary?.hasStretch).toBe(false);
      expect(daySummary?.hasMeditation).toBe(false);
      expect(daySummary?.totalActivities).toBe(1);
    });

    it('should pass through raw completedAt timestamp on activity', async () => {
      const workout = createWorkout({
        ...workoutDefaults,
        completed_at: '2024-01-15T11:30:45.123Z',
      });
      const sets = [createWorkoutSet(workoutSetDefaults)];

      mockWorkoutRepo.findCompletedInDateRange.mockResolvedValue([workout]);
      mockWorkoutSetRepo.findByWorkoutId.mockResolvedValue(sets);
      mockPlanDayRepo.findById.mockResolvedValue(mockPlanDay);
      mockStretchSessionRepo.findInDateRange.mockResolvedValue([]);
      mockMeditationSessionRepo.findInDateRange.mockResolvedValue([]);

      const result = await service.getMonthData(2024, 1);

      const workoutActivity = result.days['2024-01-15']?.activities.find(
        (a) => a.type === 'workout'
      );
      expect(workoutActivity?.completedAt).toBe('2024-01-15T11:30:45.123Z');
    });

    it('should default timezone offset to 0 when not provided', async () => {
      mockWorkoutRepo.findCompletedInDateRange.mockResolvedValue([]);
      mockStretchSessionRepo.findInDateRange.mockResolvedValue([]);
      mockMeditationSessionRepo.findInDateRange.mockResolvedValue([]);

      await service.getMonthData(2024, 6);

      expect(mockWorkoutRepo.findCompletedInDateRange).toHaveBeenCalledWith(
        '2024-06-01',
        '2024-06-30',
        0
      );
      expect(mockStretchSessionRepo.findInDateRange).toHaveBeenCalledWith(
        '2024-06-01',
        '2024-06-30',
        0
      );
      expect(mockMeditationSessionRepo.findInDateRange).toHaveBeenCalledWith(
        '2024-06-01',
        '2024-06-30',
        0
      );
    });

    it('should call findById and findByWorkoutId for each workout', async () => {
      const workout1 = createWorkout({ ...workoutDefaults, id: 'w-1', plan_day_id: 'pd-1' });
      const workout2 = createWorkout({ ...workoutDefaults, id: 'w-2', plan_day_id: 'pd-2', completed_at: '2024-01-16T10:00:00Z', scheduled_date: '2024-01-16' });

      mockWorkoutRepo.findCompletedInDateRange.mockResolvedValue([workout1, workout2]);
      mockWorkoutSetRepo.findByWorkoutId.mockResolvedValue([createWorkoutSet(workoutSetDefaults)]);
      mockPlanDayRepo.findById
        .mockResolvedValueOnce(createPlanDay({ id: 'pd-1', plan_id: 'plan-1', day_of_week: 1, name: 'Push Day', sort_order: 0 }))
        .mockResolvedValueOnce(createPlanDay({ id: 'pd-2', plan_id: 'plan-1', day_of_week: 2, name: 'Pull Day', sort_order: 1 }));
      mockStretchSessionRepo.findInDateRange.mockResolvedValue([]);
      mockMeditationSessionRepo.findInDateRange.mockResolvedValue([]);

      const result = await service.getMonthData(2024, 1);

      // Verify per-workout repo calls
      expect(mockPlanDayRepo.findById).toHaveBeenCalledTimes(2);
      expect(mockPlanDayRepo.findById).toHaveBeenCalledWith('pd-1');
      expect(mockPlanDayRepo.findById).toHaveBeenCalledWith('pd-2');
      expect(mockWorkoutSetRepo.findByWorkoutId).toHaveBeenCalledTimes(2);
      expect(mockWorkoutSetRepo.findByWorkoutId).toHaveBeenCalledWith('w-1');
      expect(mockWorkoutSetRepo.findByWorkoutId).toHaveBeenCalledWith('w-2');

      // Verify both workouts appear with correct plan day names
      const pushActivities = result.days['2024-01-15']?.activities;
      const pullActivities = result.days['2024-01-16']?.activities;
      if (!pushActivities || !pullActivities) {
        throw new Error('Expected month data to include activities for both workout days');
      }
      const push = pushActivities.find(a => a.id === 'workout-w-1');
      const pull = pullActivities.find(a => a.id === 'workout-w-2');
      if (!push || !pull) {
        throw new Error('Expected workouts to be present in calendar activity lists');
      }
      expect((push.summary as WorkoutActivitySummary).dayName).toBe('Push Day');
      expect((pull.summary as WorkoutActivitySummary).dayName).toBe('Pull Day');
    });

    it('should sort activities with deterministic tie-breaker when completedAt is identical', async () => {
      // Create multiple activities with identical completedAt
      const stretchSession1 = createStretchSession({
        ...stretchSessionDefaults,
        id: 'stretch-a',
        completedAt: '2024-01-15T12:00:00Z',
      });
      const stretchSession2 = createStretchSession({
        ...stretchSessionDefaults,
        id: 'stretch-b',
        completedAt: '2024-01-15T12:00:00Z',
      });
      const stretchSession3 = createStretchSession({
        ...stretchSessionDefaults,
        id: 'stretch-c',
        completedAt: '2024-01-15T12:00:00Z',
      });

      mockWorkoutRepo.findCompletedInDateRange.mockResolvedValue([]);
      mockStretchSessionRepo.findInDateRange.mockResolvedValue([stretchSession1, stretchSession2, stretchSession3]);
      mockMeditationSessionRepo.findInDateRange.mockResolvedValue([]);

      const result = await service.getMonthData(2024, 1);

      const activities = result.days['2024-01-15']?.activities ?? [];
      expect(activities).toHaveLength(3);
      // Should be sorted by id: stretch-a, stretch-b, stretch-c
      expect(activities[0]?.id).toBe('stretch-stretch-a');
      expect(activities[1]?.id).toBe('stretch-stretch-b');
      expect(activities[2]?.id).toBe('stretch-stretch-c');
    });
  });

  describe('getMonthData timezone/month boundary matrix', () => {
    it('should include cycling activity that crosses month boundary forward with negative tz', async () => {
      // Cycling activity on UTC Feb 1 at 00:30, with tz=-120 (UTC-2) converts to Jan 31 locally
      // Should be included in Jan query because local date is within Jan range
      const cyclingActivity: CyclingActivity = {
        ...cyclingActivityDefaults,
        id: 'cycling-boundary-1',
        date: '2026-02-01T00:30:00Z',
      };

      mockWorkoutRepo.findCompletedInDateRange.mockResolvedValue([]);
      mockStretchSessionRepo.findInDateRange.mockResolvedValue([]);
      mockMeditationSessionRepo.findInDateRange.mockResolvedValue([]);
      mockCyclingRepo.getCyclingActivities.mockResolvedValue([cyclingActivity]);

      const result = await service.getMonthData(2026, 1, -120);

      // The activity should appear on 2026-01-31 due to timezone conversion
      expect(result.days['2026-01-31']).toBeDefined();
      expect(result.days['2026-02-01']).toBeUndefined();
    });

    it('should exclude cycling activity that crosses month boundary forward with positive tz', async () => {
      // Cycling activity on UTC Jan 31 at 23:30, with tz=+120 (UTC+2) converts to Feb 1 locally
      // Should be excluded from Jan query because local date is outside Jan range
      const cyclingActivity: CyclingActivity = {
        ...cyclingActivityDefaults,
        id: 'cycling-boundary-2',
        date: '2026-01-31T23:30:00Z',
      };

      mockWorkoutRepo.findCompletedInDateRange.mockResolvedValue([]);
      mockStretchSessionRepo.findInDateRange.mockResolvedValue([]);
      mockMeditationSessionRepo.findInDateRange.mockResolvedValue([]);
      mockCyclingRepo.getCyclingActivities.mockResolvedValue([cyclingActivity]);

      const result = await service.getMonthData(2026, 1, 120);

      // The activity converts to Feb 1, outside the Jan range
      expect(result.days['2026-01-31']).toBeUndefined();
      expect(result.days['2026-02-01']).toBeUndefined();
    });

    it('should handle extreme timezone offset UTC+14 at month boundary', async () => {
      // Cycling activity on UTC Feb 1 at 11:00, with tz=+840 (UTC+14) converts to Feb 2 locally
      const cyclingActivity: CyclingActivity = {
        ...cyclingActivityDefaults,
        id: 'cycling-extreme-positive',
        date: '2026-02-01T11:00:00Z',
      };

      mockWorkoutRepo.findCompletedInDateRange.mockResolvedValue([]);
      mockStretchSessionRepo.findInDateRange.mockResolvedValue([]);
      mockMeditationSessionRepo.findInDateRange.mockResolvedValue([]);
      mockCyclingRepo.getCyclingActivities.mockResolvedValue([cyclingActivity]);

      const result = await service.getMonthData(2026, 2, 840);

      // Activity should appear on Feb 2 locally due to extreme timezone
      expect(result.days['2026-02-02']).toBeDefined();
      expect(result.days['2026-02-01']).toBeUndefined();
    });

    it('should handle extreme timezone offset UTC-12 at month boundary', async () => {
      // Cycling activity on UTC Feb 1 at 11:00, with tz=-720 (UTC-12) converts to Jan 31 locally
      const cyclingActivity: CyclingActivity = {
        ...cyclingActivityDefaults,
        id: 'cycling-extreme-negative',
        date: '2026-02-01T11:00:00Z',
      };

      mockWorkoutRepo.findCompletedInDateRange.mockResolvedValue([]);
      mockStretchSessionRepo.findInDateRange.mockResolvedValue([]);
      mockMeditationSessionRepo.findInDateRange.mockResolvedValue([]);
      mockCyclingRepo.getCyclingActivities.mockResolvedValue([cyclingActivity]);

      const result = await service.getMonthData(2026, 1, -720);

      // Activity converts to Jan 31, should be included in Jan query
      expect(result.days['2026-01-31']).toBeDefined();
      expect(result.days['2026-02-01']).toBeUndefined();
    });
  });
});
