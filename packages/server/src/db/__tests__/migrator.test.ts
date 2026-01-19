import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { Migrator, type Migration } from '../migrator.js';
import { migrations } from '../migrations/index.js';

describe('Migrator', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
  });

  afterEach(() => {
    db.close();
  });

  describe('constructor', () => {
    it('should sort migrations by version', () => {
      const unsortedMigrations: Migration[] = [
        {
          version: 3,
          name: 'third',
          up: (): void => {},
          down: (): void => {},
        },
        {
          version: 1,
          name: 'first',
          up: (): void => {},
          down: (): void => {},
        },
        {
          version: 2,
          name: 'second',
          up: (): void => {},
          down: (): void => {},
        },
      ];

      const migrator = new Migrator(db, unsortedMigrations);
      const pendingMigrations = migrator.getPendingMigrations();
      expect(pendingMigrations[0]?.version).toBe(1);
    });
  });

  describe('getCurrentVersion', () => {
    it('should return 0 when no migrations applied', () => {
      const migrator = new Migrator(db, migrations);
      expect(migrator.getCurrentVersion()).toBe(0);
    });

    it('should return the highest applied migration version', () => {
      const migrator = new Migrator(db, migrations);
      migrator.up();
      expect(migrator.getCurrentVersion()).toBe(8);
    });
  });

  describe('getPendingMigrations', () => {
    it('should return all migrations when none applied', () => {
      const migrator = new Migrator(db, migrations);
      expect(migrator.getPendingMigrations()).toHaveLength(8);
    });

    it('should return empty array when all migrations applied', () => {
      const migrator = new Migrator(db, migrations);
      migrator.up();
      expect(migrator.getPendingMigrations()).toHaveLength(0);
    });
  });

  describe('up', () => {
    it('should apply all pending migrations', () => {
      const migrator = new Migrator(db, migrations);
      migrator.up();

      // Check that all tables exist by querying each one
      const exercisesTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='exercises'").get();
      const plansTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='plans'").get();
      const planDaysTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='plan_days'").get();
      const planDayExercisesTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='plan_day_exercises'").get();
      const mesocyclesTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='mesocycles'").get();
      const workoutsTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='workouts'").get();
      const workoutSetsTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='workout_sets'").get();

      expect(exercisesTable).toBeDefined();
      expect(plansTable).toBeDefined();
      expect(planDaysTable).toBeDefined();
      expect(planDayExercisesTable).toBeDefined();
      expect(mesocyclesTable).toBeDefined();
      expect(workoutsTable).toBeDefined();
      expect(workoutSetsTable).toBeDefined();
    });

    it('should track applied migrations', () => {
      const migrator = new Migrator(db, migrations);
      migrator.up();

      const appliedMigrations = db
        .prepare('SELECT * FROM _migrations ORDER BY version')
        .all() as { version: number; name: string }[];

      expect(appliedMigrations).toHaveLength(8);
      expect(appliedMigrations[0].name).toBe('create_exercises');
      expect(appliedMigrations[6].name).toBe('create_workout_sets');
    });

    it('should be idempotent', () => {
      const migrator = new Migrator(db, migrations);
      migrator.up();
      migrator.up();

      const appliedMigrations = db
        .prepare('SELECT * FROM _migrations')
        .all() as { version: number }[];

      expect(appliedMigrations).toHaveLength(8);
    });
  });

  describe('down', () => {
    it('should rollback the last migration', () => {
      const migrator = new Migrator(db, migrations);
      migrator.up();

      expect(migrator.getCurrentVersion()).toBe(8);

      migrator.down();

      expect(migrator.getCurrentVersion()).toBe(7);

      // Verify min_reps/max_reps columns are removed (migration 8 rolled back)
      const columns = db.prepare("PRAGMA table_info(plan_day_exercises)").all() as { name: string }[];
      const columnNames = columns.map((c) => c.name);
      expect(columnNames).not.toContain('min_reps');
      expect(columnNames).not.toContain('max_reps');
    });

    it('should do nothing when no migrations applied', () => {
      const migrator = new Migrator(db, migrations);
      migrator.down();
      expect(migrator.getCurrentVersion()).toBe(0);
    });
  });

  describe('reset', () => {
    it('should rollback all migrations', () => {
      const migrator = new Migrator(db, migrations);
      migrator.up();

      expect(migrator.getCurrentVersion()).toBe(8);

      migrator.reset();

      expect(migrator.getCurrentVersion()).toBe(0);

      // Verify _migrations table still exists
      const migrationsTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='_migrations'").get();
      expect(migrationsTable).toBeDefined();

      // Verify all content tables are dropped
      const exercisesTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='exercises'").get();
      const plansTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='plans'").get();
      expect(exercisesTable).toBeUndefined();
      expect(plansTable).toBeUndefined();
    });
  });
});
