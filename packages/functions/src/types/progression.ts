import { z } from 'zod';

export type ProgressionReason = z.infer<
  typeof import('../schemas/progression.schema.js').progressionReasonSchema
>;
export type ExerciseProgression = z.infer<
  typeof import('../schemas/progression.schema.js').exerciseProgressionSchema
>;
export type PreviousWeekPerformance = z.infer<
  typeof import('../schemas/progression.schema.js').previousWeekPerformanceSchema
>;
export type DynamicProgressionResult = z.infer<
  typeof import('../schemas/progression.schema.js').dynamicProgressionResultSchema
>;
export type WeekTargets = z.infer<
  typeof import('../schemas/progression.schema.js').weekTargetsSchema
>;
export type CompletionStatus = z.infer<
  typeof import('../schemas/progression.schema.js').completionStatusSchema
>;
export type NextWeekExercise = z.infer<
  typeof import('../schemas/progression.schema.js').nextWeekExerciseSchema
>;
export type NextWeekResponse = z.infer<
  typeof import('../schemas/progression.schema.js').nextWeekResponseSchema
>;
