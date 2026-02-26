import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockPlanDayRepository, createMockWorkoutRepository, createMockWorkoutSetRepository } from '../__tests__/utils/mock-repository.js';

// Define mock objects with vi.hoisted (before any imports)
const mockWorkoutRepo = createMockWorkoutRepository();
const mockPlanDayRepo = createMockPlanDayRepository();
const mockWorkoutSetRepo = createMockWorkoutSetRepository();
const mockMesocycleService = {
  getActive: vi.fn(),
};

// Mock modules — getters return our mock objects
vi.mock('../repositories/index.js', () => ({
  getWorkoutRepository: (): typeof mockWorkoutRepo => mockWorkoutRepo,
  getPlanDayRepository: (): typeof mockPlanDayRepo => mockPlanDayRepo,
  getWorkoutSetRepository: (): typeof mockWorkoutSetRepo => mockWorkoutSetRepo,
}));

vi.mock('./mesocycle.service.js', () => ({
  MesocycleService: vi.fn().mockImplementation(() => mockMesocycleService),
}));

vi.mock('../firebase.js', () => ({
  getFirestoreDb: vi.fn(),
}));

// Import AFTER all vi.mock() calls
import { buildLiftingContext, buildLiftingSchedule, buildMesocycleContext } from './lifting-context.service.js';
import {
  createWorkout,
  createWorkoutSet,
  createPlanDay,
  createMesocycle,
} from '../__tests__/utils/fixtures.js';

describe('buildLiftingContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return empty array when no completed workouts', async () => {
    mockWorkoutRepo.findCompletedInDateRange.mockResolvedValue([]);
    const result = await buildLiftingContext(0);
    expect(result).toEqual([]);
  });

  it('should pass timezoneOffset to findCompletedInDateRange', async () => {
    mockWorkoutRepo.findCompletedInDateRange.mockResolvedValue([]);
    await buildLiftingContext(-300);
    expect(mockWorkoutRepo.findCompletedInDateRange).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      -300,
    );
  });

  it('should query a 7-day date range', async () => {
    mockWorkoutRepo.findCompletedInDateRange.mockResolvedValue([]);
    await buildLiftingContext(0);
    const [startDate, endDate] = mockWorkoutRepo.findCompletedInDateRange.mock.calls[0] as [string, string, number];
    // Parse YYYY-MM-DD strings and verify 7-day gap
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    expect(diffDays).toBe(7);
  });

  it('should build summary with plan day name and isLowerBody flag', async () => {
    const workout = createWorkout({
      id: 'w-1',
      plan_day_id: 'pd-1',
      status: 'completed' as const,
      started_at: '2026-02-20T10:00:00Z',
      completed_at: '2026-02-20T11:00:00Z',
    });
    mockWorkoutRepo.findCompletedInDateRange.mockResolvedValue([workout]);
    mockPlanDayRepo.findById.mockResolvedValue(createPlanDay({ id: 'pd-1', name: 'Leg Day' }));
    mockWorkoutSetRepo.findByWorkoutId.mockResolvedValue([]);

    const result = await buildLiftingContext(0);

    expect(result).toHaveLength(1);
    expect(result[0]?.workoutDayName).toBe('Leg Day');
    expect(result[0]?.isLowerBody).toBe(true);
  });

  it.each([
    ['Leg Day', true],
    ['Lower Body', true],
    ['Squat Focus', true],
    ['Deadlift Day', true],
    ['Push Day', false],
    ['Pull Day', false],
    ['Upper Body', false],
  ])('should detect isLowerBody=%s for plan day name "%s"', async (name, expected) => {
    const workout = createWorkout({
      id: 'w-x',
      plan_day_id: 'pd-x',
      status: 'completed' as const,
      started_at: '2026-02-20T10:00:00Z',
      completed_at: '2026-02-20T10:30:00Z',
    });
    mockWorkoutRepo.findCompletedInDateRange.mockResolvedValue([workout]);
    mockPlanDayRepo.findById.mockResolvedValue(createPlanDay({ id: 'pd-x', name }));
    mockWorkoutSetRepo.findByWorkoutId.mockResolvedValue([]);

    const result = await buildLiftingContext(0);
    expect(result[0]?.isLowerBody).toBe(expected);
  });

  it('should default workoutDayName to "Workout" when plan_day_id is missing', async () => {
    const workout = createWorkout({
      id: 'w-2',
      plan_day_id: '',   // falsy
      status: 'completed' as const,
      started_at: '2026-02-20T10:00:00Z',
      completed_at: '2026-02-20T10:45:00Z',
    });
    mockWorkoutRepo.findCompletedInDateRange.mockResolvedValue([workout]);
    mockWorkoutSetRepo.findByWorkoutId.mockResolvedValue([]);

    const result = await buildLiftingContext(0);
    expect(result[0]?.workoutDayName).toBe('Workout');
    expect(result[0]?.isLowerBody).toBe(false);
  });

  it('should count completed sets and calculate total volume', async () => {
    const workout = createWorkout({
      id: 'w-3',
      plan_day_id: 'pd-3',
      status: 'completed' as const,
      started_at: '2026-02-20T10:00:00Z',
      completed_at: '2026-02-20T11:00:00Z',
    });
    const sets = [
      createWorkoutSet({ workout_id: 'w-3', status: 'completed' as const, actual_weight: 135, actual_reps: 10 }),
      createWorkoutSet({ workout_id: 'w-3', status: 'completed' as const, actual_weight: 135, actual_reps: 8 }),
      createWorkoutSet({ workout_id: 'w-3', status: 'pending' as const, actual_weight: null, actual_reps: null }),
    ];
    mockWorkoutRepo.findCompletedInDateRange.mockResolvedValue([workout]);
    mockPlanDayRepo.findById.mockResolvedValue(createPlanDay({ id: 'pd-3', name: 'Push Day' }));
    mockWorkoutSetRepo.findByWorkoutId.mockResolvedValue(sets);

    const result = await buildLiftingContext(0);
    expect(result[0]?.setsCompleted).toBe(2);
    expect(result[0]?.totalVolume).toBe(135 * 10 + 135 * 8); // 2430
  });

  it('should not add to volume when actual_weight or actual_reps is null', async () => {
    const workout = createWorkout({
      id: 'w-4',
      plan_day_id: 'pd-4',
      status: 'completed' as const,
      started_at: '2026-02-20T10:00:00Z',
      completed_at: '2026-02-20T10:30:00Z',
    });
    const sets = [
      createWorkoutSet({ workout_id: 'w-4', status: 'completed' as const, actual_weight: 100, actual_reps: null }),
      createWorkoutSet({ workout_id: 'w-4', status: 'completed' as const, actual_weight: null, actual_reps: 10 }),
    ];
    mockWorkoutRepo.findCompletedInDateRange.mockResolvedValue([workout]);
    mockPlanDayRepo.findById.mockResolvedValue(createPlanDay({ id: 'pd-4', name: 'Pull Day' }));
    mockWorkoutSetRepo.findByWorkoutId.mockResolvedValue(sets);

    const result = await buildLiftingContext(0);
    expect(result[0]?.setsCompleted).toBe(2);
    expect(result[0]?.totalVolume).toBe(0);
  });

  it('should calculate durationMinutes from started_at and completed_at', async () => {
    const workout = createWorkout({
      id: 'w-5',
      plan_day_id: 'pd-5',
      status: 'completed' as const,
      started_at: '2026-02-20T10:00:00Z',
      completed_at: '2026-02-20T10:45:00Z', // 45 minutes later
    });
    mockWorkoutRepo.findCompletedInDateRange.mockResolvedValue([workout]);
    mockPlanDayRepo.findById.mockResolvedValue(createPlanDay({ id: 'pd-5', name: 'Push' }));
    mockWorkoutSetRepo.findByWorkoutId.mockResolvedValue([]);

    const result = await buildLiftingContext(0);
    expect(result[0]?.durationMinutes).toBe(45);
  });

  it('should set durationMinutes to 0 when timestamps are null', async () => {
    const workout = createWorkout({
      id: 'w-6',
      plan_day_id: 'pd-6',
      status: 'completed' as const,
      started_at: null,
      completed_at: null,
    });
    mockWorkoutRepo.findCompletedInDateRange.mockResolvedValue([workout]);
    mockPlanDayRepo.findById.mockResolvedValue(createPlanDay({ id: 'pd-6', name: 'Pull' }));
    mockWorkoutSetRepo.findByWorkoutId.mockResolvedValue([]);

    const result = await buildLiftingContext(0);
    expect(result[0]?.durationMinutes).toBe(0);
  });

  it('should use completed_at as summary date, falling back to scheduled_date', async () => {
    const workout = createWorkout({
      id: 'w-7',
      plan_day_id: '',
      status: 'completed' as const,
      scheduled_date: '2026-02-19',
      started_at: null,
      completed_at: null,
    });
    mockWorkoutRepo.findCompletedInDateRange.mockResolvedValue([workout]);
    mockWorkoutSetRepo.findByWorkoutId.mockResolvedValue([]);

    const result = await buildLiftingContext(0);
    expect(result[0]?.date).toBe('2026-02-19'); // falls back to scheduled_date
  });

  it('should set avgHeartRate, maxHeartRate, activeCalories to 0', async () => {
    const workout = createWorkout({
      id: 'w-8',
      plan_day_id: 'pd-8',
      status: 'completed' as const,
      started_at: '2026-02-20T10:00:00Z',
      completed_at: '2026-02-20T11:00:00Z',
    });
    mockWorkoutRepo.findCompletedInDateRange.mockResolvedValue([workout]);
    mockPlanDayRepo.findById.mockResolvedValue(createPlanDay({ id: 'pd-8', name: 'Push' }));
    mockWorkoutSetRepo.findByWorkoutId.mockResolvedValue([]);

    const result = await buildLiftingContext(0);
    expect(result[0]?.avgHeartRate).toBe(0);
    expect(result[0]?.maxHeartRate).toBe(0);
    expect(result[0]?.activeCalories).toBe(0);
  });

  it('should build summaries for multiple completed workouts', async () => {
    const workouts = [
      createWorkout({ id: 'w-a', plan_day_id: 'pd-a', status: 'completed' as const, started_at: '2026-02-19T10:00:00Z', completed_at: '2026-02-19T11:00:00Z' }),
      createWorkout({ id: 'w-b', plan_day_id: 'pd-b', status: 'completed' as const, started_at: '2026-02-20T10:00:00Z', completed_at: '2026-02-20T10:30:00Z' }),
    ];
    mockWorkoutRepo.findCompletedInDateRange.mockResolvedValue(workouts);
    mockPlanDayRepo.findById
      .mockResolvedValueOnce(createPlanDay({ id: 'pd-a', name: 'Push Day' }))
      .mockResolvedValueOnce(createPlanDay({ id: 'pd-b', name: 'Leg Day' }));
    mockWorkoutSetRepo.findByWorkoutId.mockResolvedValue([]);

    const result = await buildLiftingContext(0);
    expect(result).toHaveLength(2);
    expect(result[0]?.workoutDayName).toBe('Push Day');
    expect(result[1]?.workoutDayName).toBe('Leg Day');
    expect(result[1]?.isLowerBody).toBe(true);
  });
});

describe('buildLiftingSchedule', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return all-false schedule when no workouts exist', async () => {
    mockWorkoutRepo.findCompletedInDateRange.mockResolvedValue([]);
    mockWorkoutRepo.findByDate.mockResolvedValue([]);

    const result = await buildLiftingSchedule();

    expect(result.yesterday).toEqual({ completed: false });
    expect(result.today).toEqual({ planned: false });
    expect(result.tomorrow).toEqual({ planned: false });
  });

  it('should show yesterday as completed with workout name', async () => {
    const yesterdayWorkout = createWorkout({
      id: 'w-y', plan_day_id: 'pd-y', status: 'completed' as const,
    });
    mockWorkoutRepo.findCompletedInDateRange.mockResolvedValue([yesterdayWorkout]);
    mockWorkoutRepo.findByDate.mockResolvedValue([]);
    mockPlanDayRepo.findById.mockResolvedValue(createPlanDay({ id: 'pd-y', name: 'Push Day' }));

    const result = await buildLiftingSchedule();

    expect(result.yesterday.completed).toBe(true);
    expect(result.yesterday.workoutName).toBe('Push Day');
    expect(result.yesterday.isLowerBody).toBe(false);
  });

  it('should show today as planned for pending workout', async () => {
    const todayWorkout = createWorkout({
      id: 'w-t', plan_day_id: 'pd-t', status: 'pending' as const,
    });
    mockWorkoutRepo.findCompletedInDateRange.mockResolvedValue([]);
    mockWorkoutRepo.findByDate.mockResolvedValue([todayWorkout]);
    mockPlanDayRepo.findById.mockResolvedValue(createPlanDay({ id: 'pd-t', name: 'Squat Day' }));

    const result = await buildLiftingSchedule();

    expect(result.today.planned).toBe(true);
    expect(result.today.workoutName).toBe('Squat Day');
    expect(result.today.isLowerBody).toBe(true);
  });

  it('should not show today as planned if workout is completed or skipped', async () => {
    const completedWorkout = createWorkout({
      id: 'w-tc', plan_day_id: 'pd-tc', status: 'completed' as const,
    });
    mockWorkoutRepo.findCompletedInDateRange.mockResolvedValue([]);
    mockWorkoutRepo.findByDate.mockResolvedValue([completedWorkout]);

    const result = await buildLiftingSchedule();

    expect(result.today.planned).toBe(false);
  });

  it('should show tomorrow as planned for pending workout', async () => {
    const tomorrowWorkout = createWorkout({
      id: 'w-tm', plan_day_id: 'pd-tm', status: 'pending' as const,
    });
    mockWorkoutRepo.findCompletedInDateRange.mockResolvedValue([]);
    // findByDate is called twice: once for today, once for tomorrow
    mockWorkoutRepo.findByDate
      .mockResolvedValueOnce([])            // today
      .mockResolvedValueOnce([tomorrowWorkout]); // tomorrow
    mockPlanDayRepo.findById.mockResolvedValue(createPlanDay({ id: 'pd-tm', name: 'Deadlift Day' }));

    const result = await buildLiftingSchedule();

    expect(result.tomorrow.planned).toBe(true);
    expect(result.tomorrow.workoutName).toBe('Deadlift Day');
    expect(result.tomorrow.isLowerBody).toBe(true);
  });

  it('should not show tomorrow as planned if workout is in_progress', async () => {
    const inProgressWorkout = createWorkout({
      id: 'w-ip', plan_day_id: 'pd-ip', status: 'in_progress' as const,
    });
    mockWorkoutRepo.findCompletedInDateRange.mockResolvedValue([]);
    mockWorkoutRepo.findByDate
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([inProgressWorkout]);

    const result = await buildLiftingSchedule();

    expect(result.tomorrow.planned).toBe(false);
  });

  it('should default workout name to "Workout" when plan day not found', async () => {
    const workout = createWorkout({
      id: 'w-nf', plan_day_id: 'pd-missing', status: 'completed' as const,
    });
    mockWorkoutRepo.findCompletedInDateRange.mockResolvedValue([workout]);
    mockWorkoutRepo.findByDate.mockResolvedValue([]);
    mockPlanDayRepo.findById.mockResolvedValue(null);

    const result = await buildLiftingSchedule();

    expect(result.yesterday.workoutName).toBe('Workout');
    expect(result.yesterday.isLowerBody).toBe(false);
  });
});

describe('buildMesocycleContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return undefined when no active mesocycle', async () => {
    mockMesocycleService.getActive.mockResolvedValue(null);
    const result = await buildMesocycleContext();
    expect(result).toBeUndefined();
  });

  it('should return mesocycle context with currentWeek and planName', async () => {
    mockMesocycleService.getActive.mockResolvedValue({
      ...createMesocycle({ current_week: 3 }),
      plan_name: 'PPL Program',
      weeks: [],
      total_workouts: 18,
      completed_workouts: 9,
    });

    const result = await buildMesocycleContext();

    expect(result).toEqual({
      currentWeek: 3,
      isDeloadWeek: false,
      planName: 'PPL Program',
    });
  });

  it('should set isDeloadWeek to true when current_week is 7', async () => {
    mockMesocycleService.getActive.mockResolvedValue({
      ...createMesocycle({ current_week: 7 }),
      plan_name: 'Deload Test',
      weeks: [],
      total_workouts: 21,
      completed_workouts: 18,
    });

    const result = await buildMesocycleContext();

    expect(result?.isDeloadWeek).toBe(true);
    expect(result?.currentWeek).toBe(7);
  });

  it('should set isDeloadWeek to false for non-deload weeks', async () => {
    mockMesocycleService.getActive.mockResolvedValue({
      ...createMesocycle({ current_week: 1 }),
      plan_name: 'Week 1 Test',
      weeks: [],
      total_workouts: 3,
      completed_workouts: 0,
    });

    const result = await buildMesocycleContext();

    expect(result?.isDeloadWeek).toBe(false);
  });
});
