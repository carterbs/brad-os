import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import { errorHandler } from '../middleware/error-handler.js';
import { stripPathPrefix } from '../middleware/strip-path-prefix.js';
import { requireAppCheck } from '../middleware/app-check.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { RecipeRepository } from '../repositories/recipe.repository.js';
import { getFirestoreDb } from '../firebase.js';

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());
app.use(stripPathPrefix('recipes'));
app.use(requireAppCheck);

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

// Error handler must be last
app.use(errorHandler);

export const recipesApp = app;
