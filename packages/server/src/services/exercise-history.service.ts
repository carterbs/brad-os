import type { ExerciseHistory, ExerciseHistoryEntry } from '@lifting/shared';
import type { WorkoutSetRepository, CompletedSetRow } from '../repositories/workout-set.repository.js';
import type { ExerciseRepository } from '../repositories/exercise.repository.js';

export class ExerciseHistoryService {
  constructor(
    private workoutSetRepo: WorkoutSetRepository,
    private exerciseRepo: ExerciseRepository
  ) {}

  getHistory(exerciseId: number): ExerciseHistory | null {
    const exercise = this.exerciseRepo.findById(exerciseId);
    if (!exercise) {
      return null;
    }

    const rows = this.workoutSetRepo.findCompletedByExerciseId(exerciseId);

    if (rows.length === 0) {
      return {
        exercise_id: exercise.id,
        exercise_name: exercise.name,
        entries: [],
        personal_record: null,
      };
    }

    const entries = this.groupRowsIntoEntries(rows);
    const personalRecord = this.findPersonalRecord(entries);

    return {
      exercise_id: exercise.id,
      exercise_name: exercise.name,
      entries,
      personal_record: personalRecord,
    };
  }

  private groupRowsIntoEntries(rows: CompletedSetRow[]): ExerciseHistoryEntry[] {
    const entriesByWorkout = new Map<number, CompletedSetRow[]>();

    for (const row of rows) {
      const existing = entriesByWorkout.get(row.workout_id) ?? [];
      existing.push(row);
      entriesByWorkout.set(row.workout_id, existing);
    }

    const entries: ExerciseHistoryEntry[] = [];

    for (const [workoutId, workoutRows] of entriesByWorkout) {
      const firstRow = workoutRows[0];
      if (!firstRow) continue;

      const date = firstRow.completed_at ?? firstRow.scheduled_date;

      const sets = workoutRows.map((r) => ({
        set_number: r.set_number,
        weight: r.actual_weight,
        reps: r.actual_reps,
      }));

      let bestWeight = 0;
      let bestSetReps = 0;

      for (const set of sets) {
        if (set.weight > bestWeight) {
          bestWeight = set.weight;
          bestSetReps = set.reps;
        }
      }

      entries.push({
        workout_id: workoutId,
        date,
        week_number: firstRow.week_number,
        mesocycle_id: firstRow.mesocycle_id,
        sets,
        best_weight: bestWeight,
        best_set_reps: bestSetReps,
      });
    }

    return entries;
  }

  private findPersonalRecord(
    entries: ExerciseHistoryEntry[]
  ): { weight: number; reps: number; date: string } | null {
    if (entries.length === 0) {
      return null;
    }

    let prWeight = 0;
    let prReps = 0;
    let prDate = '';

    for (const entry of entries) {
      if (entry.best_weight > prWeight) {
        prWeight = entry.best_weight;
        prReps = entry.best_set_reps;
        prDate = entry.date;
      }
      // On tie, use the earliest date (entries are already ordered by date ascending)
      // so we only update on strictly greater weight
    }

    if (prWeight === 0) {
      return null;
    }

    return {
      weight: prWeight,
      reps: prReps,
      date: prDate,
    };
  }
}
