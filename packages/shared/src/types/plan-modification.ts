/**
 * Types for plan modification during active mesocycle (Phase 9)
 */

import type { PlanDayExercise } from './database.js';

/**
 * Represents a change to an exercise configuration
 */
export interface ExerciseChanges {
  sets?: number;
  reps?: number;
  weight?: number;
  rest_seconds?: number;
}

/**
 * Represents an added exercise to a plan day
 */
export interface AddedExercise {
  planDayId: number;
  exerciseId: number;
  planDayExercise: PlanDayExercise;
}

/**
 * Represents a removed exercise from a plan day
 */
export interface RemovedExercise {
  planDayId: number;
  exerciseId: number;
  planDayExerciseId: number;
}

/**
 * Represents a modified exercise in a plan day
 */
export interface ModifiedExercise {
  planDayId: number;
  exerciseId: number;
  planDayExerciseId: number;
  changes: ExerciseChanges;
}

/**
 * Represents the diff between old and new plan states
 */
export interface PlanDiff {
  addedExercises: AddedExercise[];
  removedExercises: RemovedExercise[];
  modifiedExercises: ModifiedExercise[];
  addedDays: number[]; // plan_day_ids
  removedDays: number[]; // plan_day_ids
}

/**
 * Result of applying modifications to an active mesocycle
 */
export interface ModificationResult {
  affectedWorkoutCount: number;
  warnings: string[];
  addedSetsCount: number;
  removedSetsCount: number;
  modifiedSetsCount: number;
}

/**
 * Response for the plan update API when there's an active mesocycle
 */
export interface PlanUpdateResponse {
  success: true;
  data: {
    planId: number;
    affectedWorkouts: number;
    warnings: string[];
    hasActiveMesocycle: boolean;
  };
}

/**
 * Input for updating targets on future workout sets
 */
export interface UpdateWorkoutSetTargets {
  targetReps?: number;
  targetWeight?: number;
  restSeconds?: number;
}
