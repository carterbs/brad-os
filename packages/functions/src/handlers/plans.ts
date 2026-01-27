import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
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
} from '@brad-os/shared';
import { validate } from '../middleware/validate.js';
import { errorHandler, NotFoundError, ConflictError } from '../middleware/error-handler.js';
import { stripPathPrefix } from '../middleware/strip-path-prefix.js';
import { requireAppCheck } from '../middleware/app-check.js';
import {
  PlanRepository,
  PlanDayRepository,
  PlanDayExerciseRepository,
  MesocycleRepository,
  ExerciseRepository,
} from '../repositories/index.js';
import { getPlanModificationService } from '../services/index.js';
import { getFirestoreDb } from '../firebase.js';

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());
app.use(stripPathPrefix('plans'));
app.use(requireAppCheck);

// Lazy repository initialization
let planRepo: PlanRepository | null = null;
let planDayRepo: PlanDayRepository | null = null;
let planDayExerciseRepo: PlanDayExerciseRepository | null = null;
let mesocycleRepo: MesocycleRepository | null = null;
let exerciseRepo: ExerciseRepository | null = null;

function getPlanRepo(): PlanRepository {
  if (!planRepo) {
    planRepo = new PlanRepository(getFirestoreDb());
  }
  return planRepo;
}

function getPlanDayRepo(): PlanDayRepository {
  if (!planDayRepo) {
    planDayRepo = new PlanDayRepository(getFirestoreDb());
  }
  return planDayRepo;
}

function getPlanDayExerciseRepo(): PlanDayExerciseRepository {
  if (!planDayExerciseRepo) {
    planDayExerciseRepo = new PlanDayExerciseRepository(getFirestoreDb());
  }
  return planDayExerciseRepo;
}

function getMesocycleRepo(): MesocycleRepository {
  if (!mesocycleRepo) {
    mesocycleRepo = new MesocycleRepository(getFirestoreDb());
  }
  return mesocycleRepo;
}

function getExerciseRepo(): ExerciseRepository {
  if (!exerciseRepo) {
    exerciseRepo = new ExerciseRepository(getFirestoreDb());
  }
  return exerciseRepo;
}

// ============ Plans ============

// GET /plans
app.get('/', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const plans = await getPlanRepo().findAll();
    const response: ApiResponse<Plan[]> = { success: true, data: plans };
    res.json(response);
  } catch (error) {
    next(error);
  }
});

// GET /plans/:id
app.get('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params['id'];
    if (!id) {
      throw new NotFoundError('Plan', 'unknown');
    }
    const plan = await getPlanRepo().findById(id);
    if (!plan) {
      throw new NotFoundError('Plan', id);
    }
    const response: ApiResponse<Plan> = { success: true, data: plan };
    res.json(response);
  } catch (error) {
    next(error);
  }
});

// POST /plans
app.post('/', validate(createPlanSchema), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const plan = await getPlanRepo().create(req.body as CreatePlanDTO);
    const response: ApiResponse<Plan> = { success: true, data: plan };
    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
});

// PUT /plans/:id
app.put('/:id', validate(updatePlanSchema), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params['id'];
    if (!id) {
      throw new NotFoundError('Plan', 'unknown');
    }

    // Get the existing plan
    const existingPlan = await getPlanRepo().findById(id);
    if (!existingPlan) {
      throw new NotFoundError('Plan', id);
    }

    // Check for active mesocycle
    const mesocycles = await getMesocycleRepo().findByPlanId(id);
    const activeMesocycle = mesocycles.find((m) => m.status === 'active');

    // Update the plan
    const plan = await getPlanRepo().update(id, req.body as UpdatePlanDTO);
    if (!plan) {
      throw new NotFoundError('Plan', id);
    }

    // If there's an active mesocycle, sync plan state to future workouts
    if (activeMesocycle) {
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
  } catch (error) {
    next(error);
  }
});

// DELETE /plans/:id
app.delete('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params['id'];
    if (!id) {
      throw new NotFoundError('Plan', 'unknown');
    }

    if (await getPlanRepo().isInUse(id)) {
      throw new ConflictError('Cannot delete plan that has active mesocycles');
    }

    const deleted = await getPlanRepo().delete(id);
    if (!deleted) {
      throw new NotFoundError('Plan', id);
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// ============ Plan Days ============

// GET /plans/:planId/days
app.get('/:planId/days', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const planId = req.params['planId'];
    if (!planId) {
      throw new NotFoundError('Plan', 'unknown');
    }

    const plan = await getPlanRepo().findById(planId);
    if (!plan) {
      throw new NotFoundError('Plan', planId);
    }

    const days = await getPlanDayRepo().findByPlanId(planId);
    const response: ApiResponse<PlanDay[]> = { success: true, data: days };
    res.json(response);
  } catch (error) {
    next(error);
  }
});

// POST /plans/:planId/days
app.post(
  '/:planId/days',
  validate(createPlanDaySchema.omit({ plan_id: true })),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const planId = req.params['planId'];
      if (!planId) {
        throw new NotFoundError('Plan', 'unknown');
      }

      const plan = await getPlanRepo().findById(planId);
      if (!plan) {
        throw new NotFoundError('Plan', planId);
      }

      const day = await getPlanDayRepo().create({
        ...(req.body as Omit<CreatePlanDayDTO, 'plan_id'>),
        plan_id: planId,
      });

      const response: ApiResponse<PlanDay> = { success: true, data: day };
      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  }
);

// PUT /plans/:planId/days/:dayId
app.put(
  '/:planId/days/:dayId',
  validate(updatePlanDaySchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const dayId = req.params['dayId'];
      if (!dayId) {
        throw new NotFoundError('PlanDay', 'unknown');
      }

      const day = await getPlanDayRepo().update(dayId, req.body as UpdatePlanDayDTO);
      if (!day) {
        throw new NotFoundError('PlanDay', dayId);
      }

      const response: ApiResponse<PlanDay> = { success: true, data: day };
      res.json(response);
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /plans/:planId/days/:dayId
app.delete('/:planId/days/:dayId', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const dayId = req.params['dayId'];
    if (!dayId) {
      throw new NotFoundError('PlanDay', 'unknown');
    }

    const deleted = await getPlanDayRepo().delete(dayId);
    if (!deleted) {
      throw new NotFoundError('PlanDay', dayId);
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// ============ Plan Day Exercises ============

// GET /plans/:planId/days/:dayId/exercises
app.get('/:planId/days/:dayId/exercises', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const dayId = req.params['dayId'];
    if (!dayId) {
      throw new NotFoundError('PlanDay', 'unknown');
    }

    const day = await getPlanDayRepo().findById(dayId);
    if (!day) {
      throw new NotFoundError('PlanDay', dayId);
    }

    const exercises = await getPlanDayExerciseRepo().findByPlanDayId(dayId);
    const response: ApiResponse<PlanDayExercise[]> = { success: true, data: exercises };
    res.json(response);
  } catch (error) {
    next(error);
  }
});

// POST /plans/:planId/days/:dayId/exercises
app.post(
  '/:planId/days/:dayId/exercises',
  validate(createPlanDayExerciseSchema.omit({ plan_day_id: true })),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const dayId = req.params['dayId'];
      if (!dayId) {
        throw new NotFoundError('PlanDay', 'unknown');
      }

      const day = await getPlanDayRepo().findById(dayId);
      if (!day) {
        throw new NotFoundError('PlanDay', dayId);
      }

      const exercise = await getPlanDayExerciseRepo().create({
        ...(req.body as Omit<CreatePlanDayExerciseDTO, 'plan_day_id'>),
        plan_day_id: dayId,
      });

      const response: ApiResponse<PlanDayExercise> = { success: true, data: exercise };
      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  }
);

// PUT /plans/:planId/days/:dayId/exercises/:exerciseId
app.put(
  '/:planId/days/:dayId/exercises/:exerciseId',
  validate(updatePlanDayExerciseSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const exerciseId = req.params['exerciseId'];
      if (!exerciseId) {
        throw new NotFoundError('PlanDayExercise', 'unknown');
      }

      const exercise = await getPlanDayExerciseRepo().update(exerciseId, req.body as UpdatePlanDayExerciseDTO);
      if (!exercise) {
        throw new NotFoundError('PlanDayExercise', exerciseId);
      }

      const response: ApiResponse<PlanDayExercise> = { success: true, data: exercise };
      res.json(response);
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /plans/:planId/days/:dayId/exercises/:exerciseId
app.delete(
  '/:planId/days/:dayId/exercises/:exerciseId',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const exerciseId = req.params['exerciseId'];
      if (!exerciseId) {
        throw new NotFoundError('PlanDayExercise', 'unknown');
      }

      const deleted = await getPlanDayExerciseRepo().delete(exerciseId);
      if (!deleted) {
        throw new NotFoundError('PlanDayExercise', exerciseId);
      }

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

// Error handler must be last
app.use(errorHandler);

export const plansApp = app;
