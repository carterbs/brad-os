import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import type { Workout, WorkoutSet, Exercise } from '../shared.js';
import { WorkoutSetService } from './workout-set.service.js';
import {
  WorkoutSetRepository,
  WorkoutRepository,
  ExerciseRepository,
} from '../repositories/index.js';

// Mock repositories - the service imports from index.js, so we only need to mock that
vi.mock('../repositories/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../repositories/index.js')>();
  return {
    ...actual,
    createRepositories: vi.fn(() => ({
      workout: { findByMesocycleId: vi.fn() },
      workoutSet: {
        findByWorkoutAndExercise: vi.fn(),
        create: vi.fn(),
        delete: vi.fn(),
      },
      planDayExercise: { findByPlanDayId: vi.fn() },
    })),
    WorkoutSetRepository: vi.fn(),
    WorkoutRepository: vi.fn(),
    ExerciseRepository: vi.fn(),
  };
});
vi.mock('./plan-modification.service.js', () => ({
  PlanModificationService: vi.fn().mockImplementation(() => ({
    updateExerciseTargetsForFutureWorkouts: vi.fn().mockResolvedValue({
      affectedWorkoutCount: 0,
      modifiedSetsCount: 0,
    }),
  })),
}));
vi.mock('./progression.service.js', () => ({
  ProgressionService: vi.fn().mockImplementation(() => ({})),
}));

describe('WorkoutSetService', () => {
  let service: WorkoutSetService;
  let mockWorkoutSetRepo: {
    findById: Mock;
    findByWorkoutAndExercise: Mock;
    update: Mock;
    create: Mock;
    delete: Mock;
  };
  let mockWorkoutRepo: {
    findById: Mock;
    update: Mock;
  };
  let mockExerciseRepo: {
    findById: Mock;
  };

  // Fixtures
  const createMockWorkout = (overrides: Partial<Workout> = {}): Workout => ({
    id: 'workout-1',
    mesocycle_id: 'meso-1',
    plan_day_id: 'plan-day-1',
    week_number: 1,
    scheduled_date: '2024-01-15',
    status: 'in_progress',
    started_at: '2024-01-15T10:00:00Z',
    completed_at: null,
    ...overrides,
  });

  const createMockWorkoutSet = (overrides: Partial<WorkoutSet> = {}): WorkoutSet => ({
    id: 'set-1',
    workout_id: 'workout-1',
    exercise_id: 'exercise-1',
    set_number: 1,
    target_reps: 8,
    target_weight: 100,
    actual_reps: null,
    actual_weight: null,
    status: 'pending',
    ...overrides,
  });

  const mockExercise: Exercise = {
    id: 'exercise-1',
    name: 'Bench Press',
    weight_increment: 5,
    is_custom: false,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockWorkoutSetRepo = {
      findById: vi.fn(),
      findByWorkoutAndExercise: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    };

    mockWorkoutRepo = {
      findById: vi.fn(),
      update: vi.fn(),
    };

    mockExerciseRepo = {
      findById: vi.fn(),
    };

    vi.mocked(WorkoutSetRepository).mockImplementation(() => mockWorkoutSetRepo as unknown as WorkoutSetRepository);
    vi.mocked(WorkoutRepository).mockImplementation(() => mockWorkoutRepo as unknown as WorkoutRepository);
    vi.mocked(ExerciseRepository).mockImplementation(() => mockExerciseRepo as unknown as ExerciseRepository);

    service = new WorkoutSetService({} as Firestore);
  });

  describe('log', () => {
    it('should throw error if workout set not found', async () => {
      mockWorkoutSetRepo.findById.mockResolvedValue(null);

      await expect(
        service.log('non-existent', { actual_reps: 8, actual_weight: 100 })
      ).rejects.toThrow('WorkoutSet with id non-existent not found');
    });

    it('should throw error if reps is negative', async () => {
      const set = createMockWorkoutSet();
      const workout = createMockWorkout();

      mockWorkoutSetRepo.findById.mockResolvedValue(set);
      mockWorkoutRepo.findById.mockResolvedValue(workout);

      await expect(
        service.log('set-1', { actual_reps: -1, actual_weight: 100 })
      ).rejects.toThrow('Reps must be a non-negative number');
    });

    it('should throw error if weight is negative', async () => {
      const set = createMockWorkoutSet();
      const workout = createMockWorkout();

      mockWorkoutSetRepo.findById.mockResolvedValue(set);
      mockWorkoutRepo.findById.mockResolvedValue(workout);

      await expect(
        service.log('set-1', { actual_reps: 8, actual_weight: -5 })
      ).rejects.toThrow('Weight must be a non-negative number');
    });

    it('should throw error if workout not found', async () => {
      const set = createMockWorkoutSet();

      mockWorkoutSetRepo.findById.mockResolvedValue(set);
      mockWorkoutRepo.findById.mockResolvedValue(null);

      await expect(
        service.log('set-1', { actual_reps: 8, actual_weight: 100 })
      ).rejects.toThrow('Workout with id workout-1 not found');
    });

    it('should throw error if workout is completed', async () => {
      const set = createMockWorkoutSet();
      const workout = createMockWorkout({ status: 'completed' });

      mockWorkoutSetRepo.findById.mockResolvedValue(set);
      mockWorkoutRepo.findById.mockResolvedValue(workout);

      await expect(
        service.log('set-1', { actual_reps: 8, actual_weight: 100 })
      ).rejects.toThrow('Cannot log sets for a completed workout');
    });

    it('should throw error if workout is skipped', async () => {
      const set = createMockWorkoutSet();
      const workout = createMockWorkout({ status: 'skipped' });

      mockWorkoutSetRepo.findById.mockResolvedValue(set);
      mockWorkoutRepo.findById.mockResolvedValue(workout);

      await expect(
        service.log('set-1', { actual_reps: 8, actual_weight: 100 })
      ).rejects.toThrow('Cannot log sets for a skipped workout');
    });

    it('should auto-start pending workout when logging first set', async () => {
      const set = createMockWorkoutSet();
      const pendingWorkout = createMockWorkout({ status: 'pending', started_at: null });
      const loggedSet = createMockWorkoutSet({
        status: 'completed',
        actual_reps: 8,
        actual_weight: 100,
      });

      mockWorkoutSetRepo.findById.mockResolvedValue(set);
      mockWorkoutRepo.findById.mockResolvedValue(pendingWorkout);
      mockWorkoutRepo.update.mockResolvedValue({ ...pendingWorkout, status: 'in_progress' });
      mockWorkoutSetRepo.update.mockResolvedValue(loggedSet);

      await service.log('set-1', { actual_reps: 8, actual_weight: 100 });

      expect(mockWorkoutRepo.update).toHaveBeenCalledWith('workout-1', expect.objectContaining({
        status: 'in_progress',
        started_at: expect.any(String) as unknown as string,
      }));
    });

    it('should update set with actual values and status completed', async () => {
      const set = createMockWorkoutSet();
      const workout = createMockWorkout();
      const loggedSet = createMockWorkoutSet({
        status: 'completed',
        actual_reps: 10,
        actual_weight: 105,
      });

      mockWorkoutSetRepo.findById.mockResolvedValue(set);
      mockWorkoutRepo.findById.mockResolvedValue(workout);
      mockWorkoutSetRepo.update.mockResolvedValue(loggedSet);

      const result = await service.log('set-1', { actual_reps: 10, actual_weight: 105 });

      expect(result.status).toBe('completed');
      expect(result.actual_reps).toBe(10);
      expect(result.actual_weight).toBe(105);
      expect(mockWorkoutSetRepo.update).toHaveBeenCalledWith('set-1', {
        actual_reps: 10,
        actual_weight: 105,
        status: 'completed',
      });
    });

    it('should allow logging zero reps', async () => {
      const set = createMockWorkoutSet();
      const workout = createMockWorkout();
      const loggedSet = createMockWorkoutSet({
        status: 'completed',
        actual_reps: 0,
        actual_weight: 100,
      });

      mockWorkoutSetRepo.findById.mockResolvedValue(set);
      mockWorkoutRepo.findById.mockResolvedValue(workout);
      mockWorkoutSetRepo.update.mockResolvedValue(loggedSet);

      const result = await service.log('set-1', { actual_reps: 0, actual_weight: 100 });

      expect(result.actual_reps).toBe(0);
    });

    it('should allow logging zero weight', async () => {
      const set = createMockWorkoutSet();
      const workout = createMockWorkout();
      const loggedSet = createMockWorkoutSet({
        status: 'completed',
        actual_reps: 15,
        actual_weight: 0,
      });

      mockWorkoutSetRepo.findById.mockResolvedValue(set);
      mockWorkoutRepo.findById.mockResolvedValue(workout);
      mockWorkoutSetRepo.update.mockResolvedValue(loggedSet);

      const result = await service.log('set-1', { actual_reps: 15, actual_weight: 0 });

      expect(result.actual_weight).toBe(0);
    });

    it('should throw error if update fails', async () => {
      const set = createMockWorkoutSet();
      const workout = createMockWorkout();

      mockWorkoutSetRepo.findById.mockResolvedValue(set);
      mockWorkoutRepo.findById.mockResolvedValue(workout);
      mockWorkoutSetRepo.update.mockResolvedValue(null);

      await expect(
        service.log('set-1', { actual_reps: 8, actual_weight: 100 })
      ).rejects.toThrow('Failed to update WorkoutSet with id set-1');
    });
  });

  describe('skip', () => {
    it('should throw error if workout set not found', async () => {
      mockWorkoutSetRepo.findById.mockResolvedValue(null);

      await expect(service.skip('non-existent')).rejects.toThrow(
        'WorkoutSet with id non-existent not found'
      );
    });

    it('should throw error if workout not found', async () => {
      const set = createMockWorkoutSet();

      mockWorkoutSetRepo.findById.mockResolvedValue(set);
      mockWorkoutRepo.findById.mockResolvedValue(null);

      await expect(service.skip('set-1')).rejects.toThrow(
        'Workout with id workout-1 not found'
      );
    });

    it('should throw error if workout is completed', async () => {
      const set = createMockWorkoutSet();
      const workout = createMockWorkout({ status: 'completed' });

      mockWorkoutSetRepo.findById.mockResolvedValue(set);
      mockWorkoutRepo.findById.mockResolvedValue(workout);

      await expect(service.skip('set-1')).rejects.toThrow(
        'Cannot skip sets for a completed workout'
      );
    });

    it('should throw error if workout is skipped', async () => {
      const set = createMockWorkoutSet();
      const workout = createMockWorkout({ status: 'skipped' });

      mockWorkoutSetRepo.findById.mockResolvedValue(set);
      mockWorkoutRepo.findById.mockResolvedValue(workout);

      await expect(service.skip('set-1')).rejects.toThrow(
        'Cannot skip sets for a skipped workout'
      );
    });

    it('should auto-start pending workout when skipping a set', async () => {
      const set = createMockWorkoutSet();
      const pendingWorkout = createMockWorkout({ status: 'pending', started_at: null });
      const skippedSet = createMockWorkoutSet({ status: 'skipped' });

      mockWorkoutSetRepo.findById.mockResolvedValue(set);
      mockWorkoutRepo.findById.mockResolvedValue(pendingWorkout);
      mockWorkoutRepo.update.mockResolvedValue({ ...pendingWorkout, status: 'in_progress' });
      mockWorkoutSetRepo.update.mockResolvedValue(skippedSet);

      await service.skip('set-1');

      expect(mockWorkoutRepo.update).toHaveBeenCalledWith('workout-1', expect.objectContaining({
        status: 'in_progress',
        started_at: expect.any(String) as unknown as string,
      }));
    });

    it('should set status to skipped and clear actual values', async () => {
      const set = createMockWorkoutSet();
      const workout = createMockWorkout();
      const skippedSet = createMockWorkoutSet({
        status: 'skipped',
        actual_reps: null,
        actual_weight: null,
      });

      mockWorkoutSetRepo.findById.mockResolvedValue(set);
      mockWorkoutRepo.findById.mockResolvedValue(workout);
      mockWorkoutSetRepo.update.mockResolvedValue(skippedSet);

      const result = await service.skip('set-1');

      expect(result.status).toBe('skipped');
      expect(mockWorkoutSetRepo.update).toHaveBeenCalledWith('set-1', {
        actual_reps: null,
        actual_weight: null,
        status: 'skipped',
      });
    });

    it('should throw error if update fails', async () => {
      const set = createMockWorkoutSet();
      const workout = createMockWorkout();

      mockWorkoutSetRepo.findById.mockResolvedValue(set);
      mockWorkoutRepo.findById.mockResolvedValue(workout);
      mockWorkoutSetRepo.update.mockResolvedValue(null);

      await expect(service.skip('set-1')).rejects.toThrow(
        'Failed to update WorkoutSet with id set-1'
      );
    });
  });

  describe('unlog', () => {
    it('should throw error if workout set not found', async () => {
      mockWorkoutSetRepo.findById.mockResolvedValue(null);

      await expect(service.unlog('non-existent')).rejects.toThrow(
        'WorkoutSet with id non-existent not found'
      );
    });

    it('should throw error if workout not found', async () => {
      const set = createMockWorkoutSet();

      mockWorkoutSetRepo.findById.mockResolvedValue(set);
      mockWorkoutRepo.findById.mockResolvedValue(null);

      await expect(service.unlog('set-1')).rejects.toThrow(
        'Workout with id workout-1 not found'
      );
    });

    it('should throw error if workout is completed', async () => {
      const set = createMockWorkoutSet({ status: 'completed', actual_reps: 8, actual_weight: 100 });
      const workout = createMockWorkout({ status: 'completed' });

      mockWorkoutSetRepo.findById.mockResolvedValue(set);
      mockWorkoutRepo.findById.mockResolvedValue(workout);

      await expect(service.unlog('set-1')).rejects.toThrow(
        'Cannot unlog sets for a completed workout'
      );
    });

    it('should throw error if workout is skipped', async () => {
      const set = createMockWorkoutSet({ status: 'skipped' });
      const workout = createMockWorkout({ status: 'skipped' });

      mockWorkoutSetRepo.findById.mockResolvedValue(set);
      mockWorkoutRepo.findById.mockResolvedValue(workout);

      await expect(service.unlog('set-1')).rejects.toThrow(
        'Cannot unlog sets for a skipped workout'
      );
    });

    it('should revert set to pending status and clear actual values', async () => {
      const set = createMockWorkoutSet({
        status: 'completed',
        actual_reps: 10,
        actual_weight: 105,
      });
      const workout = createMockWorkout();
      const revertedSet = createMockWorkoutSet({
        status: 'pending',
        actual_reps: null,
        actual_weight: null,
      });

      mockWorkoutSetRepo.findById.mockResolvedValue(set);
      mockWorkoutRepo.findById.mockResolvedValue(workout);
      mockWorkoutSetRepo.update.mockResolvedValue(revertedSet);

      const result = await service.unlog('set-1');

      expect(result.status).toBe('pending');
      expect(result.actual_reps).toBeNull();
      expect(result.actual_weight).toBeNull();
      expect(mockWorkoutSetRepo.update).toHaveBeenCalledWith('set-1', {
        actual_reps: null,
        actual_weight: null,
        status: 'pending',
      });
    });

    it('should throw error if update fails', async () => {
      const set = createMockWorkoutSet({ status: 'completed', actual_reps: 8, actual_weight: 100 });
      const workout = createMockWorkout();

      mockWorkoutSetRepo.findById.mockResolvedValue(set);
      mockWorkoutRepo.findById.mockResolvedValue(workout);
      mockWorkoutSetRepo.update.mockResolvedValue(null);

      await expect(service.unlog('set-1')).rejects.toThrow(
        'Failed to update WorkoutSet with id set-1'
      );
    });
  });

  describe('addSetToExercise', () => {
    it('should throw error if workout not found', async () => {
      mockWorkoutRepo.findById.mockResolvedValue(null);

      await expect(
        service.addSetToExercise('workout-1', 'exercise-1')
      ).rejects.toThrow('Workout with id workout-1 not found');
    });

    it('should throw error if workout is completed', async () => {
      const workout = createMockWorkout({ status: 'completed' });
      mockWorkoutRepo.findById.mockResolvedValue(workout);

      await expect(
        service.addSetToExercise('workout-1', 'exercise-1')
      ).rejects.toThrow('Cannot add sets to a completed workout');
    });

    it('should throw error if workout is skipped', async () => {
      const workout = createMockWorkout({ status: 'skipped' });
      mockWorkoutRepo.findById.mockResolvedValue(workout);

      await expect(
        service.addSetToExercise('workout-1', 'exercise-1')
      ).rejects.toThrow('Cannot add sets to a skipped workout');
    });

    it('should throw error if no existing sets for exercise', async () => {
      const workout = createMockWorkout();
      mockWorkoutRepo.findById.mockResolvedValue(workout);
      mockWorkoutSetRepo.findByWorkoutAndExercise.mockResolvedValue([]);

      await expect(
        service.addSetToExercise('workout-1', 'exercise-1')
      ).rejects.toThrow('WorkoutSet with id exercise exercise-1 in workout workout-1 not found');
    });

    it('should copy target values from the last set', async () => {
      const workout = createMockWorkout();
      const existingSets = [
        createMockWorkoutSet({ id: 'set-1', set_number: 1, target_reps: 8, target_weight: 100 }),
        createMockWorkoutSet({ id: 'set-2', set_number: 2, target_reps: 8, target_weight: 100 }),
        createMockWorkoutSet({ id: 'set-3', set_number: 3, target_reps: 8, target_weight: 100 }),
      ];
      const newSet = createMockWorkoutSet({ id: 'set-4', set_number: 4 });

      mockWorkoutRepo.findById.mockResolvedValue(workout);
      mockWorkoutSetRepo.findByWorkoutAndExercise.mockResolvedValue(existingSets);
      mockWorkoutSetRepo.create.mockResolvedValue(newSet);
      mockExerciseRepo.findById.mockResolvedValue(mockExercise);

      await service.addSetToExercise('workout-1', 'exercise-1');

      expect(mockWorkoutSetRepo.create).toHaveBeenCalledWith({
        workout_id: 'workout-1',
        exercise_id: 'exercise-1',
        set_number: 4,
        target_reps: 8,
        target_weight: 100,
      });
    });

    it('should return result with new set and propagation info', async () => {
      const workout = createMockWorkout();
      const existingSets = [
        createMockWorkoutSet({ id: 'set-1', set_number: 1 }),
        createMockWorkoutSet({ id: 'set-2', set_number: 2 }),
      ];
      const newSet = createMockWorkoutSet({ id: 'set-3', set_number: 3 });

      mockWorkoutRepo.findById.mockResolvedValue(workout);
      mockWorkoutSetRepo.findByWorkoutAndExercise.mockResolvedValue(existingSets);
      mockWorkoutSetRepo.create.mockResolvedValue(newSet);
      mockExerciseRepo.findById.mockResolvedValue(mockExercise);

      const result = await service.addSetToExercise('workout-1', 'exercise-1');

      expect(result.currentWorkoutSet).toEqual(newSet);
      expect(typeof result.futureWorkoutsAffected).toBe('number');
      expect(typeof result.futureSetsModified).toBe('number');
    });
  });

  describe('removeSetFromExercise', () => {
    it('should throw error if workout not found', async () => {
      mockWorkoutRepo.findById.mockResolvedValue(null);

      await expect(
        service.removeSetFromExercise('workout-1', 'exercise-1')
      ).rejects.toThrow('Workout with id workout-1 not found');
    });

    it('should throw error if workout is completed', async () => {
      const workout = createMockWorkout({ status: 'completed' });
      mockWorkoutRepo.findById.mockResolvedValue(workout);

      await expect(
        service.removeSetFromExercise('workout-1', 'exercise-1')
      ).rejects.toThrow('Cannot remove sets from a completed workout');
    });

    it('should throw error if workout is skipped', async () => {
      const workout = createMockWorkout({ status: 'skipped' });
      mockWorkoutRepo.findById.mockResolvedValue(workout);

      await expect(
        service.removeSetFromExercise('workout-1', 'exercise-1')
      ).rejects.toThrow('Cannot remove sets from a skipped workout');
    });

    it('should throw error if no existing sets for exercise', async () => {
      const workout = createMockWorkout();
      mockWorkoutRepo.findById.mockResolvedValue(workout);
      mockWorkoutSetRepo.findByWorkoutAndExercise.mockResolvedValue([]);

      await expect(
        service.removeSetFromExercise('workout-1', 'exercise-1')
      ).rejects.toThrow('WorkoutSet with id exercise exercise-1 in workout workout-1 not found');
    });

    it('should throw error if trying to remove the last set', async () => {
      const workout = createMockWorkout();
      const existingSets = [
        createMockWorkoutSet({ id: 'set-1', set_number: 1 }),
      ];

      mockWorkoutRepo.findById.mockResolvedValue(workout);
      mockWorkoutSetRepo.findByWorkoutAndExercise.mockResolvedValue(existingSets);

      await expect(
        service.removeSetFromExercise('workout-1', 'exercise-1')
      ).rejects.toThrow('Cannot remove the last set from an exercise');
    });

    it('should throw error if no pending sets to remove', async () => {
      const workout = createMockWorkout();
      const existingSets = [
        createMockWorkoutSet({ id: 'set-1', set_number: 1, status: 'completed', actual_reps: 8, actual_weight: 100 }),
        createMockWorkoutSet({ id: 'set-2', set_number: 2, status: 'completed', actual_reps: 8, actual_weight: 100 }),
      ];

      mockWorkoutRepo.findById.mockResolvedValue(workout);
      mockWorkoutSetRepo.findByWorkoutAndExercise.mockResolvedValue(existingSets);

      await expect(
        service.removeSetFromExercise('workout-1', 'exercise-1')
      ).rejects.toThrow('No pending sets to remove');
    });

    it('should only remove pending sets (preserve logged sets)', async () => {
      const workout = createMockWorkout();
      const existingSets = [
        createMockWorkoutSet({ id: 'set-1', set_number: 1, status: 'completed', actual_reps: 8, actual_weight: 100 }),
        createMockWorkoutSet({ id: 'set-2', set_number: 2, status: 'completed', actual_reps: 8, actual_weight: 100 }),
        createMockWorkoutSet({ id: 'set-3', set_number: 3, status: 'pending' }),
      ];

      mockWorkoutRepo.findById.mockResolvedValue(workout);
      mockWorkoutSetRepo.findByWorkoutAndExercise.mockResolvedValue(existingSets);
      mockWorkoutSetRepo.delete.mockResolvedValue(true);
      mockExerciseRepo.findById.mockResolvedValue(mockExercise);

      await service.removeSetFromExercise('workout-1', 'exercise-1');

      expect(mockWorkoutSetRepo.delete).toHaveBeenCalledWith('set-3');
      expect(mockWorkoutSetRepo.delete).not.toHaveBeenCalledWith('set-1');
      expect(mockWorkoutSetRepo.delete).not.toHaveBeenCalledWith('set-2');
    });

    it('should remove the last pending set by set_number', async () => {
      const workout = createMockWorkout();
      const existingSets = [
        createMockWorkoutSet({ id: 'set-1', set_number: 1, status: 'pending' }),
        createMockWorkoutSet({ id: 'set-2', set_number: 2, status: 'pending' }),
        createMockWorkoutSet({ id: 'set-3', set_number: 3, status: 'pending' }),
      ];

      mockWorkoutRepo.findById.mockResolvedValue(workout);
      mockWorkoutSetRepo.findByWorkoutAndExercise.mockResolvedValue(existingSets);
      mockWorkoutSetRepo.delete.mockResolvedValue(true);
      mockExerciseRepo.findById.mockResolvedValue(mockExercise);

      await service.removeSetFromExercise('workout-1', 'exercise-1');

      expect(mockWorkoutSetRepo.delete).toHaveBeenCalledWith('set-3');
    });

    it('should return result with null currentWorkoutSet and propagation info', async () => {
      const workout = createMockWorkout();
      const existingSets = [
        createMockWorkoutSet({ id: 'set-1', set_number: 1, status: 'pending' }),
        createMockWorkoutSet({ id: 'set-2', set_number: 2, status: 'pending' }),
      ];

      mockWorkoutRepo.findById.mockResolvedValue(workout);
      mockWorkoutSetRepo.findByWorkoutAndExercise.mockResolvedValue(existingSets);
      mockWorkoutSetRepo.delete.mockResolvedValue(true);
      mockExerciseRepo.findById.mockResolvedValue(mockExercise);

      const result = await service.removeSetFromExercise('workout-1', 'exercise-1');

      expect(result.currentWorkoutSet).toBeNull();
      expect(typeof result.futureWorkoutsAffected).toBe('number');
      expect(typeof result.futureSetsModified).toBe('number');
    });
  });
});
