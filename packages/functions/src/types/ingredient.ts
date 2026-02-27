import { z } from 'zod';

export type Ingredient = z.infer<
  typeof import('../schemas/ingredient.schema.js').ingredientResponseSchema
>;
export type CreateIngredientDTO = z.infer<
  typeof import('../schemas/ingredient.schema.js').createIngredientSchema
>;
export type UpdateIngredientDTO = z.infer<
  typeof import('../schemas/ingredient.schema.js').updateIngredientSchema
>;
