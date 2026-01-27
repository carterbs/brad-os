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
  planDayId: string;
  exerciseId: string;
  planDayExercise: PlanDayExercise;
}

/**
 * Represents a removed exercise from a plan day
 */
export interface RemovedExercise {
  planDayId: string;
  exerciseId: string;
  planDayExerciseId: string;
}

/**
 * Represents a modified exercise in a plan day
 */
export interface ModifiedExercise {
  planDayId: string;
  exerciseId: string;
  planDayExerciseId: string;
  changes: ExerciseChanges;
}

/**
 * Represents the diff between old and new plan states
 */
export interface PlanDiff {
  addedExercises: AddedExercise[];
  removedExercises: RemovedExercise[];
  modifiedExercises: ModifiedExercise[];
  addedDays: string[]; // plan_day_ids
  removedDays: string[]; // plan_day_ids
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
    planId: string;
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
