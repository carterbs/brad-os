import type { Database } from 'better-sqlite3';
import type {
  Exercise,
  CreateExerciseDTO,
  UpdateExerciseDTO,
} from '@brad-os/shared';
import { BaseRepository } from './base.repository.js';

interface ExerciseRow {
  id: number;
  name: string;
  weight_increment: number;
  is_custom: number;
  created_at: string;
  updated_at: string;
}

export class ExerciseRepository extends BaseRepository<
  Exercise,
  CreateExerciseDTO,
  UpdateExerciseDTO
> {
  constructor(db: Database) {
    super(db, 'exercises');
  }

  private rowToExercise(row: ExerciseRow): Exercise {
    return {
      id: row.id,
      name: row.name,
      weight_increment: row.weight_increment,
      is_custom: row.is_custom === 1,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  create(data: CreateExerciseDTO): Exercise {
    const stmt = this.db.prepare(`
      INSERT INTO exercises (name, weight_increment, is_custom)
      VALUES (?, ?, ?)
    `);

    const result = stmt.run(
      data.name,
      data.weight_increment ?? 5.0,
      (data.is_custom ?? false) ? 1 : 0
    );

    const exercise = this.findById(result.lastInsertRowid as number);
    if (!exercise) {
      throw new Error('Failed to retrieve newly created exercise');
    }
    return exercise;
  }

  findById(id: number): Exercise | null {
    const stmt = this.db.prepare('SELECT * FROM exercises WHERE id = ?');
    const row = stmt.get(id) as ExerciseRow | undefined;
    return row ? this.rowToExercise(row) : null;
  }

  findByName(name: string): Exercise | null {
    const stmt = this.db.prepare('SELECT * FROM exercises WHERE name = ?');
    const row = stmt.get(name) as ExerciseRow | undefined;
    return row ? this.rowToExercise(row) : null;
  }

  findAll(): Exercise[] {
    const stmt = this.db.prepare('SELECT * FROM exercises ORDER BY name');
    const rows = stmt.all() as ExerciseRow[];
    return rows.map((row) => this.rowToExercise(row));
  }

  findDefaultExercises(): Exercise[] {
    const stmt = this.db.prepare(
      'SELECT * FROM exercises WHERE is_custom = 0 ORDER BY name'
    );
    const rows = stmt.all() as ExerciseRow[];
    return rows.map((row) => this.rowToExercise(row));
  }

  findCustomExercises(): Exercise[] {
    const stmt = this.db.prepare(
      'SELECT * FROM exercises WHERE is_custom = 1 ORDER BY name'
    );
    const rows = stmt.all() as ExerciseRow[];
    return rows.map((row) => this.rowToExercise(row));
  }

  update(id: number, data: UpdateExerciseDTO): Exercise | null {
    const existing = this.findById(id);
    if (!existing) return null;

    const updates: string[] = [];
    const values: (string | number)[] = [];

    if (data.name !== undefined) {
      updates.push('name = ?');
      values.push(data.name);
    }

    if (data.weight_increment !== undefined) {
      updates.push('weight_increment = ?');
      values.push(data.weight_increment);
    }

    if (updates.length === 0) return existing;

    updates.push('updated_at = ?');
    values.push(this.updateTimestamp());
    values.push(id);

    const stmt = this.db.prepare(`
      UPDATE exercises SET ${updates.join(', ')} WHERE id = ?
    `);
    stmt.run(...values);

    return this.findById(id);
  }

  delete(id: number): boolean {
    const stmt = this.db.prepare('DELETE FROM exercises WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Check if exercise is referenced by any plan_day_exercises
   */
  isInUse(id: number): boolean {
    const stmt = this.db.prepare(
      'SELECT COUNT(*) as count FROM plan_day_exercises WHERE exercise_id = ?'
    );
    const result = stmt.get(id) as { count: number };
    return result.count > 0;
  }
}
