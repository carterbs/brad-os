import { Router, type Request, type Response, type NextFunction } from 'express';
import { type ApiResponse } from '@brad-os/shared';
import { getDatabase, seedDefaultExercises } from '../db/index.js';
import { getCollectionName } from '../firebase/index.js';

export const testRouter = Router();

// Only enable test routes in non-production environments
const isProduction = process.env['NODE_ENV'] === 'production';
const isTest = process.env['NODE_ENV'] === 'test';

/**
 * Logs a warning if test endpoints are called without NODE_ENV=test.
 * This helps catch accidental database pollution during development.
 */
function warnIfNotTestEnv(endpoint: string): void {
  if (!isTest) {
    console.warn('');
    console.warn('⚠️  WARNING: Test endpoint called on development database!');
    console.warn(`   Endpoint: ${endpoint}`);
    console.warn('   This will modify your development data.');
    console.warn('   Run E2E tests with NODE_ENV=test to use isolated test database.');
    console.warn('');
  }
}

if (isProduction) {
  // In production, return 404 for all test routes
  testRouter.all('/*', (_req: Request, res: Response): void => {
    res.status(404).json({
      success: false,
      error: 'Not found',
    });
  });
} else {
  /**
   * Helper to delete all documents in a Firestore collection.
   */
  async function deleteCollection(
    db: FirebaseFirestore.Firestore,
    collectionName: string
  ): Promise<void> {
    const collectionRef = db.collection(collectionName);
    const snapshot = await collectionRef.get();

    if (snapshot.empty) {
      return;
    }

    // Delete in batches of 500 (Firestore limit)
    const batchSize = 500;
    const docs = snapshot.docs;

    for (let i = 0; i < docs.length; i += batchSize) {
      const batch = db.batch();
      const batchDocs = docs.slice(i, i + batchSize);

      for (const doc of batchDocs) {
        batch.delete(doc.ref);
      }

      await batch.commit();
    }
  }

  /**
   * POST /api/test/reset
   *
   * Resets the database to a clean state for E2E testing.
   * Clears all collections and re-seeds default exercises.
   */
  testRouter.post(
    '/reset',
    async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        warnIfNotTestEnv('/api/test/reset');
        const db = getDatabase();

        // Collections to clear (order doesn't matter in Firestore)
        const collectionsToClear = [
          'stretch_sessions',
          'workout_sets',
          'workouts',
          'mesocycles',
          'plan_day_exercises',
          'plan_days',
          'plans',
          'exercises',
        ];

        // Clear all collections (using prefixed names)
        for (const collection of collectionsToClear) {
          await deleteCollection(db, getCollectionName(collection));
        }

        // Re-seed default exercises
        await seedDefaultExercises(db);

        const response: ApiResponse<{ message: string }> = {
          success: true,
          data: { message: 'Database reset successfully' },
        };
        res.json(response);
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * GET /api/test/health
   *
   * Health check endpoint for test environment.
   */
  testRouter.get(
    '/health',
    (_req: Request, res: Response): void => {
      const response: ApiResponse<{ status: string; env: string }> = {
        success: true,
        data: {
          status: 'ok',
          env: process.env['NODE_ENV'] ?? 'development',
        },
      };
      res.json(response);
    }
  );
}
