import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import {
  createExerciseSchema,
  updateExerciseSchema,
  type CreateExerciseDTO,
  type UpdateExerciseDTO,
} from '../shared.js';
import { validate } from '../middleware/validate.js';
import { errorHandler, NotFoundError, ConflictError } from '../middleware/error-handler.js';
import { stripPathPrefix } from '../middleware/strip-path-prefix.js';
import { requireAppCheck } from '../middleware/app-check.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { ExerciseRepository } from '../repositories/exercise.repository.js';
import { WorkoutSetRepository } from '../repositories/workout-set.repository.js';
import type { ExerciseHistory, ExerciseHistoryEntry } from '../shared.js';
import { getFirestoreDb } from '../firebase.js';

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());
app.use(stripPathPrefix('exercises'));
app.use(requireAppCheck);

// Lazy repository initialization
let exerciseRepo: ExerciseRepository | null = null;
function getRepo(): ExerciseRepository {
  if (exerciseRepo === null) {
    exerciseRepo = new ExerciseRepository(getFirestoreDb());
  }
  return exerciseRepo;
}

let workoutSetRepo: WorkoutSetRepository | null = null;
function getWorkoutSetRepo(): WorkoutSetRepository {
  if (workoutSetRepo === null) {
    workoutSetRepo = new WorkoutSetRepository(getFirestoreDb());
  }
  return workoutSetRepo;
}

// GET /exercises
app.get('/', asyncHandler(async (_req: Request, res: Response, _next: NextFunction) => {
  const exercises = await getRepo().findAll();
  res.json({ success: true, data: exercises });
}));

// GET /exercises/default
app.get('/default', asyncHandler(async (_req: Request, res: Response, _next: NextFunction) => {
  const exercises = await getRepo().findDefaultExercises();
  res.json({ success: true, data: exercises });
}));

// GET /exercises/custom
app.get('/custom', asyncHandler(async (_req: Request, res: Response, _next: NextFunction) => {
  const exercises = await getRepo().findCustomExercises();
  res.json({ success: true, data: exercises });
}));

// GET /exercises/:id/history
app.get('/:id/history', asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const id = req.params['id'] ?? '';
  const exercise = await getRepo().findById(id);
  if (exercise === null) {
    next(new NotFoundError('Exercise', id));
    return;
  }

  const completedSets = await getWorkoutSetRepo().findCompletedByExerciseId(id);

  // Group sets by workout_id to create entries
  const workoutGroups = new Map<string, typeof completedSets>();
  for (const set of completedSets) {
    const existing = workoutGroups.get(set.workout_id) ?? [];
    existing.push(set);
    workoutGroups.set(set.workout_id, existing);
  }

  const entries: ExerciseHistoryEntry[] = [];
  let personalRecord: ExerciseHistory['personal_record'] = null;

  for (const [workoutId, sets] of workoutGroups) {
    const firstSet = sets[0];
    if (!firstSet) continue;

    const bestWeight = Math.max(...sets.map(s => s.actual_weight));
    const bestWeightSet = sets.find(s => s.actual_weight === bestWeight);
    const bestSetReps = bestWeightSet?.actual_reps ?? 0;

    entries.push({
      workout_id: workoutId,
      date: firstSet.completed_at ?? firstSet.scheduled_date,
      week_number: firstSet.week_number,
      mesocycle_id: firstSet.mesocycle_id,
      sets: sets.map(s => ({
        set_number: s.set_number,
        weight: s.actual_weight,
        reps: s.actual_reps,
      })),
      best_weight: bestWeight,
      best_set_reps: bestSetReps,
    });

    // Track personal record (highest weight)
    if (personalRecord === null || bestWeight > personalRecord.weight) {
      personalRecord = {
        weight: bestWeight,
        reps: bestSetReps,
        date: firstSet.completed_at ?? firstSet.scheduled_date,
      };
    }
  }

  const history: ExerciseHistory = {
    exercise_id: id,
    exercise_name: exercise.name,
    entries,
    personal_record: personalRecord,
  };

  res.json({ success: true, data: history });
}));

// GET /exercises/:id
app.get('/:id', asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const id = req.params['id'] ?? '';
  const exercise = await getRepo().findById(id);
  if (exercise === null) {
    next(new NotFoundError('Exercise', id));
    return;
  }
  res.json({ success: true, data: exercise });
}));

// POST /exercises
app.post('/', validate(createExerciseSchema), asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const body = req.body as CreateExerciseDTO;
  const exercise = await getRepo().create(body);
  res.status(201).json({ success: true, data: exercise });
}));

// PUT /exercises/:id
app.put('/:id', validate(updateExerciseSchema), asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const id = req.params['id'] ?? '';
  const body = req.body as UpdateExerciseDTO;
  const exercise = await getRepo().update(id, body);
  if (exercise === null) {
    next(new NotFoundError('Exercise', id));
    return;
  }
  res.json({ success: true, data: exercise });
}));

// DELETE /exercises/:id
app.delete('/:id', asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const id = req.params['id'] ?? '';
  const isInUse = await getRepo().isInUse(id);
  if (isInUse) {
    next(new ConflictError('Cannot delete exercise that is used in plans'));
    return;
  }
  const deleted = await getRepo().delete(id);
  if (!deleted) {
    next(new NotFoundError('Exercise', id));
    return;
  }
  res.json({ success: true, data: { deleted: true } });
}));

// Error handler must be last
app.use(errorHandler);

export const exercisesApp = app;
