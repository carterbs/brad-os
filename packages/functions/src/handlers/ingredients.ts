import { createIngredientSchema, updateIngredientSchema } from '../shared.js';
import { createResourceRouter } from '../middleware/create-resource-router.js';
import { IngredientRepository } from '../repositories/ingredient.repository.js';
import { RecipeRepository } from '../repositories/recipe.repository.js';
import { AppError } from '../types/errors.js';

export const ingredientsApp = createResourceRouter({
  resourceName: 'ingredients',
  displayName: 'Ingredient',
  RepoClass: IngredientRepository,
  createSchema: createIngredientSchema,
  updateSchema: updateIngredientSchema,
  beforeDelete: async ({ id }) => {
    const recipeRepo = new RecipeRepository();
    const recipes = await recipeRepo.findAll();
    const referencingRecipes = recipes.filter((recipe) =>
      recipe.ingredients.some((ing) => ing.ingredient_id === id)
    );
    if (referencingRecipes.length > 0) {
      throw new AppError(
        409,
        'CONFLICT',
        `Cannot delete ingredient: referenced by ${referencingRecipes.length} recipe(s)`
      );
    }
  },
});
