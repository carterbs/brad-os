import type { Database } from 'better-sqlite3';
import type { Migration } from '../migrator.js';

export const migration: Migration = {
  version: 9,
  name: 'create_stretch_sessions',

  up(db: Database): void {
    db.exec(`
      CREATE TABLE stretch_sessions (
        id TEXT PRIMARY KEY,
        completed_at TEXT NOT NULL,
        total_duration_seconds INTEGER NOT NULL,
        regions_completed INTEGER NOT NULL,
        regions_skipped INTEGER NOT NULL,
        stretches TEXT NOT NULL
      );

      CREATE INDEX idx_stretch_sessions_completed_at ON stretch_sessions(completed_at DESC);
    `);
  },

  down(db: Database): void {
    db.exec('DROP TABLE IF EXISTS stretch_sessions');
  },
};
