import { Router, type Request, type Response, type NextFunction } from 'express';
import {
  logWorkoutSetSchema,
  type ApiResponse,
  type WorkoutSet,
  type LogWorkoutSetInput,
} from '@brad-os/shared';
import { validate } from '../middleware/validate.js';
import { NotFoundError, ValidationError } from '../middleware/error-handler.js';
import { getWorkoutSetService } from '../services/index.js';

export const workoutSetRouter = Router();

// PUT /api/workout-sets/:id/log
workoutSetRouter.put(
  '/:id/log',
  validate(logWorkoutSetSchema),
  (req: Request, res: Response, next: NextFunction): void => {
    try {
      const service = getWorkoutSetService();
      const id = parseInt(req.params['id'] ?? '', 10);

      if (isNaN(id)) {
        throw new NotFoundError('WorkoutSet', req.params['id'] ?? 'unknown');
      }

      const body = req.body as LogWorkoutSetInput;
      const set = service.log(id, {
        actual_reps: body.actual_reps,
        actual_weight: body.actual_weight,
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

// PUT /api/workout-sets/:id/skip
workoutSetRouter.put(
  '/:id/skip',
  (req: Request, res: Response, next: NextFunction): void => {
    try {
      const service = getWorkoutSetService();
      const id = parseInt(req.params['id'] ?? '', 10);

      if (isNaN(id)) {
        throw new NotFoundError('WorkoutSet', req.params['id'] ?? 'unknown');
      }

      const set = service.skip(id);

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

// PUT /api/workout-sets/:id/unlog
workoutSetRouter.put(
  '/:id/unlog',
  (req: Request, res: Response, next: NextFunction): void => {
    try {
      const service = getWorkoutSetService();
      const id = parseInt(req.params['id'] ?? '', 10);

      if (isNaN(id)) {
        throw new NotFoundError('WorkoutSet', req.params['id'] ?? 'unknown');
      }

      const set = service.unlog(id);

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
