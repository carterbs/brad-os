import { type Request, type Response, type NextFunction } from 'express';
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
} from '../shared.js';
import { validate } from '../middleware/validate.js';
import { errorHandler, NotFoundError } from '../middleware/error-handler.js';
import { createBaseApp } from '../middleware/create-resource-router.js';
import { asyncHandler } from '../middleware/async-handler.js';
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

const app = createBaseApp('workouts');

// Lazy repository initialization
let workoutRepo: WorkoutRepository | null = null;
let workoutSetRepo: WorkoutSetRepository | null = null;

function getWorkoutRepo(): WorkoutRepository {
  if (workoutRepo === null) {
    workoutRepo = new WorkoutRepository(getFirestoreDb());
  }
  return workoutRepo;
}

function getWorkoutSetRepo(): WorkoutSetRepository {
  if (workoutSetRepo === null) {
    workoutSetRepo = new WorkoutSetRepository(getFirestoreDb());
  }
  return workoutSetRepo;
}

// ============ Workout Routes ============

// GET /workouts/today - Get today's workout
app.get('/today', asyncHandler(async (_req: Request, res: Response, _next: NextFunction): Promise<void> => {
  const service = getWorkoutService();
  const workout = await service.getTodaysWorkout();

  if (workout === null) {
    const response: ApiResponse<null> = { success: true, data: null };
    res.json(response);
    return;
  }

  const response: ApiResponse<WorkoutWithExercises> = { success: true, data: workout };
  res.json(response);
}));

// GET /workouts
app.get('/', asyncHandler(async (_req: Request, res: Response, _next: NextFunction): Promise<void> => {
  const workouts = await getWorkoutRepo().findAll();
  const response: ApiResponse<Workout[]> = { success: true, data: workouts };
  res.json(response);
}));

// GET /workouts/:id - Get workout with all sets grouped by exercise
app.get('/:id', asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const service = getWorkoutService();
  const id = req.params['id'];

  if (id === undefined) {
    next(new NotFoundError('Workout', 'unknown'));
    return;
  }

  const workout = await service.getById(id);
  if (workout === null) {
    next(new NotFoundError('Workout', id));
    return;
  }

  const response: ApiResponse<WorkoutWithExercises> = { success: true, data: workout };
  res.json(response);
}));

// POST /workouts
app.post('/', validate(createWorkoutSchema), asyncHandler(async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
  const body = req.body as CreateWorkoutInput;
  const workout = await getWorkoutRepo().create(body);
  const response: ApiResponse<Workout> = { success: true, data: workout };
  res.status(201).json(response);
}));

// PUT /workouts/:id
app.put('/:id', validate(updateWorkoutSchema), asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const id = req.params['id'];
  if (id === undefined) {
    next(new NotFoundError('Workout', 'unknown'));
    return;
  }

  const body = req.body as UpdateWorkoutInput;
  // Filter out undefined values for exactOptionalPropertyTypes compatibility
  const updateData: UpdateWorkoutDTO = {};
  if (body.status !== undefined) updateData.status = body.status;
  if (body.started_at !== undefined) updateData.started_at = body.started_at;
  if (body.completed_at !== undefined) updateData.completed_at = body.completed_at;
  const workout = await getWorkoutRepo().update(id, updateData);

  if (workout === null) {
    next(new NotFoundError('Workout', id));
    return;
  }

  const response: ApiResponse<Workout> = { success: true, data: workout };
  res.json(response);
}));

// PUT /workouts/:id/start
app.put('/:id/start', asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const service = getWorkoutService();
  const id = req.params['id'];

  if (id === undefined) {
    next(new NotFoundError('Workout', 'unknown'));
    return;
  }

  const workout = await service.start(id);
  const response: ApiResponse<Workout> = { success: true, data: workout };
  res.json(response);
}));

// PUT /workouts/:id/complete
app.put('/:id/complete', asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const service = getWorkoutService();
  const id = req.params['id'];

  if (id === undefined) {
    next(new NotFoundError('Workout', 'unknown'));
    return;
  }

  const workout = await service.complete(id);
  const response: ApiResponse<Workout> = { success: true, data: workout };
  res.json(response);
}));

// PUT /workouts/:id/skip
app.put('/:id/skip', asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const service = getWorkoutService();
  const id = req.params['id'];

  if (id === undefined) {
    next(new NotFoundError('Workout', 'unknown'));
    return;
  }

  const workout = await service.skip(id);
  const response: ApiResponse<Workout> = { success: true, data: workout };
  res.json(response);
}));

// DELETE /workouts/:id
app.delete('/:id', asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const id = req.params['id'];
  if (id === undefined) {
    next(new NotFoundError('Workout', 'unknown'));
    return;
  }

  const deleted = await getWorkoutRepo().delete(id);
  if (!deleted) {
    next(new NotFoundError('Workout', id));
    return;
  }

  res.status(204).send();
}));

// ============ Workout Sets (nested under workouts) ============

// GET /workouts/:workoutId/sets
app.get('/:workoutId/sets', asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const workoutId = req.params['workoutId'];
  if (workoutId === undefined) {
    next(new NotFoundError('Workout', 'unknown'));
    return;
  }

  const workout = await getWorkoutRepo().findById(workoutId);
  if (workout === null) {
    next(new NotFoundError('Workout', workoutId));
    return;
  }

  const sets = await getWorkoutSetRepo().findByWorkoutId(workoutId);
  const response: ApiResponse<WorkoutSet[]> = { success: true, data: sets };
  res.json(response);
}));

// POST /workouts/:workoutId/sets
app.post(
  '/:workoutId/sets',
  validate(createWorkoutSetSchema.omit({ workout_id: true })),
  asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const workoutId = req.params['workoutId'];
    if (workoutId === undefined) {
      next(new NotFoundError('Workout', 'unknown'));
      return;
    }

    const workout = await getWorkoutRepo().findById(workoutId);
    if (workout === null) {
      next(new NotFoundError('Workout', workoutId));
      return;
    }

    const body = req.body as Omit<WorkoutSet, 'id' | 'workout_id' | 'created_at' | 'status' | 'actual_reps' | 'actual_weight'>;
    const set = await getWorkoutSetRepo().create({
      ...body,
      workout_id: workoutId,
    });

    const response: ApiResponse<WorkoutSet> = { success: true, data: set };
    res.status(201).json(response);
  })
);

// PUT /workouts/sets/:id/log (legacy endpoint - use /workout-sets/:id/log instead)
app.put('/sets/:id/log', validate(logWorkoutSetSchema), asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const service = getWorkoutSetService();
  const id = req.params['id'];

  if (id === undefined) {
    next(new NotFoundError('WorkoutSet', 'unknown'));
    return;
  }

  const logBody = req.body as LogWorkoutSetInput;
  const set = await service.log(id, {
    actual_reps: logBody.actual_reps,
    actual_weight: logBody.actual_weight,
  });

  const response: ApiResponse<WorkoutSet> = { success: true, data: set };
  res.json(response);
}));

// PUT /workouts/sets/:id/skip (legacy endpoint - use /workout-sets/:id/skip instead)
app.put('/sets/:id/skip', asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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

// DELETE /workouts/sets/:id
app.delete('/sets/:id', asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const id = req.params['id'];
  if (id === undefined) {
    next(new NotFoundError('WorkoutSet', 'unknown'));
    return;
  }

  const deleted = await getWorkoutSetRepo().delete(id);
  if (!deleted) {
    next(new NotFoundError('WorkoutSet', id));
    return;
  }

  res.status(204).send();
}));

// ============ Add/Remove Sets ============

// POST /workouts/:workoutId/exercises/:exerciseId/sets/add
app.post(
  '/:workoutId/exercises/:exerciseId/sets/add',
  asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const service = getWorkoutSetService();
    const workoutId = req.params['workoutId'];
    const exerciseId = req.params['exerciseId'];

    if (workoutId === undefined) {
      next(new NotFoundError('Workout', 'unknown'));
      return;
    }
    if (exerciseId === undefined) {
      next(new NotFoundError('Exercise', 'unknown'));
      return;
    }

    const result = await service.addSetToExercise(workoutId, exerciseId);
    const response: ApiResponse<typeof result> = { success: true, data: result };
    res.status(201).json(response);
  })
);

// DELETE /workouts/:workoutId/exercises/:exerciseId/sets/remove
app.delete(
  '/:workoutId/exercises/:exerciseId/sets/remove',
  asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const service = getWorkoutSetService();
    const workoutId = req.params['workoutId'];
    const exerciseId = req.params['exerciseId'];

    if (workoutId === undefined) {
      next(new NotFoundError('Workout', 'unknown'));
      return;
    }
    if (exerciseId === undefined) {
      next(new NotFoundError('Exercise', 'unknown'));
      return;
    }

    const result = await service.removeSetFromExercise(workoutId, exerciseId);
    const response: ApiResponse<typeof result> = { success: true, data: result };
    res.json(response);
  })
);

app.use(errorHandler);

export const workoutsApp = app;
