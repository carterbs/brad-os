import { type Request, type Response, type NextFunction } from 'express';
import {
  createPlanSchema,
  updatePlanSchema,
  createPlanDaySchema,
  updatePlanDaySchema,
  createPlanDayExerciseSchema,
  updatePlanDayExerciseSchema,
  type ApiResponse,
  type Plan,
  type PlanDay,
  type PlanDayExercise,
  type CreatePlanDTO,
  type UpdatePlanDTO,
  type CreatePlanDayDTO,
  type UpdatePlanDayDTO,
  type CreatePlanDayExerciseDTO,
  type UpdatePlanDayExerciseDTO,
} from '../shared.js';
import { validate } from '../middleware/validate.js';
import { errorHandler, NotFoundError, ConflictError } from '../middleware/error-handler.js';
import { createBaseApp } from '../middleware/create-resource-router.js';
import { asyncHandler } from '../middleware/async-handler.js';
import {
  PlanRepository,
  PlanDayRepository,
  PlanDayExerciseRepository,
  MesocycleRepository,
  ExerciseRepository,
} from '../repositories/index.js';
import { getPlanModificationService } from '../services/index.js';
import { getFirestoreDb } from '../firebase.js';

const app = createBaseApp('plans');

// Lazy repository initialization
let planRepo: PlanRepository | null = null;
let planDayRepo: PlanDayRepository | null = null;
let planDayExerciseRepo: PlanDayExerciseRepository | null = null;
let mesocycleRepo: MesocycleRepository | null = null;
let exerciseRepo: ExerciseRepository | null = null;

function getPlanRepo(): PlanRepository {
  if (planRepo === null) {
    planRepo = new PlanRepository(getFirestoreDb());
  }
  return planRepo;
}

function getPlanDayRepo(): PlanDayRepository {
  if (planDayRepo === null) {
    planDayRepo = new PlanDayRepository(getFirestoreDb());
  }
  return planDayRepo;
}

function getPlanDayExerciseRepo(): PlanDayExerciseRepository {
  if (planDayExerciseRepo === null) {
    planDayExerciseRepo = new PlanDayExerciseRepository(getFirestoreDb());
  }
  return planDayExerciseRepo;
}

function getMesocycleRepo(): MesocycleRepository {
  if (mesocycleRepo === null) {
    mesocycleRepo = new MesocycleRepository(getFirestoreDb());
  }
  return mesocycleRepo;
}

function getExerciseRepo(): ExerciseRepository {
  if (exerciseRepo === null) {
    exerciseRepo = new ExerciseRepository(getFirestoreDb());
  }
  return exerciseRepo;
}

// ============ Plans ============

// GET /plans
app.get('/', asyncHandler(async (_req: Request, res: Response, _next: NextFunction): Promise<void> => {
  const plans = await getPlanRepo().findAll();
  const response: ApiResponse<Plan[]> = { success: true, data: plans };
  res.json(response);
}));

// GET /plans/:id
app.get('/:id', asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const id = req.params['id'];
  if (id === undefined) {
    next(new NotFoundError('Plan', 'unknown'));
    return;
  }
  const plan = await getPlanRepo().findById(id);
  if (plan === null) {
    next(new NotFoundError('Plan', id));
    return;
  }
  const response: ApiResponse<Plan> = { success: true, data: plan };
  res.json(response);
}));

// POST /plans
app.post('/', validate(createPlanSchema), asyncHandler(async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
  const plan = await getPlanRepo().create(req.body as CreatePlanDTO);
  const response: ApiResponse<Plan> = { success: true, data: plan };
  res.status(201).json(response);
}));

// PUT /plans/:id
app.put('/:id', validate(updatePlanSchema), asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const id = req.params['id'];
  if (id === undefined) {
    next(new NotFoundError('Plan', 'unknown'));
    return;
  }

  // Get the existing plan
  const existingPlan = await getPlanRepo().findById(id);
  if (existingPlan === null) {
    next(new NotFoundError('Plan', id));
    return;
  }

  // Check for active mesocycle
  const mesocycles = await getMesocycleRepo().findByPlanId(id);
  const activeMesocycle = mesocycles.find((m) => m.status === 'active');

  // Update the plan
  const plan = await getPlanRepo().update(id, req.body as UpdatePlanDTO);
  if (plan === null) {
    next(new NotFoundError('Plan', id));
    return;
  }

  // If there's an active mesocycle, sync plan state to future workouts
  if (activeMesocycle !== undefined) {
    const planDays = await getPlanDayRepo().findByPlanId(id);
    const allExercises = await getExerciseRepo().findAll();
    const exerciseMap = new Map(allExercises.map((e) => [e.id, e]));

    for (const day of planDays) {
      const planExercises = await getPlanDayExerciseRepo().findByPlanDayId(day.id);
      await getPlanModificationService().syncPlanToMesocycle(
        activeMesocycle.id,
        day.id,
        planExercises,
        exerciseMap
      );
    }
  }

  const response: ApiResponse<Plan> = { success: true, data: plan };
  res.json(response);
}));

// DELETE /plans/:id
app.delete('/:id', asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const id = req.params['id'];
  if (id === undefined) {
    next(new NotFoundError('Plan', 'unknown'));
    return;
  }

  if (await getPlanRepo().isInUse(id)) {
    next(new ConflictError('Cannot delete plan that has active mesocycles'));
    return;
  }

  const deleted = await getPlanRepo().delete(id);
  if (!deleted) {
    next(new NotFoundError('Plan', id));
    return;
  }

  res.status(204).send();
}));

// ============ Plan Days ============

// GET /plans/:planId/days
app.get('/:planId/days', asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const planId = req.params['planId'];
  if (planId === undefined) {
    next(new NotFoundError('Plan', 'unknown'));
    return;
  }

  const plan = await getPlanRepo().findById(planId);
  if (plan === null) {
    next(new NotFoundError('Plan', planId));
    return;
  }

  const days = await getPlanDayRepo().findByPlanId(planId);
  const response: ApiResponse<PlanDay[]> = { success: true, data: days };
  res.json(response);
}));

// POST /plans/:planId/days
app.post(
  '/:planId/days',
  validate(createPlanDaySchema.omit({ plan_id: true })),
  asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const planId = req.params['planId'];
    if (planId === undefined) {
      next(new NotFoundError('Plan', 'unknown'));
      return;
    }

    const plan = await getPlanRepo().findById(planId);
    if (plan === null) {
      next(new NotFoundError('Plan', planId));
      return;
    }

    const day = await getPlanDayRepo().create({
      ...(req.body as Omit<CreatePlanDayDTO, 'plan_id'>),
      plan_id: planId,
    });

    const response: ApiResponse<PlanDay> = { success: true, data: day };
    res.status(201).json(response);
  })
);

// PUT /plans/:planId/days/:dayId
app.put(
  '/:planId/days/:dayId',
  validate(updatePlanDaySchema),
  asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const dayId = req.params['dayId'];
    if (dayId === undefined) {
      next(new NotFoundError('PlanDay', 'unknown'));
      return;
    }

    const day = await getPlanDayRepo().update(dayId, req.body as UpdatePlanDayDTO);
    if (day === null) {
      next(new NotFoundError('PlanDay', dayId));
      return;
    }

    const response: ApiResponse<PlanDay> = { success: true, data: day };
    res.json(response);
  })
);

// DELETE /plans/:planId/days/:dayId
app.delete('/:planId/days/:dayId', asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const dayId = req.params['dayId'];
  if (dayId === undefined) {
    next(new NotFoundError('PlanDay', 'unknown'));
    return;
  }

  const deleted = await getPlanDayRepo().delete(dayId);
  if (!deleted) {
    next(new NotFoundError('PlanDay', dayId));
    return;
  }

  res.status(204).send();
}));

// ============ Plan Day Exercises ============

// GET /plans/:planId/days/:dayId/exercises
app.get('/:planId/days/:dayId/exercises', asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const dayId = req.params['dayId'];
  if (dayId === undefined) {
    next(new NotFoundError('PlanDay', 'unknown'));
    return;
  }

  const day = await getPlanDayRepo().findById(dayId);
  if (day === null) {
    next(new NotFoundError('PlanDay', dayId));
    return;
  }

  const exercises = await getPlanDayExerciseRepo().findByPlanDayId(dayId);
  const response: ApiResponse<PlanDayExercise[]> = { success: true, data: exercises };
  res.json(response);
}));

// POST /plans/:planId/days/:dayId/exercises
app.post(
  '/:planId/days/:dayId/exercises',
  validate(createPlanDayExerciseSchema.omit({ plan_day_id: true })),
  asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const dayId = req.params['dayId'];
    if (dayId === undefined) {
      next(new NotFoundError('PlanDay', 'unknown'));
      return;
    }

    const day = await getPlanDayRepo().findById(dayId);
    if (day === null) {
      next(new NotFoundError('PlanDay', dayId));
      return;
    }

    const exercise = await getPlanDayExerciseRepo().create({
      ...(req.body as Omit<CreatePlanDayExerciseDTO, 'plan_day_id'>),
      plan_day_id: dayId,
    });

    const response: ApiResponse<PlanDayExercise> = { success: true, data: exercise };
    res.status(201).json(response);
  })
);

// PUT /plans/:planId/days/:dayId/exercises/:exerciseId
app.put(
  '/:planId/days/:dayId/exercises/:exerciseId',
  validate(updatePlanDayExerciseSchema),
  asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const exerciseId = req.params['exerciseId'];
    if (exerciseId === undefined) {
      next(new NotFoundError('PlanDayExercise', 'unknown'));
      return;
    }

    const exercise = await getPlanDayExerciseRepo().update(exerciseId, req.body as UpdatePlanDayExerciseDTO);
    if (exercise === null) {
      next(new NotFoundError('PlanDayExercise', exerciseId));
      return;
    }

    const response: ApiResponse<PlanDayExercise> = { success: true, data: exercise };
    res.json(response);
  })
);

// DELETE /plans/:planId/days/:dayId/exercises/:exerciseId
app.delete(
  '/:planId/days/:dayId/exercises/:exerciseId',
  asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const exerciseId = req.params['exerciseId'];
    if (exerciseId === undefined) {
      next(new NotFoundError('PlanDayExercise', 'unknown'));
      return;
    }

    const deleted = await getPlanDayExerciseRepo().delete(exerciseId);
    if (!deleted) {
      next(new NotFoundError('PlanDayExercise', exerciseId));
      return;
    }

    res.status(204).send();
  })
);

// Error handler must be last
app.use(errorHandler);

export const plansApp = app;
