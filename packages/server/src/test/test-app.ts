import express, { type Express, type Request, type Response } from 'express';
import Database from 'better-sqlite3';
import { APP_VERSION, createSuccessResponse } from '@brad-os/shared';
import { apiRouter } from '../routes/index.js';
import { errorHandler } from '../middleware/error-handler.js';
import { Migrator } from '../db/migrator.js';
import { migrations } from '../db/migrations/index.js';
import { seedDefaultExercises } from '../db/seed.js';
import { setTestDatabase } from '../db/index.js';
import { resetRepositories } from '../repositories/index.js';
import { resetServices } from '../services/index.js';

export interface TestContext {
  app: Express;
  db: Database.Database;
}

export function createTestDatabase(withSeeds = true): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');

  const migrator = new Migrator(db, migrations);
  migrator.up();

  if (withSeeds) {
    seedDefaultExercises(db);
  }

  return db;
}

export function setupTestApp(withSeeds = true): TestContext {
  // Reset repository and service singletons to ensure fresh instances
  resetRepositories();
  resetServices();

  // Create and set test database
  const db = createTestDatabase(withSeeds);
  setTestDatabase(db);

  // Create Express app
  const app: Express = express();

  // Body parsing
  app.use(express.json());

  // API routes
  app.use('/api', apiRouter);

  // Root endpoint
  app.get('/', (_req: Request, res: Response): void => {
    res.json(
      createSuccessResponse({
        message: 'Lifting API',
        version: APP_VERSION,
      })
    );
  });

  // Error handling (must be last)
  app.use(errorHandler);

  return { app, db };
}

export function teardownTestApp(ctx: TestContext): void {
  // Reset the test database
  setTestDatabase(null);
  resetRepositories();
  resetServices();

  // Close the database connection
  ctx.db.close();
}
