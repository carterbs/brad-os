import type { Database } from 'better-sqlite3';
import type {
  PlanDayExercise,
  CreatePlanDayExerciseDTO,
  UpdatePlanDayExerciseDTO,
} from '@lifting/shared';
import { BaseRepository } from './base.repository.js';

interface PlanDayExerciseRow {
  id: number;
  plan_day_id: number;
  exercise_id: number;
  sets: number;
  reps: number;
  weight: number;
  rest_seconds: number;
  sort_order: number;
  min_reps: number;
  max_reps: number;
}

export class PlanDayExerciseRepository extends BaseRepository<
  PlanDayExercise,
  CreatePlanDayExerciseDTO,
  UpdatePlanDayExerciseDTO
> {
  constructor(db: Database) {
    super(db, 'plan_day_exercises');
  }

  private rowToPlanDayExercise(row: PlanDayExerciseRow): PlanDayExercise {
    return {
      id: row.id,
      plan_day_id: row.plan_day_id,
      exercise_id: row.exercise_id,
      sets: row.sets,
      reps: row.reps,
      weight: row.weight,
      rest_seconds: row.rest_seconds,
      sort_order: row.sort_order,
      min_reps: row.min_reps,
      max_reps: row.max_reps,
    };
  }

  create(data: CreatePlanDayExerciseDTO): PlanDayExercise {
    const stmt = this.db.prepare(`
      INSERT INTO plan_day_exercises (plan_day_id, exercise_id, sets, reps, weight, rest_seconds, sort_order, min_reps, max_reps)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      data.plan_day_id,
      data.exercise_id,
      data.sets ?? 2,
      data.reps ?? 8,
      data.weight ?? 30.0,
      data.rest_seconds ?? 60,
      data.sort_order,
      data.min_reps ?? 8,
      data.max_reps ?? 12
    );

    const planDayExercise = this.findById(result.lastInsertRowid as number);
    if (!planDayExercise) {
      throw new Error('Failed to retrieve newly created plan day exercise');
    }
    return planDayExercise;
  }

  findById(id: number): PlanDayExercise | null {
    const stmt = this.db.prepare(
      'SELECT * FROM plan_day_exercises WHERE id = ?'
    );
    const row = stmt.get(id) as PlanDayExerciseRow | undefined;
    return row ? this.rowToPlanDayExercise(row) : null;
  }

  findByPlanDayId(planDayId: number): PlanDayExercise[] {
    const stmt = this.db.prepare(
      'SELECT * FROM plan_day_exercises WHERE plan_day_id = ? ORDER BY sort_order'
    );
    const rows = stmt.all(planDayId) as PlanDayExerciseRow[];
    return rows.map((row) => this.rowToPlanDayExercise(row));
  }

  findAll(): PlanDayExercise[] {
    const stmt = this.db.prepare(
      'SELECT * FROM plan_day_exercises ORDER BY plan_day_id, sort_order'
    );
    const rows = stmt.all() as PlanDayExerciseRow[];
    return rows.map((row) => this.rowToPlanDayExercise(row));
  }

  update(id: number, data: UpdatePlanDayExerciseDTO): PlanDayExercise | null {
    const existing = this.findById(id);
    if (!existing) return null;

    const updates: string[] = [];
    const values: number[] = [];

    if (data.sets !== undefined) {
      updates.push('sets = ?');
      values.push(data.sets);
    }

    if (data.reps !== undefined) {
      updates.push('reps = ?');
      values.push(data.reps);
    }

    if (data.weight !== undefined) {
      updates.push('weight = ?');
      values.push(data.weight);
    }

    if (data.rest_seconds !== undefined) {
      updates.push('rest_seconds = ?');
      values.push(data.rest_seconds);
    }

    if (data.sort_order !== undefined) {
      updates.push('sort_order = ?');
      values.push(data.sort_order);
    }

    if (data.min_reps !== undefined) {
      updates.push('min_reps = ?');
      values.push(data.min_reps);
    }

    if (data.max_reps !== undefined) {
      updates.push('max_reps = ?');
      values.push(data.max_reps);
    }

    if (updates.length === 0) return existing;

    values.push(id);

    const stmt = this.db.prepare(`
      UPDATE plan_day_exercises SET ${updates.join(', ')} WHERE id = ?
    `);
    stmt.run(...values);

    return this.findById(id);
  }

  delete(id: number): boolean {
    const stmt = this.db.prepare('DELETE FROM plan_day_exercises WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }
}
