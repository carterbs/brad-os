import { z } from 'zod';

export const workoutStatusSchema = z.enum([
  'pending',
  'in_progress',
  'completed',
  'skipped',
]);

export const workoutSetStatusSchema = z.enum([
  'pending',
  'completed',
  'skipped',
]);

// ISO 8601 date format: YYYY-MM-DD
const dateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// ISO 8601 datetime format
const dateTimeStringSchema = z.string().datetime().nullable();

export const createWorkoutSchema = z.object({
  mesocycle_id: z.string().min(1),
  plan_day_id: z.string().min(1),
  week_number: z.number().int().positive(),
  scheduled_date: dateStringSchema,
});

export const updateWorkoutSchema = z.object({
  status: workoutStatusSchema.optional(),
  started_at: dateTimeStringSchema.optional(),
  completed_at: dateTimeStringSchema.optional(),
});

export const createWorkoutSetSchema = z.object({
  workout_id: z.string().min(1),
  exercise_id: z.string().min(1),
  set_number: z.number().int().positive(),
  target_reps: z.number().int().positive(),
  target_weight: z.number().nonnegative(),
});

export const updateWorkoutSetSchema = z.object({
  actual_reps: z.number().int().nonnegative().nullable().optional(),
  actual_weight: z.number().nonnegative().nullable().optional(),
  status: workoutSetStatusSchema.optional(),
});

export const logWorkoutSetSchema = z.object({
  actual_reps: z.number().int().nonnegative(),
  actual_weight: z.number().nonnegative(),
});

export type CreateWorkoutInput = z.infer<typeof createWorkoutSchema>;
export type UpdateWorkoutInput = z.infer<typeof updateWorkoutSchema>;
export type CreateWorkoutSetInput = z.infer<typeof createWorkoutSetSchema>;
export type UpdateWorkoutSetInput = z.infer<typeof updateWorkoutSetSchema>;
export type LogWorkoutSetInput = z.infer<typeof logWorkoutSetSchema>;
