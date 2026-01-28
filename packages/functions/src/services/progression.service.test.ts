import { describe, it, expect, beforeEach } from 'vitest';
import { ProgressionService } from './progression.service.js';
import type { ExerciseProgression, CompletionStatus } from '../shared.js';

describe('ProgressionService', () => {
  let service: ProgressionService;

  // Standard test exercise with base values
  const createTestExercise = (
    overrides: Partial<ExerciseProgression> = {}
  ): ExerciseProgression => ({
    exerciseId: 'exercise-1',
    planExerciseId: 'plan-exercise-1',
    baseWeight: 100,
    baseReps: 8,
    baseSets: 3,
    weightIncrement: 5,
    minReps: 8,
    maxReps: 12,
    ...overrides,
  });

  beforeEach(() => {
    service = new ProgressionService();
  });

  describe('calculateTargetsForWeek', () => {
    describe('Week 0 - Baseline', () => {
      it('should return base values for week 0', () => {
        const exercise = createTestExercise();
        const result = service.calculateTargetsForWeek(exercise, 0, true);

        expect(result.targetWeight).toBe(100);
        expect(result.targetReps).toBe(8);
        expect(result.targetSets).toBe(3);
        expect(result.weekNumber).toBe(0);
        expect(result.isDeload).toBe(false);
      });

      it('should return base values for week 0 regardless of previous completion', () => {
        const exercise = createTestExercise();
        const result = service.calculateTargetsForWeek(exercise, 0, false);

        expect(result.targetWeight).toBe(100);
        expect(result.targetReps).toBe(8);
        expect(result.targetSets).toBe(3);
      });

      it('should include exercise and plan exercise IDs', () => {
        const exercise = createTestExercise({
          exerciseId: 'bench-press',
          planExerciseId: 'plan-bench-1',
        });
        const result = service.calculateTargetsForWeek(exercise, 0, true);

        expect(result.exerciseId).toBe('bench-press');
        expect(result.planExerciseId).toBe('plan-bench-1');
      });
    });

    describe('Odd weeks (1, 3, 5) - Add rep', () => {
      it('should add 1 rep on week 1 when previous week completed', () => {
        const exercise = createTestExercise();
        const result = service.calculateTargetsForWeek(exercise, 1, true);

        expect(result.targetWeight).toBe(100); // Same weight
        expect(result.targetReps).toBe(9); // +1 rep
        expect(result.targetSets).toBe(3);
        expect(result.isDeload).toBe(false);
      });

      it('should add 1 rep on week 3 when previous week completed', () => {
        const exercise = createTestExercise();
        const result = service.calculateTargetsForWeek(exercise, 3, true);

        expect(result.targetWeight).toBe(105); // Already had one weight increase
        expect(result.targetReps).toBe(9); // +1 rep from base
        expect(result.targetSets).toBe(3);
      });

      it('should add 1 rep on week 5 when previous week completed', () => {
        const exercise = createTestExercise();
        const result = service.calculateTargetsForWeek(exercise, 5, true);

        expect(result.targetWeight).toBe(110); // Two weight increases
        expect(result.targetReps).toBe(9); // +1 rep
        expect(result.targetSets).toBe(3);
      });
    });

    describe('Even weeks (2, 4) - Add weight, reset reps', () => {
      it('should add weight and reset reps on week 2 when previous week completed', () => {
        const exercise = createTestExercise();
        const result = service.calculateTargetsForWeek(exercise, 2, true);

        expect(result.targetWeight).toBe(105); // +5 lbs
        expect(result.targetReps).toBe(8); // Reset to base
        expect(result.targetSets).toBe(3);
        expect(result.isDeload).toBe(false);
      });

      it('should add weight and reset reps on week 4 when previous week completed', () => {
        const exercise = createTestExercise();
        const result = service.calculateTargetsForWeek(exercise, 4, true);

        expect(result.targetWeight).toBe(110); // +10 lbs total (2x increment)
        expect(result.targetReps).toBe(8); // Reset to base
        expect(result.targetSets).toBe(3);
      });

      it('should use custom weight increment', () => {
        const exercise = createTestExercise({ weightIncrement: 10 });
        const result = service.calculateTargetsForWeek(exercise, 2, true);

        expect(result.targetWeight).toBe(110); // +10 lbs
        expect(result.targetReps).toBe(8);
      });
    });

    describe('Incomplete week handling', () => {
      it('should hold at previous targets when week 0 incomplete (moving to week 1)', () => {
        const exercise = createTestExercise();
        const result = service.calculateTargetsForWeek(exercise, 1, false);

        expect(result.targetWeight).toBe(100); // Same as week 0
        expect(result.targetReps).toBe(8); // Same as week 0
        expect(result.targetSets).toBe(3);
        expect(result.weekNumber).toBe(1);
      });

      it('should hold at previous targets when week 1 incomplete (moving to week 2)', () => {
        const exercise = createTestExercise();
        const result = service.calculateTargetsForWeek(exercise, 2, false);

        // Should stay at week 1 values (not progress to week 2)
        expect(result.targetWeight).toBe(100); // Week 1 weight
        expect(result.targetReps).toBe(9); // Week 1 reps
        expect(result.targetSets).toBe(3);
      });

      it('should hold at previous targets when week 3 incomplete (moving to week 4)', () => {
        const exercise = createTestExercise();
        const result = service.calculateTargetsForWeek(exercise, 4, false);

        // Should stay at week 3 values
        expect(result.targetWeight).toBe(105); // Week 3 weight
        expect(result.targetReps).toBe(9); // Week 3 reps
      });

      it('should not regress on incomplete weeks', () => {
        const exercise = createTestExercise();
        const result = service.calculateTargetsForWeek(exercise, 3, false);

        // Should stay at week 2 values (not go below)
        expect(result.targetWeight).toBe(105); // Week 2 weight
        expect(result.targetReps).toBe(8); // Week 2 reps
      });
    });

    describe('Deload week (week 6)', () => {
      it('should apply 85% weight on deload week when previous completed', () => {
        const exercise = createTestExercise();
        const result = service.calculateTargetsForWeek(exercise, 6, true);

        // Week 5 has 110 lbs, deload is 85% rounded to 2.5
        // 110 * 0.85 = 93.5, rounds to 92.5
        expect(result.targetWeight).toBe(92.5);
        expect(result.isDeload).toBe(true);
        expect(result.weekNumber).toBe(6);
      });

      it('should apply 50% volume (sets) on deload week', () => {
        const exercise = createTestExercise({ baseSets: 4 });
        const result = service.calculateTargetsForWeek(exercise, 6, true);

        // 4 * 0.5 = 2 sets
        expect(result.targetSets).toBe(2);
      });

      it('should have minimum 1 set on deload week', () => {
        const exercise = createTestExercise({ baseSets: 1 });
        const result = service.calculateTargetsForWeek(exercise, 6, true);

        // 1 * 0.5 = 0.5, ceil = 1, max(1, 1) = 1
        expect(result.targetSets).toBe(1);
      });

      it('should use week 5 reps when previous week completed', () => {
        const exercise = createTestExercise();
        const result = service.calculateTargetsForWeek(exercise, 6, true);

        // Week 5 has 9 reps (base 8 + 1)
        expect(result.targetReps).toBe(9);
      });

      it('should use week 4 values when week 5 incomplete', () => {
        const exercise = createTestExercise();
        const result = service.calculateTargetsForWeek(exercise, 6, false);

        // Week 4 has 110 lbs, 8 reps
        // Deload weight: 110 * 0.85 = 93.5 -> 92.5
        expect(result.targetWeight).toBe(92.5);
        expect(result.targetReps).toBe(8); // Week 4 reps
      });

      it('should round deload weight to nearest 2.5 lbs', () => {
        const exercise = createTestExercise({ baseWeight: 135 });
        const result = service.calculateTargetsForWeek(exercise, 6, true);

        // Week 5: 135 + 10 = 145 lbs
        // Deload: 145 * 0.85 = 123.25 -> rounds to 122.5
        expect(result.targetWeight).toBe(122.5);
      });
    });
  });

  describe('calculateProgressionHistory', () => {
    it('should generate 7 weeks of targets (weeks 0-6)', () => {
      const exercise = createTestExercise();
      const completionHistory: CompletionStatus[] = [];

      const result = service.calculateProgressionHistory(
        exercise,
        completionHistory
      );

      expect(result).toHaveLength(7);
      const firstWeek = result[0];
      const lastWeek = result[6];
      expect(firstWeek).toBeDefined();
      expect(lastWeek).toBeDefined();
      expect(firstWeek?.weekNumber).toBe(0);
      expect(lastWeek?.weekNumber).toBe(6);
    });

    it('should handle empty completion history (assume all completed)', () => {
      const exercise = createTestExercise();
      const completionHistory: CompletionStatus[] = [];

      const result = service.calculateProgressionHistory(
        exercise,
        completionHistory
      );

      // With all weeks completed, should see full progression
      expect(result[0]?.targetWeight).toBe(100); // Week 0
      expect(result[1]?.targetReps).toBe(9); // Week 1: +1 rep
      expect(result[2]?.targetWeight).toBe(105); // Week 2: +weight
      expect(result[3]?.targetReps).toBe(9); // Week 3: +1 rep
      expect(result[4]?.targetWeight).toBe(110); // Week 4: +weight
      expect(result[5]?.targetReps).toBe(9); // Week 5: +1 rep
      expect(result[6]?.isDeload).toBe(true); // Week 6: deload
    });

    it('should carry forward incomplete weeks', () => {
      const exercise = createTestExercise();
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
          allSetsCompleted: false, // Failed week 1
          completedSets: 2,
          prescribedSets: 3,
        },
      ];

      const result = service.calculateProgressionHistory(
        exercise,
        completionHistory
      );

      // Week 2 should not progress because week 1 was incomplete
      expect(result[2]?.targetWeight).toBe(100); // Held at week 1 weight
      expect(result[2]?.targetReps).toBe(9); // Held at week 1 reps
    });

    it('should correctly identify week 0 previous as completed', () => {
      const exercise = createTestExercise();
      const completionHistory: CompletionStatus[] = [];

      const result = service.calculateProgressionHistory(
        exercise,
        completionHistory
      );

      // Week 0 has no previous week, should treat as completed
      expect(result[0]?.targetWeight).toBe(exercise.baseWeight);
      expect(result[0]?.targetReps).toBe(exercise.baseReps);
    });

    it('should preserve exercise and plan IDs in all targets', () => {
      const exercise = createTestExercise({
        exerciseId: 'squat',
        planExerciseId: 'plan-squat-1',
      });
      const completionHistory: CompletionStatus[] = [];

      const result = service.calculateProgressionHistory(
        exercise,
        completionHistory
      );

      for (const weekTarget of result) {
        expect(weekTarget.exerciseId).toBe('squat');
        expect(weekTarget.planExerciseId).toBe('plan-squat-1');
      }
    });

    it('should mark only week 6 as deload', () => {
      const exercise = createTestExercise();
      const completionHistory: CompletionStatus[] = [];

      const result = service.calculateProgressionHistory(
        exercise,
        completionHistory
      );

      for (let week = 0; week < 6; week++) {
        expect(result[week]?.isDeload).toBe(false);
      }
      expect(result[6]?.isDeload).toBe(true);
    });

    it('should apply deload even if previous weeks incomplete', () => {
      const exercise = createTestExercise();
      const completionHistory: CompletionStatus[] = [
        {
          exerciseId: 'exercise-1',
          weekNumber: 4,
          allSetsCompleted: false,
          completedSets: 1,
          prescribedSets: 3,
        },
        {
          exerciseId: 'exercise-1',
          weekNumber: 5,
          allSetsCompleted: false,
          completedSets: 1,
          prescribedSets: 3,
        },
      ];

      const result = service.calculateProgressionHistory(
        exercise,
        completionHistory
      );

      // Week 6 should still be deload
      expect(result[6]?.isDeload).toBe(true);
      // But with adjusted values based on week 4 (since week 5 incomplete)
      expect(result[6]?.targetWeight).toBe(92.5); // 110 * 0.85 rounded
    });
  });
});
