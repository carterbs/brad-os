import type {
  ExerciseProgression,
  PreviousWeekPerformance,
} from '@lifting/shared';

/**
 * Result of dynamic progression calculation
 */
export interface DynamicProgressionResult {
  /** Target weight for next week */
  targetWeight: number;
  /** Target reps for next week */
  targetReps: number;
  /** Target sets for next week */
  targetSets: number;
  /** Whether this is a deload week */
  isDeload: boolean;
  /** Explanation of the progression decision */
  reason: ProgressionReason;
}

export type ProgressionReason =
  | 'first_week' // No previous data, use base values
  | 'hit_max_reps' // User hit maxReps, adding weight and dropping to minReps
  | 'hit_target' // User hit target, incrementing reps
  | 'hold' // User missed target but >= minReps, holding
  | 'regress' // User failed minReps twice at same weight, dropping weight
  | 'deload'; // Deload week

/**
 * Service for calculating dynamic progressive overload targets based on actual performance.
 *
 * Algorithm (8-12 rep range for hypertrophy):
 * - If user hits maxReps (12) → add weight, drop to minReps (8)
 * - If user hits target reps → increment reps by 1
 * - If user misses target but >= minReps → hold (same target)
 * - If user fails to hit minReps for 2 consecutive weeks at same weight → regress
 *
 * Deload week (week 7): Reduced weight and volume for recovery.
 */
export class DynamicProgressionService {
  private readonly DELOAD_WEIGHT_FACTOR = 0.85;
  private readonly DELOAD_VOLUME_FACTOR = 0.5;
  private readonly WEIGHT_ROUNDING_INCREMENT = 2.5;
  private readonly CONSECUTIVE_FAILURE_THRESHOLD = 2;

  /**
   * Calculate next week's targets based on previous week's actual performance.
   *
   * @param exercise - Exercise configuration with rep range
   * @param previousPerformance - Actual performance from previous week (null if first week)
   * @param isDeloadWeek - Whether the upcoming week is a deload week
   * @returns Calculated targets for next week
   */
  calculateNextWeekTargets(
    exercise: ExerciseProgression,
    previousPerformance: PreviousWeekPerformance | null,
    isDeloadWeek: boolean
  ): DynamicProgressionResult {
    const { baseSets, minReps, maxReps, weightIncrement, baseWeight } =
      exercise;

    // First week - use base values
    if (!previousPerformance) {
      return {
        targetWeight: baseWeight,
        targetReps: exercise.baseReps,
        targetSets: baseSets,
        isDeload: false,
        reason: 'first_week',
      };
    }

    const { actualWeight, actualReps, targetReps, consecutiveFailures } =
      previousPerformance;

    // Deload week - reduced intensity and volume
    if (isDeloadWeek) {
      const deloadWeight = this.roundToNearest(
        actualWeight * this.DELOAD_WEIGHT_FACTOR,
        this.WEIGHT_ROUNDING_INCREMENT
      );
      const deloadSets = Math.max(
        1,
        Math.ceil(baseSets * this.DELOAD_VOLUME_FACTOR)
      );
      return {
        targetWeight: deloadWeight,
        targetReps: minReps,
        targetSets: deloadSets,
        isDeload: true,
        reason: 'deload',
      };
    }

    // Check for regression: failed to hit minReps for consecutive weeks
    if (
      actualReps < minReps &&
      consecutiveFailures >= this.CONSECUTIVE_FAILURE_THRESHOLD
    ) {
      const regressedWeight = Math.max(
        baseWeight,
        actualWeight - weightIncrement
      );
      return {
        targetWeight: regressedWeight,
        targetReps: minReps,
        targetSets: baseSets,
        isDeload: false,
        reason: 'regress',
      };
    }

    // Hit max reps - add weight and drop to min reps
    if (actualReps >= maxReps) {
      return {
        targetWeight: actualWeight + weightIncrement,
        targetReps: minReps,
        targetSets: baseSets,
        isDeload: false,
        reason: 'hit_max_reps',
      };
    }

    // Hit target reps - increment reps (up to maxReps)
    if (actualReps >= targetReps) {
      const nextReps = Math.min(targetReps + 1, maxReps);
      return {
        targetWeight: actualWeight,
        targetReps: nextReps,
        targetSets: baseSets,
        isDeload: false,
        reason: 'hit_target',
      };
    }

    // Missed target but >= minReps - hold
    if (actualReps >= minReps) {
      return {
        targetWeight: actualWeight,
        targetReps: targetReps, // Keep same target
        targetSets: baseSets,
        isDeload: false,
        reason: 'hold',
      };
    }

    // Missed minReps but not enough consecutive failures yet - hold with minReps as target
    return {
      targetWeight: actualWeight,
      targetReps: minReps,
      targetSets: baseSets,
      isDeload: false,
      reason: 'hold',
    };
  }

  /**
   * Calculate consecutive failures at the same weight.
   * Looks through performance history to count how many consecutive weeks
   * the user failed to hit minReps at the current weight.
   *
   * @param performanceHistory - Array of previous performances, newest first
   * @param currentWeight - The current working weight
   * @param minReps - Minimum reps threshold
   * @returns Number of consecutive failures
   */
  calculateConsecutiveFailures(
    performanceHistory: PreviousWeekPerformance[],
    currentWeight: number,
    minReps: number
  ): number {
    let consecutiveFailures = 0;

    for (const perf of performanceHistory) {
      // Only count failures at the same weight
      if (perf.actualWeight !== currentWeight) {
        break;
      }

      // Check if this week was a failure (didn't hit minReps)
      if (perf.actualReps < minReps) {
        consecutiveFailures++;
      } else {
        // Hit minReps, stop counting
        break;
      }
    }

    return consecutiveFailures;
  }

  /**
   * Build PreviousWeekPerformance from workout set data.
   * Takes the best performance (highest weight with highest reps at that weight)
   * from all completed sets for an exercise in a workout.
   *
   * @param exerciseId - The exercise ID
   * @param weekNumber - The week number
   * @param targetWeight - Target weight that was prescribed
   * @param targetReps - Target reps that were prescribed
   * @param completedSets - Array of {actualWeight, actualReps} from completed sets
   * @param minReps - Minimum reps threshold for determining failure
   * @param performanceHistory - Previous performances to calculate consecutive failures
   * @returns PreviousWeekPerformance or null if no completed sets
   */
  buildPreviousWeekPerformance(
    exerciseId: string,
    weekNumber: number,
    targetWeight: number,
    targetReps: number,
    completedSets: Array<{ actualWeight: number; actualReps: number }>,
    minReps: number,
    performanceHistory: PreviousWeekPerformance[]
  ): PreviousWeekPerformance | null {
    if (completedSets.length === 0) {
      return null;
    }

    // Find best set: highest weight, then highest reps at that weight
    const firstSet = completedSets[0];
    if (!firstSet) {
      return null;
    }
    let bestSet = firstSet;
    for (const set of completedSets) {
      if (
        set.actualWeight > bestSet.actualWeight ||
        (set.actualWeight === bestSet.actualWeight &&
          set.actualReps > bestSet.actualReps)
      ) {
        bestSet = set;
      }
    }

    const hitTarget = bestSet.actualReps >= targetReps;

    // Calculate consecutive failures at this weight
    const consecutiveFailures = this.calculateConsecutiveFailures(
      performanceHistory,
      bestSet.actualWeight,
      minReps
    );

    // Add 1 to consecutive failures if this week was also a failure
    const totalFailures =
      bestSet.actualReps < minReps ? consecutiveFailures + 1 : 0;

    return {
      exerciseId,
      weekNumber,
      targetWeight,
      targetReps,
      actualWeight: bestSet.actualWeight,
      actualReps: bestSet.actualReps,
      hitTarget,
      consecutiveFailures: totalFailures,
    };
  }

  private roundToNearest(value: number, increment: number): number {
    return Math.round(value / increment) * increment;
  }
}
