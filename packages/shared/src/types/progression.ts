/**
 * Progression types for the mesocycle progressive overload system
 */

/**
 * Configuration for how an exercise progresses through a mesocycle
 */
export interface ExerciseProgression {
  /** The exercise ID from the exercises table */
  exerciseId: string;
  /** The plan exercise ID from the plan_day_exercises table */
  planExerciseId: string;
  /** Starting weight from plan configuration */
  baseWeight: number;
  /** Starting reps from plan configuration */
  baseReps: number;
  /** Starting sets from plan configuration */
  baseSets: number;
  /** Weight to add each progression cycle (default 5 lbs) */
  weightIncrement: number;
  /** Minimum reps in the rep range - drop to this after adding weight (default 8) */
  minReps: number;
  /** Maximum reps in the rep range - triggers weight increase (default 12) */
  maxReps: number;
}

/**
 * Actual performance data from a previous week for an exercise.
 * Used by dynamic progression to calculate next week's targets.
 */
export interface PreviousWeekPerformance {
  /** The exercise ID */
  exerciseId: string;
  /** The week number this performance was from */
  weekNumber: number;
  /** Target weight that was prescribed */
  targetWeight: number;
  /** Target reps that were prescribed */
  targetReps: number;
  /** Actual weight achieved (best set) */
  actualWeight: number;
  /** Actual reps achieved at that weight (best set) */
  actualReps: number;
  /** Whether the user hit or exceeded target reps */
  hitTarget: boolean;
  /** Number of consecutive weeks at this weight failing to hit minReps */
  consecutiveFailures: number;
}

/**
 * Calculated targets for a specific week
 */
export interface WeekTargets {
  /** The exercise ID */
  exerciseId: string;
  /** The plan exercise ID */
  planExerciseId: string;
  /** Target weight for this week */
  targetWeight: number;
  /** Target reps for this week */
  targetReps: number;
  /** Target sets for this week */
  targetSets: number;
  /** The week number (0-6) */
  weekNumber: number;
  /** Whether this is a deload week */
  isDeload: boolean;
}

/**
 * Tracks whether all sets were completed for an exercise in a given week
 */
export interface CompletionStatus {
  /** The exercise ID */
  exerciseId: string;
  /** The week number */
  weekNumber: number;
  /** Whether all prescribed sets were completed */
  allSetsCompleted: boolean;
  /** Number of sets completed */
  completedSets: number;
  /** Number of sets prescribed */
  prescribedSets: number;
}

/**
 * Preview of next week's targets for the frontend
 */
export interface NextWeekExercise {
  /** The exercise ID */
  exerciseId: string;
  /** The exercise name for display */
  exerciseName: string;
  /** Target weight for next week */
  targetWeight: number;
  /** Target reps for next week */
  targetReps: number;
  /** Target sets for next week */
  targetSets: number;
  /** Whether this exercise will progress (false if previous week incomplete) */
  willProgress: boolean;
  /** Whether the previous week was completed */
  previousWeekCompleted: boolean;
}

/**
 * Full response for the next week preview API
 */
export interface NextWeekResponse {
  /** The mesocycle ID */
  mesocycleId: number;
  /** The upcoming week number */
  weekNumber: number;
  /** Whether the upcoming week is a deload week */
  isDeload: boolean;
  /** List of exercises with their targets */
  exercises: NextWeekExercise[];
}
