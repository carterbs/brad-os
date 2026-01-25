import type {
  ExerciseProgression,
  WeekTargets,
  CompletionStatus,
} from '@brad-os/shared';

/**
 * Service for calculating progressive overload targets for exercises
 * across a 7-week mesocycle (6 regular weeks + 1 deload week).
 *
 * Progression pattern:
 * - Week 0: Base weight/reps
 * - Week 1: +1 rep (same weight)
 * - Week 2: +weight, reset reps to base
 * - Week 3: +1 rep
 * - Week 4: +weight, reset reps
 * - Week 5: +1 rep
 * - Week 6 (Deload): 85% weight, 50% sets, same reps as week 5
 */
export class ProgressionService {
  private readonly DELOAD_WEIGHT_FACTOR = 0.85;
  private readonly DELOAD_VOLUME_FACTOR = 0.5;
  private readonly WEIGHT_ROUNDING_INCREMENT = 2.5;

  /**
   * Calculate target weight, reps, and sets for a given week.
   *
   * @param exercise - The exercise with base values and weight increment
   * @param weekNumber - The week number (0-6)
   * @param previousWeekCompleted - Whether all sets were completed in the previous week
   * @returns WeekTargets with calculated values
   */
  calculateTargetsForWeek(
    exercise: ExerciseProgression,
    weekNumber: number,
    previousWeekCompleted: boolean
  ): WeekTargets {
    // Week 0 is always the baseline
    if (weekNumber === 0) {
      return this.createWeekTargets(
        exercise,
        exercise.baseWeight,
        exercise.baseReps,
        exercise.baseSets,
        0,
        false
      );
    }

    // Calculate what the targets WOULD be if all previous weeks were completed
    const idealTargets = this.calculateIdealTargetsForWeek(
      exercise,
      weekNumber
    );

    // Week 6 is always deload, even if previous week incomplete
    if (weekNumber === 6) {
      const week5Targets = previousWeekCompleted
        ? this.calculateIdealTargetsForWeek(exercise, 5)
        : this.calculateIdealTargetsForWeek(exercise, 4);

      const deloadWeight = this.roundToNearest(
        week5Targets.weight * this.DELOAD_WEIGHT_FACTOR,
        this.WEIGHT_ROUNDING_INCREMENT
      );
      const deloadSets = Math.max(
        1,
        Math.ceil(exercise.baseSets * this.DELOAD_VOLUME_FACTOR)
      );

      return this.createWeekTargets(
        exercise,
        deloadWeight,
        previousWeekCompleted
          ? week5Targets.reps
          : this.calculateIdealTargetsForWeek(exercise, 4).reps,
        deloadSets,
        weekNumber,
        true
      );
    }

    // If previous week was not completed, don't progress
    if (!previousWeekCompleted) {
      const previousIdealTargets = this.calculateIdealTargetsForWeek(
        exercise,
        weekNumber - 1
      );
      return this.createWeekTargets(
        exercise,
        previousIdealTargets.weight,
        previousIdealTargets.reps,
        previousIdealTargets.sets,
        weekNumber,
        false
      );
    }

    return this.createWeekTargets(
      exercise,
      idealTargets.weight,
      idealTargets.reps,
      idealTargets.sets,
      weekNumber,
      false
    );
  }

  /**
   * Calculate progression history based on actual completion data.
   */
  calculateProgressionHistory(
    exercise: ExerciseProgression,
    completionHistory: CompletionStatus[]
  ): WeekTargets[] {
    const targets: WeekTargets[] = [];

    for (let week = 0; week <= 6; week++) {
      const previousWeek = completionHistory.find(
        (c) => c.weekNumber === week - 1
      );
      const previousCompleted =
        week === 0 ? true : (previousWeek?.allSetsCompleted ?? true);

      targets.push(
        this.calculateTargetsForWeek(exercise, week, previousCompleted)
      );
    }

    return targets;
  }

  /**
   * Calculate ideal targets assuming all previous weeks were completed.
   */
  private calculateIdealTargetsForWeek(
    exercise: ExerciseProgression,
    weekNumber: number
  ): { weight: number; reps: number; sets: number } {
    const { baseWeight, baseReps, baseSets, weightIncrement } = exercise;

    switch (weekNumber) {
      case 0:
        return { weight: baseWeight, reps: baseReps, sets: baseSets };
      case 1:
        return { weight: baseWeight, reps: baseReps + 1, sets: baseSets };
      case 2:
        return {
          weight: baseWeight + weightIncrement,
          reps: baseReps,
          sets: baseSets,
        };
      case 3:
        return {
          weight: baseWeight + weightIncrement,
          reps: baseReps + 1,
          sets: baseSets,
        };
      case 4:
        return {
          weight: baseWeight + weightIncrement * 2,
          reps: baseReps,
          sets: baseSets,
        };
      case 5:
        return {
          weight: baseWeight + weightIncrement * 2,
          reps: baseReps + 1,
          sets: baseSets,
        };
      default:
        // Week 6+ returns week 5 values (deload is calculated separately)
        return {
          weight: baseWeight + weightIncrement * 2,
          reps: baseReps + 1,
          sets: baseSets,
        };
    }
  }

  private createWeekTargets(
    exercise: ExerciseProgression,
    weight: number,
    reps: number,
    sets: number,
    weekNumber: number,
    isDeload: boolean
  ): WeekTargets {
    return {
      exerciseId: exercise.exerciseId,
      planExerciseId: exercise.planExerciseId,
      targetWeight: weight,
      targetReps: reps,
      targetSets: sets,
      weekNumber,
      isDeload,
    };
  }

  private roundToNearest(value: number, increment: number): number {
    return Math.round(value / increment) * increment;
  }
}
