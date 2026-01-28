import { describe, it, expect, beforeEach } from 'vitest';
import { DynamicProgressionService } from './dynamic-progression.service.js';
import type {
  ExerciseProgression,
  PreviousWeekPerformance,
} from '../shared.js';

describe('DynamicProgressionService', () => {
  let service: DynamicProgressionService;

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

  const createPerformance = (
    overrides: Partial<PreviousWeekPerformance> = {}
  ): PreviousWeekPerformance => ({
    exerciseId: 'exercise-1',
    weekNumber: 0,
    targetWeight: 100,
    targetReps: 8,
    actualWeight: 100,
    actualReps: 8,
    hitTarget: true,
    consecutiveFailures: 0,
    ...overrides,
  });

  beforeEach(() => {
    service = new DynamicProgressionService();
  });

  describe('calculateNextWeekTargets', () => {
    describe('First week (no previous data)', () => {
      it('should return base values with first_week reason', () => {
        const exercise = createTestExercise();

        const result = service.calculateNextWeekTargets(exercise, null, false);

        expect(result.targetWeight).toBe(100);
        expect(result.targetReps).toBe(8);
        expect(result.targetSets).toBe(3);
        expect(result.isDeload).toBe(false);
        expect(result.reason).toBe('first_week');
      });

      it('should use custom base values', () => {
        const exercise = createTestExercise({
          baseWeight: 135,
          baseReps: 10,
          baseSets: 4,
        });

        const result = service.calculateNextWeekTargets(exercise, null, false);

        expect(result.targetWeight).toBe(135);
        expect(result.targetReps).toBe(10);
        expect(result.targetSets).toBe(4);
      });
    });

    describe('Deload week', () => {
      it('should apply 85% weight on deload week', () => {
        const exercise = createTestExercise();
        const performance = createPerformance({ actualWeight: 100 });

        const result = service.calculateNextWeekTargets(
          exercise,
          performance,
          true
        );

        // 100 * 0.85 = 85
        expect(result.targetWeight).toBe(85);
        expect(result.isDeload).toBe(true);
        expect(result.reason).toBe('deload');
      });

      it('should apply 50% volume on deload week', () => {
        const exercise = createTestExercise({ baseSets: 4 });
        const performance = createPerformance();

        const result = service.calculateNextWeekTargets(
          exercise,
          performance,
          true
        );

        // 4 * 0.5 = 2
        expect(result.targetSets).toBe(2);
      });

      it('should have minimum 1 set on deload', () => {
        const exercise = createTestExercise({ baseSets: 1 });
        const performance = createPerformance();

        const result = service.calculateNextWeekTargets(
          exercise,
          performance,
          true
        );

        expect(result.targetSets).toBe(1);
      });

      it('should use minReps on deload week', () => {
        const exercise = createTestExercise({ minReps: 6 });
        const performance = createPerformance({ actualReps: 10 });

        const result = service.calculateNextWeekTargets(
          exercise,
          performance,
          true
        );

        expect(result.targetReps).toBe(6);
      });

      it('should round deload weight to nearest 2.5', () => {
        const exercise = createTestExercise();
        const performance = createPerformance({ actualWeight: 135 });

        const result = service.calculateNextWeekTargets(
          exercise,
          performance,
          true
        );

        // 135 * 0.85 = 114.75 -> rounds to 115
        expect(result.targetWeight).toBe(115);
      });
    });

    describe('Hit max reps - progression', () => {
      it('should add weight and drop to minReps when hitting maxReps', () => {
        const exercise = createTestExercise({
          minReps: 8,
          maxReps: 12,
          weightIncrement: 5,
        });
        const performance = createPerformance({
          actualWeight: 100,
          actualReps: 12, // Hit max reps
          targetReps: 10,
        });

        const result = service.calculateNextWeekTargets(
          exercise,
          performance,
          false
        );

        expect(result.targetWeight).toBe(105); // +5 lbs
        expect(result.targetReps).toBe(8); // Drop to minReps
        expect(result.reason).toBe('hit_max_reps');
      });

      it('should add weight when exceeding maxReps', () => {
        const exercise = createTestExercise({ maxReps: 12 });
        const performance = createPerformance({
          actualWeight: 100,
          actualReps: 15, // Exceeded max reps
        });

        const result = service.calculateNextWeekTargets(
          exercise,
          performance,
          false
        );

        expect(result.targetWeight).toBe(105);
        expect(result.reason).toBe('hit_max_reps');
      });

      it('should use custom weight increment', () => {
        const exercise = createTestExercise({
          maxReps: 12,
          weightIncrement: 10,
        });
        const performance = createPerformance({
          actualWeight: 100,
          actualReps: 12,
        });

        const result = service.calculateNextWeekTargets(
          exercise,
          performance,
          false
        );

        expect(result.targetWeight).toBe(110); // +10 lbs
      });
    });

    describe('Hit target - increment reps', () => {
      it('should increment reps when hitting target', () => {
        const exercise = createTestExercise({ maxReps: 12 });
        const performance = createPerformance({
          actualWeight: 100,
          actualReps: 10,
          targetReps: 10,
        });

        const result = service.calculateNextWeekTargets(
          exercise,
          performance,
          false
        );

        expect(result.targetWeight).toBe(100); // Same weight
        expect(result.targetReps).toBe(11); // +1 rep
        expect(result.reason).toBe('hit_target');
      });

      it('should increment reps when exceeding target but not maxReps', () => {
        const exercise = createTestExercise({ maxReps: 12 });
        const performance = createPerformance({
          actualWeight: 100,
          actualReps: 11, // Exceeded target but not max
          targetReps: 10,
        });

        const result = service.calculateNextWeekTargets(
          exercise,
          performance,
          false
        );

        expect(result.targetReps).toBe(11); // Based on exceeded target
        expect(result.reason).toBe('hit_target');
      });

      it('should cap reps at maxReps when incrementing', () => {
        const exercise = createTestExercise({ maxReps: 12 });
        const performance = createPerformance({
          actualWeight: 100,
          actualReps: 11, // One below max
          targetReps: 11,
        });

        const result = service.calculateNextWeekTargets(
          exercise,
          performance,
          false
        );

        expect(result.targetReps).toBe(12); // Capped at maxReps
      });
    });

    describe('Hold - met minimum but not target', () => {
      it('should hold at same targets when meeting minReps but not target', () => {
        const exercise = createTestExercise({ minReps: 8 });
        const performance = createPerformance({
          actualWeight: 100,
          actualReps: 9, // Above min but below target
          targetReps: 10,
        });

        const result = service.calculateNextWeekTargets(
          exercise,
          performance,
          false
        );

        expect(result.targetWeight).toBe(100);
        expect(result.targetReps).toBe(10); // Same target
        expect(result.reason).toBe('hold');
      });

      it('should hold when exactly hitting minReps', () => {
        const exercise = createTestExercise({ minReps: 8 });
        const performance = createPerformance({
          actualWeight: 100,
          actualReps: 8, // Exactly minReps
          targetReps: 10,
        });

        const result = service.calculateNextWeekTargets(
          exercise,
          performance,
          false
        );

        expect(result.targetWeight).toBe(100);
        expect(result.targetReps).toBe(10);
        expect(result.reason).toBe('hold');
      });
    });

    describe('Regression after 2 consecutive failures', () => {
      it('should regress weight after 2 consecutive failures', () => {
        const exercise = createTestExercise({
          minReps: 8,
          weightIncrement: 5,
          baseWeight: 100,
        });
        const performance = createPerformance({
          actualWeight: 110,
          actualReps: 6, // Below minReps
          consecutiveFailures: 2,
        });

        const result = service.calculateNextWeekTargets(
          exercise,
          performance,
          false
        );

        expect(result.targetWeight).toBe(105); // -5 lbs
        expect(result.targetReps).toBe(8); // Reset to minReps
        expect(result.reason).toBe('regress');
      });

      it('should not regress below baseWeight', () => {
        const exercise = createTestExercise({
          minReps: 8,
          weightIncrement: 5,
          baseWeight: 100,
        });
        const performance = createPerformance({
          actualWeight: 100, // At base weight
          actualReps: 6,
          consecutiveFailures: 2,
        });

        const result = service.calculateNextWeekTargets(
          exercise,
          performance,
          false
        );

        expect(result.targetWeight).toBe(100); // Stays at base
        expect(result.reason).toBe('regress');
      });

      it('should not regress with only 1 consecutive failure', () => {
        const exercise = createTestExercise({ minReps: 8 });
        const performance = createPerformance({
          actualWeight: 110,
          actualReps: 6,
          consecutiveFailures: 1, // Only 1 failure
        });

        const result = service.calculateNextWeekTargets(
          exercise,
          performance,
          false
        );

        expect(result.targetWeight).toBe(110); // No regression
        expect(result.reason).toBe('hold');
      });

      it('should regress with more than 2 consecutive failures', () => {
        const exercise = createTestExercise({
          minReps: 8,
          weightIncrement: 5,
        });
        const performance = createPerformance({
          actualWeight: 120,
          actualReps: 5,
          consecutiveFailures: 3, // More than threshold
        });

        const result = service.calculateNextWeekTargets(
          exercise,
          performance,
          false
        );

        expect(result.targetWeight).toBe(115);
        expect(result.reason).toBe('regress');
      });
    });

    describe('Hold when below minReps with insufficient failures', () => {
      it('should hold with minReps when below minReps but not enough failures', () => {
        const exercise = createTestExercise({ minReps: 8 });
        const performance = createPerformance({
          actualWeight: 100,
          actualReps: 5, // Below minReps
          consecutiveFailures: 0,
        });

        const result = service.calculateNextWeekTargets(
          exercise,
          performance,
          false
        );

        expect(result.targetWeight).toBe(100);
        expect(result.targetReps).toBe(8); // Reset to minReps
        expect(result.reason).toBe('hold');
      });
    });
  });

  describe('calculateConsecutiveFailures', () => {
    it('should return 0 for empty history', () => {
      const result = service.calculateConsecutiveFailures([], 100, 8);

      expect(result).toBe(0);
    });

    it('should count consecutive failures at same weight', () => {
      const history: PreviousWeekPerformance[] = [
        createPerformance({ actualWeight: 100, actualReps: 6 }),
        createPerformance({ actualWeight: 100, actualReps: 5 }),
      ];

      const result = service.calculateConsecutiveFailures(history, 100, 8);

      expect(result).toBe(2);
    });

    it('should stop counting when weight changes', () => {
      const history: PreviousWeekPerformance[] = [
        createPerformance({ actualWeight: 100, actualReps: 6 }),
        createPerformance({ actualWeight: 95, actualReps: 5 }), // Different weight
      ];

      const result = service.calculateConsecutiveFailures(history, 100, 8);

      expect(result).toBe(1); // Only counts the first failure
    });

    it('should stop counting at first success', () => {
      const history: PreviousWeekPerformance[] = [
        createPerformance({ actualWeight: 100, actualReps: 6 }), // Fail
        createPerformance({ actualWeight: 100, actualReps: 9 }), // Success
        createPerformance({ actualWeight: 100, actualReps: 5 }), // Fail (ignored)
      ];

      const result = service.calculateConsecutiveFailures(history, 100, 8);

      expect(result).toBe(1); // Stops at success
    });

    it('should return 0 when first entry is success', () => {
      const history: PreviousWeekPerformance[] = [
        createPerformance({ actualWeight: 100, actualReps: 10 }), // Success
        createPerformance({ actualWeight: 100, actualReps: 5 }), // Fail (ignored)
      ];

      const result = service.calculateConsecutiveFailures(history, 100, 8);

      expect(result).toBe(0);
    });

    it('should use minReps as threshold', () => {
      const history: PreviousWeekPerformance[] = [
        createPerformance({ actualWeight: 100, actualReps: 7 }), // Fail (< 8)
        createPerformance({ actualWeight: 100, actualReps: 8 }), // Success (= 8)
      ];

      const result = service.calculateConsecutiveFailures(history, 100, 8);

      expect(result).toBe(1);
    });

    it('should handle different weight than history', () => {
      const history: PreviousWeekPerformance[] = [
        createPerformance({ actualWeight: 95, actualReps: 6 }),
        createPerformance({ actualWeight: 95, actualReps: 5 }),
      ];

      // Looking for failures at 100, but history is at 95
      const result = service.calculateConsecutiveFailures(history, 100, 8);

      expect(result).toBe(0); // Weight doesn't match
    });
  });

  describe('buildPreviousWeekPerformance', () => {
    it('should return null for empty sets array', () => {
      const result = service.buildPreviousWeekPerformance(
        'exercise-1',
        1,
        100,
        10,
        [],
        8,
        []
      );

      expect(result).toBeNull();
    });

    it('should select best set by weight then reps', () => {
      const completedSets = [
        { actualWeight: 100, actualReps: 8 },
        { actualWeight: 105, actualReps: 6 }, // Higher weight wins
        { actualWeight: 100, actualReps: 10 },
      ];

      const result = service.buildPreviousWeekPerformance(
        'exercise-1',
        1,
        100,
        10,
        completedSets,
        8,
        []
      );

      expect(result?.actualWeight).toBe(105);
      expect(result?.actualReps).toBe(6);
    });

    it('should select best reps when weight is equal', () => {
      const completedSets = [
        { actualWeight: 100, actualReps: 8 },
        { actualWeight: 100, actualReps: 12 }, // Same weight, higher reps
        { actualWeight: 100, actualReps: 10 },
      ];

      const result = service.buildPreviousWeekPerformance(
        'exercise-1',
        1,
        100,
        10,
        completedSets,
        8,
        []
      );

      expect(result?.actualWeight).toBe(100);
      expect(result?.actualReps).toBe(12);
    });

    it('should calculate hitTarget correctly when meeting target', () => {
      const completedSets = [{ actualWeight: 100, actualReps: 10 }];

      const result = service.buildPreviousWeekPerformance(
        'exercise-1',
        1,
        100,
        10, // Target reps
        completedSets,
        8,
        []
      );

      expect(result?.hitTarget).toBe(true);
    });

    it('should calculate hitTarget correctly when exceeding target', () => {
      const completedSets = [{ actualWeight: 100, actualReps: 12 }];

      const result = service.buildPreviousWeekPerformance(
        'exercise-1',
        1,
        100,
        10, // Target reps
        completedSets,
        8,
        []
      );

      expect(result?.hitTarget).toBe(true);
    });

    it('should calculate hitTarget correctly when missing target', () => {
      const completedSets = [{ actualWeight: 100, actualReps: 8 }];

      const result = service.buildPreviousWeekPerformance(
        'exercise-1',
        1,
        100,
        10, // Target reps
        completedSets,
        8,
        []
      );

      expect(result?.hitTarget).toBe(false);
    });

    it('should track consecutive failures from history', () => {
      const completedSets = [{ actualWeight: 100, actualReps: 6 }]; // Below minReps
      const performanceHistory: PreviousWeekPerformance[] = [
        createPerformance({ actualWeight: 100, actualReps: 5 }),
        createPerformance({ actualWeight: 100, actualReps: 6 }),
      ];

      const result = service.buildPreviousWeekPerformance(
        'exercise-1',
        3,
        100,
        10,
        completedSets,
        8,
        performanceHistory
      );

      // 2 previous failures + current failure = 3
      expect(result?.consecutiveFailures).toBe(3);
    });

    it('should reset consecutive failures when hitting minReps', () => {
      const completedSets = [{ actualWeight: 100, actualReps: 9 }]; // Above minReps
      const performanceHistory: PreviousWeekPerformance[] = [
        createPerformance({ actualWeight: 100, actualReps: 5 }),
        createPerformance({ actualWeight: 100, actualReps: 6 }),
      ];

      const result = service.buildPreviousWeekPerformance(
        'exercise-1',
        3,
        100,
        10,
        completedSets,
        8,
        performanceHistory
      );

      expect(result?.consecutiveFailures).toBe(0);
    });

    it('should populate all performance fields correctly', () => {
      const completedSets = [{ actualWeight: 105, actualReps: 9 }];

      const result = service.buildPreviousWeekPerformance(
        'bench-press',
        2,
        100,
        8,
        completedSets,
        6,
        []
      );

      expect(result).toEqual({
        exerciseId: 'bench-press',
        weekNumber: 2,
        targetWeight: 100,
        targetReps: 8,
        actualWeight: 105,
        actualReps: 9,
        hitTarget: true,
        consecutiveFailures: 0,
      });
    });

    it('should handle single set correctly', () => {
      const completedSets = [{ actualWeight: 100, actualReps: 10 }];

      const result = service.buildPreviousWeekPerformance(
        'exercise-1',
        1,
        100,
        10,
        completedSets,
        8,
        []
      );

      expect(result?.actualWeight).toBe(100);
      expect(result?.actualReps).toBe(10);
    });
  });
});
