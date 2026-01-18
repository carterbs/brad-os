import { Router, type Request, type Response, type NextFunction } from 'express';
import { type ApiResponse } from '@lifting/shared';
import { getDatabase, seedDefaultExercises } from '../db/index.js';

export const testRouter = Router();

// Only enable test routes in non-production environments
const isProduction = process.env['NODE_ENV'] === 'production';

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
   * POST /api/test/reset
   *
   * Resets the database to a clean state for E2E testing.
   * Clears all tables except _migrations and re-seeds default exercises.
   */
  testRouter.post(
    '/reset',
    (_req: Request, res: Response, next: NextFunction): void => {
      try {
        const db = getDatabase();

        // Tables to clear (in order to respect foreign key constraints)
        const tablesToClear = [
          'workout_sets',
          'workouts',
          'mesocycles',
          'plan_day_exercises',
          'plan_days',
          'plans',
          'exercises',
        ];

        // Clear all tables
        for (const table of tablesToClear) {
          db.prepare(`DELETE FROM ${table}`).run();
        }

        // Reset auto-increment counters
        for (const table of tablesToClear) {
          db.prepare(
            `DELETE FROM sqlite_sequence WHERE name = ?`
          ).run(table);
        }

        // Re-seed default exercises
        seedDefaultExercises(db);

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
