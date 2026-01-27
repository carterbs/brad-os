import { Router, type Request, type Response, type NextFunction } from 'express';
import {
  createWorkoutSchema,
  updateWorkoutSchema,
  createWorkoutSetSchema,
  updateWorkoutSetSchema,
  logWorkoutSetSchema,
  type ApiResponse,
  type Workout,
  type WorkoutSet,
  type CreateWorkoutInput,
  type UpdateWorkoutInput,
  type UpdateWorkoutDTO,
  type CreateWorkoutSetInput,
  type UpdateWorkoutSetInput,
  type UpdateWorkoutSetDTO,
  type LogWorkoutSetInput,
} from '@brad-os/shared';
import { validate } from '../middleware/validate.js';
import { NotFoundError, ValidationError } from '../middleware/error-handler.js';
import {
  getWorkoutRepository,
  getWorkoutSetRepository,
} from '../repositories/index.js';
import {
  getWorkoutService,
  getWorkoutSetService,
  type WorkoutWithExercises,
} from '../services/index.js';

export const workoutRouter = Router();

// ============ Workout Routes ============

// GET /api/workouts/today - Get today's workout
workoutRouter.get(
  '/today',
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const service = getWorkoutService();
      const workout = await service.getTodaysWorkout();

      if (!workout) {
        const response: ApiResponse<null> = {
          success: true,
          data: null,
        };
        res.json(response);
        return;
      }

      const response: ApiResponse<WorkoutWithExercises> = {
        success: true,
        data: workout,
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/workouts
workoutRouter.get(
  '/',
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const repository = getWorkoutRepository();
      const workouts = await repository.findAll();

      const response: ApiResponse<Workout[]> = {
        success: true,
        data: workouts,
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/workouts/:id - Get workout with all sets grouped by exercise
workoutRouter.get(
  '/:id',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const service = getWorkoutService();
      const id = req.params['id'];

      if (!id) {
        throw new NotFoundError('Workout', 'unknown');
      }

      const workout = await service.getById(id);

      if (!workout) {
        throw new NotFoundError('Workout', id);
      }

      const response: ApiResponse<WorkoutWithExercises> = {
        success: true,
        data: workout,
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/workouts
workoutRouter.post(
  '/',
  validate(createWorkoutSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const repository = getWorkoutRepository();
      const body = req.body as CreateWorkoutInput;
      const workout = await repository.create(body);

      const response: ApiResponse<Workout> = {
        success: true,
        data: workout,
      };
      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/workouts/:id
workoutRouter.put(
  '/:id',
  validate(updateWorkoutSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const repository = getWorkoutRepository();
      const id = req.params['id'];

      if (!id) {
        throw new NotFoundError('Workout', 'unknown');
      }

      const body = req.body as UpdateWorkoutInput;
      // Filter out undefined values for exactOptionalPropertyTypes compatibility
      const updateData: UpdateWorkoutDTO = {};
      if (body.status !== undefined) updateData.status = body.status;
      if (body.started_at !== undefined) updateData.started_at = body.started_at;
      if (body.completed_at !== undefined) updateData.completed_at = body.completed_at;
      const workout = await repository.update(id, updateData);

      if (!workout) {
        throw new NotFoundError('Workout', id);
      }

      const response: ApiResponse<Workout> = {
        success: true,
        data: workout,
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/workouts/:id/start
workoutRouter.put(
  '/:id/start',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const service = getWorkoutService();
      const id = req.params['id'];

      if (!id) {
        throw new NotFoundError('Workout', 'unknown');
      }

      const workout = await service.start(id);

      const response: ApiResponse<Workout> = {
        success: true,
        data: workout,
      };
      res.json(response);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          return next(new NotFoundError('Workout', req.params['id'] ?? 'unknown'));
        }
        if (
          error.message.includes('Cannot') ||
          error.message.includes('already')
        ) {
          return next(new ValidationError(error.message));
        }
      }
      next(error);
    }
  }
);

// PUT /api/workouts/:id/complete
workoutRouter.put(
  '/:id/complete',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const service = getWorkoutService();
      const id = req.params['id'];

      if (!id) {
        throw new NotFoundError('Workout', 'unknown');
      }

      const workout = await service.complete(id);

      const response: ApiResponse<Workout> = {
        success: true,
        data: workout,
      };
      res.json(response);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          return next(new NotFoundError('Workout', req.params['id'] ?? 'unknown'));
        }
        if (
          error.message.includes('Cannot') ||
          error.message.includes('already')
        ) {
          return next(new ValidationError(error.message));
        }
      }
      next(error);
    }
  }
);

// PUT /api/workouts/:id/skip
workoutRouter.put(
  '/:id/skip',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const service = getWorkoutService();
      const id = req.params['id'];

      if (!id) {
        throw new NotFoundError('Workout', 'unknown');
      }

      const workout = await service.skip(id);

      const response: ApiResponse<Workout> = {
        success: true,
        data: workout,
      };
      res.json(response);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          return next(new NotFoundError('Workout', req.params['id'] ?? 'unknown'));
        }
        if (
          error.message.includes('Cannot') ||
          error.message.includes('already')
        ) {
          return next(new ValidationError(error.message));
        }
      }
      next(error);
    }
  }
);

// DELETE /api/workouts/:id
workoutRouter.delete(
  '/:id',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const repository = getWorkoutRepository();
      const id = req.params['id'];

      if (!id) {
        throw new NotFoundError('Workout', 'unknown');
      }

      const deleted = await repository.delete(id);

      if (!deleted) {
        throw new NotFoundError('Workout', id);
      }

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

// ============ Workout Sets (nested under workouts) ============

// GET /api/workouts/:workoutId/sets
workoutRouter.get(
  '/:workoutId/sets',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const workoutRepository = getWorkoutRepository();
      const workoutSetRepository = getWorkoutSetRepository();
      const workoutId = req.params['workoutId'];

      if (!workoutId) {
        throw new NotFoundError('Workout', 'unknown');
      }

      const workout = await workoutRepository.findById(workoutId);
      if (!workout) {
        throw new NotFoundError('Workout', workoutId);
      }

      const sets = await workoutSetRepository.findByWorkoutId(workoutId);

      const response: ApiResponse<WorkoutSet[]> = {
        success: true,
        data: sets,
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/workouts/:workoutId/sets
workoutRouter.post(
  '/:workoutId/sets',
  validate(createWorkoutSetSchema.omit({ workout_id: true })),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const workoutRepository = getWorkoutRepository();
      const workoutSetRepository = getWorkoutSetRepository();
      const workoutId = req.params['workoutId'];

      if (!workoutId) {
        throw new NotFoundError('Workout', 'unknown');
      }

      const workout = await workoutRepository.findById(workoutId);
      if (!workout) {
        throw new NotFoundError('Workout', workoutId);
      }

      const body = req.body as Omit<CreateWorkoutSetInput, 'workout_id'>;
      const set = await workoutSetRepository.create({
        ...body,
        workout_id: workoutId,
      });

      const response: ApiResponse<WorkoutSet> = {
        success: true,
        data: set,
      };
      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/workouts/sets/:id (legacy endpoint - use /api/workout-sets/:id instead)
workoutRouter.put(
  '/sets/:id',
  validate(updateWorkoutSetSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const workoutSetRepository = getWorkoutSetRepository();
      const id = req.params['id'];

      if (!id) {
        throw new NotFoundError('WorkoutSet', 'unknown');
      }

      const updateBody = req.body as UpdateWorkoutSetInput;
      // Filter out undefined values for exactOptionalPropertyTypes compatibility
      const updateData: UpdateWorkoutSetDTO = {};
      if (updateBody.actual_reps !== undefined) updateData.actual_reps = updateBody.actual_reps;
      if (updateBody.actual_weight !== undefined) updateData.actual_weight = updateBody.actual_weight;
      if (updateBody.status !== undefined) updateData.status = updateBody.status;
      const set = await workoutSetRepository.update(id, updateData);

      if (!set) {
        throw new NotFoundError('WorkoutSet', id);
      }

      const response: ApiResponse<WorkoutSet> = {
        success: true,
        data: set,
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/workouts/sets/:id/log (legacy endpoint - use /api/workout-sets/:id/log instead)
workoutRouter.put(
  '/sets/:id/log',
  validate(logWorkoutSetSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const service = getWorkoutSetService();
      const id = req.params['id'];

      if (!id) {
        throw new NotFoundError('WorkoutSet', 'unknown');
      }

      const logBody = req.body as LogWorkoutSetInput;
      const set = await service.log(id, {
        actual_reps: logBody.actual_reps,
        actual_weight: logBody.actual_weight,
      });

      const response: ApiResponse<WorkoutSet> = {
        success: true,
        data: set,
      };
      res.json(response);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          return next(
            new NotFoundError('WorkoutSet', req.params['id'] ?? 'unknown')
          );
        }
        if (
          error.message.includes('Cannot') ||
          error.message.includes('must be')
        ) {
          return next(new ValidationError(error.message));
        }
      }
      next(error);
    }
  }
);

// PUT /api/workouts/sets/:id/skip (legacy endpoint - use /api/workout-sets/:id/skip instead)
workoutRouter.put(
  '/sets/:id/skip',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const service = getWorkoutSetService();
      const id = req.params['id'];

      if (!id) {
        throw new NotFoundError('WorkoutSet', 'unknown');
      }

      const set = await service.skip(id);

      const response: ApiResponse<WorkoutSet> = {
        success: true,
        data: set,
      };
      res.json(response);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          return next(
            new NotFoundError('WorkoutSet', req.params['id'] ?? 'unknown')
          );
        }
        if (error.message.includes('Cannot')) {
          return next(new ValidationError(error.message));
        }
      }
      next(error);
    }
  }
);

// DELETE /api/workouts/sets/:id
workoutRouter.delete(
  '/sets/:id',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const workoutSetRepository = getWorkoutSetRepository();
      const id = req.params['id'];

      if (!id) {
        throw new NotFoundError('WorkoutSet', 'unknown');
      }

      const deleted = await workoutSetRepository.delete(id);

      if (!deleted) {
        throw new NotFoundError('WorkoutSet', id);
      }

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

// ============ Add/Remove Sets ============

// POST /api/workouts/:workoutId/exercises/:exerciseId/sets/add
workoutRouter.post(
  '/:workoutId/exercises/:exerciseId/sets/add',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const service = getWorkoutSetService();
      const workoutId = req.params['workoutId'];
      const exerciseId = req.params['exerciseId'];

      if (!workoutId) {
        throw new NotFoundError('Workout', 'unknown');
      }

      if (!exerciseId) {
        throw new NotFoundError('Exercise', 'unknown');
      }

      const result = await service.addSetToExercise(workoutId, exerciseId);

      const response: ApiResponse<typeof result> = {
        success: true,
        data: result,
      };
      res.status(201).json(response);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          return next(
            new NotFoundError('Workout or Exercise', `${req.params['workoutId']}/${req.params['exerciseId']}`)
          );
        }
        if (error.message.includes('Cannot')) {
          return next(new ValidationError(error.message));
        }
      }
      next(error);
    }
  }
);

// DELETE /api/workouts/:workoutId/exercises/:exerciseId/sets/remove
workoutRouter.delete(
  '/:workoutId/exercises/:exerciseId/sets/remove',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const service = getWorkoutSetService();
      const workoutId = req.params['workoutId'];
      const exerciseId = req.params['exerciseId'];

      if (!workoutId) {
        throw new NotFoundError('Workout', 'unknown');
      }

      if (!exerciseId) {
        throw new NotFoundError('Exercise', 'unknown');
      }

      const result = await service.removeSetFromExercise(workoutId, exerciseId);

      const response: ApiResponse<typeof result> = {
        success: true,
        data: result,
      };
      res.json(response);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          return next(
            new NotFoundError('Workout or Exercise', `${req.params['workoutId']}/${req.params['exerciseId']}`)
          );
        }
        if (error.message.includes('Cannot') || error.message.includes('No pending')) {
          return next(new ValidationError(error.message));
        }
      }
      next(error);
    }
  }
);
