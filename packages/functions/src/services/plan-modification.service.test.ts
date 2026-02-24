import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type {
  WorkoutSet,
  PlanDayExercise,
} from '../shared.js';
import { PlanModificationService } from './plan-modification.service.js';
import { ProgressionService } from './progression.service.js';
import type { createRepositories } from '../repositories/index.js';
import { createWorkout, createWorkoutSet, createPlanDayExercise, createExercise } from '../__tests__/utils/index.js';

type Repositories = ReturnType<typeof createRepositories>;

describe('PlanModificationService', () => {
  let service: PlanModificationService;
  let mockRepos: {
    workout: {
      findByMesocycleId: Mock;
    };
    workoutSet: {
      findByWorkoutId: Mock;
      findByWorkoutAndExercise: Mock;
      create: Mock;
      delete: Mock;
    };
    planDayExercise: {
      findByPlanDayId: Mock;
    };
    mesocycle: {
      findById: Mock;
    };
  };
  let mockProgressionService: {
    calculateTargetsForWeek: Mock;
  };

  // Shared default overrides matching original inline factory defaults
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

  const planDayExerciseDefaults = {
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
  };

  const mockExercise = createExercise({
    id: 'exercise-1',
    name: 'Bench Press',
    weight_increment: 5,
    is_custom: false,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  });

  beforeEach(() => {
    vi.clearAllMocks();

    mockRepos = {
      workout: {
        findByMesocycleId: vi.fn(),
      },
      workoutSet: {
        findByWorkoutId: vi.fn(),
        findByWorkoutAndExercise: vi.fn(),
        create: vi.fn(),
        delete: vi.fn(),
      },
      planDayExercise: {
        findByPlanDayId: vi.fn(),
      },
      mesocycle: {
        findById: vi.fn(),
      },
    };

    mockProgressionService = {
      calculateTargetsForWeek: vi.fn().mockReturnValue({
        exerciseId: 'exercise-1',
        planExerciseId: 'pde-1',
        targetWeight: 100,
        targetReps: 8,
        targetSets: 3,
        weekNumber: 1,
        isDeload: false,
      }),
    };

    service = new PlanModificationService(
      mockRepos as unknown as Repositories,
      mockProgressionService as unknown as ProgressionService
    );
  });

  describe('diffPlanDayExercises', () => {
    it('should detect added exercises', () => {
      const oldExercises: PlanDayExercise[] = [];
      const newExercises = [createPlanDayExercise(planDayExerciseDefaults)];

      const diff = service.diffPlanDayExercises('plan-day-1', oldExercises, newExercises);

      expect(diff.addedExercises).toHaveLength(1);
      expect(diff.addedExercises[0]?.exerciseId).toBe('exercise-1');
      expect(diff.removedExercises).toHaveLength(0);
      expect(diff.modifiedExercises).toHaveLength(0);
    });

    it('should detect removed exercises', () => {
      const oldExercises = [createPlanDayExercise(planDayExerciseDefaults)];
      const newExercises: PlanDayExercise[] = [];

      const diff = service.diffPlanDayExercises('plan-day-1', oldExercises, newExercises);

      expect(diff.removedExercises).toHaveLength(1);
      expect(diff.removedExercises[0]?.exerciseId).toBe('exercise-1');
      expect(diff.addedExercises).toHaveLength(0);
      expect(diff.modifiedExercises).toHaveLength(0);
    });

    it('should detect modified exercises - sets changed', () => {
      const oldExercises = [createPlanDayExercise({ ...planDayExerciseDefaults, sets: 3 })];
      const newExercises = [createPlanDayExercise({ ...planDayExerciseDefaults, sets: 4 })];

      const diff = service.diffPlanDayExercises('plan-day-1', oldExercises, newExercises);

      expect(diff.modifiedExercises).toHaveLength(1);
      expect(diff.modifiedExercises[0]?.changes.sets).toBe(4);
      expect(diff.addedExercises).toHaveLength(0);
      expect(diff.removedExercises).toHaveLength(0);
    });

    it('should detect modified exercises - reps changed', () => {
      const oldExercises = [createPlanDayExercise({ ...planDayExerciseDefaults, reps: 8 })];
      const newExercises = [createPlanDayExercise({ ...planDayExerciseDefaults, reps: 10 })];

      const diff = service.diffPlanDayExercises('plan-day-1', oldExercises, newExercises);

      expect(diff.modifiedExercises).toHaveLength(1);
      expect(diff.modifiedExercises[0]?.changes.reps).toBe(10);
    });

    it('should detect modified exercises - weight changed', () => {
      const oldExercises = [createPlanDayExercise({ ...planDayExerciseDefaults, weight: 100 })];
      const newExercises = [createPlanDayExercise({ ...planDayExerciseDefaults, weight: 110 })];

      const diff = service.diffPlanDayExercises('plan-day-1', oldExercises, newExercises);

      expect(diff.modifiedExercises).toHaveLength(1);
      expect(diff.modifiedExercises[0]?.changes.weight).toBe(110);
    });

    it('should detect modified exercises - rest_seconds changed', () => {
      const oldExercises = [createPlanDayExercise({ ...planDayExerciseDefaults, rest_seconds: 90 })];
      const newExercises = [createPlanDayExercise({ ...planDayExerciseDefaults, rest_seconds: 120 })];

      const diff = service.diffPlanDayExercises('plan-day-1', oldExercises, newExercises);

      expect(diff.modifiedExercises).toHaveLength(1);
      expect(diff.modifiedExercises[0]?.changes.rest_seconds).toBe(120);
    });

    it('should not report unchanged exercises as modified', () => {
      const exercises = [createPlanDayExercise(planDayExerciseDefaults)];

      const diff = service.diffPlanDayExercises('plan-day-1', exercises, exercises);

      expect(diff.modifiedExercises).toHaveLength(0);
      expect(diff.addedExercises).toHaveLength(0);
      expect(diff.removedExercises).toHaveLength(0);
    });

    it('should handle multiple changes in same diff', () => {
      const oldExercises = [
        createPlanDayExercise({ ...planDayExerciseDefaults, id: 'pde-1', exercise_id: 'ex-1' }),
        createPlanDayExercise({ ...planDayExerciseDefaults, id: 'pde-2', exercise_id: 'ex-2', sets: 3 }),
      ];
      const newExercises = [
        createPlanDayExercise({ ...planDayExerciseDefaults, id: 'pde-2', exercise_id: 'ex-2', sets: 4 }),
        createPlanDayExercise({ ...planDayExerciseDefaults, id: 'pde-3', exercise_id: 'ex-3' }),
      ];

      const diff = service.diffPlanDayExercises('plan-day-1', oldExercises, newExercises);

      expect(diff.addedExercises).toHaveLength(1);
      expect(diff.removedExercises).toHaveLength(1);
      expect(diff.modifiedExercises).toHaveLength(1);
    });
  });

  describe('addExerciseToFutureWorkouts', () => {
    it('should add sets to pending workouts matching plan day', async () => {
      const pendingWorkouts = [
        createWorkout({ ...workoutDefaults, id: 'w1', week_number: 1, status: 'pending' }),
        createWorkout({ ...workoutDefaults, id: 'w2', week_number: 2, status: 'pending' }),
      ];
      const pde = createPlanDayExercise(planDayExerciseDefaults);

      mockRepos.workout.findByMesocycleId.mockResolvedValue(pendingWorkouts);
      mockRepos.workoutSet.create.mockResolvedValue(createWorkoutSet(workoutSetDefaults));

      const result = await service.addExerciseToFutureWorkouts(
        'meso-1',
        'plan-day-1',
        pde,
        mockExercise
      );

      // 2 workouts x 3 sets each = 6 sets
      expect(mockRepos.workoutSet.create).toHaveBeenCalledTimes(6);
      expect(result.affectedWorkoutCount).toBe(2);
      expect(result.addedSetsCount).toBe(6);
    });

    it('should apply progressive overload based on week number', async () => {
      const pendingWorkouts = [
        createWorkout({ ...workoutDefaults, id: 'w1', week_number: 1, status: 'pending' }),
        createWorkout({ ...workoutDefaults, id: 'w2', week_number: 3, status: 'pending' }),
      ];
      const pde = createPlanDayExercise(planDayExerciseDefaults);

      mockRepos.workout.findByMesocycleId.mockResolvedValue(pendingWorkouts);
      mockRepos.workoutSet.create.mockResolvedValue(createWorkoutSet(workoutSetDefaults));
      mockProgressionService.calculateTargetsForWeek
        .mockReturnValueOnce({ targetWeight: 100, targetReps: 8, targetSets: 3 })
        .mockReturnValueOnce({ targetWeight: 100, targetReps: 8, targetSets: 3 })
        .mockReturnValueOnce({ targetWeight: 100, targetReps: 8, targetSets: 3 })
        .mockReturnValueOnce({ targetWeight: 105, targetReps: 9, targetSets: 3 })
        .mockReturnValueOnce({ targetWeight: 105, targetReps: 9, targetSets: 3 })
        .mockReturnValueOnce({ targetWeight: 105, targetReps: 9, targetSets: 3 });

      await service.addExerciseToFutureWorkouts('meso-1', 'plan-day-1', pde, mockExercise);

      expect(mockProgressionService.calculateTargetsForWeek).toHaveBeenCalledWith(
        expect.objectContaining({ exerciseId: 'exercise-1' }),
        1,
        true
      );
      expect(mockProgressionService.calculateTargetsForWeek).toHaveBeenCalledWith(
        expect.objectContaining({ exerciseId: 'exercise-1' }),
        3,
        true
      );
    });

    it('should only affect workouts matching plan day', async () => {
      const workouts = [
        createWorkout({ ...workoutDefaults, id: 'w1', plan_day_id: 'plan-day-1', status: 'pending' }),
        createWorkout({ ...workoutDefaults, id: 'w2', plan_day_id: 'plan-day-2', status: 'pending' }),
      ];
      const pde = createPlanDayExercise(planDayExerciseDefaults);

      mockRepos.workout.findByMesocycleId.mockResolvedValue(workouts);
      mockRepos.workoutSet.create.mockResolvedValue(createWorkoutSet(workoutSetDefaults));

      const result = await service.addExerciseToFutureWorkouts(
        'meso-1',
        'plan-day-1',
        pde,
        mockExercise
      );

      expect(result.affectedWorkoutCount).toBe(1);
    });

    it('should not add to non-pending workouts', async () => {
      const workouts = [
        createWorkout({ ...workoutDefaults, id: 'w1', status: 'pending' }),
        createWorkout({ ...workoutDefaults, id: 'w2', status: 'completed' }),
        createWorkout({ ...workoutDefaults, id: 'w3', status: 'in_progress' }),
        createWorkout({ ...workoutDefaults, id: 'w4', status: 'skipped' }),
      ];
      const pde = createPlanDayExercise(planDayExerciseDefaults);

      mockRepos.workout.findByMesocycleId.mockResolvedValue(workouts);
      mockRepos.workoutSet.create.mockResolvedValue(createWorkoutSet(workoutSetDefaults));

      const result = await service.addExerciseToFutureWorkouts(
        'meso-1',
        'plan-day-1',
        pde,
        mockExercise
      );

      expect(result.affectedWorkoutCount).toBe(1);
    });
  });

  describe('removeExerciseFromFutureWorkouts', () => {
    it('should remove pending sets only', async () => {
      const pendingWorkouts = [createWorkout({ ...workoutDefaults, status: 'pending' })];
      const sets = [
        createWorkoutSet({ ...workoutSetDefaults, id: 'set-1', status: 'pending' }),
        createWorkoutSet({ ...workoutSetDefaults, id: 'set-2', status: 'pending' }),
      ];

      mockRepos.workout.findByMesocycleId.mockResolvedValue(pendingWorkouts);
      mockRepos.workoutSet.findByWorkoutAndExercise.mockResolvedValue(sets);
      mockRepos.workoutSet.delete.mockResolvedValue(true);

      const result = await service.removeExerciseFromFutureWorkouts(
        'meso-1',
        'plan-day-1',
        'exercise-1'
      );

      expect(mockRepos.workoutSet.delete).toHaveBeenCalledTimes(2);
      expect(result.removedSetsCount).toBe(2);
    });

    it('should preserve sets with logged data', async () => {
      const pendingWorkouts = [createWorkout({ ...workoutDefaults, status: 'pending' })];
      const sets = [
        createWorkoutSet({ ...workoutSetDefaults, id: 'set-1', status: 'completed', actual_reps: 8, actual_weight: 100 }),
        createWorkoutSet({ ...workoutSetDefaults, id: 'set-2', status: 'pending' }),
      ];

      mockRepos.workout.findByMesocycleId.mockResolvedValue(pendingWorkouts);
      mockRepos.workoutSet.findByWorkoutAndExercise.mockResolvedValue(sets);
      mockRepos.workoutSet.delete.mockResolvedValue(true);

      const result = await service.removeExerciseFromFutureWorkouts(
        'meso-1',
        'plan-day-1',
        'exercise-1'
      );

      // Since workout has logged data, it's preserved and not deleted
      expect(result.preservedCount).toBe(1);
      expect(result.warnings).toHaveLength(1);
    });

    it('should return warnings for preserved workouts', async () => {
      const pendingWorkouts = [createWorkout({ ...workoutDefaults, scheduled_date: '2024-01-15', status: 'pending' })];
      const setsWithLoggedData = [
        createWorkoutSet({ ...workoutSetDefaults, status: 'completed', actual_reps: 8, actual_weight: 100 }),
      ];

      mockRepos.workout.findByMesocycleId.mockResolvedValue(pendingWorkouts);
      mockRepos.workoutSet.findByWorkoutAndExercise.mockResolvedValue(setsWithLoggedData);

      const result = await service.removeExerciseFromFutureWorkouts(
        'meso-1',
        'plan-day-1',
        'exercise-1'
      );

      expect(result.warnings).toContain(
        'Workout on 2024-01-15 has logged data - exercise sets preserved'
      );
    });

    it('should only affect workouts matching plan day', async () => {
      const workouts = [
        createWorkout({ ...workoutDefaults, id: 'w1', plan_day_id: 'plan-day-1', status: 'pending' }),
        createWorkout({ ...workoutDefaults, id: 'w2', plan_day_id: 'plan-day-2', status: 'pending' }),
      ];
      const sets = [createWorkoutSet({ ...workoutSetDefaults, status: 'pending' })];

      mockRepos.workout.findByMesocycleId.mockResolvedValue(workouts);
      mockRepos.workoutSet.findByWorkoutAndExercise.mockResolvedValue(sets);
      mockRepos.workoutSet.delete.mockResolvedValue(true);

      await service.removeExerciseFromFutureWorkouts('meso-1', 'plan-day-1', 'exercise-1');

      // Should only call findByWorkoutAndExercise for matching plan day
      expect(mockRepos.workoutSet.findByWorkoutAndExercise).toHaveBeenCalledTimes(1);
    });
  });

  describe('updateExerciseTargetsForFutureWorkouts', () => {
    it('should update pending sets with new targets', async () => {
      const pendingWorkouts = [createWorkout({ ...workoutDefaults, status: 'pending' })];
      const existingSets = [
        createWorkoutSet({ ...workoutSetDefaults, id: 'set-1', status: 'pending' }),
        createWorkoutSet({ ...workoutSetDefaults, id: 'set-2', status: 'pending' }),
      ];
      const pde = createPlanDayExercise(planDayExerciseDefaults);

      mockRepos.workout.findByMesocycleId.mockResolvedValue(pendingWorkouts);
      mockRepos.workoutSet.findByWorkoutAndExercise.mockResolvedValue(existingSets);
      mockRepos.planDayExercise.findByPlanDayId.mockResolvedValue([pde]);
      mockRepos.workoutSet.delete.mockResolvedValue(true);
      mockRepos.workoutSet.create.mockResolvedValue(createWorkoutSet(workoutSetDefaults));
      mockProgressionService.calculateTargetsForWeek.mockReturnValue({
        targetWeight: 110,
        targetReps: 10,
        targetSets: 3,
      });

      const result = await service.updateExerciseTargetsForFutureWorkouts(
        'meso-1',
        'plan-day-1',
        'exercise-1',
        { reps: 10, weight: 110 },
        5
      );

      expect(result.affectedWorkoutCount).toBe(1);
      expect(result.modifiedSetsCount).toBeGreaterThan(0);
    });

    it('should recalculate progression from new base values', async () => {
      const pendingWorkouts = [
        createWorkout({ ...workoutDefaults, id: 'w1', week_number: 2, status: 'pending' }),
      ];
      const existingSets = [createWorkoutSet({ ...workoutSetDefaults, status: 'pending', target_reps: 8, target_weight: 100 })];
      const pde = createPlanDayExercise(planDayExerciseDefaults);

      mockRepos.workout.findByMesocycleId.mockResolvedValue(pendingWorkouts);
      mockRepos.workoutSet.findByWorkoutAndExercise.mockResolvedValue(existingSets);
      mockRepos.planDayExercise.findByPlanDayId.mockResolvedValue([pde]);
      mockRepos.workoutSet.delete.mockResolvedValue(true);
      mockRepos.workoutSet.create.mockResolvedValue(createWorkoutSet(workoutSetDefaults));

      await service.updateExerciseTargetsForFutureWorkouts(
        'meso-1',
        'plan-day-1',
        'exercise-1',
        { weight: 120 },
        5
      );

      expect(mockProgressionService.calculateTargetsForWeek).toHaveBeenCalledWith(
        expect.objectContaining({ baseWeight: 120 }),
        2,
        true
      );
    });

    it('should add sets when set count increases', async () => {
      const pendingWorkouts = [createWorkout({ ...workoutDefaults, status: 'pending' })];
      const existingSets = [
        createWorkoutSet({ ...workoutSetDefaults, id: 'set-1', set_number: 1, status: 'pending' }),
        createWorkoutSet({ ...workoutSetDefaults, id: 'set-2', set_number: 2, status: 'pending' }),
      ];
      const pde = createPlanDayExercise(planDayExerciseDefaults);

      mockRepos.workout.findByMesocycleId.mockResolvedValue(pendingWorkouts);
      mockRepos.workoutSet.findByWorkoutAndExercise.mockResolvedValue(existingSets);
      mockRepos.planDayExercise.findByPlanDayId.mockResolvedValue([pde]);
      mockRepos.workoutSet.create.mockResolvedValue(createWorkoutSet(workoutSetDefaults));
      mockProgressionService.calculateTargetsForWeek.mockReturnValue({
        targetWeight: 100,
        targetReps: 8,
        targetSets: 4,
      });

      await service.updateExerciseTargetsForFutureWorkouts(
        'meso-1',
        'plan-day-1',
        'exercise-1',
        { sets: 4 },
        5
      );

      // Should create 2 new sets (4 - 2)
      expect(mockRepos.workoutSet.create).toHaveBeenCalled();
    });

    it('should remove sets when set count decreases', async () => {
      const pendingWorkouts = [createWorkout({ ...workoutDefaults, status: 'pending' })];
      const existingSets = [
        createWorkoutSet({ ...workoutSetDefaults, id: 'set-1', set_number: 1, status: 'pending' }),
        createWorkoutSet({ ...workoutSetDefaults, id: 'set-2', set_number: 2, status: 'pending' }),
        createWorkoutSet({ ...workoutSetDefaults, id: 'set-3', set_number: 3, status: 'pending' }),
        createWorkoutSet({ ...workoutSetDefaults, id: 'set-4', set_number: 4, status: 'pending' }),
      ];
      const pde = createPlanDayExercise(planDayExerciseDefaults);

      mockRepos.workout.findByMesocycleId.mockResolvedValue(pendingWorkouts);
      mockRepos.workoutSet.findByWorkoutAndExercise.mockResolvedValue(existingSets);
      mockRepos.planDayExercise.findByPlanDayId.mockResolvedValue([pde]);
      mockRepos.workoutSet.delete.mockResolvedValue(true);
      mockProgressionService.calculateTargetsForWeek.mockReturnValue({
        targetWeight: 100,
        targetReps: 8,
        targetSets: 2,
      });

      await service.updateExerciseTargetsForFutureWorkouts(
        'meso-1',
        'plan-day-1',
        'exercise-1',
        { sets: 2 },
        5
      );

      expect(mockRepos.workoutSet.delete).toHaveBeenCalled();
    });

    it('should not modify completed sets when updating targets', async () => {
      const pendingWorkouts = [createWorkout({ ...workoutDefaults, status: 'pending' })];
      const mixedSets = [
        createWorkoutSet({ ...workoutSetDefaults, id: 'set-1', status: 'completed', actual_reps: 8, actual_weight: 100 }),
        createWorkoutSet({ ...workoutSetDefaults, id: 'set-2', status: 'pending' }),
      ];
      const pde = createPlanDayExercise(planDayExerciseDefaults);

      mockRepos.workout.findByMesocycleId.mockResolvedValue(pendingWorkouts);
      mockRepos.workoutSet.findByWorkoutAndExercise.mockResolvedValue(mixedSets);
      mockRepos.planDayExercise.findByPlanDayId.mockResolvedValue([pde]);
      mockRepos.workoutSet.delete.mockResolvedValue(true);
      mockRepos.workoutSet.create.mockResolvedValue(createWorkoutSet(workoutSetDefaults));
      mockProgressionService.calculateTargetsForWeek.mockReturnValue({
        targetWeight: 110,
        targetReps: 10,
        targetSets: 2,
      });

      await service.updateExerciseTargetsForFutureWorkouts(
        'meso-1',
        'plan-day-1',
        'exercise-1',
        { reps: 10 },
        5
      );

      // Should only delete/recreate the pending set, not the completed one
      const deleteCalls = mockRepos.workoutSet.delete.mock.calls as [string][];
      const deletedIds = deleteCalls.map((call) => call[0]);
      expect(deletedIds).not.toContain('set-1');
    });
  });

  describe('syncPlanToMesocycle', () => {
    it('should add exercises not in workout', async () => {
      const pendingWorkouts = [createWorkout({ ...workoutDefaults, status: 'pending' })];
      const existingSets: WorkoutSet[] = [];
      const planExercises = [createPlanDayExercise(planDayExerciseDefaults)];
      const exerciseMap = new Map([['exercise-1', mockExercise]]);

      mockRepos.workout.findByMesocycleId.mockResolvedValue(pendingWorkouts);
      mockRepos.workoutSet.findByWorkoutId.mockResolvedValue(existingSets);
      mockRepos.workoutSet.findByWorkoutAndExercise.mockResolvedValue([]);
      mockRepos.workoutSet.create.mockResolvedValue(createWorkoutSet(workoutSetDefaults));
      mockProgressionService.calculateTargetsForWeek.mockReturnValue({
        targetWeight: 100,
        targetReps: 8,
        targetSets: 3,
      });

      const result = await service.syncPlanToMesocycle(
        'meso-1',
        'plan-day-1',
        planExercises,
        exerciseMap
      );

      expect(result.addedSetsCount).toBe(3);
    });

    it('should remove exercises not in plan', async () => {
      const pendingWorkouts = [createWorkout({ ...workoutDefaults, status: 'pending' })];
      const existingSets = [
        createWorkoutSet({ ...workoutSetDefaults, exercise_id: 'removed-exercise', status: 'pending' }),
      ];
      const planExercises: PlanDayExercise[] = [];
      const exerciseMap = new Map<string, ReturnType<typeof createExercise>>();

      mockRepos.workout.findByMesocycleId.mockResolvedValue(pendingWorkouts);
      mockRepos.workoutSet.findByWorkoutId.mockResolvedValue(existingSets);
      mockRepos.workoutSet.delete.mockResolvedValue(true);

      const result = await service.syncPlanToMesocycle(
        'meso-1',
        'plan-day-1',
        planExercises,
        exerciseMap
      );

      expect(result.removedSetsCount).toBe(1);
    });

    it('should preserve logged data when syncing', async () => {
      const pendingWorkouts = [createWorkout({ ...workoutDefaults, status: 'pending' })];
      const loggedSets = [
        createWorkoutSet({
          ...workoutSetDefaults,
          exercise_id: 'removed-exercise',
          status: 'completed',
          actual_reps: 8,
          actual_weight: 100,
        }),
      ];
      const planExercises: PlanDayExercise[] = [];
      const exerciseMap = new Map<string, ReturnType<typeof createExercise>>();

      mockRepos.workout.findByMesocycleId.mockResolvedValue(pendingWorkouts);
      mockRepos.workoutSet.findByWorkoutId.mockResolvedValue(loggedSets);

      const result = await service.syncPlanToMesocycle(
        'meso-1',
        'plan-day-1',
        planExercises,
        exerciseMap
      );

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(mockRepos.workoutSet.delete).not.toHaveBeenCalled();
    });

    it('should return empty result if no future workouts', async () => {
      mockRepos.workout.findByMesocycleId.mockResolvedValue([
        createWorkout({ ...workoutDefaults, status: 'completed' }),
      ]);

      const result = await service.syncPlanToMesocycle(
        'meso-1',
        'plan-day-1',
        [],
        new Map()
      );

      expect(result.affectedWorkoutCount).toBe(0);
    });

    it('should update set counts for existing exercises', async () => {
      const pendingWorkouts = [createWorkout({ ...workoutDefaults, status: 'pending' })];
      const existingSets = [
        createWorkoutSet({ ...workoutSetDefaults, id: 'set-1', set_number: 1, status: 'pending' }),
        createWorkoutSet({ ...workoutSetDefaults, id: 'set-2', set_number: 2, status: 'pending' }),
      ];
      const planExercises = [createPlanDayExercise({ ...planDayExerciseDefaults, sets: 4 })];
      const exerciseMap = new Map([['exercise-1', mockExercise]]);

      mockRepos.workout.findByMesocycleId.mockResolvedValue(pendingWorkouts);
      mockRepos.workoutSet.findByWorkoutId.mockResolvedValue(existingSets);
      mockRepos.workoutSet.findByWorkoutAndExercise.mockResolvedValue(existingSets);
      mockRepos.workoutSet.create.mockResolvedValue(createWorkoutSet(workoutSetDefaults));
      mockProgressionService.calculateTargetsForWeek.mockReturnValue({
        targetWeight: 100,
        targetReps: 8,
        targetSets: 4,
      });

      const result = await service.syncPlanToMesocycle(
        'meso-1',
        'plan-day-1',
        planExercises,
        exerciseMap
      );

      expect(result.addedSetsCount).toBeGreaterThan(0);
    });
  });

  describe('getFutureWorkouts', () => {
    it('should return only pending workouts', async () => {
      const workouts = [
        createWorkout({ ...workoutDefaults, id: 'w1', status: 'pending' }),
        createWorkout({ ...workoutDefaults, id: 'w2', status: 'in_progress' }),
        createWorkout({ ...workoutDefaults, id: 'w3', status: 'completed' }),
        createWorkout({ ...workoutDefaults, id: 'w4', status: 'skipped' }),
        createWorkout({ ...workoutDefaults, id: 'w5', status: 'pending' }),
      ];

      mockRepos.workout.findByMesocycleId.mockResolvedValue(workouts);

      const result = await service.getFutureWorkouts('meso-1');

      expect(result).toHaveLength(2);
      expect(result.every((w) => w.status === 'pending')).toBe(true);
    });

    it('should return empty array if no pending workouts', async () => {
      const workouts = [
        createWorkout({ ...workoutDefaults, status: 'completed' }),
        createWorkout({ ...workoutDefaults, status: 'skipped' }),
      ];

      mockRepos.workout.findByMesocycleId.mockResolvedValue(workouts);

      const result = await service.getFutureWorkouts('meso-1');

      expect(result).toHaveLength(0);
    });
  });
});
