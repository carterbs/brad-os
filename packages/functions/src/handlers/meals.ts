import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import {
  createMealSchema,
  updateMealSchema,
  type CreateMealDTO,
  type UpdateMealDTO,
} from '../shared.js';
import { validate } from '../middleware/validate.js';
import { errorHandler, NotFoundError } from '../middleware/error-handler.js';
import { stripPathPrefix } from '../middleware/strip-path-prefix.js';
import { requireAppCheck } from '../middleware/app-check.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { MealRepository } from '../repositories/meal.repository.js';
import { getFirestoreDb } from '../firebase.js';

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());
app.use(stripPathPrefix('meals'));
app.use(requireAppCheck);

// Lazy repository initialization
let mealRepo: MealRepository | null = null;
function getRepo(): MealRepository {
  if (mealRepo === null) {
    mealRepo = new MealRepository(getFirestoreDb());
  }
  return mealRepo;
}

// GET /meals
app.get('/', asyncHandler(async (_req: Request, res: Response, _next: NextFunction) => {
  const meals = await getRepo().findAll();
  res.json({ success: true, data: meals });
}));

// GET /meals/:id
app.get('/:id', asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const id = req.params['id'] ?? '';
  const meal = await getRepo().findById(id);
  if (meal === null) {
    next(new NotFoundError('Meal', id));
    return;
  }
  res.json({ success: true, data: meal });
}));

// POST /meals
app.post('/', validate(createMealSchema), asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const body = req.body as CreateMealDTO;
  const meal = await getRepo().create(body);
  res.status(201).json({ success: true, data: meal });
}));

// PUT /meals/:id
app.put('/:id', validate(updateMealSchema), asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const id = req.params['id'] ?? '';
  const body = req.body as UpdateMealDTO;
  const meal = await getRepo().update(id, body);
  if (meal === null) {
    next(new NotFoundError('Meal', id));
    return;
  }
  res.json({ success: true, data: meal });
}));

// DELETE /meals/:id
app.delete('/:id', asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const id = req.params['id'] ?? '';
  const deleted = await getRepo().delete(id);
  if (!deleted) {
    next(new NotFoundError('Meal', id));
    return;
  }
  res.json({ success: true, data: { deleted: true } });
}));

// Error handler must be last
app.use(errorHandler);

export const mealsApp = app;
