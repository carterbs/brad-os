import { activeMealPlan, activeMealPlanSession, activePlanningMeals, mealPlanFeatureFlags, preserveDisabledEntries } from '../services/mealplan-features.service.js';
import { type Request, type Response, type NextFunction } from 'express';
import { isDeepStrictEqual } from 'node:util';
import { info } from 'firebase-functions/logger';
import {
  errorHandler,
  NotFoundError,
  AppError,
} from '../middleware/error-handler.js';
import { createBaseApp } from '../middleware/create-resource-router.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { validate } from '../middleware/validate.js';
import { MealRepository } from '../repositories/meal.repository.js';
import { MealPlanSessionRepository } from '../repositories/mealplan-session.repository.js';
import { RecipeRepository } from '../repositories/recipe.repository.js';
import { IngredientRepository } from '../repositories/ingredient.repository.js';
import { getFirestoreDb } from '../firebase.js';
import {
  generateMealPlan,
  InsufficientMealsError,
} from '../services/mealplan-generation.service.js';
import { processCritique } from '../services/mealplan-critique.service.js';
import { applyOperations } from '../services/mealplan-operations.service.js';
import {
  getUniquePlannedMealIds,
  reconcileMealLastPlanned,
  reconcileMealLastPlannedForPlanChange,
} from '../services/mealplan-recency.service.js';
import { buildShoppingList } from '../services/shopping-list.service.js';
import { critiqueInputSchema, type ConversationMessage, type CritiqueResponse, type MealPlanSession } from '../shared.js';

const app = createBaseApp('mealplans');
app.use((_req, res, next) => {
  res.set('Cache-Control', 'private, no-store');
  next();
});

// Lazy repository initialization
let mealRepo: MealRepository | null = null;
let sessionRepo: MealPlanSessionRepository | null = null;
let recipeRepo: RecipeRepository | null = null;
let ingredientRepo: IngredientRepository | null = null;

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

function getRecipeRepo(): RecipeRepository {
  if (recipeRepo === null) {
    recipeRepo = new RecipeRepository(getFirestoreDb());
  }
  return recipeRepo;
}

function getIngredientRepo(): IngredientRepository {
  if (ingredientRepo === null) {
    ingredientRepo = new IngredientRepository(getFirestoreDb());
  }
  return ingredientRepo;
}

function buildAssistantHistory(session: MealPlanSession, response: CritiqueResponse): ConversationMessage {
  const previousAssignments = session.plan.filter((entry) => response.operations.some((operation) =>
    operation.day_index === entry.day_index
    && (operation.meal_track ?? 'family') === entry.meal_track
    && operation.meal_type === entry.meal_type
    && operation.new_meal_id !== entry.meal_id
  )).map((entry) => ({ ...entry }));
  return {
    role: 'assistant',
    content: response.explanation,
    operations: response.operations,
    ...(previousAssignments.length === 0 ? {} : { previous_assignments: previousAssignments }),
  };
}

function getCritiqueApiKey(): string {
  const apiKey = process.env['TYPESAFE_API_KEY']?.trim() ?? '';
  if (apiKey === '') {
    throw new AppError(500, 'MISSING_API_KEY', 'TypeSafe API key is not configured');
  }
  return apiKey;
}

// POST /mealplans/generate
app.post(
  '/generate',
  asyncHandler(async (_req: Request, res: Response, _next: NextFunction) => {
    const meals = await getMealRepo().findAll();

    try {
      const plan = generateMealPlan(meals);

      const session = await getSessionRepo().create({
        plan,
        meals_snapshot: activePlanningMeals(meals),
        history: [],
        is_finalized: false,
      });

      res.status(201).json({
        success: true,
        data: {
          session_id: session.id,
          feature_flags: mealPlanFeatureFlags(),
          plan: activeMealPlan(session.plan),
        },
      });
    } catch (error) {
      if (error instanceof InsufficientMealsError) {
        throw new AppError(422, 'INSUFFICIENT_MEALS', error.message);
      }
      throw error;
    }
  })
);

// GET /mealplans/latest
app.get(
  '/latest',
  asyncHandler(async (_req: Request, res: Response, _next: NextFunction) => {
    const readStart = Date.now();
    const latest = await getSessionRepo().findLatest();
    info('mealplans:latest_read', {
      elapsed_ms: Date.now() - readStart,
      found: latest !== null,
      sessionId: latest?.id,
    });
    if (latest === null) {
      res.json({ success: true, data: null });
      return;
    }
    res.json({ success: true, data: { ...activeMealPlanSession(latest), feature_flags: mealPlanFeatureFlags() } });
  })
);

// GET /mealplans/:sessionId/shopping-list
app.get(
  '/:sessionId/shopping-list',
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const sessionId = req.params['sessionId'] ?? '';
    const session = await getSessionRepo().findById(sessionId);
    if (session === null) {
      next(new NotFoundError('MealPlanSession', sessionId));
      return;
    }

    const [recipes, ingredients] = await Promise.all([
      getRecipeRepo().findAll(),
      getIngredientRepo().findAll(),
    ]);

    const shoppingList = buildShoppingList(session.plan, recipes, ingredients);

    res.json({
      success: true,
      data: {
        session_id: sessionId,
        ...shoppingList,
      },
    });
  })
);

// GET /mealplans/:sessionId
app.get(
  '/:sessionId',
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const sessionId = req.params['sessionId'] ?? '';
    const session = await getSessionRepo().findById(sessionId);
    if (session === null) {
      next(new NotFoundError('MealPlanSession', sessionId));
      return;
    }
    res.json({ success: true, data: { ...activeMealPlanSession(session), feature_flags: mealPlanFeatureFlags() } });
  })
);

// DELETE /mealplans/:sessionId
app.delete(
  '/:sessionId',
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const sessionId = req.params['sessionId'] ?? '';
    const session = await getSessionRepo().findById(sessionId);
    if (session === null) {
      next(new NotFoundError('MealPlanSession', sessionId));
      return;
    }

    const wasFinalized = session.is_finalized;
    const affectedMealIds = getUniquePlannedMealIds(session.plan);
    const deleted = await getSessionRepo().delete(sessionId);
    if (!deleted) {
      next(new NotFoundError('MealPlanSession', sessionId));
      return;
    }

    if (wasFinalized) {
      await reconcileMealLastPlanned(
        getMealRepo(),
        getSessionRepo(),
        affectedMealIds
      );
    }

    res.json({
      success: true,
      data: {
        deleted: true,
        was_finalized: wasFinalized,
        recency_reconciled: wasFinalized,
      },
    });
  })
);

// POST /mealplans/:sessionId/critique
app.post(
  '/:sessionId/critique',
  validate(critiqueInputSchema),
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const requestStart = Date.now();
    const sessionId = req.params['sessionId'] ?? '';

    // Phase 1: Firestore read
    const firestoreReadStart = Date.now();
    const session = await getSessionRepo().findById(sessionId);
    const firestoreReadMs = Date.now() - firestoreReadStart;
    info('critique:firestore_read', {
      phase: 'firestore_read',
      elapsed_ms: firestoreReadMs,
      sessionId,
    });

    if (session === null) {
      next(new NotFoundError('MealPlanSession', sessionId));
      return;
    }

    if (session.is_finalized) {
      throw new AppError(
        400,
        'SESSION_FINALIZED',
        `Session is already finalized. Use /mealplans/${sessionId}/revise or brados mealplan revise instead.`
      );
    }

    const { critique, context } = critiqueInputSchema.parse(req.body);
    const apiKey = getCritiqueApiKey();

    // Phase 2: Jev evaluates bounded slot and candidate questions.
    const jevStart = Date.now();
    const critiqueResponse = await processCritique(activeMealPlanSession(session), critique, apiKey, context);
    const jevMs = Date.now() - jevStart;
    info('critique:jev_total', {
      phase: 'jev_total',
      elapsed_ms: jevMs,
    });

    // Phase 3: Apply operations
    const opsStart = Date.now();
    const { updatedPlan, errors: operationErrors } = applyOperations(
      session.plan,
      critiqueResponse.operations,
      session.meals_snapshot
    );
    const opsMs = Date.now() - opsStart;
    info('critique:apply_ops', {
      phase: 'apply_ops',
      elapsed_ms: opsMs,
      operation_count: critiqueResponse.operations.length,
    });

    if (operationErrors.length > 0) {
      res.json({
        success: true,
        data: {
          plan: activeMealPlan(session.plan),
          explanation: 'No changes were applied because the requested changes did not pass validation.',
          operations: critiqueResponse.operations,
          errors: operationErrors,
          outcome: 'validation_failed',
        },
      });
      return;
    }

    // Phase 4: Firestore write
    const firestoreWriteStart = Date.now();
    const saved = await getSessionRepo().applyCritiqueUpdates(
      sessionId,
      { role: 'user', content: critique, ...(context === undefined ? {} : { context }) },
      buildAssistantHistory(session, critiqueResponse),
      preserveDisabledEntries(session.plan, updatedPlan),
      session
    );
    if (!saved) {
      throw new AppError(409, 'SESSION_CONFLICT', 'This meal plan changed while the request was being evaluated. Reload the session and retry your feedback.');
    }
    const firestoreWriteMs = Date.now() - firestoreWriteStart;
    info('critique:firestore_write', {
      phase: 'firestore_write',
      elapsed_ms: firestoreWriteMs,
    });

    const totalMs = Date.now() - requestStart;
    info('critique:complete', {
      phase: 'total',
      total_ms: totalMs,
      firestore_read_ms: firestoreReadMs,
      jev_ms: jevMs,
      apply_ops_ms: opsMs,
      firestore_write_ms: firestoreWriteMs,
      sessionId,
    });

    res.json({
      success: true,
      data: {
        plan: activeMealPlan(updatedPlan),
        explanation: critiqueResponse.explanation,
        operations: critiqueResponse.operations,
        errors: operationErrors,
        outcome: critiqueResponse.outcome,
      },
    });
  })
);

// POST /mealplans/:sessionId/revise
app.post(
  '/:sessionId/revise',
  validate(critiqueInputSchema),
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const sessionId = req.params['sessionId'] ?? '';
    const session = await getSessionRepo().findById(sessionId);
    if (session === null) {
      next(new NotFoundError('MealPlanSession', sessionId));
      return;
    }

    if (!session.is_finalized) {
      throw new AppError(
        400,
        'SESSION_NOT_FINALIZED',
        `Session is still a draft. Use /mealplans/${sessionId}/critique or brados mealplan critique instead.`
      );
    }

    const { critique, context } = critiqueInputSchema.parse(req.body);
    const apiKey = getCritiqueApiKey();

    const critiqueResponse = await processCritique(activeMealPlanSession(session), critique, apiKey, context);
    const { updatedPlan, errors: operationErrors } = applyOperations(
      session.plan,
      critiqueResponse.operations,
      session.meals_snapshot
    );

    if (operationErrors.length > 0) {
      res.json({
        success: true,
        data: {
          plan: activeMealPlan(session.plan),
          explanation: 'No changes were applied because the requested changes did not pass validation.',
          operations: critiqueResponse.operations,
          errors: operationErrors,
          outcome: 'validation_failed',
          recency_reconciled: false,
        },
      });
      return;
    }

    const saved = await getSessionRepo().applyCritiqueUpdates(
      sessionId,
      { role: 'user', content: critique, ...(context === undefined ? {} : { context }) },
      buildAssistantHistory(session, critiqueResponse),
      preserveDisabledEntries(session.plan, updatedPlan),
      session
    );
    if (!saved) {
      throw new AppError(409, 'SESSION_CONFLICT', 'This meal plan changed while the request was being evaluated. Reload the session and retry your feedback.');
    }

    const planChanged = !isDeepStrictEqual(session.plan, updatedPlan);
    if (planChanged) {
      await reconcileMealLastPlannedForPlanChange({
        previousPlan: session.plan,
        nextPlan: updatedPlan,
        sessionRepository: getSessionRepo(),
        mealRepository: getMealRepo(),
      });
    }

    res.json({
      success: true,
      data: {
        plan: activeMealPlan(updatedPlan),
        explanation: critiqueResponse.explanation,
        operations: critiqueResponse.operations,
        errors: operationErrors,
        outcome: critiqueResponse.outcome,
        recency_reconciled: planChanged,
      },
    });
  })
);

// POST /mealplans/:sessionId/finalize
app.post(
  '/:sessionId/finalize',
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const sessionId = req.params['sessionId'] ?? '';
    const session = await getSessionRepo().findById(sessionId);
    if (session === null) {
      next(new NotFoundError('MealPlanSession', sessionId));
      return;
    }

    if (session.is_finalized) {
      throw new AppError(
        400,
        'SESSION_FINALIZED',
        'Session is already finalized'
      );
    }

    const finalized = await getSessionRepo().finalize(sessionId, session, getUniquePlannedMealIds(activeMealPlan(session.plan)));
    if (finalized === null) {
      throw new AppError(409, 'SESSION_CONFLICT', 'This meal plan changed before it could be finalized. Reload the session and review the updated plan.');
    }
    res.json({ success: true, data: { finalized: true } });
  })
);

// Error handler must be last
app.use(errorHandler);

export const mealplansApp = app;
