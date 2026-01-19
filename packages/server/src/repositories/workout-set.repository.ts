import type { Database } from 'better-sqlite3';
import type {
  WorkoutSet,
  CreateWorkoutSetDTO,
  UpdateWorkoutSetDTO,
  WorkoutSetStatus,
} from '@lifting/shared';
import { BaseRepository } from './base.repository.js';

interface WorkoutSetRow {
  id: number;
  workout_id: number;
  exercise_id: number;
  set_number: number;
  target_reps: number;
  target_weight: number;
  actual_reps: number | null;
  actual_weight: number | null;
  status: string;
}

export class WorkoutSetRepository extends BaseRepository<
  WorkoutSet,
  CreateWorkoutSetDTO,
  UpdateWorkoutSetDTO
> {
  constructor(db: Database) {
    super(db, 'workout_sets');
  }

  private rowToWorkoutSet(row: WorkoutSetRow): WorkoutSet {
    return {
      id: row.id,
      workout_id: row.workout_id,
      exercise_id: row.exercise_id,
      set_number: row.set_number,
      target_reps: row.target_reps,
      target_weight: row.target_weight,
      actual_reps: row.actual_reps,
      actual_weight: row.actual_weight,
      status: row.status as WorkoutSetStatus,
    };
  }

  create(data: CreateWorkoutSetDTO): WorkoutSet {
    const stmt = this.db.prepare(`
      INSERT INTO workout_sets (workout_id, exercise_id, set_number, target_reps, target_weight)
      VALUES (?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      data.workout_id,
      data.exercise_id,
      data.set_number,
      data.target_reps,
      data.target_weight
    );

    const workoutSet = this.findById(result.lastInsertRowid as number);
    if (!workoutSet) {
      throw new Error('Failed to retrieve newly created workout set');
    }
    return workoutSet;
  }

  findById(id: number): WorkoutSet | null {
    const stmt = this.db.prepare('SELECT * FROM workout_sets WHERE id = ?');
    const row = stmt.get(id) as WorkoutSetRow | undefined;
    return row ? this.rowToWorkoutSet(row) : null;
  }

  findByWorkoutId(workoutId: number): WorkoutSet[] {
    const stmt = this.db.prepare(
      'SELECT * FROM workout_sets WHERE workout_id = ? ORDER BY exercise_id, set_number'
    );
    const rows = stmt.all(workoutId) as WorkoutSetRow[];
    return rows.map((row) => this.rowToWorkoutSet(row));
  }

  findByWorkoutAndExercise(workoutId: number, exerciseId: number): WorkoutSet[] {
    const stmt = this.db.prepare(
      'SELECT * FROM workout_sets WHERE workout_id = ? AND exercise_id = ? ORDER BY set_number'
    );
    const rows = stmt.all(workoutId, exerciseId) as WorkoutSetRow[];
    return rows.map((row) => this.rowToWorkoutSet(row));
  }

  findByStatus(status: WorkoutSetStatus): WorkoutSet[] {
    const stmt = this.db.prepare('SELECT * FROM workout_sets WHERE status = ?');
    const rows = stmt.all(status) as WorkoutSetRow[];
    return rows.map((row) => this.rowToWorkoutSet(row));
  }

  findAll(): WorkoutSet[] {
    const stmt = this.db.prepare(
      'SELECT * FROM workout_sets ORDER BY workout_id, exercise_id, set_number'
    );
    const rows = stmt.all() as WorkoutSetRow[];
    return rows.map((row) => this.rowToWorkoutSet(row));
  }

  update(id: number, data: UpdateWorkoutSetDTO): WorkoutSet | null {
    const existing = this.findById(id);
    if (!existing) return null;

    const updates: string[] = [];
    const values: (string | number | null)[] = [];

    if (data.actual_reps !== undefined) {
      updates.push('actual_reps = ?');
      values.push(data.actual_reps);
    }

    if (data.actual_weight !== undefined) {
      updates.push('actual_weight = ?');
      values.push(data.actual_weight);
    }

    if (data.status !== undefined) {
      updates.push('status = ?');
      values.push(data.status);
    }

    if (data.target_reps !== undefined) {
      updates.push('target_reps = ?');
      values.push(data.target_reps);
    }

    if (data.target_weight !== undefined) {
      updates.push('target_weight = ?');
      values.push(data.target_weight);
    }

    if (updates.length === 0) return existing;

    values.push(id);

    const stmt = this.db.prepare(`
      UPDATE workout_sets SET ${updates.join(', ')} WHERE id = ?
    `);
    stmt.run(...values);

    return this.findById(id);
  }

  delete(id: number): boolean {
    const stmt = this.db.prepare('DELETE FROM workout_sets WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }
}
