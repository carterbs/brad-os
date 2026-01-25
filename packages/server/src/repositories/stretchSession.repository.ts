import type { Database } from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type {
  StretchSessionRecord,
  CreateStretchSessionRequest,
  CompletedStretch,
} from '@brad-os/shared';

/**
 * Convert a local date boundary to a UTC timestamp.
 * @param localDate - Local date in YYYY-MM-DD format
 * @param isEndOfDay - If true, returns end of day (23:59:59.999), otherwise start of day (00:00:00.000)
 * @param timezoneOffsetMinutes - Timezone offset in minutes from Date.getTimezoneOffset()
 *                                 (positive for west of UTC, negative for east)
 * @returns UTC timestamp in ISO format
 */
function localDateToUtcBoundary(
  localDate: string,
  isEndOfDay: boolean,
  timezoneOffsetMinutes: number
): string {
  // Parse the local date components (format: YYYY-MM-DD)
  const parts = localDate.split('-').map(Number);
  const year = parts[0] ?? 0;
  const month = parts[1] ?? 1;
  const day = parts[2] ?? 1;

  // Create a date representing the local time boundary
  // For start of day: 00:00:00.000 local time
  // For end of day: 23:59:59.999 local time
  const localMs = Date.UTC(
    year,
    month - 1,
    day,
    isEndOfDay ? 23 : 0,
    isEndOfDay ? 59 : 0,
    isEndOfDay ? 59 : 0,
    isEndOfDay ? 999 : 0
  );

  // Convert local time to UTC by adding the offset
  // utcTime = localTime + (offsetMinutes * 60 * 1000)
  const utcMs = localMs + timezoneOffsetMinutes * 60 * 1000;

  return new Date(utcMs).toISOString();
}

interface StretchSessionRow {
  id: string;
  completed_at: string;
  total_duration_seconds: number;
  regions_completed: number;
  regions_skipped: number;
  stretches: string;
}

export class StretchSessionRepository {
  constructor(private db: Database) {}

  private rowToRecord(row: StretchSessionRow): StretchSessionRecord {
    return {
      id: row.id,
      completedAt: row.completed_at,
      totalDurationSeconds: row.total_duration_seconds,
      regionsCompleted: row.regions_completed,
      regionsSkipped: row.regions_skipped,
      stretches: JSON.parse(row.stretches) as CompletedStretch[],
    };
  }

  /**
   * Create a new stretch session record.
   */
  create(data: CreateStretchSessionRequest): StretchSessionRecord {
    const id = randomUUID();

    const stmt = this.db.prepare(`
      INSERT INTO stretch_sessions (
        id, completed_at, total_duration_seconds,
        regions_completed, regions_skipped, stretches
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      data.completedAt,
      data.totalDurationSeconds,
      data.regionsCompleted,
      data.regionsSkipped,
      JSON.stringify(data.stretches)
    );

    const record = this.findById(id);
    if (!record) {
      throw new Error('Failed to retrieve newly created stretch session');
    }
    return record;
  }

  /**
   * Find a stretch session by ID.
   */
  findById(id: string): StretchSessionRecord | null {
    const stmt = this.db.prepare('SELECT * FROM stretch_sessions WHERE id = ?');
    const row = stmt.get(id) as StretchSessionRow | undefined;
    return row ? this.rowToRecord(row) : null;
  }

  /**
   * Get the most recent stretch session.
   */
  getLatest(): StretchSessionRecord | null {
    const stmt = this.db.prepare(
      'SELECT * FROM stretch_sessions ORDER BY completed_at DESC LIMIT 1'
    );
    const row = stmt.get() as StretchSessionRow | undefined;
    return row ? this.rowToRecord(row) : null;
  }

  /**
   * Get all stretch sessions, most recent first.
   */
  getAll(): StretchSessionRecord[] {
    const stmt = this.db.prepare(
      'SELECT * FROM stretch_sessions ORDER BY completed_at DESC'
    );
    const rows = stmt.all() as StretchSessionRow[];
    return rows.map((row) => this.rowToRecord(row));
  }

  /**
   * Delete a stretch session by ID.
   */
  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM stretch_sessions WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Find stretch sessions where completedAt falls within the date range.
   * Date range is inclusive of both start and end dates in the user's local timezone.
   * @param startDate - Start date in YYYY-MM-DD format (local date)
   * @param endDate - End date in YYYY-MM-DD format (local date)
   * @param timezoneOffset - Timezone offset in minutes from Date.getTimezoneOffset()
   *                         (positive for west of UTC, negative for east). Defaults to 0 (UTC).
   */
  findInDateRange(
    startDate: string,
    endDate: string,
    timezoneOffset: number = 0
  ): StretchSessionRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM stretch_sessions
      WHERE completed_at >= ?
        AND completed_at <= ?
      ORDER BY completed_at ASC
    `);
    // Convert local date boundaries to UTC timestamps
    const startTimestamp = localDateToUtcBoundary(startDate, false, timezoneOffset);
    const endTimestamp = localDateToUtcBoundary(endDate, true, timezoneOffset);
    const rows = stmt.all(startTimestamp, endTimestamp) as StretchSessionRow[];
    return rows.map((row) => this.rowToRecord(row));
  }
}
