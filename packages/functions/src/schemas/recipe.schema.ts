import { z } from 'zod';

export const recipeIngredientSchema = z.object({
  ingredient_id: z.string(),
  quantity: z.number().nullable(),
  unit: z.string().nullable(),
}).strict();

export const recipeStepSchema = z.object({
  step_number: z.number().int().nonnegative(),
  instruction: z.string(),
}).strict();

export const recipeResponseSchema = z.object({
  id: z.string(),
  meal_id: z.string(),
  ingredients: z.array(recipeIngredientSchema),
  steps: z.array(recipeStepSchema).nullable(),
  created_at: z.string(),
  updated_at: z.string(),
}).strict();

export const createRecipeSchema = z.object({
  meal_id: z.string(),
  ingredients: z.array(recipeIngredientSchema).optional(),
  steps: z.array(recipeStepSchema).nullable().optional(),
}).strict();

export const updateRecipeSchema = z.object({
  meal_id: z.string().optional(),
  ingredients: z.array(recipeIngredientSchema).optional(),
  steps: z.array(recipeStepSchema).nullable().optional(),
}).strict();
