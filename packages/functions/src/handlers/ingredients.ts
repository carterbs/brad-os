import { createIngredientSchema, updateIngredientSchema } from '../shared.js';
import { createResourceRouter } from '../middleware/create-resource-router.js';
import { IngredientRepository } from '../repositories/ingredient.repository.js';

export const ingredientsApp = createResourceRouter({
  resourceName: 'ingredients',
  displayName: 'Ingredient',
  RepoClass: IngredientRepository,
  createSchema: createIngredientSchema,
  updateSchema: updateIngredientSchema,
});
