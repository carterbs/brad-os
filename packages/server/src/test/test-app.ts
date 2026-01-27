import express, { type Express, type Request, type Response } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import { APP_VERSION, createSuccessResponse } from '@brad-os/shared';
import { apiRouter } from '../routes/index.js';
import { errorHandler } from '../middleware/error-handler.js';
import { seedDatabase } from '../db/seed.js';
import { setTestDatabase } from '../db/index.js';
import { resetRepositories } from '../repositories/index.js';
import { resetServices } from '../services/index.js';
import {
  initializeFirestore,
  resetFirebase,
  getCollectionPrefix,
} from '../firebase/index.js';

export interface TestContext {
  app: Express;
  db: Firestore;
}

/**
 * Initialize Firebase for testing.
 * Uses environment-based collection prefixes to isolate test data.
 */
export async function createTestDatabase(withSeeds = true): Promise<Firestore> {
  // Reset any existing Firebase state
  resetFirebase();

  // Initialize Firestore (uses environment variables for config)
  const db = initializeFirestore();

  if (withSeeds) {
    await seedDatabase(db);
  }

  return db;
}

/**
 * Clean up test collections.
 * This deletes all documents in the prefixed collections.
 */
export async function cleanupTestCollections(db: Firestore): Promise<void> {
  const prefix = getCollectionPrefix();
  const collections = [
    'exercises',
    'plans',
    'plan_days',
    'plan_day_exercises',
    'mesocycles',
    'workouts',
    'workout_sets',
    'stretch_sessions',
    'meditation_sessions',
  ];

  for (const collectionName of collections) {
    const prefixedName = `${prefix}${collectionName}`;
    const snapshot = await db.collection(prefixedName).get();
    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    if (!snapshot.empty) {
      await batch.commit();
    }
  }
}

export async function setupTestApp(withSeeds = true): Promise<TestContext> {
  // Reset repository and service singletons to ensure fresh instances
  resetRepositories();
  resetServices();

  // Create and set test database
  const db = await createTestDatabase(withSeeds);
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

export async function teardownTestApp(ctx: TestContext): Promise<void> {
  // Clean up test data
  await cleanupTestCollections(ctx.db);

  // Reset the test database
  setTestDatabase(null);
  resetRepositories();
  resetServices();

  // Reset Firebase state
  resetFirebase();
}
