import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import { createExerciseSchema, updateExerciseSchema } from '@brad-os/shared';
import { validate } from '../middleware/validate.js';
import { errorHandler, NotFoundError, ConflictError } from '../middleware/error-handler.js';
import { stripPathPrefix } from '../middleware/strip-path-prefix.js';
import { ExerciseRepository } from '../repositories/exercise.repository.js';
import { getFirestoreDb } from '../firebase.js';

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());
app.use(stripPathPrefix('exercises'));

// Lazy repository initialization
let exerciseRepo: ExerciseRepository | null = null;
function getRepo(): ExerciseRepository {
  if (!exerciseRepo) {
    exerciseRepo = new ExerciseRepository(getFirestoreDb());
  }
  return exerciseRepo;
}

// GET /exercises
app.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const exercises = await getRepo().findAll();
    res.json({ success: true, data: exercises });
  } catch (error) {
    next(error);
  }
});

// GET /exercises/default
app.get('/default', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const exercises = await getRepo().findDefaultExercises();
    res.json({ success: true, data: exercises });
  } catch (error) {
    next(error);
  }
});

// GET /exercises/custom
app.get('/custom', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const exercises = await getRepo().findCustomExercises();
    res.json({ success: true, data: exercises });
  } catch (error) {
    next(error);
  }
});

// GET /exercises/:id
app.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const exercise = await getRepo().findById(req.params['id'] ?? '');
    if (!exercise) {
      throw new NotFoundError('Exercise', req.params['id'] ?? '');
    }
    res.json({ success: true, data: exercise });
  } catch (error) {
    next(error);
  }
});

// POST /exercises
app.post('/', validate(createExerciseSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const exercise = await getRepo().create(req.body);
    res.status(201).json({ success: true, data: exercise });
  } catch (error) {
    next(error);
  }
});

// PUT /exercises/:id
app.put('/:id', validate(updateExerciseSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const exercise = await getRepo().update(req.params['id'] ?? '', req.body);
    if (!exercise) {
      throw new NotFoundError('Exercise', req.params['id'] ?? '');
    }
    res.json({ success: true, data: exercise });
  } catch (error) {
    next(error);
  }
});

// DELETE /exercises/:id
app.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params['id'] ?? '';
    const isInUse = await getRepo().isInUse(id);
    if (isInUse) {
      throw new ConflictError('Cannot delete exercise that is used in plans');
    }
    const deleted = await getRepo().delete(id);
    if (!deleted) {
      throw new NotFoundError('Exercise', id);
    }
    res.json({ success: true, data: { deleted: true } });
  } catch (error) {
    next(error);
  }
});

// Error handler must be last
app.use(errorHandler);

export const exercisesApp = app;
