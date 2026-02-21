import { z } from 'zod';

export const createMealSchema = z.object({
  name: z.string().min(1).max(200),
  meal_type: z.enum(['breakfast', 'lunch', 'dinner']),
  effort: z.number().int().min(1).max(10),
  has_red_meat: z.boolean(),
  url: z.string().min(0).max(2000),
});

export const updateMealSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  meal_type: z.enum(['breakfast', 'lunch', 'dinner']).optional(),
  effort: z.number().int().min(1).max(10).optional(),
  has_red_meat: z.boolean().optional(),
  url: z.string().min(0).max(2000).optional(),
});

export type CreateMealInput = z.infer<typeof createMealSchema>;
export type UpdateMealInput = z.infer<typeof updateMealSchema>;

// DTO aliases (canonical — replaces manual interfaces in types/meal.ts)
export type CreateMealDTO = CreateMealInput;
export type UpdateMealDTO = UpdateMealInput;
