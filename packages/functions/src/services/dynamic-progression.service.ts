import type {
  ExerciseProgression,
  PreviousWeekPerformance,
} from '@brad-os/shared';

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
 */
export class DynamicProgressionService {
  private readonly DELOAD_WEIGHT_FACTOR = 0.85;
  private readonly DELOAD_VOLUME_FACTOR = 0.5;
  private readonly WEIGHT_ROUNDING_INCREMENT = 2.5;
  private readonly CONSECUTIVE_FAILURE_THRESHOLD = 2;

  calculateNextWeekTargets(
    exercise: ExerciseProgression,
    previousPerformance: PreviousWeekPerformance | null,
    isDeloadWeek: boolean
  ): DynamicProgressionResult {
    const { baseSets, minReps, maxReps, weightIncrement, baseWeight } = exercise;

    if (!previousPerformance) {
      return {
        targetWeight: baseWeight,
        targetReps: exercise.baseReps,
        targetSets: baseSets,
        isDeload: false,
        reason: 'first_week',
      };
    }

    const { actualWeight, actualReps, targetReps, consecutiveFailures } = previousPerformance;

    if (isDeloadWeek) {
      const deloadWeight = this.roundToNearest(
        actualWeight * this.DELOAD_WEIGHT_FACTOR,
        this.WEIGHT_ROUNDING_INCREMENT
      );
      const deloadSets = Math.max(1, Math.ceil(baseSets * this.DELOAD_VOLUME_FACTOR));
      return {
        targetWeight: deloadWeight,
        targetReps: minReps,
        targetSets: deloadSets,
        isDeload: true,
        reason: 'deload',
      };
    }

    if (actualReps < minReps && consecutiveFailures >= this.CONSECUTIVE_FAILURE_THRESHOLD) {
      const regressedWeight = Math.max(baseWeight, actualWeight - weightIncrement);
      return {
        targetWeight: regressedWeight,
        targetReps: minReps,
        targetSets: baseSets,
        isDeload: false,
        reason: 'regress',
      };
    }

    if (actualReps >= maxReps) {
      return {
        targetWeight: actualWeight + weightIncrement,
        targetReps: minReps,
        targetSets: baseSets,
        isDeload: false,
        reason: 'hit_max_reps',
      };
    }

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

    if (actualReps >= minReps) {
      return {
        targetWeight: actualWeight,
        targetReps: targetReps,
        targetSets: baseSets,
        isDeload: false,
        reason: 'hold',
      };
    }

    return {
      targetWeight: actualWeight,
      targetReps: minReps,
      targetSets: baseSets,
      isDeload: false,
      reason: 'hold',
    };
  }

  calculateConsecutiveFailures(
    performanceHistory: PreviousWeekPerformance[],
    currentWeight: number,
    minReps: number
  ): number {
    let consecutiveFailures = 0;

    for (const perf of performanceHistory) {
      if (perf.actualWeight !== currentWeight) {
        break;
      }
      if (perf.actualReps < minReps) {
        consecutiveFailures++;
      } else {
        break;
      }
    }

    return consecutiveFailures;
  }

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

    const firstSet = completedSets[0];
    if (!firstSet) {
      return null;
    }
    let bestSet = firstSet;
    for (const set of completedSets) {
      if (
        set.actualWeight > bestSet.actualWeight ||
        (set.actualWeight === bestSet.actualWeight && set.actualReps > bestSet.actualReps)
      ) {
        bestSet = set;
      }
    }

    const hitTarget = bestSet.actualReps >= targetReps;
    const consecutiveFailures = this.calculateConsecutiveFailures(
      performanceHistory,
      bestSet.actualWeight,
      minReps
    );
    const totalFailures = bestSet.actualReps < minReps ? consecutiveFailures + 1 : 0;

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
