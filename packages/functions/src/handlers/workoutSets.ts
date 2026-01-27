import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import {
  logWorkoutSetSchema,
  type ApiResponse,
  type WorkoutSet,
  type LogWorkoutSetInput,
} from '@brad-os/shared';
import { validate } from '../middleware/validate.js';
import { errorHandler, NotFoundError, ValidationError } from '../middleware/error-handler.js';
import { stripPathPrefix } from '../middleware/strip-path-prefix.js';
import { requireAppCheck } from '../middleware/app-check.js';
import { getWorkoutSetService } from '../services/index.js';

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());
app.use(stripPathPrefix('workout-sets'));
app.use(requireAppCheck);

// PUT /workout-sets/:id/log
app.put(
  '/:id/log',
  validate(logWorkoutSetSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const service = getWorkoutSetService();
      const id = req.params['id'];

      if (!id) {
        throw new NotFoundError('WorkoutSet', 'unknown');
      }

      const body = req.body as LogWorkoutSetInput;
      const set = await service.log(id, {
        actual_reps: body.actual_reps,
        actual_weight: body.actual_weight,
      });

      const response: ApiResponse<WorkoutSet> = { success: true, data: set };
      res.json(response);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          return next(new NotFoundError('WorkoutSet', req.params['id'] ?? 'unknown'));
        }
        if (error.message.includes('Cannot') || error.message.includes('must be')) {
          return next(new ValidationError(error.message));
        }
      }
      next(error);
    }
  }
);

// PUT /workout-sets/:id/skip
app.put('/:id/skip', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const service = getWorkoutSetService();
    const id = req.params['id'];

    if (!id) {
      throw new NotFoundError('WorkoutSet', 'unknown');
    }

    const set = await service.skip(id);
    const response: ApiResponse<WorkoutSet> = { success: true, data: set };
    res.json(response);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return next(new NotFoundError('WorkoutSet', req.params['id'] ?? 'unknown'));
      }
      if (error.message.includes('Cannot')) {
        return next(new ValidationError(error.message));
      }
    }
    next(error);
  }
});

// PUT /workout-sets/:id/unlog
app.put('/:id/unlog', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const service = getWorkoutSetService();
    const id = req.params['id'];

    if (!id) {
      throw new NotFoundError('WorkoutSet', 'unknown');
    }

    const set = await service.unlog(id);
    const response: ApiResponse<WorkoutSet> = { success: true, data: set };
    res.json(response);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return next(new NotFoundError('WorkoutSet', req.params['id'] ?? 'unknown'));
      }
      if (error.message.includes('Cannot')) {
        return next(new ValidationError(error.message));
      }
    }
    next(error);
  }
});

// Error handler must be last
app.use(errorHandler);

export const workoutSetsApp = app;
