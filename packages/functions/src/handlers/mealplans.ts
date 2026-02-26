import { type Request, type Response, type NextFunction } from 'express';
import { info } from 'firebase-functions/logger';
import { errorHandler, NotFoundError, AppError } from '../middleware/error-handler.js';
import { createBaseApp } from '../middleware/create-resource-router.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { validate } from '../middleware/validate.js';
import { MealRepository } from '../repositories/meal.repository.js';
import { MealPlanSessionRepository } from '../repositories/mealplan-session.repository.js';
import { getFirestoreDb } from '../firebase.js';
import { generateMealPlan, InsufficientMealsError } from '../services/mealplan-generation.service.js';
import { processCritique } from '../services/mealplan-critique.service.js';
import { applyOperations } from '../services/mealplan-operations.service.js';
import { critiqueInputSchema } from '../shared.js';

const app = createBaseApp('mealplans');
app.use((_req, res, next) => {
  res.set('Cache-Control', 'private, no-store');
  next();
});

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

// GET /mealplans/latest
app.get('/latest', asyncHandler(async (_req: Request, res: Response, _next: NextFunction) => {
  const sessions = await getSessionRepo().findAll(); // already ordered by created_at desc
  const latest = sessions[0] ?? null;
  if (latest === null) {
    res.json({ success: true, data: null });
    return;
  }
  res.json({ success: true, data: latest });
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
  const requestStart = Date.now();
  const sessionId = req.params['sessionId'] ?? '';

  // Phase 1: Firestore read
  const firestoreReadStart = Date.now();
  const session = await getSessionRepo().findById(sessionId);
  const firestoreReadMs = Date.now() - firestoreReadStart;
  info('critique:firestore_read', { phase: 'firestore_read', elapsed_ms: firestoreReadMs, sessionId });

  if (session === null) {
    next(new NotFoundError('MealPlanSession', sessionId));
    return;
  }

  if (session.is_finalized) {
    throw new AppError(400, 'SESSION_FINALIZED', 'Session is already finalized');
  }

  const { critique } = critiqueInputSchema.parse(req.body);
  const apiKey = process.env['OPENAI_API_KEY'] ?? '';
  if (apiKey === '') {
    throw new AppError(500, 'MISSING_API_KEY', 'OpenAI API key is not configured');
  }

  // Phase 2: OpenAI (message building + API call + parsing all logged inside processCritique)
  const openaiStart = Date.now();
  const critiqueResponse = await processCritique(session, critique, apiKey);
  const openaiMs = Date.now() - openaiStart;
  info('critique:openai_total', { phase: 'openai_total', elapsed_ms: openaiMs });

  // Phase 3: Apply operations
  const opsStart = Date.now();
  const { updatedPlan, errors: operationErrors } = applyOperations(
    session.plan,
    critiqueResponse.operations,
    session.meals_snapshot
  );
  const opsMs = Date.now() - opsStart;
  info('critique:apply_ops', { phase: 'apply_ops', elapsed_ms: opsMs, operation_count: critiqueResponse.operations.length });

  // Phase 4: Firestore write
  const firestoreWriteStart = Date.now();
  await getSessionRepo().applyCritiqueUpdates(
    sessionId,
    { role: 'user', content: critique },
    { role: 'assistant', content: critiqueResponse.explanation, operations: critiqueResponse.operations },
    updatedPlan,
  );
  const firestoreWriteMs = Date.now() - firestoreWriteStart;
  info('critique:firestore_write', { phase: 'firestore_write', elapsed_ms: firestoreWriteMs });

  const totalMs = Date.now() - requestStart;
  info('critique:complete', {
    phase: 'total',
    total_ms: totalMs,
    firestore_read_ms: firestoreReadMs,
    openai_ms: openaiMs,
    apply_ops_ms: opsMs,
    firestore_write_ms: firestoreWriteMs,
    sessionId,
  });

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
