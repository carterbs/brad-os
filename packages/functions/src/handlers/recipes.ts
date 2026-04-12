import { createRecipeSchema, updateRecipeSchema } from '../shared.js';
import { createResourceRouter } from '../middleware/create-resource-router.js';
import { RecipeRepository } from '../repositories/recipe.repository.js';
import { NotFoundError } from '../types/errors.js';
import { asyncHandler } from '../middleware/async-handler.js';

export const recipesApp = createResourceRouter({
  resourceName: 'recipes',
  displayName: 'Recipe',
  RepoClass: RecipeRepository,
  createSchema: createRecipeSchema,
  updateSchema: updateRecipeSchema,
  registerCustomRoutes: ({ app, getRepo }) => {
    app.get('/by-meal/:mealId', asyncHandler(async (req, res, next) => {
      const mealId = req.params['mealId'] ?? '';
      const recipe = await getRepo().findByMealId(mealId);
      if (!recipe) {
        next(new NotFoundError('Recipe', `meal:${mealId}`));
        return;
      }
      res.json({ success: true, data: recipe });
    }));
  },
});
