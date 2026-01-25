import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExerciseHistoryService } from '../exercise-history.service.js';
import type { WorkoutSetRepository } from '../../repositories/workout-set.repository.js';
import type { ExerciseRepository } from '../../repositories/exercise.repository.js';
import type { CompletedSetRow } from '../../repositories/workout-set.repository.js';
import type { Exercise, ExerciseHistory } from '@brad-os/shared';

function createMockExerciseRepo(): {
  findById: ReturnType<typeof vi.fn>;
} & Pick<ExerciseRepository, 'findById'> {
  return {
    findById: vi.fn(),
  };
}

function createMockWorkoutSetRepo(): {
  findCompletedByExerciseId: ReturnType<typeof vi.fn>;
} & Pick<WorkoutSetRepository, 'findCompletedByExerciseId'> {
  return {
    findCompletedByExerciseId: vi.fn(),
  };
}

function createMockExercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: 1,
    name: 'Bench Press',
    weight_increment: 5,
    is_custom: false,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('ExerciseHistoryService', () => {
  let service: ExerciseHistoryService;
  let mockWorkoutSetRepo: ReturnType<typeof createMockWorkoutSetRepo>;
  let mockExerciseRepo: ReturnType<typeof createMockExerciseRepo>;

  beforeEach(() => {
    mockWorkoutSetRepo = createMockWorkoutSetRepo();
    mockExerciseRepo = createMockExerciseRepo();
    service = new ExerciseHistoryService(
      mockWorkoutSetRepo as unknown as WorkoutSetRepository,
      mockExerciseRepo as unknown as ExerciseRepository
    );
  });

  describe('getHistory', () => {
    it('should return null for non-existent exercise', () => {
      mockExerciseRepo.findById.mockReturnValue(null);

      const result = service.getHistory(999);

      expect(result).toBeNull();
      expect(mockExerciseRepo.findById).toHaveBeenCalledWith(999);
    });

    it('should return empty entries array for exercise with no completed sets', () => {
      mockExerciseRepo.findById.mockReturnValue(createMockExercise({ id: 1 }));
      mockWorkoutSetRepo.findCompletedByExerciseId.mockReturnValue([]);

      const result = service.getHistory(1);

      expect(result).not.toBeNull();
      const history = result as ExerciseHistory;
      expect(history.exercise_id).toBe(1);
      expect(history.exercise_name).toBe('Bench Press');
      expect(history.entries).toEqual([]);
      expect(history.personal_record).toBeNull();
    });

    it('should group sets by workout_id into separate entries', () => {
      mockExerciseRepo.findById.mockReturnValue(createMockExercise({ id: 1 }));

      const rows: CompletedSetRow[] = [
        {
          workout_id: 10,
          exercise_id: 1,
          set_number: 1,
          actual_weight: 100,
          actual_reps: 10,
          scheduled_date: '2024-01-01',
          completed_at: '2024-01-01T10:00:00Z',
          week_number: 1,
          mesocycle_id: 1,
        },
        {
          workout_id: 10,
          exercise_id: 1,
          set_number: 2,
          actual_weight: 100,
          actual_reps: 8,
          scheduled_date: '2024-01-01',
          completed_at: '2024-01-01T10:00:00Z',
          week_number: 1,
          mesocycle_id: 1,
        },
        {
          workout_id: 20,
          exercise_id: 1,
          set_number: 1,
          actual_weight: 105,
          actual_reps: 10,
          scheduled_date: '2024-01-08',
          completed_at: '2024-01-08T10:00:00Z',
          week_number: 2,
          mesocycle_id: 1,
        },
      ];
      mockWorkoutSetRepo.findCompletedByExerciseId.mockReturnValue(rows);

      const result = service.getHistory(1);

      expect(result).not.toBeNull();
      const history = result as ExerciseHistory;
      expect(history.entries).toHaveLength(2);
      expect(history.entries[0]?.workout_id).toBe(10);
      expect(history.entries[0]?.sets).toHaveLength(2);
      expect(history.entries[1]?.workout_id).toBe(20);
      expect(history.entries[1]?.sets).toHaveLength(1);
    });

    it('should calculate best_weight per session (highest weight across sets)', () => {
      mockExerciseRepo.findById.mockReturnValue(createMockExercise({ id: 1 }));

      const rows: CompletedSetRow[] = [
        {
          workout_id: 10,
          exercise_id: 1,
          set_number: 1,
          actual_weight: 100,
          actual_reps: 10,
          scheduled_date: '2024-01-01',
          completed_at: '2024-01-01T10:00:00Z',
          week_number: 1,
          mesocycle_id: 1,
        },
        {
          workout_id: 10,
          exercise_id: 1,
          set_number: 2,
          actual_weight: 110,
          actual_reps: 8,
          scheduled_date: '2024-01-01',
          completed_at: '2024-01-01T10:00:00Z',
          week_number: 1,
          mesocycle_id: 1,
        },
        {
          workout_id: 10,
          exercise_id: 1,
          set_number: 3,
          actual_weight: 105,
          actual_reps: 9,
          scheduled_date: '2024-01-01',
          completed_at: '2024-01-01T10:00:00Z',
          week_number: 1,
          mesocycle_id: 1,
        },
      ];
      mockWorkoutSetRepo.findCompletedByExerciseId.mockReturnValue(rows);

      const result = service.getHistory(1);

      expect(result).not.toBeNull();
      const history = result as ExerciseHistory;
      expect(history.entries[0]?.best_weight).toBe(110);
    });

    it('should set best_set_reps to the reps achieved at best_weight', () => {
      mockExerciseRepo.findById.mockReturnValue(createMockExercise({ id: 1 }));

      const rows: CompletedSetRow[] = [
        {
          workout_id: 10,
          exercise_id: 1,
          set_number: 1,
          actual_weight: 100,
          actual_reps: 12,
          scheduled_date: '2024-01-01',
          completed_at: '2024-01-01T10:00:00Z',
          week_number: 1,
          mesocycle_id: 1,
        },
        {
          workout_id: 10,
          exercise_id: 1,
          set_number: 2,
          actual_weight: 120,
          actual_reps: 6,
          scheduled_date: '2024-01-01',
          completed_at: '2024-01-01T10:00:00Z',
          week_number: 1,
          mesocycle_id: 1,
        },
      ];
      mockWorkoutSetRepo.findCompletedByExerciseId.mockReturnValue(rows);

      const result = service.getHistory(1);

      expect(result).not.toBeNull();
      const history = result as ExerciseHistory;
      expect(history.entries[0]?.best_weight).toBe(120);
      expect(history.entries[0]?.best_set_reps).toBe(6);
    });

    it('should identify overall personal record (highest weight across all sessions)', () => {
      mockExerciseRepo.findById.mockReturnValue(createMockExercise({ id: 1 }));

      const rows: CompletedSetRow[] = [
        {
          workout_id: 10,
          exercise_id: 1,
          set_number: 1,
          actual_weight: 100,
          actual_reps: 10,
          scheduled_date: '2024-01-01',
          completed_at: '2024-01-01T10:00:00Z',
          week_number: 1,
          mesocycle_id: 1,
        },
        {
          workout_id: 20,
          exercise_id: 1,
          set_number: 1,
          actual_weight: 130,
          actual_reps: 8,
          scheduled_date: '2024-01-08',
          completed_at: '2024-01-08T10:00:00Z',
          week_number: 2,
          mesocycle_id: 1,
        },
        {
          workout_id: 30,
          exercise_id: 1,
          set_number: 1,
          actual_weight: 120,
          actual_reps: 10,
          scheduled_date: '2024-01-15',
          completed_at: '2024-01-15T10:00:00Z',
          week_number: 3,
          mesocycle_id: 1,
        },
      ];
      mockWorkoutSetRepo.findCompletedByExerciseId.mockReturnValue(rows);

      const result = service.getHistory(1);

      expect(result).not.toBeNull();
      const history = result as ExerciseHistory;
      expect(history.personal_record).not.toBeNull();
      expect(history.personal_record?.weight).toBe(130);
      expect(history.personal_record?.reps).toBe(8);
      expect(history.personal_record?.date).toBe('2024-01-08T10:00:00Z');
    });

    it('should use the earliest date when weight ties exist for PR', () => {
      mockExerciseRepo.findById.mockReturnValue(createMockExercise({ id: 1 }));

      const rows: CompletedSetRow[] = [
        {
          workout_id: 10,
          exercise_id: 1,
          set_number: 1,
          actual_weight: 130,
          actual_reps: 8,
          scheduled_date: '2024-01-01',
          completed_at: '2024-01-01T10:00:00Z',
          week_number: 1,
          mesocycle_id: 1,
        },
        {
          workout_id: 20,
          exercise_id: 1,
          set_number: 1,
          actual_weight: 130,
          actual_reps: 10,
          scheduled_date: '2024-01-08',
          completed_at: '2024-01-08T10:00:00Z',
          week_number: 2,
          mesocycle_id: 1,
        },
        {
          workout_id: 30,
          exercise_id: 1,
          set_number: 1,
          actual_weight: 100,
          actual_reps: 12,
          scheduled_date: '2024-01-15',
          completed_at: '2024-01-15T10:00:00Z',
          week_number: 3,
          mesocycle_id: 1,
        },
      ];
      mockWorkoutSetRepo.findCompletedByExerciseId.mockReturnValue(rows);

      const result = service.getHistory(1);

      expect(result).not.toBeNull();
      const history = result as ExerciseHistory;
      expect(history.personal_record?.weight).toBe(130);
      // Should use the earliest date when the weight was first achieved
      expect(history.personal_record?.date).toBe('2024-01-01T10:00:00Z');
      // Reps from the earliest session where PR weight was hit
      expect(history.personal_record?.reps).toBe(8);
    });

    it('should order entries by date ascending', () => {
      mockExerciseRepo.findById.mockReturnValue(createMockExercise({ id: 1 }));

      // Rows are already ordered by the repository, but let's verify entries maintain order
      const rows: CompletedSetRow[] = [
        {
          workout_id: 10,
          exercise_id: 1,
          set_number: 1,
          actual_weight: 100,
          actual_reps: 10,
          scheduled_date: '2024-01-01',
          completed_at: '2024-01-01T10:00:00Z',
          week_number: 1,
          mesocycle_id: 1,
        },
        {
          workout_id: 20,
          exercise_id: 1,
          set_number: 1,
          actual_weight: 105,
          actual_reps: 10,
          scheduled_date: '2024-01-08',
          completed_at: '2024-01-08T10:00:00Z',
          week_number: 2,
          mesocycle_id: 1,
        },
        {
          workout_id: 30,
          exercise_id: 1,
          set_number: 1,
          actual_weight: 110,
          actual_reps: 10,
          scheduled_date: '2024-01-15',
          completed_at: '2024-01-15T10:00:00Z',
          week_number: 3,
          mesocycle_id: 1,
        },
      ];
      mockWorkoutSetRepo.findCompletedByExerciseId.mockReturnValue(rows);

      const result = service.getHistory(1);

      expect(result).not.toBeNull();
      const history = result as ExerciseHistory;
      expect(history.entries).toHaveLength(3);
      expect(history.entries[0]?.date).toBe('2024-01-01T10:00:00Z');
      expect(history.entries[1]?.date).toBe('2024-01-08T10:00:00Z');
      expect(history.entries[2]?.date).toBe('2024-01-15T10:00:00Z');
    });

    it('should use completed_at when available, falls back to scheduled_date', () => {
      mockExerciseRepo.findById.mockReturnValue(createMockExercise({ id: 1 }));

      const rows: CompletedSetRow[] = [
        {
          workout_id: 10,
          exercise_id: 1,
          set_number: 1,
          actual_weight: 100,
          actual_reps: 10,
          scheduled_date: '2024-01-01',
          completed_at: '2024-01-01T10:00:00Z',
          week_number: 1,
          mesocycle_id: 1,
        },
        {
          workout_id: 20,
          exercise_id: 1,
          set_number: 1,
          actual_weight: 105,
          actual_reps: 10,
          scheduled_date: '2024-01-08',
          completed_at: null,
          week_number: 2,
          mesocycle_id: 1,
        },
      ];
      mockWorkoutSetRepo.findCompletedByExerciseId.mockReturnValue(rows);

      const result = service.getHistory(1);

      expect(result).not.toBeNull();
      const history = result as ExerciseHistory;
      expect(history.entries[0]?.date).toBe('2024-01-01T10:00:00Z');
      expect(history.entries[1]?.date).toBe('2024-01-08');
    });
  });
});
