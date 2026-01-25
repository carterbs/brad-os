import type { Database } from 'better-sqlite3';
import type {
  Mesocycle,
  CreateMesocycleDTO,
  UpdateMesocycleDTO,
  MesocycleStatus,
} from '@brad-os/shared';
import { BaseRepository } from './base.repository.js';

interface MesocycleRow {
  id: number;
  plan_id: number;
  start_date: string;
  current_week: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export class MesocycleRepository extends BaseRepository<
  Mesocycle,
  CreateMesocycleDTO,
  UpdateMesocycleDTO
> {
  constructor(db: Database) {
    super(db, 'mesocycles');
  }

  private rowToMesocycle(row: MesocycleRow): Mesocycle {
    return {
      id: row.id,
      plan_id: row.plan_id,
      start_date: row.start_date,
      current_week: row.current_week,
      status: row.status as MesocycleStatus,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  create(data: CreateMesocycleDTO): Mesocycle {
    const stmt = this.db.prepare(`
      INSERT INTO mesocycles (plan_id, start_date)
      VALUES (?, ?)
    `);

    const result = stmt.run(data.plan_id, data.start_date);

    const mesocycle = this.findById(result.lastInsertRowid as number);
    if (!mesocycle) {
      throw new Error('Failed to retrieve newly created mesocycle');
    }
    return mesocycle;
  }

  findById(id: number): Mesocycle | null {
    const stmt = this.db.prepare('SELECT * FROM mesocycles WHERE id = ?');
    const row = stmt.get(id) as MesocycleRow | undefined;
    return row ? this.rowToMesocycle(row) : null;
  }

  findByPlanId(planId: number): Mesocycle[] {
    const stmt = this.db.prepare(
      'SELECT * FROM mesocycles WHERE plan_id = ? ORDER BY start_date DESC'
    );
    const rows = stmt.all(planId) as MesocycleRow[];
    return rows.map((row) => this.rowToMesocycle(row));
  }

  findActive(): Mesocycle[] {
    const stmt = this.db.prepare(
      "SELECT * FROM mesocycles WHERE status = 'active' ORDER BY start_date DESC"
    );
    const rows = stmt.all() as MesocycleRow[];
    return rows.map((row) => this.rowToMesocycle(row));
  }

  findAll(): Mesocycle[] {
    const stmt = this.db.prepare(
      'SELECT * FROM mesocycles ORDER BY start_date DESC'
    );
    const rows = stmt.all() as MesocycleRow[];
    return rows.map((row) => this.rowToMesocycle(row));
  }

  update(id: number, data: UpdateMesocycleDTO): Mesocycle | null {
    const existing = this.findById(id);
    if (!existing) return null;

    const updates: string[] = [];
    const values: (string | number)[] = [];

    if (data.current_week !== undefined) {
      updates.push('current_week = ?');
      values.push(data.current_week);
    }

    if (data.status !== undefined) {
      updates.push('status = ?');
      values.push(data.status);
    }

    if (updates.length === 0) return existing;

    updates.push('updated_at = ?');
    values.push(this.updateTimestamp());
    values.push(id);

    const stmt = this.db.prepare(`
      UPDATE mesocycles SET ${updates.join(', ')} WHERE id = ?
    `);
    stmt.run(...values);

    return this.findById(id);
  }

  delete(id: number): boolean {
    const stmt = this.db.prepare('DELETE FROM mesocycles WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }
}
