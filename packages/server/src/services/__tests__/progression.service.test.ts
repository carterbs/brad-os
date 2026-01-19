import { describe, it, expect, beforeEach } from 'vitest';
import { ProgressionService } from '../progression.service.js';
import type {
  ExerciseProgression,
  CompletionStatus,
} from '@lifting/shared';

describe('ProgressionService', () => {
  let service: ProgressionService;

  const baseExercise: ExerciseProgression = {
    exerciseId: 'exercise-1',
    planExerciseId: 'plan-exercise-1',
    baseWeight: 30,
    baseReps: 8,
    baseSets: 3,
    weightIncrement: 5,
    minReps: 8,
    maxReps: 12,
  };

  beforeEach(() => {
    service = new ProgressionService();
  });

  describe('calculateTargetsForWeek', () => {
    describe('Week 0 - Baseline', () => {
      it('should return starting weight and reps from plan', () => {
        const result = service.calculateTargetsForWeek(baseExercise, 0, true);

        expect(result.targetWeight).toBe(30);
        expect(result.targetReps).toBe(8);
        expect(result.targetSets).toBe(3);
        expect(result.isDeload).toBe(false);
      });

      it('should work regardless of previous completion status for week 0', () => {
        const result = service.calculateTargetsForWeek(baseExercise, 0, false);

        expect(result.targetWeight).toBe(30);
        expect(result.targetReps).toBe(8);
      });
    });

    describe('Week 1 - Add 1 rep', () => {
      it('should add 1 rep when previous week completed', () => {
        const result = service.calculateTargetsForWeek(baseExercise, 1, true);

        expect(result.targetWeight).toBe(30);
        expect(result.targetReps).toBe(9);
        expect(result.targetSets).toBe(3);
      });

      it('should NOT add rep when previous week incomplete', () => {
        const result = service.calculateTargetsForWeek(baseExercise, 1, false);

        expect(result.targetWeight).toBe(30);
        expect(result.targetReps).toBe(8); // Same as week 0
        expect(result.targetSets).toBe(3);
      });
    });

    describe('Week 2 - Add weight, reset reps', () => {
      it('should add weight and reset reps when previous week completed', () => {
        const result = service.calculateTargetsForWeek(baseExercise, 2, true);

        expect(result.targetWeight).toBe(35); // 30 + 5
        expect(result.targetReps).toBe(8); // Reset to base
        expect(result.targetSets).toBe(3);
      });

      it('should NOT add weight when previous week incomplete', () => {
        const result = service.calculateTargetsForWeek(baseExercise, 2, false);

        // Should stay at week 1 targets (assuming week 0 was completed)
        expect(result.targetWeight).toBe(30);
        expect(result.targetReps).toBe(9);
      });

      it('should use custom weight increment', () => {
        const exercise = { ...baseExercise, weightIncrement: 2.5 };
        const result = service.calculateTargetsForWeek(exercise, 2, true);

        expect(result.targetWeight).toBe(32.5);
      });
    });

    describe('Week 3 - Add 1 rep', () => {
      it('should add 1 rep to week 2 weight when completed', () => {
        const result = service.calculateTargetsForWeek(baseExercise, 3, true);

        expect(result.targetWeight).toBe(35);
        expect(result.targetReps).toBe(9);
      });

      it('should NOT progress when previous week incomplete', () => {
        const result = service.calculateTargetsForWeek(baseExercise, 3, false);

        expect(result.targetWeight).toBe(35);
        expect(result.targetReps).toBe(8); // Same as week 2
      });
    });

    describe('Week 4 - Add weight, reset reps', () => {
      it('should add weight again and reset reps when completed', () => {
        const result = service.calculateTargetsForWeek(baseExercise, 4, true);

        expect(result.targetWeight).toBe(40); // 30 + 5 + 5
        expect(result.targetReps).toBe(8);
      });

      it('should NOT add weight when previous week incomplete', () => {
        const result = service.calculateTargetsForWeek(baseExercise, 4, false);

        expect(result.targetWeight).toBe(35);
        expect(result.targetReps).toBe(9); // Same as week 3
      });
    });

    describe('Week 5 - Add 1 rep', () => {
      it('should add 1 rep to week 4 weight when completed', () => {
        const result = service.calculateTargetsForWeek(baseExercise, 5, true);

        expect(result.targetWeight).toBe(40);
        expect(result.targetReps).toBe(9);
      });

      it('should NOT progress when previous week incomplete', () => {
        const result = service.calculateTargetsForWeek(baseExercise, 5, false);

        expect(result.targetWeight).toBe(40);
        expect(result.targetReps).toBe(8);
      });
    });

    describe('Week 6 - Deload', () => {
      it('should apply 85% weight and 50% sets', () => {
        const result = service.calculateTargetsForWeek(baseExercise, 6, true);

        // 40 * 0.85 = 34, rounded to nearest 2.5 = 35
        expect(result.targetWeight).toBe(35);
        expect(result.targetReps).toBe(9); // Same as week 5
        expect(result.targetSets).toBe(2); // 3 * 0.5 = 1.5, round up = 2
        expect(result.isDeload).toBe(true);
      });

      it('should round weight to nearest 2.5 lbs', () => {
        const exercise = { ...baseExercise, baseWeight: 45 };
        // Week 5 weight would be 55 (45 + 5 + 5)
        // 55 * 0.85 = 46.75 -> round to 47.5
        const result = service.calculateTargetsForWeek(exercise, 6, true);

        expect(result.targetWeight).toBe(47.5);
      });

      it('should round sets up when odd number', () => {
        const exercise = { ...baseExercise, baseSets: 5 };
        const result = service.calculateTargetsForWeek(exercise, 6, true);

        expect(result.targetSets).toBe(3); // 5 * 0.5 = 2.5, round up = 3
      });

      it('should still apply deload even if previous week incomplete', () => {
        const result = service.calculateTargetsForWeek(baseExercise, 6, false);

        // Deload is based on week 4 targets since week 5 wasn't completed
        // 40 * 0.85 = 34, rounded to nearest 2.5 = 35
        expect(result.targetWeight).toBe(35);
        expect(result.targetReps).toBe(8); // Week 4 reps
        expect(result.isDeload).toBe(true);
      });
    });
  });

  describe('calculateProgressionHistory', () => {
    it('should calculate all weeks based on completion history', () => {
      const completionHistory: CompletionStatus[] = [
        {
          exerciseId: 'exercise-1',
          weekNumber: 0,
          allSetsCompleted: true,
          completedSets: 3,
          prescribedSets: 3,
        },
        {
          exerciseId: 'exercise-1',
          weekNumber: 1,
          allSetsCompleted: true,
          completedSets: 3,
          prescribedSets: 3,
        },
        {
          exerciseId: 'exercise-1',
          weekNumber: 2,
          allSetsCompleted: false,
          completedSets: 2,
          prescribedSets: 3,
        }, // Incomplete!
      ];

      const result = service.calculateProgressionHistory(
        baseExercise,
        completionHistory
      );

      expect(result[0]?.targetWeight).toBe(30);
      expect(result[1]?.targetWeight).toBe(30);
      expect(result[2]?.targetWeight).toBe(35);
      expect(result[3]?.targetWeight).toBe(35); // No progression - week 2 incomplete
      expect(result[3]?.targetReps).toBe(8); // Stays at week 2 values
    });
  });

  describe('edge cases', () => {
    it('should handle minimum 1 set for deload', () => {
      const exercise = { ...baseExercise, baseSets: 1 };
      const result = service.calculateTargetsForWeek(exercise, 6, true);

      expect(result.targetSets).toBe(1); // 1 * 0.5 = 0.5, round up = 1
    });

    it('should handle very light weights correctly', () => {
      const exercise = { ...baseExercise, baseWeight: 5 };
      const result = service.calculateTargetsForWeek(exercise, 6, true);

      // Week 5 weight: 5 + 5 + 5 = 15, deload = 15 * 0.85 = 12.75 -> 12.5
      expect(result.targetWeight).toBe(12.5);
    });

    it('should handle 0 as a valid starting weight', () => {
      const exercise = { ...baseExercise, baseWeight: 0 };
      const result = service.calculateTargetsForWeek(exercise, 0, true);

      expect(result.targetWeight).toBe(0);
    });

    it('should preserve exerciseId and planExerciseId in output', () => {
      const result = service.calculateTargetsForWeek(baseExercise, 0, true);

      expect(result.exerciseId).toBe('exercise-1');
      expect(result.planExerciseId).toBe('plan-exercise-1');
    });

    it('should include weekNumber in output', () => {
      const result = service.calculateTargetsForWeek(baseExercise, 3, true);

      expect(result.weekNumber).toBe(3);
    });
  });
});
