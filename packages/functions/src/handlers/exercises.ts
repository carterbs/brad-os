import { type Request, type Response, type NextFunction } from 'express';
import { createExerciseSchema, updateExerciseSchema } from '../shared.js';
import { NotFoundError, ConflictError } from '../middleware/error-handler.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { createResourceRouter } from '../middleware/create-resource-router.js';
import { ExerciseRepository } from '../repositories/exercise.repository.js';
import { WorkoutSetRepository } from '../repositories/workout-set.repository.js';
import type { ExerciseHistory, ExerciseHistoryEntry } from '../shared.js';
import { getFirestoreDb } from '../firebase.js';

let workoutSetRepo: WorkoutSetRepository | null = null;
function getWorkoutSetRepo(): WorkoutSetRepository {
  if (workoutSetRepo === null) {
    workoutSetRepo = new WorkoutSetRepository(getFirestoreDb());
  }
  return workoutSetRepo;
}

export const exercisesApp = createResourceRouter({
  resourceName: 'exercises',
  displayName: 'Exercise',
  RepoClass: ExerciseRepository,
  createSchema: createExerciseSchema,
  updateSchema: updateExerciseSchema,
  registerCustomRoutes: ({ app, getRepo: getRouterRepo }) => {
    app.get('/default', asyncHandler(async (_req: Request, res: Response, _next: NextFunction) => {
      const exercises = await getRouterRepo().findDefaultExercises();
      res.json({ success: true, data: exercises });
    }));

    app.get('/custom', asyncHandler(async (_req: Request, res: Response, _next: NextFunction) => {
      const exercises = await getRouterRepo().findCustomExercises();
      res.json({ success: true, data: exercises });
    }));

    app.get('/:id/history', asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
      const id = req.params['id'] ?? '';
      const exercise = await getRouterRepo().findById(id);
      if (exercise === null) {
        next(new NotFoundError('Exercise', id));
        return;
      }

      const completedSets = await getWorkoutSetRepo().findCompletedByExerciseId(id);

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
        if (!firstSet) {
          continue;
        }

        const bestWeight = Math.max(...sets.map((set) => set.actual_weight));
        const bestWeightSet = sets.find((set) => set.actual_weight === bestWeight);
        const bestSetReps = bestWeightSet?.actual_reps ?? 0;

        entries.push({
          workout_id: workoutId,
          date: firstSet.completed_at ?? firstSet.scheduled_date,
          week_number: firstSet.week_number,
          mesocycle_id: firstSet.mesocycle_id,
          sets: sets.map((set) => ({
            set_number: set.set_number,
            weight: set.actual_weight,
            reps: set.actual_reps,
          })),
          best_weight: bestWeight,
          best_set_reps: bestSetReps,
        });

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
  },
  beforeDelete: async ({ id, repo }) => {
    const isInUse = await repo.isInUse(id);
    if (isInUse) {
      throw new ConflictError('Cannot delete exercise that is used in plans');
    }
  },
});
