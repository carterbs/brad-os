import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import { errorHandler } from '../middleware/error-handler.js';
import { stripPathPrefix } from '../middleware/strip-path-prefix.js';
import { requireAppCheck } from '../middleware/app-check.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { IngredientRepository } from '../repositories/ingredient.repository.js';
import { getFirestoreDb } from '../firebase.js';

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());
app.use(stripPathPrefix('ingredients'));
app.use(requireAppCheck);

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

// Error handler must be last
app.use(errorHandler);

export const ingredientsApp = app;
