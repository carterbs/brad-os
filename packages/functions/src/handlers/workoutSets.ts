import { type Request, type Response, type NextFunction } from 'express';
import {
  logWorkoutSetSchema,
  type ApiResponse,
  type WorkoutSet,
  type LogWorkoutSetInput,
} from '../shared.js';
import { validate } from '../middleware/validate.js';
import { errorHandler, NotFoundError } from '../middleware/error-handler.js';
import { createBaseApp } from '../middleware/create-resource-router.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { getWorkoutSetService } from '../services/index.js';

const app = createBaseApp('workout-sets');

// PUT /workout-sets/:id/log
app.put(
  '/:id/log',
  validate(logWorkoutSetSchema),
  asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const service = getWorkoutSetService();
    const id = req.params['id'];

    if (id === undefined) {
      next(new NotFoundError('WorkoutSet', 'unknown'));
      return;
    }

    const body = req.body as LogWorkoutSetInput;
    const set = await service.log(id, {
      actual_reps: body.actual_reps,
      actual_weight: body.actual_weight,
    });

    const response: ApiResponse<WorkoutSet> = { success: true, data: set };
    res.json(response);
  })
);

// PUT /workout-sets/:id/skip
app.put('/:id/skip', asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const service = getWorkoutSetService();
  const id = req.params['id'];

  if (id === undefined) {
    next(new NotFoundError('WorkoutSet', 'unknown'));
    return;
  }

  const set = await service.skip(id);
  const response: ApiResponse<WorkoutSet> = { success: true, data: set };
  res.json(response);
}));

// PUT /workout-sets/:id/unlog
app.put('/:id/unlog', asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const service = getWorkoutSetService();
  const id = req.params['id'];

  if (id === undefined) {
    next(new NotFoundError('WorkoutSet', 'unknown'));
    return;
  }

  const set = await service.unlog(id);
  const response: ApiResponse<WorkoutSet> = { success: true, data: set };
  res.json(response);
}));

app.use(errorHandler);

export const workoutSetsApp = app;
