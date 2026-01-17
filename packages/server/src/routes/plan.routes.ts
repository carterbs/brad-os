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
} from '@lifting/shared';
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
  (_req: Request, res: Response, next: NextFunction): void => {
    try {
      const repository = getPlanRepository();
      const plans = repository.findAll();

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
  (req: Request, res: Response, next: NextFunction): void => {
    try {
      const repository = getPlanRepository();
      const id = parseInt(req.params['id'] ?? '', 10);

      if (isNaN(id)) {
        throw new NotFoundError('Plan', req.params['id'] ?? 'unknown');
      }

      const plan = repository.findById(id);

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
  (req: Request, res: Response, next: NextFunction): void => {
    try {
      const repository = getPlanRepository();
      const plan = repository.create(req.body);

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
  (req: Request, res: Response, next: NextFunction): void => {
    try {
      const planRepository = getPlanRepository();
      const planDayRepository = getPlanDayRepository();
      const planDayExerciseRepository = getPlanDayExerciseRepository();
      const mesocycleRepository = getMesocycleRepository();
      const exerciseRepository = getExerciseRepository();
      const planModificationService = getPlanModificationService();

      const id = parseInt(req.params['id'] ?? '', 10);

      if (isNaN(id)) {
        throw new NotFoundError('Plan', req.params['id'] ?? 'unknown');
      }

      // Get the existing plan
      const existingPlan = planRepository.findById(id);
      if (!existingPlan) {
        throw new NotFoundError('Plan', id);
      }

      // Check for active mesocycle
      const mesocycles = mesocycleRepository.findByPlanId(id);
      const activeMesocycle = mesocycles.find((m) => m.status === 'active');

      // Update the plan
      const plan = planRepository.update(id, req.body);

      if (!plan) {
        throw new NotFoundError('Plan', id);
      }

      // If there's an active mesocycle, sync plan state to future workouts
      if (activeMesocycle) {
        const planDays = planDayRepository.findByPlanId(id);

        // Build exercise map for lookups
        const allExercises = exerciseRepository.findAll();
        const exerciseMap = new Map(allExercises.map((e) => [e.id, e]));

        // Sync each plan day's exercises to matching workouts
        for (const day of planDays) {
          const planExercises = planDayExerciseRepository.findByPlanDayId(day.id);

          planModificationService.syncPlanToMesocycle(
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
  (req: Request, res: Response, next: NextFunction): void => {
    try {
      const repository = getPlanRepository();
      const id = parseInt(req.params['id'] ?? '', 10);

      if (isNaN(id)) {
        throw new NotFoundError('Plan', req.params['id'] ?? 'unknown');
      }

      if (repository.isInUse(id)) {
        throw new ConflictError(
          'Cannot delete plan that has active mesocycles'
        );
      }

      const deleted = repository.delete(id);

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
  (req: Request, res: Response, next: NextFunction): void => {
    try {
      const planRepository = getPlanRepository();
      const planDayRepository = getPlanDayRepository();
      const planId = parseInt(req.params['planId'] ?? '', 10);

      if (isNaN(planId)) {
        throw new NotFoundError('Plan', req.params['planId'] ?? 'unknown');
      }

      const plan = planRepository.findById(planId);
      if (!plan) {
        throw new NotFoundError('Plan', planId);
      }

      const days = planDayRepository.findByPlanId(planId);

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
  (req: Request, res: Response, next: NextFunction): void => {
    try {
      const planRepository = getPlanRepository();
      const planDayRepository = getPlanDayRepository();
      const planId = parseInt(req.params['planId'] ?? '', 10);

      if (isNaN(planId)) {
        throw new NotFoundError('Plan', req.params['planId'] ?? 'unknown');
      }

      const plan = planRepository.findById(planId);
      if (!plan) {
        throw new NotFoundError('Plan', planId);
      }

      const day = planDayRepository.create({
        ...req.body,
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
  (req: Request, res: Response, next: NextFunction): void => {
    try {
      const planDayRepository = getPlanDayRepository();
      const dayId = parseInt(req.params['dayId'] ?? '', 10);

      if (isNaN(dayId)) {
        throw new NotFoundError('PlanDay', req.params['dayId'] ?? 'unknown');
      }

      const day = planDayRepository.update(dayId, req.body);

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
  (req: Request, res: Response, next: NextFunction): void => {
    try {
      const planDayRepository = getPlanDayRepository();
      const dayId = parseInt(req.params['dayId'] ?? '', 10);

      if (isNaN(dayId)) {
        throw new NotFoundError('PlanDay', req.params['dayId'] ?? 'unknown');
      }

      const deleted = planDayRepository.delete(dayId);

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
  (req: Request, res: Response, next: NextFunction): void => {
    try {
      const planDayRepository = getPlanDayRepository();
      const planDayExerciseRepository = getPlanDayExerciseRepository();
      const dayId = parseInt(req.params['dayId'] ?? '', 10);

      if (isNaN(dayId)) {
        throw new NotFoundError('PlanDay', req.params['dayId'] ?? 'unknown');
      }

      const day = planDayRepository.findById(dayId);
      if (!day) {
        throw new NotFoundError('PlanDay', dayId);
      }

      const exercises = planDayExerciseRepository.findByPlanDayId(dayId);

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
  (req: Request, res: Response, next: NextFunction): void => {
    try {
      const planDayRepository = getPlanDayRepository();
      const planDayExerciseRepository = getPlanDayExerciseRepository();
      const dayId = parseInt(req.params['dayId'] ?? '', 10);

      if (isNaN(dayId)) {
        throw new NotFoundError('PlanDay', req.params['dayId'] ?? 'unknown');
      }

      const day = planDayRepository.findById(dayId);
      if (!day) {
        throw new NotFoundError('PlanDay', dayId);
      }

      const exercise = planDayExerciseRepository.create({
        ...req.body,
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
  (req: Request, res: Response, next: NextFunction): void => {
    try {
      const planDayExerciseRepository = getPlanDayExerciseRepository();
      const exerciseId = parseInt(req.params['exerciseId'] ?? '', 10);

      if (isNaN(exerciseId)) {
        throw new NotFoundError(
          'PlanDayExercise',
          req.params['exerciseId'] ?? 'unknown'
        );
      }

      const exercise = planDayExerciseRepository.update(exerciseId, req.body);

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
  (req: Request, res: Response, next: NextFunction): void => {
    try {
      const planDayExerciseRepository = getPlanDayExerciseRepository();
      const exerciseId = parseInt(req.params['exerciseId'] ?? '', 10);

      if (isNaN(exerciseId)) {
        throw new NotFoundError(
          'PlanDayExercise',
          req.params['exerciseId'] ?? 'unknown'
        );
      }

      const deleted = planDayExerciseRepository.delete(exerciseId);

      if (!deleted) {
        throw new NotFoundError('PlanDayExercise', exerciseId);
      }

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);
