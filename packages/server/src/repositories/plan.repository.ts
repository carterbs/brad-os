import type { Database } from 'better-sqlite3';
import type { Plan, CreatePlanDTO, UpdatePlanDTO } from '@brad-os/shared';
import { BaseRepository } from './base.repository.js';

interface PlanRow {
  id: number;
  name: string;
  duration_weeks: number;
  created_at: string;
  updated_at: string;
}

export class PlanRepository extends BaseRepository<
  Plan,
  CreatePlanDTO,
  UpdatePlanDTO
> {
  constructor(db: Database) {
    super(db, 'plans');
  }

  private rowToPlan(row: PlanRow): Plan {
    return {
      id: row.id,
      name: row.name,
      duration_weeks: row.duration_weeks,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  create(data: CreatePlanDTO): Plan {
    const stmt = this.db.prepare(`
      INSERT INTO plans (name, duration_weeks)
      VALUES (?, ?)
    `);

    const result = stmt.run(data.name, data.duration_weeks ?? 6);

    const plan = this.findById(result.lastInsertRowid as number);
    if (!plan) {
      throw new Error('Failed to retrieve newly created plan');
    }
    return plan;
  }

  findById(id: number): Plan | null {
    const stmt = this.db.prepare('SELECT * FROM plans WHERE id = ?');
    const row = stmt.get(id) as PlanRow | undefined;
    return row ? this.rowToPlan(row) : null;
  }

  findAll(): Plan[] {
    const stmt = this.db.prepare('SELECT * FROM plans ORDER BY name');
    const rows = stmt.all() as PlanRow[];
    return rows.map((row) => this.rowToPlan(row));
  }

  update(id: number, data: UpdatePlanDTO): Plan | null {
    const existing = this.findById(id);
    if (!existing) return null;

    const updates: string[] = [];
    const values: (string | number)[] = [];

    if (data.name !== undefined) {
      updates.push('name = ?');
      values.push(data.name);
    }

    if (data.duration_weeks !== undefined) {
      updates.push('duration_weeks = ?');
      values.push(data.duration_weeks);
    }

    if (updates.length === 0) return existing;

    updates.push('updated_at = ?');
    values.push(this.updateTimestamp());
    values.push(id);

    const stmt = this.db.prepare(`
      UPDATE plans SET ${updates.join(', ')} WHERE id = ?
    `);
    stmt.run(...values);

    return this.findById(id);
  }

  delete(id: number): boolean {
    const stmt = this.db.prepare('DELETE FROM plans WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Check if plan is referenced by any mesocycles
   */
  isInUse(id: number): boolean {
    const stmt = this.db.prepare(
      'SELECT COUNT(*) as count FROM mesocycles WHERE plan_id = ?'
    );
    const result = stmt.get(id) as { count: number };
    return result.count > 0;
  }
}
