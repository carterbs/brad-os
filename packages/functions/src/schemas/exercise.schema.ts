import { z } from 'zod';

export const createExerciseSchema = z.object({
  name: z.string().min(1).max(100),
  weight_increment: z.number().positive().default(5.0),
  is_custom: z.boolean().default(true),
});

export const updateExerciseSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  weight_increment: z.number().positive().optional(),
});

export type CreateExerciseInput = z.infer<typeof createExerciseSchema>;
export type UpdateExerciseInput = z.infer<typeof updateExerciseSchema>;

// DTO aliases (canonical — replaces manual interfaces in types/database.ts)
export type CreateExerciseDTO = CreateExerciseInput;
export type UpdateExerciseDTO = UpdateExerciseInput;
