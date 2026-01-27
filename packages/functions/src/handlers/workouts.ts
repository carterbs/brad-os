import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import {
  createWorkoutSchema,
  updateWorkoutSchema,
  createWorkoutSetSchema,
  logWorkoutSetSchema,
  type ApiResponse,
  type Workout,
  type WorkoutSet,
  type CreateWorkoutInput,
  type UpdateWorkoutInput,
  type UpdateWorkoutDTO,
  type LogWorkoutSetInput,
} from '@brad-os/shared';
import { validate } from '../middleware/validate.js';
import { errorHandler, NotFoundError, ValidationError } from '../middleware/error-handler.js';
import {
  WorkoutRepository,
  WorkoutSetRepository,
} from '../repositories/index.js';
import {
  getWorkoutService,
  getWorkoutSetService,
  type WorkoutWithExercises,
} from '../services/index.js';
import { getFirestoreDb } from '../firebase.js';

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

// Lazy repository initialization
let workoutRepo: WorkoutRepository | null = null;
let workoutSetRepo: WorkoutSetRepository | null = null;

function getWorkoutRepo(): WorkoutRepository {
  if (!workoutRepo) {
    workoutRepo = new WorkoutRepository(getFirestoreDb());
  }
  return workoutRepo;
}

function getWorkoutSetRepo(): WorkoutSetRepository {
  if (!workoutSetRepo) {
    workoutSetRepo = new WorkoutSetRepository(getFirestoreDb());
  }
  return workoutSetRepo;
}

// ============ Workout Routes ============

// GET /workouts/today - Get today's workout
app.get('/today', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const service = getWorkoutService();
    const workout = await service.getTodaysWorkout();

    if (!workout) {
      const response: ApiResponse<null> = { success: true, data: null };
      res.json(response);
      return;
    }

    const response: ApiResponse<WorkoutWithExercises> = { success: true, data: workout };
    res.json(response);
  } catch (error) {
    next(error);
  }
});

// GET /workouts
app.get('/', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const workouts = await getWorkoutRepo().findAll();
    const response: ApiResponse<Workout[]> = { success: true, data: workouts };
    res.json(response);
  } catch (error) {
    next(error);
  }
});

// GET /workouts/:id - Get workout with all sets grouped by exercise
app.get('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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

    const response: ApiResponse<WorkoutWithExercises> = { success: true, data: workout };
    res.json(response);
  } catch (error) {
    next(error);
  }
});

// POST /workouts
app.post('/', validate(createWorkoutSchema), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const body = req.body as CreateWorkoutInput;
    const workout = await getWorkoutRepo().create(body);
    const response: ApiResponse<Workout> = { success: true, data: workout };
    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
});

// PUT /workouts/:id
app.put('/:id', validate(updateWorkoutSchema), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
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
    const workout = await getWorkoutRepo().update(id, updateData);

    if (!workout) {
      throw new NotFoundError('Workout', id);
    }

    const response: ApiResponse<Workout> = { success: true, data: workout };
    res.json(response);
  } catch (error) {
    next(error);
  }
});

// PUT /workouts/:id/start
app.put('/:id/start', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const service = getWorkoutService();
    const id = req.params['id'];

    if (!id) {
      throw new NotFoundError('Workout', 'unknown');
    }

    const workout = await service.start(id);
    const response: ApiResponse<Workout> = { success: true, data: workout };
    res.json(response);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return next(new NotFoundError('Workout', req.params['id'] ?? 'unknown'));
      }
      if (error.message.includes('Cannot') || error.message.includes('already')) {
        return next(new ValidationError(error.message));
      }
    }
    next(error);
  }
});

// PUT /workouts/:id/complete
app.put('/:id/complete', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const service = getWorkoutService();
    const id = req.params['id'];

    if (!id) {
      throw new NotFoundError('Workout', 'unknown');
    }

    const workout = await service.complete(id);
    const response: ApiResponse<Workout> = { success: true, data: workout };
    res.json(response);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return next(new NotFoundError('Workout', req.params['id'] ?? 'unknown'));
      }
      if (error.message.includes('Cannot') || error.message.includes('already')) {
        return next(new ValidationError(error.message));
      }
    }
    next(error);
  }
});

// PUT /workouts/:id/skip
app.put('/:id/skip', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const service = getWorkoutService();
    const id = req.params['id'];

    if (!id) {
      throw new NotFoundError('Workout', 'unknown');
    }

    const workout = await service.skip(id);
    const response: ApiResponse<Workout> = { success: true, data: workout };
    res.json(response);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return next(new NotFoundError('Workout', req.params['id'] ?? 'unknown'));
      }
      if (error.message.includes('Cannot') || error.message.includes('already')) {
        return next(new ValidationError(error.message));
      }
    }
    next(error);
  }
});

// DELETE /workouts/:id
app.delete('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params['id'];
    if (!id) {
      throw new NotFoundError('Workout', 'unknown');
    }

    const deleted = await getWorkoutRepo().delete(id);
    if (!deleted) {
      throw new NotFoundError('Workout', id);
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// ============ Workout Sets (nested under workouts) ============

// GET /workouts/:workoutId/sets
app.get('/:workoutId/sets', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const workoutId = req.params['workoutId'];
    if (!workoutId) {
      throw new NotFoundError('Workout', 'unknown');
    }

    const workout = await getWorkoutRepo().findById(workoutId);
    if (!workout) {
      throw new NotFoundError('Workout', workoutId);
    }

    const sets = await getWorkoutSetRepo().findByWorkoutId(workoutId);
    const response: ApiResponse<WorkoutSet[]> = { success: true, data: sets };
    res.json(response);
  } catch (error) {
    next(error);
  }
});

// POST /workouts/:workoutId/sets
app.post(
  '/:workoutId/sets',
  validate(createWorkoutSetSchema.omit({ workout_id: true })),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const workoutId = req.params['workoutId'];
      if (!workoutId) {
        throw new NotFoundError('Workout', 'unknown');
      }

      const workout = await getWorkoutRepo().findById(workoutId);
      if (!workout) {
        throw new NotFoundError('Workout', workoutId);
      }

      const body = req.body as Omit<WorkoutSet, 'id' | 'workout_id' | 'created_at' | 'status' | 'actual_reps' | 'actual_weight'>;
      const set = await getWorkoutSetRepo().create({
        ...body,
        workout_id: workoutId,
      });

      const response: ApiResponse<WorkoutSet> = { success: true, data: set };
      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  }
);

// PUT /workouts/sets/:id/log (legacy endpoint - use /workout-sets/:id/log instead)
app.put('/sets/:id/log', validate(logWorkoutSetSchema), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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
});

// PUT /workouts/sets/:id/skip (legacy endpoint - use /workout-sets/:id/skip instead)
app.put('/sets/:id/skip', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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

// DELETE /workouts/sets/:id
app.delete('/sets/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params['id'];
    if (!id) {
      throw new NotFoundError('WorkoutSet', 'unknown');
    }

    const deleted = await getWorkoutSetRepo().delete(id);
    if (!deleted) {
      throw new NotFoundError('WorkoutSet', id);
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// ============ Add/Remove Sets ============

// POST /workouts/:workoutId/exercises/:exerciseId/sets/add
app.post(
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
      const response: ApiResponse<typeof result> = { success: true, data: result };
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

// DELETE /workouts/:workoutId/exercises/:exerciseId/sets/remove
app.delete(
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
      const response: ApiResponse<typeof result> = { success: true, data: result };
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

// Error handler must be last
app.use(errorHandler);

export const workoutsApp = app;
