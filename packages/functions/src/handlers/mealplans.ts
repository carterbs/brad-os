import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import { errorHandler, NotFoundError, AppError } from '../middleware/error-handler.js';
import { stripPathPrefix } from '../middleware/strip-path-prefix.js';
import { requireAppCheck } from '../middleware/app-check.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { validate } from '../middleware/validate.js';
import { MealRepository } from '../repositories/meal.repository.js';
import { MealPlanSessionRepository } from '../repositories/mealplan-session.repository.js';
import { getFirestoreDb } from '../firebase.js';
import { generateMealPlan, InsufficientMealsError } from '../services/mealplan-generation.service.js';
import { processCritique } from '../services/mealplan-critique.service.js';
import { applyOperations } from '../services/mealplan-operations.service.js';
import { critiqueInputSchema, type CritiqueInput } from '../shared.js';

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());
app.use(stripPathPrefix('mealplans'));
app.use(requireAppCheck);

// Lazy repository initialization
let mealRepo: MealRepository | null = null;
let sessionRepo: MealPlanSessionRepository | null = null;

function getMealRepo(): MealRepository {
  if (mealRepo === null) {
    mealRepo = new MealRepository(getFirestoreDb());
  }
  return mealRepo;
}

function getSessionRepo(): MealPlanSessionRepository {
  if (sessionRepo === null) {
    sessionRepo = new MealPlanSessionRepository(getFirestoreDb());
  }
  return sessionRepo;
}

// POST /mealplans/generate
app.post('/generate', asyncHandler(async (_req: Request, res: Response, _next: NextFunction) => {
  const meals = await getMealRepo().findAll();

  try {
    const plan = generateMealPlan(meals);

    const session = await getSessionRepo().create({
      plan,
      meals_snapshot: meals,
      history: [],
      is_finalized: false,
    });

    res.status(201).json({
      success: true,
      data: {
        session_id: session.id,
        plan: session.plan,
      },
    });
  } catch (error) {
    if (error instanceof InsufficientMealsError) {
      throw new AppError(422, 'INSUFFICIENT_MEALS', error.message);
    }
    throw error;
  }
}));

// GET /mealplans/:sessionId
app.get('/:sessionId', asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const sessionId = req.params['sessionId'] ?? '';
  const session = await getSessionRepo().findById(sessionId);
  if (session === null) {
    next(new NotFoundError('MealPlanSession', sessionId));
    return;
  }
  res.json({ success: true, data: session });
}));

// POST /mealplans/:sessionId/critique
app.post('/:sessionId/critique', validate(critiqueInputSchema), asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const sessionId = req.params['sessionId'] ?? '';
  const session = await getSessionRepo().findById(sessionId);
  if (session === null) {
    next(new NotFoundError('MealPlanSession', sessionId));
    return;
  }

  if (session.is_finalized) {
    throw new AppError(400, 'SESSION_FINALIZED', 'Session is already finalized');
  }

  const { critique } = req.body as CritiqueInput;
  const apiKey = process.env['OPENAI_API_KEY'] ?? '';
  if (apiKey === '') {
    throw new AppError(500, 'MISSING_API_KEY', 'OpenAI API key is not configured');
  }

  const critiqueResponse = await processCritique(session, critique, apiKey);
  const { updatedPlan, errors: operationErrors } = applyOperations(
    session.plan,
    critiqueResponse.operations,
    session.meals_snapshot
  );

  // Append user message to history
  await getSessionRepo().appendHistory(sessionId, {
    role: 'user',
    content: critique,
  });

  // Append assistant message to history
  await getSessionRepo().appendHistory(sessionId, {
    role: 'assistant',
    content: critiqueResponse.explanation,
    operations: critiqueResponse.operations,
  });

  // Update the plan
  await getSessionRepo().updatePlan(sessionId, updatedPlan);

  res.json({
    success: true,
    data: {
      plan: updatedPlan,
      explanation: critiqueResponse.explanation,
      operations: critiqueResponse.operations,
      errors: operationErrors,
    },
  });
}));

// POST /mealplans/:sessionId/finalize
app.post('/:sessionId/finalize', asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const sessionId = req.params['sessionId'] ?? '';
  const session = await getSessionRepo().findById(sessionId);
  if (session === null) {
    next(new NotFoundError('MealPlanSession', sessionId));
    return;
  }

  if (session.is_finalized) {
    throw new AppError(400, 'SESSION_FINALIZED', 'Session is already finalized');
  }

  // Update lastPlanned for all meals in the plan
  const now = new Date().toISOString();
  for (const entry of session.plan) {
    if (entry.meal_id !== null) {
      await getMealRepo().updateLastPlanned(entry.meal_id, now);
    }
  }

  // Mark session as finalized
  await getSessionRepo().update(sessionId, { is_finalized: true });

  res.json({ success: true, data: { finalized: true } });
}));

// Error handler must be last
app.use(errorHandler);

export const mealplansApp = app;
