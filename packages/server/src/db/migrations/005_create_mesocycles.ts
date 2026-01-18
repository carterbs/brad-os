import type { Database } from 'better-sqlite3';
import type { Migration } from '../migrator.js';

export const migration: Migration = {
  version: 5,
  name: 'create_mesocycles',

  up(db: Database): void {
    db.exec(`
      CREATE TABLE mesocycles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plan_id INTEGER NOT NULL,
        start_date TEXT NOT NULL,
        current_week INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'completed', 'cancelled')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE RESTRICT
      );

      CREATE INDEX idx_mesocycles_plan_id ON mesocycles(plan_id);
      CREATE INDEX idx_mesocycles_status ON mesocycles(status);
    `);
  },

  down(db: Database): void {
    db.exec('DROP TABLE IF EXISTS mesocycles');
  },
};
