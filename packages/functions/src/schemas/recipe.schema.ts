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

export const createRecipeSchema = z.object({
  meal_id: z.string().min(1),
  ingredients: z.array(recipeIngredientSchema).min(1),
  steps: z.array(recipeStepSchema).nullable(),
});

export const updateRecipeSchema = createRecipeSchema.partial();

export type CreateRecipeInput = z.infer<typeof createRecipeSchema>;
export type UpdateRecipeInput = z.infer<typeof updateRecipeSchema>;

export const recipeResponseSchema = z.object({
  id: z.string(),
  meal_id: z.string(),
  ingredients: z.array(recipeIngredientSchema),
  steps: z.array(recipeStepSchema).nullable(),
  created_at: z.string(),
  updated_at: z.string(),
}).strict();

export type RecipeIngredientInput = z.infer<typeof recipeIngredientSchema>;
export type RecipeStepInput = z.infer<typeof recipeStepSchema>;
export type RecipeResponse = z.infer<typeof recipeResponseSchema>;
export type CreateRecipeDTO = CreateRecipeInput;
export type UpdateRecipeDTO = UpdateRecipeInput;
