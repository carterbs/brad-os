import { z } from 'zod';

export const ingredientResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  store_section: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const createIngredientSchema = z.object({
  name: z.string().min(1),
  store_section: z.string().min(1),
});

export const updateIngredientSchema = createIngredientSchema.partial();

export type CreateIngredientInput = z.infer<typeof createIngredientSchema>;
export type UpdateIngredientInput = z.infer<typeof updateIngredientSchema>;
export type IngredientResponse = z.infer<typeof ingredientResponseSchema>;
export type CreateIngredientDTO = CreateIngredientInput;
export type UpdateIngredientDTO = UpdateIngredientInput;
