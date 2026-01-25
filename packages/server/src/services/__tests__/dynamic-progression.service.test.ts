import { describe, it, expect, beforeEach } from 'vitest';
import { DynamicProgressionService } from '../dynamic-progression.service.js';
import type {
  ExerciseProgression,
  PreviousWeekPerformance,
} from '@brad-os/shared';

describe('DynamicProgressionService', () => {
  let service: DynamicProgressionService;

  const baseExercise: ExerciseProgression = {
    exerciseId: 'exercise-1',
    planExerciseId: 'plan-exercise-1',
    baseWeight: 100,
    baseReps: 10, // Starting in the middle of the 8-12 range
    baseSets: 3,
    weightIncrement: 5,
    minReps: 8,
    maxReps: 12,
  };

  beforeEach(() => {
    service = new DynamicProgressionService();
  });

  describe('calculateNextWeekTargets', () => {
    describe('First week (no previous data)', () => {
      it('should return base values for first week', () => {
        const result = service.calculateNextWeekTargets(
          baseExercise,
          null,
          false
        );

        expect(result.targetWeight).toBe(100);
        expect(result.targetReps).toBe(10);
        expect(result.targetSets).toBe(3);
        expect(result.isDeload).toBe(false);
        expect(result.reason).toBe('first_week');
      });
    });

    describe('Hit max reps - progression trigger', () => {
      it('should add weight and drop to minReps when user hits maxReps', () => {
        const prevPerformance: PreviousWeekPerformance = {
          exerciseId: 'exercise-1',
          weekNumber: 1,
          targetWeight: 100,
          targetReps: 11,
          actualWeight: 100,
          actualReps: 12, // Hit max reps!
          hitTarget: true,
          consecutiveFailures: 0,
        };

        const result = service.calculateNextWeekTargets(
          baseExercise,
          prevPerformance,
          false
        );

        expect(result.targetWeight).toBe(105); // +5 lbs
        expect(result.targetReps).toBe(8); // Drop to minReps
        expect(result.targetSets).toBe(3);
        expect(result.reason).toBe('hit_max_reps');
      });

      it('should also progress when exceeding maxReps', () => {
        const prevPerformance: PreviousWeekPerformance = {
          exerciseId: 'exercise-1',
          weekNumber: 1,
          targetWeight: 100,
          targetReps: 12,
          actualWeight: 100,
          actualReps: 14, // Exceeded max!
          hitTarget: true,
          consecutiveFailures: 0,
        };

        const result = service.calculateNextWeekTargets(
          baseExercise,
          prevPerformance,
          false
        );

        expect(result.targetWeight).toBe(105);
        expect(result.targetReps).toBe(8);
        expect(result.reason).toBe('hit_max_reps');
      });
    });

    describe('Hit target reps - rep increment', () => {
      it('should increment reps by 1 when hitting target', () => {
        const prevPerformance: PreviousWeekPerformance = {
          exerciseId: 'exercise-1',
          weekNumber: 1,
          targetWeight: 100,
          targetReps: 10,
          actualWeight: 100,
          actualReps: 10, // Hit target exactly
          hitTarget: true,
          consecutiveFailures: 0,
        };

        const result = service.calculateNextWeekTargets(
          baseExercise,
          prevPerformance,
          false
        );

        expect(result.targetWeight).toBe(100); // Same weight
        expect(result.targetReps).toBe(11); // +1 rep
        expect(result.reason).toBe('hit_target');
      });

      it('should cap reps at maxReps', () => {
        const prevPerformance: PreviousWeekPerformance = {
          exerciseId: 'exercise-1',
          weekNumber: 1,
          targetWeight: 100,
          targetReps: 11,
          actualWeight: 100,
          actualReps: 11, // Hit target, one below max
          hitTarget: true,
          consecutiveFailures: 0,
        };

        const result = service.calculateNextWeekTargets(
          baseExercise,
          prevPerformance,
          false
        );

        expect(result.targetReps).toBe(12); // Capped at maxReps
        expect(result.reason).toBe('hit_target');
      });
    });

    describe('Missed target but >= minReps - hold', () => {
      it('should hold same weight and target when missing target but above minReps', () => {
        const prevPerformance: PreviousWeekPerformance = {
          exerciseId: 'exercise-1',
          weekNumber: 1,
          targetWeight: 100,
          targetReps: 10,
          actualWeight: 100,
          actualReps: 9, // Missed target by 1
          hitTarget: false,
          consecutiveFailures: 0,
        };

        const result = service.calculateNextWeekTargets(
          baseExercise,
          prevPerformance,
          false
        );

        expect(result.targetWeight).toBe(100); // Same weight
        expect(result.targetReps).toBe(10); // Same target
        expect(result.reason).toBe('hold');
      });

      it('should hold at exactly minReps', () => {
        const prevPerformance: PreviousWeekPerformance = {
          exerciseId: 'exercise-1',
          weekNumber: 1,
          targetWeight: 100,
          targetReps: 10,
          actualWeight: 100,
          actualReps: 8, // Exactly minReps
          hitTarget: false,
          consecutiveFailures: 0,
        };

        const result = service.calculateNextWeekTargets(
          baseExercise,
          prevPerformance,
          false
        );

        expect(result.targetWeight).toBe(100);
        expect(result.targetReps).toBe(10);
        expect(result.reason).toBe('hold');
      });
    });

    describe('Failed to hit minReps - potential regression', () => {
      it('should hold with minReps target after first failure', () => {
        const prevPerformance: PreviousWeekPerformance = {
          exerciseId: 'exercise-1',
          weekNumber: 1,
          targetWeight: 100,
          targetReps: 10,
          actualWeight: 100,
          actualReps: 6, // Below minReps
          hitTarget: false,
          consecutiveFailures: 1, // First failure
        };

        const result = service.calculateNextWeekTargets(
          baseExercise,
          prevPerformance,
          false
        );

        expect(result.targetWeight).toBe(100); // Same weight
        expect(result.targetReps).toBe(8); // Target at minReps
        expect(result.reason).toBe('hold');
      });

      it('should regress after 2 consecutive failures at same weight', () => {
        // Use an exercise with lower base weight to allow regression
        const exerciseWithLowerBase = { ...baseExercise, baseWeight: 80 };
        const prevPerformance: PreviousWeekPerformance = {
          exerciseId: 'exercise-1',
          weekNumber: 2,
          targetWeight: 100,
          targetReps: 8,
          actualWeight: 100, // User has progressed to 100, started at 80
          actualReps: 6, // Below minReps again
          hitTarget: false,
          consecutiveFailures: 2, // Second consecutive failure
        };

        const result = service.calculateNextWeekTargets(
          exerciseWithLowerBase,
          prevPerformance,
          false
        );

        expect(result.targetWeight).toBe(95); // -5 lbs (regression)
        expect(result.targetReps).toBe(8); // minReps
        expect(result.reason).toBe('regress');
      });

      it('should not regress below base weight', () => {
        const exercise = { ...baseExercise, baseWeight: 100 };
        const prevPerformance: PreviousWeekPerformance = {
          exerciseId: 'exercise-1',
          weekNumber: 2,
          targetWeight: 100, // Already at base weight
          targetReps: 8,
          actualWeight: 100,
          actualReps: 5,
          hitTarget: false,
          consecutiveFailures: 2,
        };

        const result = service.calculateNextWeekTargets(
          exercise,
          prevPerformance,
          false
        );

        expect(result.targetWeight).toBe(100); // Can't go below base
        expect(result.reason).toBe('regress');
      });
    });

    describe('Deload week', () => {
      it('should apply 85% weight and 50% sets during deload', () => {
        const prevPerformance: PreviousWeekPerformance = {
          exerciseId: 'exercise-1',
          weekNumber: 6,
          targetWeight: 120,
          targetReps: 10,
          actualWeight: 120,
          actualReps: 10,
          hitTarget: true,
          consecutiveFailures: 0,
        };

        const result = service.calculateNextWeekTargets(
          baseExercise,
          prevPerformance,
          true // Deload week
        );

        // 120 * 0.85 = 102, rounded to nearest 2.5 = 102.5
        expect(result.targetWeight).toBe(102.5);
        expect(result.targetReps).toBe(8); // minReps during deload
        expect(result.targetSets).toBe(2); // 3 * 0.5 = 1.5, rounded up = 2
        expect(result.isDeload).toBe(true);
        expect(result.reason).toBe('deload');
      });

      it('should ensure at least 1 set during deload', () => {
        const exercise = { ...baseExercise, baseSets: 1 };
        const prevPerformance: PreviousWeekPerformance = {
          exerciseId: 'exercise-1',
          weekNumber: 6,
          targetWeight: 100,
          targetReps: 10,
          actualWeight: 100,
          actualReps: 10,
          hitTarget: true,
          consecutiveFailures: 0,
        };

        const result = service.calculateNextWeekTargets(
          exercise,
          prevPerformance,
          true
        );

        expect(result.targetSets).toBe(1);
      });

      it('should round weight to nearest 2.5 lbs', () => {
        const prevPerformance: PreviousWeekPerformance = {
          exerciseId: 'exercise-1',
          weekNumber: 6,
          targetWeight: 117,
          targetReps: 10,
          actualWeight: 117,
          actualReps: 10,
          hitTarget: true,
          consecutiveFailures: 0,
        };

        const result = service.calculateNextWeekTargets(
          baseExercise,
          prevPerformance,
          true
        );

        // 117 * 0.85 = 99.45, rounded to nearest 2.5 = 100
        expect(result.targetWeight).toBe(100);
      });
    });
  });

  describe('Full progression cycle simulation', () => {
    it('should progress through a full cycle: 8→9→10→11→12→add weight→8', () => {
      // Week 1: Start at 10 reps, hit target
      let prevPerf: PreviousWeekPerformance = {
        exerciseId: 'exercise-1',
        weekNumber: 1,
        targetWeight: 100,
        targetReps: 10,
        actualWeight: 100,
        actualReps: 10,
        hitTarget: true,
        consecutiveFailures: 0,
      };

      // Week 2: Target should be 11
      let result = service.calculateNextWeekTargets(baseExercise, prevPerf, false);
      expect(result.targetReps).toBe(11);
      expect(result.targetWeight).toBe(100);

      // Week 2: User hits 11
      prevPerf = {
        exerciseId: 'exercise-1',
        weekNumber: 2,
        targetWeight: 100,
        targetReps: 11,
        actualWeight: 100,
        actualReps: 11,
        hitTarget: true,
        consecutiveFailures: 0,
      };

      // Week 3: Target should be 12
      result = service.calculateNextWeekTargets(baseExercise, prevPerf, false);
      expect(result.targetReps).toBe(12);
      expect(result.targetWeight).toBe(100);

      // Week 3: User hits 12 (max reps!)
      prevPerf = {
        exerciseId: 'exercise-1',
        weekNumber: 3,
        targetWeight: 100,
        targetReps: 12,
        actualWeight: 100,
        actualReps: 12,
        hitTarget: true,
        consecutiveFailures: 0,
      };

      // Week 4: Should add weight and drop to 8
      result = service.calculateNextWeekTargets(baseExercise, prevPerf, false);
      expect(result.targetReps).toBe(8);
      expect(result.targetWeight).toBe(105);
      expect(result.reason).toBe('hit_max_reps');
    });

    it('should handle bad days with hold behavior', () => {
      // Week 1: Target 10, only hit 9
      const prevPerf: PreviousWeekPerformance = {
        exerciseId: 'exercise-1',
        weekNumber: 1,
        targetWeight: 100,
        targetReps: 10,
        actualWeight: 100,
        actualReps: 9, // Missed by 1
        hitTarget: false,
        consecutiveFailures: 0,
      };

      // Week 2: Should hold at same target
      const result = service.calculateNextWeekTargets(baseExercise, prevPerf, false);
      expect(result.targetReps).toBe(10); // Same target
      expect(result.targetWeight).toBe(100);
      expect(result.reason).toBe('hold');
    });
  });

  describe('calculateConsecutiveFailures', () => {
    it('should count consecutive failures at same weight', () => {
      const history: PreviousWeekPerformance[] = [
        {
          exerciseId: 'exercise-1',
          weekNumber: 3,
          targetWeight: 100,
          targetReps: 8,
          actualWeight: 100,
          actualReps: 6, // Failure
          hitTarget: false,
          consecutiveFailures: 0,
        },
        {
          exerciseId: 'exercise-1',
          weekNumber: 2,
          targetWeight: 100,
          targetReps: 8,
          actualWeight: 100,
          actualReps: 7, // Failure
          hitTarget: false,
          consecutiveFailures: 0,
        },
        {
          exerciseId: 'exercise-1',
          weekNumber: 1,
          targetWeight: 100,
          targetReps: 10,
          actualWeight: 100,
          actualReps: 10, // Success - stop counting
          hitTarget: true,
          consecutiveFailures: 0,
        },
      ];

      const failures = service.calculateConsecutiveFailures(history, 100, 8);
      expect(failures).toBe(2);
    });

    it('should stop counting when weight changes', () => {
      const history: PreviousWeekPerformance[] = [
        {
          exerciseId: 'exercise-1',
          weekNumber: 2,
          targetWeight: 100,
          targetReps: 8,
          actualWeight: 100,
          actualReps: 6, // Failure at 100
          hitTarget: false,
          consecutiveFailures: 0,
        },
        {
          exerciseId: 'exercise-1',
          weekNumber: 1,
          targetWeight: 95,
          targetReps: 8,
          actualWeight: 95, // Different weight - stop counting
          actualReps: 6,
          hitTarget: false,
          consecutiveFailures: 0,
        },
      ];

      const failures = service.calculateConsecutiveFailures(history, 100, 8);
      expect(failures).toBe(1);
    });

    it('should return 0 when no failures', () => {
      const history: PreviousWeekPerformance[] = [
        {
          exerciseId: 'exercise-1',
          weekNumber: 1,
          targetWeight: 100,
          targetReps: 10,
          actualWeight: 100,
          actualReps: 10,
          hitTarget: true,
          consecutiveFailures: 0,
        },
      ];

      const failures = service.calculateConsecutiveFailures(history, 100, 8);
      expect(failures).toBe(0);
    });
  });

  describe('buildPreviousWeekPerformance', () => {
    it('should find best set from completed sets', () => {
      const completedSets = [
        { actualWeight: 100, actualReps: 8 },
        { actualWeight: 100, actualReps: 10 }, // Best at this weight
        { actualWeight: 100, actualReps: 9 },
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
      expect(result?.actualReps).toBe(10);
      expect(result?.hitTarget).toBe(true);
    });

    it('should prefer higher weight over higher reps', () => {
      const completedSets = [
        { actualWeight: 100, actualReps: 12 },
        { actualWeight: 105, actualReps: 8 }, // Higher weight wins
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
      expect(result?.actualReps).toBe(8);
    });

    it('should return null for empty sets', () => {
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

    it('should track consecutive failures when below minReps', () => {
      const history: PreviousWeekPerformance[] = [
        {
          exerciseId: 'exercise-1',
          weekNumber: 1,
          targetWeight: 100,
          targetReps: 8,
          actualWeight: 100,
          actualReps: 6,
          hitTarget: false,
          consecutiveFailures: 0,
        },
      ];

      const completedSets = [{ actualWeight: 100, actualReps: 5 }]; // Below minReps

      const result = service.buildPreviousWeekPerformance(
        'exercise-1',
        2,
        100,
        8,
        completedSets,
        8,
        history
      );

      expect(result?.consecutiveFailures).toBe(2); // 1 from history + 1 current
    });
  });

  describe('edge cases', () => {
    it('should handle weight increment with decimals', () => {
      const exercise = { ...baseExercise, weightIncrement: 2.5 };
      const prevPerf: PreviousWeekPerformance = {
        exerciseId: 'exercise-1',
        weekNumber: 1,
        targetWeight: 100,
        targetReps: 12,
        actualWeight: 100,
        actualReps: 12,
        hitTarget: true,
        consecutiveFailures: 0,
      };

      const result = service.calculateNextWeekTargets(exercise, prevPerf, false);
      expect(result.targetWeight).toBe(102.5);
    });

    it('should handle different rep ranges', () => {
      const exercise = { ...baseExercise, minReps: 5, maxReps: 8 };
      const prevPerf: PreviousWeekPerformance = {
        exerciseId: 'exercise-1',
        weekNumber: 1,
        targetWeight: 100,
        targetReps: 8,
        actualWeight: 100,
        actualReps: 8, // Hit max
        hitTarget: true,
        consecutiveFailures: 0,
      };

      const result = service.calculateNextWeekTargets(exercise, prevPerf, false);
      expect(result.targetWeight).toBe(105);
      expect(result.targetReps).toBe(5); // Drop to minReps (5)
    });

    it('should handle user using heavier weight than prescribed', () => {
      const prevPerf: PreviousWeekPerformance = {
        exerciseId: 'exercise-1',
        weekNumber: 1,
        targetWeight: 100,
        targetReps: 10,
        actualWeight: 110, // User went heavier
        actualReps: 10,
        hitTarget: true,
        consecutiveFailures: 0,
      };

      const result = service.calculateNextWeekTargets(baseExercise, prevPerf, false);
      // Should progress based on actual weight used
      expect(result.targetWeight).toBe(110);
      expect(result.targetReps).toBe(11);
    });
  });
});
