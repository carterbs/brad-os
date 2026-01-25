import type { Database } from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type {
  MeditationSessionRecord,
  CreateMeditationSessionRequest,
} from '@lifting/shared';

interface MeditationSessionRow {
  id: string;
  completed_at: string;
  session_type: string;
  planned_duration_seconds: number;
  actual_duration_seconds: number;
  completed_fully: number;
}

interface MeditationStats {
  totalSessions: number;
  totalMinutes: number;
}

export class MeditationSessionRepository {
  constructor(private db: Database) {}

  private rowToRecord(row: MeditationSessionRow): MeditationSessionRecord {
    return {
      id: row.id,
      completedAt: row.completed_at,
      sessionType: row.session_type,
      plannedDurationSeconds: row.planned_duration_seconds,
      actualDurationSeconds: row.actual_duration_seconds,
      completedFully: row.completed_fully === 1,
    };
  }

  /**
   * Create a new meditation session record.
   */
  create(data: CreateMeditationSessionRequest): MeditationSessionRecord {
    const id = randomUUID();

    const stmt = this.db.prepare(`
      INSERT INTO meditation_sessions (
        id, completed_at, session_type,
        planned_duration_seconds, actual_duration_seconds, completed_fully
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      data.completedAt,
      data.sessionType,
      data.plannedDurationSeconds,
      data.actualDurationSeconds,
      data.completedFully ? 1 : 0
    );

    const record = this.findById(id);
    if (!record) {
      throw new Error('Failed to retrieve newly created meditation session');
    }
    return record;
  }

  /**
   * Find a meditation session by ID.
   */
  findById(id: string): MeditationSessionRecord | null {
    const stmt = this.db.prepare('SELECT * FROM meditation_sessions WHERE id = ?');
    const row = stmt.get(id) as MeditationSessionRow | undefined;
    return row ? this.rowToRecord(row) : null;
  }

  /**
   * Get the most recent meditation session.
   */
  getLatest(): MeditationSessionRecord | null {
    const stmt = this.db.prepare(
      'SELECT * FROM meditation_sessions ORDER BY completed_at DESC LIMIT 1'
    );
    const row = stmt.get() as MeditationSessionRow | undefined;
    return row ? this.rowToRecord(row) : null;
  }

  /**
   * Get all meditation sessions, most recent first.
   */
  getAll(): MeditationSessionRecord[] {
    const stmt = this.db.prepare(
      'SELECT * FROM meditation_sessions ORDER BY completed_at DESC'
    );
    const rows = stmt.all() as MeditationSessionRow[];
    return rows.map((row) => this.rowToRecord(row));
  }

  /**
   * Find meditation sessions within a date range.
   * @param startDate - Start date in YYYY-MM-DD format
   * @param endDate - End date in YYYY-MM-DD format
   * @returns Array of meditation sessions completed within the range
   */
  findInDateRange(startDate: string, endDate: string): MeditationSessionRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM meditation_sessions
      WHERE completed_at >= ?
        AND completed_at <= ?
      ORDER BY completed_at ASC
    `);
    const startTimestamp = `${startDate}T00:00:00.000Z`;
    const endTimestamp = `${endDate}T23:59:59.999Z`;
    const rows = stmt.all(startTimestamp, endTimestamp) as MeditationSessionRow[];
    return rows.map((row) => this.rowToRecord(row));
  }

  /**
   * Get aggregate statistics for meditation sessions.
   */
  getStats(): MeditationStats {
    const stmt = this.db.prepare(`
      SELECT
        COUNT(*) as totalSessions,
        COALESCE(SUM(actual_duration_seconds), 0) as totalSeconds
      FROM meditation_sessions
    `);
    const row = stmt.get() as { totalSessions: number; totalSeconds: number };

    return {
      totalSessions: row.totalSessions,
      totalMinutes: Math.floor(row.totalSeconds / 60),
    };
  }

  /**
   * Delete a meditation session by ID.
   */
  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM meditation_sessions WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }
}
