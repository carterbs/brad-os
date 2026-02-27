import { z } from 'zod';

export type Recipe = z.infer<
  typeof import('../schemas/recipe.schema.js').recipeResponseSchema
>;
export type RecipeIngredient = z.infer<
  typeof import('../schemas/recipe.schema.js').recipeIngredientSchema
>;
export type RecipeStep = z.infer<
  typeof import('../schemas/recipe.schema.js').recipeStepSchema
>;
export type CreateRecipeDTO = z.infer<
  typeof import('../schemas/recipe.schema.js').createRecipeSchema
>;
export type UpdateRecipeDTO = z.infer<
  typeof import('../schemas/recipe.schema.js').updateRecipeSchema
>;
