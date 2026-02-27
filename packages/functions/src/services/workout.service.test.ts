import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { WorkoutService } from './workout.service.js';
import { WorkoutRepository } from '../repositories/workout.repository.js';
import { WorkoutSetRepository } from '../repositories/workout-set.repository.js';
import { PlanDayRepository } from '../repositories/plan-day.repository.js';
import { PlanDayExerciseRepository } from '../repositories/plan-day-exercise.repository.js';
import { ExerciseRepository } from '../repositories/exercise.repository.js';
import {
  createMockWorkoutRepository,
  createMockWorkoutSetRepository,
  createMockPlanDayRepository,
  createMockPlanDayExerciseRepository,
  createMockExerciseRepository,
  createWorkout,
  createPlanDay,
  createPlanDayExercise,
  createExercise,
  createWorkoutSet,
} from '../__tests__/utils/index.js';

// Mock all repositories
vi.mock('../repositories/workout.repository.js');
vi.mock('../repositories/workout-set.repository.js');
vi.mock('../repositories/plan-day.repository.js');
vi.mock('../repositories/plan-day-exercise.repository.js');
vi.mock('../repositories/exercise.repository.js');

describe('WorkoutService', () => {
  let service: WorkoutService;
  let mockWorkoutRepo: ReturnType<typeof createMockWorkoutRepository>;
  let mockWorkoutSetRepo: ReturnType<typeof createMockWorkoutSetRepository>;
  let mockPlanDayRepo: ReturnType<typeof createMockPlanDayRepository>;
  let mockPlanDayExerciseRepo: ReturnType<typeof createMockPlanDayExerciseRepository>;
  let mockExerciseRepo: ReturnType<typeof createMockExerciseRepository>;

  // Shared default overrides matching original inline factory/fixture defaults
  const workoutDefaults = {
    id: 'workout-1',
    mesocycle_id: 'meso-1',
    plan_day_id: 'plan-day-1',
    week_number: 1,
    scheduled_date: '2024-01-15',
    status: 'pending' as const,
    started_at: null,
    completed_at: null,
  };

  const workoutSetDefaults = {
    id: 'set-1',
    workout_id: 'workout-1',
    exercise_id: 'exercise-1',
    set_number: 1,
    target_reps: 8,
    target_weight: 100,
    actual_reps: null,
    actual_weight: null,
    status: 'pending' as const,
  };

  // Fixtures
  const mockPlanDay = createPlanDay({
    id: 'plan-day-1',
    plan_id: 'plan-1',
    day_of_week: 1,
    name: 'Push Day',
    sort_order: 0,
  });

  const mockExercise = createExercise({
    id: 'exercise-1',
    name: 'Bench Press',
    weight_increment: 5,
    is_custom: false,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  });

  const mockPlanDayExercise = createPlanDayExercise({
    id: 'pde-1',
    plan_day_id: 'plan-day-1',
    exercise_id: 'exercise-1',
    sets: 3,
    reps: 8,
    weight: 100,
    rest_seconds: 90,
    sort_order: 0,
    min_reps: 8,
    max_reps: 12,
  });

  beforeEach(() => {
    vi.clearAllMocks();

    mockWorkoutRepo = createMockWorkoutRepository();
    mockWorkoutSetRepo = createMockWorkoutSetRepository();
    mockPlanDayRepo = createMockPlanDayRepository();
    mockPlanDayExerciseRepo = createMockPlanDayExerciseRepository();
    mockExerciseRepo = createMockExerciseRepository();

    // Configure mock constructors
    vi.mocked(WorkoutRepository).mockImplementation(() => mockWorkoutRepo as unknown as WorkoutRepository);
    vi.mocked(WorkoutSetRepository).mockImplementation(() => mockWorkoutSetRepo as unknown as WorkoutSetRepository);
    vi.mocked(PlanDayRepository).mockImplementation(() => mockPlanDayRepo as unknown as PlanDayRepository);
    vi.mocked(PlanDayExerciseRepository).mockImplementation(() => mockPlanDayExerciseRepo as unknown as PlanDayExerciseRepository);
    vi.mocked(ExerciseRepository).mockImplementation(() => mockExerciseRepo as unknown as ExerciseRepository);

    service = new WorkoutService({} as Firestore);
  });

  describe('getById', () => {
    it('should return null if workout is not found', async () => {
      mockWorkoutRepo.findById.mockResolvedValue(null);

      const result = await service.getById('non-existent');

      expect(result).toBeNull();
      expect(mockWorkoutRepo.findById).toHaveBeenCalledWith('non-existent');
    });

    it('should return workout with exercises grouped', async () => {
      const workout = createWorkout(workoutDefaults);
      const sets = [
        createWorkoutSet({ ...workoutSetDefaults, id: 'set-1', set_number: 1 }),
        createWorkoutSet({ ...workoutSetDefaults, id: 'set-2', set_number: 2 }),
      ];

      mockWorkoutRepo.findById.mockResolvedValue(workout);
      mockPlanDayRepo.findById.mockResolvedValue(mockPlanDay);
      mockPlanDayExerciseRepo.findByPlanDayId.mockResolvedValue([mockPlanDayExercise]);
      mockWorkoutSetRepo.findByWorkoutId.mockResolvedValue(sets);
      mockExerciseRepo.findById.mockResolvedValue(mockExercise);

      const result = await service.getById('workout-1');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('workout-1');
      expect(result?.plan_day_name).toBe('Push Day');
      expect(result?.exercises).toHaveLength(1);
      expect(result?.exercises[0]?.exercise_name).toBe('Bench Press');
      expect(result?.exercises[0]?.sets).toHaveLength(2);
    });

    it('should sort sets by set_number within each exercise', async () => {
      const workout = createWorkout(workoutDefaults);
      const sets = [
        createWorkoutSet({ ...workoutSetDefaults, id: 'set-3', set_number: 3 }),
        createWorkoutSet({ ...workoutSetDefaults, id: 'set-1', set_number: 1 }),
        createWorkoutSet({ ...workoutSetDefaults, id: 'set-2', set_number: 2 }),
      ];

      mockWorkoutRepo.findById.mockResolvedValue(workout);
      mockPlanDayRepo.findById.mockResolvedValue(mockPlanDay);
      mockPlanDayExerciseRepo.findByPlanDayId.mockResolvedValue([mockPlanDayExercise]);
      mockWorkoutSetRepo.findByWorkoutId.mockResolvedValue(sets);
      mockExerciseRepo.findById.mockResolvedValue(mockExercise);

      const result = await service.getById('workout-1');

      expect(result?.exercises[0]?.sets[0]?.set_number).toBe(1);
      expect(result?.exercises[0]?.sets[1]?.set_number).toBe(2);
      expect(result?.exercises[0]?.sets[2]?.set_number).toBe(3);
    });

    it('should count completed sets correctly', async () => {
      const workout = createWorkout({ ...workoutDefaults, status: 'in_progress' });
      const sets = [
        createWorkoutSet({ ...workoutSetDefaults, id: 'set-1', set_number: 1, status: 'completed', actual_reps: 8, actual_weight: 100 }),
        createWorkoutSet({ ...workoutSetDefaults, id: 'set-2', set_number: 2, status: 'completed', actual_reps: 8, actual_weight: 100 }),
        createWorkoutSet({ ...workoutSetDefaults, id: 'set-3', set_number: 3, status: 'pending' }),
      ];

      mockWorkoutRepo.findById.mockResolvedValue(workout);
      mockPlanDayRepo.findById.mockResolvedValue(mockPlanDay);
      mockPlanDayExerciseRepo.findByPlanDayId.mockResolvedValue([mockPlanDayExercise]);
      mockWorkoutSetRepo.findByWorkoutId.mockResolvedValue(sets);
      mockExerciseRepo.findById.mockResolvedValue(mockExercise);

      const result = await service.getById('workout-1');

      expect(result?.exercises[0]?.completed_sets).toBe(2);
      expect(result?.exercises[0]?.total_sets).toBe(3);
    });
  });

  describe('getTodaysWorkout', () => {
    it('should return null if no pending or in_progress workouts exist', async () => {
      mockWorkoutRepo.findNextPending.mockResolvedValue(null);

      const result = await service.getTodaysWorkout();

      expect(result).toBeNull();
    });

    it('should return the next pending workout with exercises', async () => {
      const workout = createWorkout(workoutDefaults);
      const sets = [createWorkoutSet(workoutSetDefaults)];

      mockWorkoutRepo.findNextPending.mockResolvedValue(workout);
      mockPlanDayRepo.findById.mockResolvedValue(mockPlanDay);
      mockPlanDayExerciseRepo.findByPlanDayId.mockResolvedValue([mockPlanDayExercise]);
      mockWorkoutSetRepo.findByWorkoutId.mockResolvedValue(sets);
      mockExerciseRepo.findById.mockResolvedValue(mockExercise);

      const result = await service.getTodaysWorkout();

      expect(result).not.toBeNull();
      expect(result?.id).toBe('workout-1');
      expect(result?.exercises).toHaveLength(1);
    });

    it('should prefer in_progress workout over pending', async () => {
      const inProgressWorkout = createWorkout({
        ...workoutDefaults,
        id: 'workout-in-progress',
        status: 'in_progress',
        started_at: '2024-01-15T10:00:00Z',
      });
      const sets = [createWorkoutSet({ ...workoutSetDefaults, workout_id: 'workout-in-progress' })];

      mockWorkoutRepo.findNextPending.mockResolvedValue(inProgressWorkout);
      mockPlanDayRepo.findById.mockResolvedValue(mockPlanDay);
      mockPlanDayExerciseRepo.findByPlanDayId.mockResolvedValue([mockPlanDayExercise]);
      mockWorkoutSetRepo.findByWorkoutId.mockResolvedValue(sets);
      mockExerciseRepo.findById.mockResolvedValue(mockExercise);

      const result = await service.getTodaysWorkout();

      expect(result?.id).toBe('workout-in-progress');
      expect(result?.status).toBe('in_progress');
    });
  });

  describe('start', () => {
    it('should throw error if workout not found', async () => {
      mockWorkoutRepo.findById.mockResolvedValue(null);

      await expect(service.start('non-existent')).rejects.toThrow(
        'Workout with id non-existent not found'
      );
    });

    it('should throw error if workout is already in progress', async () => {
      const workout = createWorkout({ ...workoutDefaults, status: 'in_progress' });
      mockWorkoutRepo.findById.mockResolvedValue(workout);

      await expect(service.start('workout-1')).rejects.toThrow(
        'Workout is already in progress'
      );
    });

    it('should throw error if workout is completed', async () => {
      const workout = createWorkout({ ...workoutDefaults, status: 'completed' });
      mockWorkoutRepo.findById.mockResolvedValue(workout);

      await expect(service.start('workout-1')).rejects.toThrow(
        'Cannot start a completed workout'
      );
    });

    it('should throw error if workout is skipped', async () => {
      const workout = createWorkout({ ...workoutDefaults, status: 'skipped' });
      mockWorkoutRepo.findById.mockResolvedValue(workout);

      await expect(service.start('workout-1')).rejects.toThrow(
        'Cannot start a skipped workout'
      );
    });

    it('should transition pending workout to in_progress', async () => {
      const workout = createWorkout(workoutDefaults);
      const updatedWorkout = createWorkout({
        ...workoutDefaults,
        status: 'in_progress',
        started_at: '2024-01-15T10:00:00Z',
      });

      mockWorkoutRepo.findById.mockResolvedValue(workout);
      mockWorkoutSetRepo.findByWorkoutId.mockResolvedValue([]);
      mockPlanDayExerciseRepo.findByPlanDayId.mockResolvedValue([]);
      mockWorkoutRepo.update.mockResolvedValue(updatedWorkout);

      const result = await service.start('workout-1');

      expect(result.status).toBe('in_progress');
      expect(mockWorkoutRepo.update).toHaveBeenCalledWith('workout-1', expect.objectContaining({
        status: 'in_progress',
        started_at: expect.any(String) as unknown as string,
      }));
    });

    it('should set started_at timestamp when starting', async () => {
      const workout = createWorkout(workoutDefaults);
      const updatedWorkout = createWorkout({
        ...workoutDefaults,
        status: 'in_progress',
        started_at: '2024-01-15T10:00:00Z',
      });

      mockWorkoutRepo.findById.mockResolvedValue(workout);
      mockWorkoutSetRepo.findByWorkoutId.mockResolvedValue([]);
      mockPlanDayExerciseRepo.findByPlanDayId.mockResolvedValue([]);
      mockWorkoutRepo.update.mockResolvedValue(updatedWorkout);

      await service.start('workout-1');

      const updateCalls = mockWorkoutRepo.update.mock.calls as [string, { started_at?: string }][];
      expect(updateCalls.length).toBeGreaterThan(0);
      const firstCall = updateCalls[0];
      if (!firstCall) throw new Error('Expected first call');
      const updateData = firstCall[1];
      expect(updateData).toHaveProperty('started_at');
      expect(typeof updateData.started_at).toBe('string');
    });

    it('should apply dynamic progression to pending sets', async () => {
      const workout = createWorkout({ ...workoutDefaults, week_number: 2 });
      const previousWorkout = createWorkout({
        ...workoutDefaults,
        id: 'prev-workout',
        week_number: 1,
        status: 'completed',
      });
      const previousSets = [
        createWorkoutSet({
          ...workoutSetDefaults,
          workout_id: 'prev-workout',
          status: 'completed',
          actual_reps: 10,
          actual_weight: 100,
        }),
      ];
      const currentSets = [createWorkoutSet(workoutSetDefaults)];
      const updatedWorkout = createWorkout({
        ...workoutDefaults,
        status: 'in_progress',
        started_at: '2024-01-15T10:00:00Z',
      });

      mockWorkoutRepo.findById.mockResolvedValue(workout);
      mockWorkoutRepo.findPreviousWeekWorkout.mockResolvedValue(previousWorkout);
      mockWorkoutSetRepo.findByWorkoutId
        .mockResolvedValueOnce(previousSets)
        .mockResolvedValueOnce(currentSets);
      mockPlanDayExerciseRepo.findByPlanDayId.mockResolvedValue([mockPlanDayExercise]);
      mockExerciseRepo.findById.mockResolvedValue(mockExercise);
      mockWorkoutRepo.update.mockResolvedValue(updatedWorkout);
      mockWorkoutSetRepo.update.mockResolvedValue(currentSets[0]);

      await service.start('workout-1');

      expect(mockWorkoutRepo.update).toHaveBeenCalled();
    });

    it('should throw error if update fails', async () => {
      const workout = createWorkout(workoutDefaults);

      mockWorkoutRepo.findById.mockResolvedValue(workout);
      mockWorkoutSetRepo.findByWorkoutId.mockResolvedValue([]);
      mockPlanDayExerciseRepo.findByPlanDayId.mockResolvedValue([]);
      mockWorkoutRepo.update.mockResolvedValue(null);

      await expect(service.start('workout-1')).rejects.toThrow(
        'Failed to update workout with id workout-1'
      );
    });
  });

  describe('complete', () => {
    it('should throw error if workout not found', async () => {
      mockWorkoutRepo.findById.mockResolvedValue(null);

      await expect(service.complete('non-existent')).rejects.toThrow(
        'Workout with id non-existent not found'
      );
    });

    it('should throw error if workout is pending', async () => {
      const workout = createWorkout({ ...workoutDefaults, status: 'pending' });
      mockWorkoutRepo.findById.mockResolvedValue(workout);

      await expect(service.complete('workout-1')).rejects.toThrow(
        'Cannot complete a workout that has not been started'
      );
    });

    it('should throw error if workout is already completed', async () => {
      const workout = createWorkout({ ...workoutDefaults, status: 'completed' });
      mockWorkoutRepo.findById.mockResolvedValue(workout);

      await expect(service.complete('workout-1')).rejects.toThrow(
        'Workout is already completed'
      );
    });

    it('should throw error if workout is skipped', async () => {
      const workout = createWorkout({ ...workoutDefaults, status: 'skipped' });
      mockWorkoutRepo.findById.mockResolvedValue(workout);

      await expect(service.complete('workout-1')).rejects.toThrow(
        'Cannot complete a skipped workout'
      );
    });

    it('should transition in_progress workout to completed', async () => {
      const workout = createWorkout({ ...workoutDefaults, status: 'in_progress', started_at: '2024-01-15T10:00:00Z' });
      const completedWorkout = createWorkout({
        ...workoutDefaults,
        status: 'completed',
        started_at: '2024-01-15T10:00:00Z',
        completed_at: '2024-01-15T11:00:00Z',
      });

      mockWorkoutRepo.findById.mockResolvedValue(workout);
      mockWorkoutRepo.update.mockResolvedValue(completedWorkout);

      const result = await service.complete('workout-1');

      expect(result.status).toBe('completed');
      expect(mockWorkoutRepo.update).toHaveBeenCalledWith('workout-1', expect.objectContaining({
        status: 'completed',
        completed_at: expect.any(String) as unknown as string,
      }));
    });

    it('should set completed_at timestamp', async () => {
      const workout = createWorkout({ ...workoutDefaults, status: 'in_progress', started_at: '2024-01-15T10:00:00Z' });
      const completedWorkout = createWorkout({
        ...workoutDefaults,
        status: 'completed',
        completed_at: '2024-01-15T11:00:00Z',
      });

      mockWorkoutRepo.findById.mockResolvedValue(workout);
      mockWorkoutRepo.update.mockResolvedValue(completedWorkout);

      await service.complete('workout-1');

      const updateCalls = mockWorkoutRepo.update.mock.calls as [string, { completed_at?: string }][];
      expect(updateCalls.length).toBeGreaterThan(0);
      const firstCall = updateCalls[0];
      if (!firstCall) throw new Error('Expected first call');
      const updateData = firstCall[1];
      expect(updateData).toHaveProperty('completed_at');
      expect(typeof updateData.completed_at).toBe('string');
    });

    it('should throw error if update fails', async () => {
      const workout = createWorkout({ ...workoutDefaults, status: 'in_progress', started_at: '2024-01-15T10:00:00Z' });

      mockWorkoutRepo.findById.mockResolvedValue(workout);
      mockWorkoutRepo.update.mockResolvedValue(null);

      await expect(service.complete('workout-1')).rejects.toThrow(
        'Failed to update workout with id workout-1'
      );
    });
  });

  describe('skip', () => {
    it('should throw error if workout not found', async () => {
      mockWorkoutRepo.findById.mockResolvedValue(null);

      await expect(service.skip('non-existent')).rejects.toThrow(
        'Workout with id non-existent not found'
      );
    });

    it('should throw error if workout is completed', async () => {
      const workout = createWorkout({ ...workoutDefaults, status: 'completed' });
      mockWorkoutRepo.findById.mockResolvedValue(workout);

      await expect(service.skip('workout-1')).rejects.toThrow(
        'Cannot skip a completed workout'
      );
    });

    it('should throw error if workout is already skipped', async () => {
      const workout = createWorkout({ ...workoutDefaults, status: 'skipped' });
      mockWorkoutRepo.findById.mockResolvedValue(workout);

      await expect(service.skip('workout-1')).rejects.toThrow(
        'Workout is already skipped'
      );
    });

    it('should transition pending workout to skipped', async () => {
      const workout = createWorkout({ ...workoutDefaults, status: 'pending' });
      const skippedWorkout = createWorkout({ ...workoutDefaults, status: 'skipped' });

      mockWorkoutRepo.findById.mockResolvedValue(workout);
      mockWorkoutSetRepo.findByWorkoutId.mockResolvedValue([]);
      mockWorkoutRepo.update.mockResolvedValue(skippedWorkout);

      const result = await service.skip('workout-1');

      expect(result.status).toBe('skipped');
      expect(mockWorkoutRepo.update).toHaveBeenCalledWith('workout-1', { status: 'skipped' });
    });

    it('should transition in_progress workout to skipped', async () => {
      const workout = createWorkout({ ...workoutDefaults, status: 'in_progress', started_at: '2024-01-15T10:00:00Z' });
      const skippedWorkout = createWorkout({ ...workoutDefaults, status: 'skipped' });

      mockWorkoutRepo.findById.mockResolvedValue(workout);
      mockWorkoutSetRepo.findByWorkoutId.mockResolvedValue([]);
      mockWorkoutRepo.update.mockResolvedValue(skippedWorkout);

      const result = await service.skip('workout-1');

      expect(result.status).toBe('skipped');
    });

    it('should mark all pending sets as skipped', async () => {
      const workout = createWorkout({ ...workoutDefaults, status: 'pending' });
      const pendingSets = [
        createWorkoutSet({ ...workoutSetDefaults, id: 'set-1', status: 'pending' }),
        createWorkoutSet({ ...workoutSetDefaults, id: 'set-2', status: 'pending' }),
      ];
      const skippedWorkout = createWorkout({ ...workoutDefaults, status: 'skipped' });

      mockWorkoutRepo.findById.mockResolvedValue(workout);
      mockWorkoutSetRepo.findByWorkoutId.mockResolvedValue(pendingSets);
      mockWorkoutSetRepo.update.mockResolvedValue({});
      mockWorkoutRepo.update.mockResolvedValue(skippedWorkout);

      await service.skip('workout-1');

      expect(mockWorkoutSetRepo.update).toHaveBeenCalledTimes(2);
      expect(mockWorkoutSetRepo.update).toHaveBeenCalledWith('set-1', { status: 'skipped' });
      expect(mockWorkoutSetRepo.update).toHaveBeenCalledWith('set-2', { status: 'skipped' });
    });

    it('should not modify already completed sets when skipping', async () => {
      const workout = createWorkout({ ...workoutDefaults, status: 'in_progress', started_at: '2024-01-15T10:00:00Z' });
      const mixedSets = [
        createWorkoutSet({ ...workoutSetDefaults, id: 'set-1', status: 'completed', actual_reps: 8, actual_weight: 100 }),
        createWorkoutSet({ ...workoutSetDefaults, id: 'set-2', status: 'pending' }),
        createWorkoutSet({ ...workoutSetDefaults, id: 'set-3', status: 'pending' }),
      ];
      const skippedWorkout = createWorkout({ ...workoutDefaults, status: 'skipped' });

      mockWorkoutRepo.findById.mockResolvedValue(workout);
      mockWorkoutSetRepo.findByWorkoutId.mockResolvedValue(mixedSets);
      mockWorkoutSetRepo.update.mockResolvedValue({});
      mockWorkoutRepo.update.mockResolvedValue(skippedWorkout);

      await service.skip('workout-1');

      expect(mockWorkoutSetRepo.update).toHaveBeenCalledTimes(2);
      expect(mockWorkoutSetRepo.update).not.toHaveBeenCalledWith('set-1', expect.anything());
    });

    it('should throw error if update fails', async () => {
      const workout = createWorkout({ ...workoutDefaults, status: 'pending' });

      mockWorkoutRepo.findById.mockResolvedValue(workout);
      mockWorkoutSetRepo.findByWorkoutId.mockResolvedValue([]);
      mockWorkoutRepo.update.mockResolvedValue(null);

      await expect(service.skip('workout-1')).rejects.toThrow(
        'Failed to update workout with id workout-1'
      );
    });
  });

  describe('calculateWarmupSets', () => {
    it('should return 2 warmup sets at 40% and 60% of working weight', () => {
      const result = WorkoutService.calculateWarmupSets(100, 8);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ warmup_number: 1, target_weight: 40, target_reps: 8 });
      expect(result[1]).toEqual({ warmup_number: 2, target_weight: 60, target_reps: 8 });
    });

    it('should round warmup weights to nearest 2.5 lbs', () => {
      // 135 * 0.4 = 54 → 54/2.5 = 21.6 → round(21.6) = 22 → 22*2.5 = 55
      // 135 * 0.6 = 81 → 81/2.5 = 32.4 → round(32.4) = 32 → 32*2.5 = 80
      const result = WorkoutService.calculateWarmupSets(135, 10);

      expect(result[0]?.target_weight).toBe(55);
      expect(result[1]?.target_weight).toBe(80);
    });

    it('should return empty array when working weight is 20 or less', () => {
      expect(WorkoutService.calculateWarmupSets(20, 8)).toEqual([]);
      expect(WorkoutService.calculateWarmupSets(15, 8)).toEqual([]);
      expect(WorkoutService.calculateWarmupSets(0, 8)).toEqual([]);
    });

    it('should return warmup sets when working weight is just above threshold', () => {
      const result = WorkoutService.calculateWarmupSets(25, 8);

      expect(result).toHaveLength(2);
      expect(result[0]?.target_weight).toBe(10);
      expect(result[1]?.target_weight).toBe(15);
    });

    it('should use target reps from working set', () => {
      const result = WorkoutService.calculateWarmupSets(200, 12);

      expect(result[0]?.target_reps).toBe(12);
      expect(result[1]?.target_reps).toBe(12);
    });

    it('should handle non-round working weights', () => {
      // 67.5 * 0.4 = 27 → rounds to 27.5
      // 67.5 * 0.6 = 40.5 → rounds to 40
      const result = WorkoutService.calculateWarmupSets(67.5, 8);

      expect(result[0]?.target_weight).toBe(27.5);
      expect(result[1]?.target_weight).toBe(40);
    });
  });

  describe('warmup sets in getById response', () => {
    it('should include warmup_sets on each exercise', async () => {
      const workout = createWorkout(workoutDefaults);
      const sets = [
        createWorkoutSet({ ...workoutSetDefaults, id: 'set-1', set_number: 1, target_weight: 100 }),
        createWorkoutSet({ ...workoutSetDefaults, id: 'set-2', set_number: 2, target_weight: 100 }),
      ];

      mockWorkoutRepo.findById.mockResolvedValue(workout);
      mockPlanDayRepo.findById.mockResolvedValue(mockPlanDay);
      mockPlanDayExerciseRepo.findByPlanDayId.mockResolvedValue([mockPlanDayExercise]);
      mockWorkoutSetRepo.findByWorkoutId.mockResolvedValue(sets);
      mockExerciseRepo.findById.mockResolvedValue(mockExercise);

      const result = await service.getById('workout-1');

      expect(result?.exercises[0]?.warmup_sets).toHaveLength(2);
      expect(result?.exercises[0]?.warmup_sets[0]?.target_weight).toBe(40);
      expect(result?.exercises[0]?.warmup_sets[1]?.target_weight).toBe(60);
    });

    it('should not include warmup_sets for low-weight exercises', async () => {
      // Use in_progress to avoid dynamic progression overriding target_weight
      const workout = createWorkout({ ...workoutDefaults, status: 'in_progress' });
      const sets = [
        createWorkoutSet({ ...workoutSetDefaults, id: 'set-1', set_number: 1, target_weight: 15 }),
      ];

      mockWorkoutRepo.findById.mockResolvedValue(workout);
      mockPlanDayRepo.findById.mockResolvedValue(mockPlanDay);
      mockPlanDayExerciseRepo.findByPlanDayId.mockResolvedValue([mockPlanDayExercise]);
      mockWorkoutSetRepo.findByWorkoutId.mockResolvedValue(sets);
      mockExerciseRepo.findById.mockResolvedValue(mockExercise);

      const result = await service.getById('workout-1');

      expect(result?.exercises[0]?.warmup_sets).toEqual([]);
    });

    it('should not count warmup sets in total_sets or completed_sets', async () => {
      const workout = createWorkout({ ...workoutDefaults, status: 'in_progress' });
      const sets = [
        createWorkoutSet({ ...workoutSetDefaults, id: 'set-1', set_number: 1, status: 'completed', actual_reps: 8, actual_weight: 100 }),
        createWorkoutSet({ ...workoutSetDefaults, id: 'set-2', set_number: 2, status: 'pending' }),
        createWorkoutSet({ ...workoutSetDefaults, id: 'set-3', set_number: 3, status: 'pending' }),
      ];

      mockWorkoutRepo.findById.mockResolvedValue(workout);
      mockPlanDayRepo.findById.mockResolvedValue(mockPlanDay);
      mockPlanDayExerciseRepo.findByPlanDayId.mockResolvedValue([mockPlanDayExercise]);
      mockWorkoutSetRepo.findByWorkoutId.mockResolvedValue(sets);
      mockExerciseRepo.findById.mockResolvedValue(mockExercise);

      const result = await service.getById('workout-1');

      // total_sets and completed_sets should only count working sets
      expect(result?.exercises[0]?.total_sets).toBe(3);
      expect(result?.exercises[0]?.completed_sets).toBe(1);
      // warmup_sets is a separate array
      expect(result?.exercises[0]?.warmup_sets).toHaveLength(2);
    });
  });
});
