import { z } from 'zod';

export const recipeIngredientSchema = z.object({
  ingredient_id: z.string(),
  quantity: z.number().nullable(),
  unit: z.string().nullable(),
});

export const recipeStepSchema = z.object({
  step_number: z.number().int().nonnegative(),
  instruction: z.string(),
});

export const recipeResponseSchema = z.object({
  id: z.string(),
  meal_id: z.string(),
  ingredients: z.array(recipeIngredientSchema),
  steps: z.array(recipeStepSchema).nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type RecipeIngredientInput = z.infer<typeof recipeIngredientSchema>;
export type RecipeStepInput = z.infer<typeof recipeStepSchema>;
export type RecipeResponse = z.infer<typeof recipeResponseSchema>;
