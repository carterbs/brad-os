import type { PlanDayExercise } from './database.js';
import { z } from 'zod';

export type {
  PlanDayExercise,
};

export type ExerciseChanges = z.infer<
  typeof import('../schemas/plan-modification.schema.js').exerciseChangesSchema
>;
export type AddedExercise = z.infer<
  typeof import('../schemas/plan-modification.schema.js').addedExerciseSchema
>;
export type RemovedExercise = z.infer<
  typeof import('../schemas/plan-modification.schema.js').removedExerciseSchema
>;
export type ModifiedExercise = z.infer<
  typeof import('../schemas/plan-modification.schema.js').modifiedExerciseSchema
>;
export type PlanDiff = z.infer<
  typeof import('../schemas/plan-modification.schema.js').planDiffSchema
>;
export type ModificationResult = z.infer<
  typeof import('../schemas/plan-modification.schema.js').modificationResultSchema
>;
export type PlanUpdateResponse = z.infer<
  typeof import('../schemas/plan-modification.schema.js').planUpdateResponseSchema
>;
export type UpdateWorkoutSetTargets = z.infer<
  typeof import('../schemas/plan-modification.schema.js').updateWorkoutSetTargetsSchema
>;
