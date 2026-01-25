import type { Database } from 'better-sqlite3';
import type {
  PlanDay,
  CreatePlanDayDTO,
  UpdatePlanDayDTO,
} from '@brad-os/shared';
import { BaseRepository } from './base.repository.js';

interface PlanDayRow {
  id: number;
  plan_id: number;
  day_of_week: number;
  name: string;
  sort_order: number;
}

export class PlanDayRepository extends BaseRepository<
  PlanDay,
  CreatePlanDayDTO,
  UpdatePlanDayDTO
> {
  constructor(db: Database) {
    super(db, 'plan_days');
  }

  private rowToPlanDay(row: PlanDayRow): PlanDay {
    return {
      id: row.id,
      plan_id: row.plan_id,
      day_of_week: row.day_of_week as PlanDay['day_of_week'],
      name: row.name,
      sort_order: row.sort_order,
    };
  }

  create(data: CreatePlanDayDTO): PlanDay {
    const stmt = this.db.prepare(`
      INSERT INTO plan_days (plan_id, day_of_week, name, sort_order)
      VALUES (?, ?, ?, ?)
    `);

    const result = stmt.run(
      data.plan_id,
      data.day_of_week,
      data.name,
      data.sort_order
    );

    const planDay = this.findById(result.lastInsertRowid as number);
    if (!planDay) {
      throw new Error('Failed to retrieve newly created plan day');
    }
    return planDay;
  }

  findById(id: number): PlanDay | null {
    const stmt = this.db.prepare('SELECT * FROM plan_days WHERE id = ?');
    const row = stmt.get(id) as PlanDayRow | undefined;
    return row ? this.rowToPlanDay(row) : null;
  }

  findByPlanId(planId: number): PlanDay[] {
    const stmt = this.db.prepare(
      'SELECT * FROM plan_days WHERE plan_id = ? ORDER BY sort_order'
    );
    const rows = stmt.all(planId) as PlanDayRow[];
    return rows.map((row) => this.rowToPlanDay(row));
  }

  findAll(): PlanDay[] {
    const stmt = this.db.prepare(
      'SELECT * FROM plan_days ORDER BY plan_id, sort_order'
    );
    const rows = stmt.all() as PlanDayRow[];
    return rows.map((row) => this.rowToPlanDay(row));
  }

  update(id: number, data: UpdatePlanDayDTO): PlanDay | null {
    const existing = this.findById(id);
    if (!existing) return null;

    const updates: string[] = [];
    const values: (string | number)[] = [];

    if (data.day_of_week !== undefined) {
      updates.push('day_of_week = ?');
      values.push(data.day_of_week);
    }

    if (data.name !== undefined) {
      updates.push('name = ?');
      values.push(data.name);
    }

    if (data.sort_order !== undefined) {
      updates.push('sort_order = ?');
      values.push(data.sort_order);
    }

    if (updates.length === 0) return existing;

    values.push(id);

    const stmt = this.db.prepare(`
      UPDATE plan_days SET ${updates.join(', ')} WHERE id = ?
    `);
    stmt.run(...values);

    return this.findById(id);
  }

  delete(id: number): boolean {
    const stmt = this.db.prepare('DELETE FROM plan_days WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }
}
