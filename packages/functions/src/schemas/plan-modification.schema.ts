import { z } from 'zod';

const planDayExerciseSchema = z.object({
  id: z.string(),
  plan_day_id: z.string(),
  exercise_id: z.string(),
  sets: z.number().int().min(0),
  reps: z.number().int().min(0),
  weight: z.number(),
  rest_seconds: z.number().min(0),
  sort_order: z.number().int().min(0),
  min_reps: z.number().int().min(0),
  max_reps: z.number().int().min(0),
}).strict();

export const exerciseChangesSchema = z.object({
  sets: z.number().int().min(0).optional(),
  reps: z.number().int().min(0).optional(),
  weight: z.number().optional(),
  rest_seconds: z.number().min(0).optional(),
}).strict();

export const addedExerciseSchema = z.object({
  planDayId: z.string(),
  exerciseId: z.string(),
  planDayExercise: planDayExerciseSchema,
}).strict();

export const removedExerciseSchema = z.object({
  planDayId: z.string(),
  exerciseId: z.string(),
  planDayExerciseId: z.string(),
}).strict();

export const modifiedExerciseSchema = z.object({
  planDayId: z.string(),
  exerciseId: z.string(),
  planDayExerciseId: z.string(),
  changes: exerciseChangesSchema,
}).strict();

export const planDiffSchema = z.object({
  addedExercises: z.array(addedExerciseSchema),
  removedExercises: z.array(removedExerciseSchema),
  modifiedExercises: z.array(modifiedExerciseSchema),
  addedDays: z.array(z.string()),
  removedDays: z.array(z.string()),
}).strict();

export const modificationResultSchema = z.object({
  affectedWorkoutCount: z.number().int().min(0),
  warnings: z.array(z.string()),
  addedSetsCount: z.number().int().min(0),
  removedSetsCount: z.number().int().min(0),
  modifiedSetsCount: z.number().int().min(0),
}).strict();

export const planUpdateResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    planId: z.string(),
    affectedWorkouts: z.number().int().min(0),
    warnings: z.array(z.string()),
    hasActiveMesocycle: z.boolean(),
  }).strict(),
}).strict();

export const updateWorkoutSetTargetsSchema = z.object({
  targetReps: z.number().int().min(0).optional(),
  targetWeight: z.number().optional(),
  restSeconds: z.number().min(0).optional(),
}).strict();

export type ExerciseChangesDTO = z.infer<typeof exerciseChangesSchema>;
export type AddedExerciseDTO = z.infer<typeof addedExerciseSchema>;
export type RemovedExerciseDTO = z.infer<typeof removedExerciseSchema>;
export type ModifiedExerciseDTO = z.infer<typeof modifiedExerciseSchema>;
export type PlanDiffDTO = z.infer<typeof planDiffSchema>;
export type ModificationResultDTO = z.infer<typeof modificationResultSchema>;
export type PlanUpdateResponseDTO = z.infer<typeof planUpdateResponseSchema>;
export type UpdateWorkoutSetTargetsDTO = z.infer<typeof updateWorkoutSetTargetsSchema>;
