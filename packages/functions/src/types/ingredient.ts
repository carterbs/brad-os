import { z } from 'zod';

export type Ingredient = z.infer<
  typeof import('../schemas/ingredient.schema.js').ingredientResponseSchema
>;
