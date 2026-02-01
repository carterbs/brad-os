import { z } from 'zod';

export const ingredientResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  store_section: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type IngredientResponse = z.infer<typeof ingredientResponseSchema>;
