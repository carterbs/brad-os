import { z } from 'zod';

export const createPlanSchema = z.object({
  name: z.string().min(1).max(100),
  duration_weeks: z.number().int().positive().default(6),
});

export const updatePlanSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  duration_weeks: z.number().int().positive().optional(),
});

export const dayOfWeekSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
]);

export const createPlanDaySchema = z.object({
  plan_id: z.string().min(1),
  day_of_week: dayOfWeekSchema,
  name: z.string().min(1).max(100),
  sort_order: z.number().int().nonnegative(),
});

export const updatePlanDaySchema = z.object({
  day_of_week: dayOfWeekSchema.optional(),
  name: z.string().min(1).max(100).optional(),
  sort_order: z.number().int().nonnegative().optional(),
});

export const createPlanDayExerciseSchema = z.object({
  plan_day_id: z.string().min(1),
  exercise_id: z.string().min(1),
  sets: z.number().int().positive().default(2),
  reps: z.number().int().positive().default(8),
  weight: z.number().nonnegative().default(30.0),
  rest_seconds: z.number().int().positive().default(60),
  sort_order: z.number().int().nonnegative(),
  min_reps: z.number().int().positive().default(8),
  max_reps: z.number().int().positive().default(12),
});

export const updatePlanDayExerciseSchema = z.object({
  sets: z.number().int().positive().optional(),
  reps: z.number().int().positive().optional(),
  weight: z.number().nonnegative().optional(),
  rest_seconds: z.number().int().positive().optional(),
  sort_order: z.number().int().nonnegative().optional(),
  min_reps: z.number().int().positive().optional(),
  max_reps: z.number().int().positive().optional(),
});

export type CreatePlanInput = z.infer<typeof createPlanSchema>;
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;
export type CreatePlanDayInput = z.infer<typeof createPlanDaySchema>;
export type UpdatePlanDayInput = z.infer<typeof updatePlanDaySchema>;
export type CreatePlanDayExerciseInput = z.infer<
  typeof createPlanDayExerciseSchema
>;
export type UpdatePlanDayExerciseInput = z.infer<
  typeof updatePlanDayExerciseSchema
>;

// DTO aliases (canonical — replaces manual interfaces in types/database.ts)
export type CreatePlanDTO = CreatePlanInput;
export type UpdatePlanDTO = UpdatePlanInput;
export type CreatePlanDayDTO = CreatePlanDayInput;
export type UpdatePlanDayDTO = UpdatePlanDayInput;
export type CreatePlanDayExerciseDTO = CreatePlanDayExerciseInput;
export type UpdatePlanDayExerciseDTO = UpdatePlanDayExerciseInput;
