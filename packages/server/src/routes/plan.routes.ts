import { Router, type Request, type Response, type NextFunction } from 'express';
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
import { NotFoundError, ConflictError } from '../middleware/error-handler.js';
import {
  getPlanRepository,
  getPlanDayRepository,
  getPlanDayExerciseRepository,
  getMesocycleRepository,
  getExerciseRepository,
} from '../repositories/index.js';
import { getPlanModificationService } from '../services/index.js';

export const planRouter = Router();

// ============ Plans ============

// GET /api/plans
planRouter.get(
  '/',
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const repository = getPlanRepository();
      const plans = await repository.findAll();

      const response: ApiResponse<Plan[]> = {
        success: true,
        data: plans,
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/plans/:id
planRouter.get(
  '/:id',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const repository = getPlanRepository();
      const id = req.params['id'];

      if (!id) {
        throw new NotFoundError('Plan', 'unknown');
      }

      const plan = await repository.findById(id);

      if (!plan) {
        throw new NotFoundError('Plan', id);
      }

      const response: ApiResponse<Plan> = {
        success: true,
        data: plan,
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/plans
planRouter.post(
  '/',
  validate(createPlanSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const repository = getPlanRepository();
      const plan = await repository.create(req.body as CreatePlanDTO);

      const response: ApiResponse<Plan> = {
        success: true,
        data: plan,
      };
      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/plans/:id
planRouter.put(
  '/:id',
  validate(updatePlanSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const planRepository = getPlanRepository();
      const planDayRepository = getPlanDayRepository();
      const planDayExerciseRepository = getPlanDayExerciseRepository();
      const mesocycleRepository = getMesocycleRepository();
      const exerciseRepository = getExerciseRepository();
      const planModificationService = getPlanModificationService();

      const id = req.params['id'];

      if (!id) {
        throw new NotFoundError('Plan', 'unknown');
      }

      // Get the existing plan
      const existingPlan = await planRepository.findById(id);
      if (!existingPlan) {
        throw new NotFoundError('Plan', id);
      }

      // Check for active mesocycle
      const mesocycles = await mesocycleRepository.findByPlanId(id);
      const activeMesocycle = mesocycles.find((m) => m.status === 'active');

      // Update the plan
      const plan = await planRepository.update(id, req.body as UpdatePlanDTO);

      if (!plan) {
        throw new NotFoundError('Plan', id);
      }

      // If there's an active mesocycle, sync plan state to future workouts
      if (activeMesocycle) {
        const planDays = await planDayRepository.findByPlanId(id);

        // Build exercise map for lookups
        const allExercises = await exerciseRepository.findAll();
        const exerciseMap = new Map(allExercises.map((e) => [e.id, e]));

        // Sync each plan day's exercises to matching workouts
        for (const day of planDays) {
          const planExercises = await planDayExerciseRepository.findByPlanDayId(day.id);

          await planModificationService.syncPlanToMesocycle(
            activeMesocycle.id,
            day.id,
            planExercises,
            exerciseMap
          );
        }
      }

      const response: ApiResponse<Plan> = {
        success: true,
        data: plan,
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/plans/:id
planRouter.delete(
  '/:id',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const repository = getPlanRepository();
      const id = req.params['id'];

      if (!id) {
        throw new NotFoundError('Plan', 'unknown');
      }

      if (await repository.isInUse(id)) {
        throw new ConflictError(
          'Cannot delete plan that has active mesocycles'
        );
      }

      const deleted = await repository.delete(id);

      if (!deleted) {
        throw new NotFoundError('Plan', id);
      }

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

// ============ Plan Days ============

// GET /api/plans/:planId/days
planRouter.get(
  '/:planId/days',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const planRepository = getPlanRepository();
      const planDayRepository = getPlanDayRepository();
      const planId = req.params['planId'];

      if (!planId) {
        throw new NotFoundError('Plan', 'unknown');
      }

      const plan = await planRepository.findById(planId);
      if (!plan) {
        throw new NotFoundError('Plan', planId);
      }

      const days = await planDayRepository.findByPlanId(planId);

      const response: ApiResponse<PlanDay[]> = {
        success: true,
        data: days,
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/plans/:planId/days
planRouter.post(
  '/:planId/days',
  validate(createPlanDaySchema.omit({ plan_id: true })),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const planRepository = getPlanRepository();
      const planDayRepository = getPlanDayRepository();
      const planId = req.params['planId'];

      if (!planId) {
        throw new NotFoundError('Plan', 'unknown');
      }

      const plan = await planRepository.findById(planId);
      if (!plan) {
        throw new NotFoundError('Plan', planId);
      }

      const day = await planDayRepository.create({
        ...(req.body as Omit<CreatePlanDayDTO, 'plan_id'>),
        plan_id: planId,
      });

      const response: ApiResponse<PlanDay> = {
        success: true,
        data: day,
      };
      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/plans/:planId/days/:dayId
planRouter.put(
  '/:planId/days/:dayId',
  validate(updatePlanDaySchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const planDayRepository = getPlanDayRepository();
      const dayId = req.params['dayId'];

      if (!dayId) {
        throw new NotFoundError('PlanDay', 'unknown');
      }

      const day = await planDayRepository.update(dayId, req.body as UpdatePlanDayDTO);

      if (!day) {
        throw new NotFoundError('PlanDay', dayId);
      }

      const response: ApiResponse<PlanDay> = {
        success: true,
        data: day,
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/plans/:planId/days/:dayId
planRouter.delete(
  '/:planId/days/:dayId',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const planDayRepository = getPlanDayRepository();
      const dayId = req.params['dayId'];

      if (!dayId) {
        throw new NotFoundError('PlanDay', 'unknown');
      }

      const deleted = await planDayRepository.delete(dayId);

      if (!deleted) {
        throw new NotFoundError('PlanDay', dayId);
      }

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

// ============ Plan Day Exercises ============

// GET /api/plans/:planId/days/:dayId/exercises
planRouter.get(
  '/:planId/days/:dayId/exercises',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const planDayRepository = getPlanDayRepository();
      const planDayExerciseRepository = getPlanDayExerciseRepository();
      const dayId = req.params['dayId'];

      if (!dayId) {
        throw new NotFoundError('PlanDay', 'unknown');
      }

      const day = await planDayRepository.findById(dayId);
      if (!day) {
        throw new NotFoundError('PlanDay', dayId);
      }

      const exercises = await planDayExerciseRepository.findByPlanDayId(dayId);

      const response: ApiResponse<PlanDayExercise[]> = {
        success: true,
        data: exercises,
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/plans/:planId/days/:dayId/exercises
planRouter.post(
  '/:planId/days/:dayId/exercises',
  validate(createPlanDayExerciseSchema.omit({ plan_day_id: true })),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const planDayRepository = getPlanDayRepository();
      const planDayExerciseRepository = getPlanDayExerciseRepository();
      const dayId = req.params['dayId'];

      if (!dayId) {
        throw new NotFoundError('PlanDay', 'unknown');
      }

      const day = await planDayRepository.findById(dayId);
      if (!day) {
        throw new NotFoundError('PlanDay', dayId);
      }

      const exercise = await planDayExerciseRepository.create({
        ...(req.body as Omit<CreatePlanDayExerciseDTO, 'plan_day_id'>),
        plan_day_id: dayId,
      });

      const response: ApiResponse<PlanDayExercise> = {
        success: true,
        data: exercise,
      };
      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/plans/:planId/days/:dayId/exercises/:exerciseId
planRouter.put(
  '/:planId/days/:dayId/exercises/:exerciseId',
  validate(updatePlanDayExerciseSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const planDayExerciseRepository = getPlanDayExerciseRepository();
      const exerciseId = req.params['exerciseId'];

      if (!exerciseId) {
        throw new NotFoundError('PlanDayExercise', 'unknown');
      }

      const exercise = await planDayExerciseRepository.update(exerciseId, req.body as UpdatePlanDayExerciseDTO);

      if (!exercise) {
        throw new NotFoundError('PlanDayExercise', exerciseId);
      }

      const response: ApiResponse<PlanDayExercise> = {
        success: true,
        data: exercise,
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/plans/:planId/days/:dayId/exercises/:exerciseId
planRouter.delete(
  '/:planId/days/:dayId/exercises/:exerciseId',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const planDayExerciseRepository = getPlanDayExerciseRepository();
      const exerciseId = req.params['exerciseId'];

      if (!exerciseId) {
        throw new NotFoundError('PlanDayExercise', 'unknown');
      }

      const deleted = await planDayExerciseRepository.delete(exerciseId);

      if (!deleted) {
        throw new NotFoundError('PlanDayExercise', exerciseId);
      }

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);
