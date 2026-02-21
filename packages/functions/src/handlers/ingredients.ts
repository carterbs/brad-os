import { type Request, type Response, type NextFunction } from 'express';
import { errorHandler } from '../middleware/error-handler.js';
import { createBaseApp } from '../middleware/create-resource-router.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { IngredientRepository } from '../repositories/ingredient.repository.js';
import { getFirestoreDb } from '../firebase.js';

const app = createBaseApp('ingredients');

// Lazy repository initialization
let ingredientRepo: IngredientRepository | null = null;
function getRepo(): IngredientRepository {
  if (ingredientRepo === null) {
    ingredientRepo = new IngredientRepository(getFirestoreDb());
  }
  return ingredientRepo;
}

// GET /ingredients
app.get('/', asyncHandler(async (_req: Request, res: Response, _next: NextFunction) => {
  const ingredients = await getRepo().findAll();
  res.json({ success: true, data: ingredients });
}));

app.use(errorHandler);

export const ingredientsApp = app;
