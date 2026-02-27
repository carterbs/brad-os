import { z } from 'zod';

export const progressionReasonSchema = z.enum([
  'first_week',
  'hit_max_reps',
  'hit_target',
  'hold',
  'regress',
  'deload',
]);

export const exerciseProgressionSchema = z.object({
  exerciseId: z.string(),
  planExerciseId: z.string(),
  baseWeight: z.number(),
  baseReps: z.number().int().min(0),
  baseSets: z.number().int().min(0),
  weightIncrement: z.number(),
  minReps: z.number().int().min(0),
  maxReps: z.number().int().min(0),
}).strict();

export const previousWeekPerformanceSchema = z.object({
  exerciseId: z.string(),
  weekNumber: z.number().int().min(0),
  targetWeight: z.number(),
  targetReps: z.number().int().min(0),
  actualWeight: z.number(),
  actualReps: z.number().int().min(0),
  hitTarget: z.boolean(),
  consecutiveFailures: z.number().int().min(0),
}).strict();

export const dynamicProgressionResultSchema = z.object({
  targetWeight: z.number(),
  targetReps: z.number().int().min(0),
  targetSets: z.number().int().min(0),
  isDeload: z.boolean(),
  reason: progressionReasonSchema,
}).strict();

export const weekTargetsSchema = z.object({
  exerciseId: z.string(),
  planExerciseId: z.string(),
  targetWeight: z.number(),
  targetReps: z.number().int().min(0),
  targetSets: z.number().int().min(0),
  weekNumber: z.number().int().min(0).max(6),
  isDeload: z.boolean(),
}).strict();

export const completionStatusSchema = z.object({
  exerciseId: z.string(),
  weekNumber: z.number().int().min(0),
  allSetsCompleted: z.boolean(),
  completedSets: z.number().int().min(0),
  prescribedSets: z.number().int().min(0),
}).strict();

export const nextWeekExerciseSchema = z.object({
  exerciseId: z.string(),
  exerciseName: z.string(),
  targetWeight: z.number(),
  targetReps: z.number().int().min(0),
  targetSets: z.number().int().min(0),
  willProgress: z.boolean(),
  previousWeekCompleted: z.boolean(),
}).strict();

export const nextWeekResponseSchema = z.object({
  mesocycleId: z.number().int().min(0),
  weekNumber: z.number().int().min(0),
  isDeload: z.boolean(),
  exercises: z.array(nextWeekExerciseSchema),
}).strict();

export type ExerciseProgressionDTO = z.infer<typeof exerciseProgressionSchema>;
export type PreviousWeekPerformanceDTO = z.infer<typeof previousWeekPerformanceSchema>;
export type DynamicProgressionResultDTO = z.infer<typeof dynamicProgressionResultSchema>;
export type WeekTargetsDTO = z.infer<typeof weekTargetsSchema>;
export type CompletionStatusDTO = z.infer<typeof completionStatusSchema>;
export type NextWeekExerciseDTO = z.infer<typeof nextWeekExerciseSchema>;
export type NextWeekResponseDTO = z.infer<typeof nextWeekResponseSchema>;
