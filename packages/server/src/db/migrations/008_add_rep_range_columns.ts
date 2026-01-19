import type { Database } from 'better-sqlite3';
import type { Migration } from '../migrator.js';

export const migration: Migration = {
  version: 8,
  name: 'add_rep_range_columns',

  up(db: Database): void {
    // Add min_reps and max_reps columns to plan_day_exercises
    // These define the rep range for the hypertrophy-based progressive overload algorithm
    // Default: min_reps = 8, max_reps = 12 (standard hypertrophy range)
    db.exec(`
      ALTER TABLE plan_day_exercises ADD COLUMN min_reps INTEGER NOT NULL DEFAULT 8;
      ALTER TABLE plan_day_exercises ADD COLUMN max_reps INTEGER NOT NULL DEFAULT 12;
    `);
  },

  down(db: Database): void {
    // SQLite doesn't support DROP COLUMN in older versions, but better-sqlite3 with newer SQLite does
    db.exec(`
      ALTER TABLE plan_day_exercises DROP COLUMN min_reps;
      ALTER TABLE plan_day_exercises DROP COLUMN max_reps;
    `);
  },
};
