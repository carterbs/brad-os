import { createRecipeSchema, updateRecipeSchema } from '../shared.js';
import { createResourceRouter } from '../middleware/create-resource-router.js';
import { RecipeRepository } from '../repositories/recipe.repository.js';

export const recipesApp = createResourceRouter({
  resourceName: 'recipes',
  displayName: 'Recipe',
  RepoClass: RecipeRepository,
  createSchema: createRecipeSchema,
  updateSchema: updateRecipeSchema,
});
