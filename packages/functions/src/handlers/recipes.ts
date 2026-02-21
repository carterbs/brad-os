import { type Request, type Response, type NextFunction } from 'express';
import { errorHandler } from '../middleware/error-handler.js';
import { createBaseApp } from '../middleware/create-resource-router.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { RecipeRepository } from '../repositories/recipe.repository.js';
import { getFirestoreDb } from '../firebase.js';

const app = createBaseApp('recipes');

// Lazy repository initialization
let recipeRepo: RecipeRepository | null = null;
function getRepo(): RecipeRepository {
  if (recipeRepo === null) {
    recipeRepo = new RecipeRepository(getFirestoreDb());
  }
  return recipeRepo;
}

// GET /recipes
app.get('/', asyncHandler(async (_req: Request, res: Response, _next: NextFunction) => {
  const recipes = await getRepo().findAll();
  res.json({ success: true, data: recipes });
}));

app.use(errorHandler);

export const recipesApp = app;
