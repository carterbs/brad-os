import type { ExerciseProgression, WeekTargets } from '@lifting/shared';

/**
 * Service for calculating deload week parameters.
 *
 * Deload week (week 6) uses:
 * - 85% of working weight (rounded to nearest 2.5 lbs)
 * - 50% of sets (rounded up, minimum 1)
 * - Same reps as previous week
 */
export class DeloadService {
  private readonly DELOAD_WEIGHT_FACTOR = 0.85;
  private readonly DELOAD_VOLUME_FACTOR = 0.5;
  private readonly WEIGHT_ROUNDING_INCREMENT = 2.5;
  private readonly DELOAD_WEEK = 6;

  /**
   * Calculate deload targets based on current working weight and reps.
   */
  calculateDeloadTargets(
    exercise: ExerciseProgression,
    currentWeight: number,
    currentReps: number
  ): WeekTargets {
    const deloadWeight = this.roundToNearest(
      currentWeight * this.DELOAD_WEIGHT_FACTOR,
      this.WEIGHT_ROUNDING_INCREMENT
    );

    const deloadSets = Math.max(
      1,
      Math.ceil(exercise.baseSets * this.DELOAD_VOLUME_FACTOR)
    );

    return {
      exerciseId: exercise.exerciseId,
      planExerciseId: exercise.planExerciseId,
      targetWeight: deloadWeight,
      targetReps: currentReps,
      targetSets: deloadSets,
      weekNumber: this.DELOAD_WEEK,
      isDeload: true,
    };
  }

  /**
   * Check if a given week number is a deload week.
   */
  isDeloadWeek(weekNumber: number): boolean {
    return weekNumber === this.DELOAD_WEEK;
  }

  /**
   * Get the weight reduction factor for deload weeks.
   */
  getDeloadWeightFactor(): number {
    return this.DELOAD_WEIGHT_FACTOR;
  }

  /**
   * Get the volume reduction factor for deload weeks.
   */
  getDeloadVolumeFactor(): number {
    return this.DELOAD_VOLUME_FACTOR;
  }

  private roundToNearest(value: number, increment: number): number {
    return Math.round(value / increment) * increment;
  }
}
