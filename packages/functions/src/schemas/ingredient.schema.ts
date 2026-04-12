import { z } from 'zod';

export const VALID_STORE_SECTIONS = [
  'Produce',
  'Dairy & Eggs',
  'Meat & Seafood',
  'Deli',
  'Bakery & Bread',
  'Frozen',
  'Canned & Jarred',
  'Pasta & Grains',
  'Snacks & Cereal',
  'Condiments & Spreads',
  'Pantry Staples',
] as const;

export const storeSectionSchema = z.enum(VALID_STORE_SECTIONS);

export const ingredientResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  store_section: storeSectionSchema,
  created_at: z.string(),
  updated_at: z.string(),
});

export const createIngredientSchema = z.object({
  name: z.string().min(1),
  store_section: storeSectionSchema,
});

export const updateIngredientSchema = createIngredientSchema.partial();

export type CreateIngredientInput = z.infer<typeof createIngredientSchema>;
export type UpdateIngredientInput = z.infer<typeof updateIngredientSchema>;
export type IngredientResponse = z.infer<typeof ingredientResponseSchema>;
export type CreateIngredientDTO = CreateIngredientInput;
export type UpdateIngredientDTO = UpdateIngredientInput;
