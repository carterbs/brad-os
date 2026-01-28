import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import type {
  Workout,
  WorkoutSet,
  PlanDay,
  StretchSessionRecord,
  MeditationSessionRecord,
  WorkoutActivitySummary,
} from '../shared.js';
import { CalendarService, utcToLocalDate } from './calendar.service.js';
import { WorkoutRepository } from '../repositories/workout.repository.js';
import { WorkoutSetRepository } from '../repositories/workout-set.repository.js';
import { PlanDayRepository } from '../repositories/plan-day.repository.js';
import { StretchSessionRepository } from '../repositories/stretchSession.repository.js';
import { MeditationSessionRepository } from '../repositories/meditationSession.repository.js';

// Mock repositories
vi.mock('../repositories/workout.repository.js');
vi.mock('../repositories/workout-set.repository.js');
vi.mock('../repositories/plan-day.repository.js');
vi.mock('../repositories/stretchSession.repository.js');
vi.mock('../repositories/meditationSession.repository.js');

describe('CalendarService', () => {
  let service: CalendarService;
  let mockWorkoutRepo: {
    findCompletedInDateRange: Mock;
  };
  let mockWorkoutSetRepo: {
    findByWorkoutId: Mock;
  };
  let mockPlanDayRepo: {
    findById: Mock;
  };
  let mockStretchSessionRepo: {
    findInDateRange: Mock;
  };
  let mockMeditationSessionRepo: {
    findInDateRange: Mock;
  };

  // Fixtures
  const mockPlanDay: PlanDay = {
    id: 'plan-day-1',
    plan_id: 'plan-1',
    day_of_week: 1,
    name: 'Push Day',
    sort_order: 0,
  };

  const createMockWorkout = (overrides: Partial<Workout> = {}): Workout => ({
    id: 'workout-1',
    mesocycle_id: 'meso-1',
    plan_day_id: 'plan-day-1',
    week_number: 1,
    scheduled_date: '2024-01-15',
    status: 'completed',
    started_at: '2024-01-15T10:00:00Z',
    completed_at: '2024-01-15T11:00:00Z',
    ...overrides,
  });

  const createMockWorkoutSet = (overrides: Partial<WorkoutSet> = {}): WorkoutSet => ({
    id: 'set-1',
    workout_id: 'workout-1',
    exercise_id: 'exercise-1',
    set_number: 1,
    target_reps: 8,
    target_weight: 100,
    actual_reps: 8,
    actual_weight: 100,
    status: 'completed',
    ...overrides,
  });

  const createMockStretchSession = (overrides: Partial<StretchSessionRecord> = {}): StretchSessionRecord => ({
    id: 'stretch-1',
    completedAt: '2024-01-15T14:00:00Z',
    totalDurationSeconds: 600,
    regionsCompleted: 5,
    regionsSkipped: 1,
    stretches: [],
    ...overrides,
  });

  const createMockMeditationSession = (overrides: Partial<MeditationSessionRecord> = {}): MeditationSessionRecord => ({
    id: 'meditation-1',
    completedAt: '2024-01-15T07:00:00Z',
    sessionType: 'basic-breathing',
    plannedDurationSeconds: 600,
    actualDurationSeconds: 600,
    completedFully: true,
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();

    mockWorkoutRepo = {
      findCompletedInDateRange: vi.fn(),
    };

    mockWorkoutSetRepo = {
      findByWorkoutId: vi.fn(),
    };

    mockPlanDayRepo = {
      findById: vi.fn(),
    };

    mockStretchSessionRepo = {
      findInDateRange: vi.fn(),
    };

    mockMeditationSessionRepo = {
      findInDateRange: vi.fn(),
    };

    vi.mocked(WorkoutRepository).mockImplementation(() => mockWorkoutRepo as unknown as WorkoutRepository);
    vi.mocked(WorkoutSetRepository).mockImplementation(() => mockWorkoutSetRepo as unknown as WorkoutSetRepository);
    vi.mocked(PlanDayRepository).mockImplementation(() => mockPlanDayRepo as unknown as PlanDayRepository);
    vi.mocked(StretchSessionRepository).mockImplementation(() => mockStretchSessionRepo as unknown as StretchSessionRepository);
    vi.mocked(MeditationSessionRepository).mockImplementation(() => mockMeditationSessionRepo as unknown as MeditationSessionRepository);

    service = new CalendarService({} as Firestore);
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
  });

  describe('getMonthData', () => {
    it('should return activities grouped by date', async () => {
      const workout = createMockWorkout();
      const sets = [createMockWorkoutSet()];
      const stretchSession = createMockStretchSession();
      const meditationSession = createMockMeditationSession();

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
      const workout = createMockWorkout({ week_number: 2 });
      const sets = [
        createMockWorkoutSet({ exercise_id: 'ex-1', status: 'completed' }),
        createMockWorkoutSet({ exercise_id: 'ex-1', status: 'completed' }),
        createMockWorkoutSet({ exercise_id: 'ex-2', status: 'completed' }),
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
      const stretchSession = createMockStretchSession({
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

    it('should include meditation activities with summary', async () => {
      const meditationSession = createMockMeditationSession({
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
      const workout = createMockWorkout();
      const sets = [createMockWorkoutSet()];
      const stretchSession = createMockStretchSession();
      const meditationSession = createMockMeditationSession();

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
      const workout1 = createMockWorkout({ id: 'w1', completed_at: '2024-01-15T09:00:00Z' });
      const workout2 = createMockWorkout({ id: 'w2', completed_at: '2024-01-15T17:00:00Z' });
      const sets = [createMockWorkoutSet()];

      mockWorkoutRepo.findCompletedInDateRange.mockResolvedValue([workout1, workout2]);
      mockWorkoutSetRepo.findByWorkoutId.mockResolvedValue(sets);
      mockPlanDayRepo.findById.mockResolvedValue(mockPlanDay);
      mockStretchSessionRepo.findInDateRange.mockResolvedValue([]);
      mockMeditationSessionRepo.findInDateRange.mockResolvedValue([]);

      const result = await service.getMonthData(2024, 1);

      expect(result.days['2024-01-15']?.activities).toHaveLength(2);
    });

    it('should sort activities within a day by completion time', async () => {
      const workout = createMockWorkout({ completed_at: '2024-01-15T14:00:00Z' });
      const sets = [createMockWorkoutSet()];
      const stretchSession = createMockStretchSession({ completedAt: '2024-01-15T16:00:00Z' });
      const meditationSession = createMockMeditationSession({ completedAt: '2024-01-15T07:00:00Z' });

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
      const workout = createMockWorkout({
        scheduled_date: '2024-01-20',
        completed_at: '',
      });
      const sets = [createMockWorkoutSet()];

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
      const deloadWorkout = createMockWorkout({ week_number: 7 });
      const sets = [createMockWorkoutSet()];

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
      const stretchSession = createMockStretchSession({
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
      const workout = createMockWorkout();
      const sets = [createMockWorkoutSet()];

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
  });
});
