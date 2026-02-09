/**
 * Health Sync Handlers
 *
 * Express app for syncing HealthKit data to Firebase.
 */

import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import { errorHandler } from '../middleware/error-handler.js';
import { stripPathPrefix } from '../middleware/strip-path-prefix.js';
import { requireAppCheck } from '../middleware/app-check.js';
import { asyncHandler } from '../middleware/async-handler.js';
import * as recoveryService from '../services/firestore-recovery.service.js';
import {
  syncHealthDataSchema,
  getRecoveryQuerySchema,
  bulkWeightSyncSchema,
} from '../shared.js';

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());
app.use(stripPathPrefix('health'));
app.use(requireAppCheck);

/**
 * Get user ID from request headers.
 * In production, this would come from Firebase Auth.
 */
function getUserId(req: Request): string {
  const userId = req.headers['x-user-id'];
  if (typeof userId === 'string' && userId.length > 0) {
    return userId;
  }
  return 'default-user';
}

// POST /health/sync
// Sync recovery, baseline, and weight data from iOS
app.post(
  '/sync',
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const userId = getUserId(req);

    // Validate request body
    const parseResult = syncHealthDataSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: parseResult.error.errors,
        },
      });
      return;
    }

    const { recovery, baseline, weight } = parseResult.data;

    // Upsert recovery snapshot
    await recoveryService.upsertRecoverySnapshot(userId, recovery);

    // Upsert baseline if provided
    let baselineUpdated = false;
    if (baseline) {
      await recoveryService.upsertRecoveryBaseline(userId, baseline);
      baselineUpdated = true;
    }

    // Add weight if provided
    let weightAdded = false;
    if (weight) {
      await recoveryService.addWeightEntry(userId, weight);
      weightAdded = true;
    }

    res.json({
      success: true,
      data: {
        synced: true,
        recoveryDate: recovery.date,
        baselineUpdated,
        weightAdded,
      },
    });
  })
);

// GET /health/recovery
// Get recovery snapshot (latest or by date)
app.get(
  '/recovery',
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const userId = getUserId(req);

    // Validate query parameters
    const parseResult = getRecoveryQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid query parameters',
          details: parseResult.error.errors,
        },
      });
      return;
    }

    const { date } = parseResult.data;

    let recovery;
    if (date !== undefined && date !== '') {
      recovery = await recoveryService.getRecoverySnapshot(userId, date);
    } else {
      recovery = await recoveryService.getLatestRecoverySnapshot(userId);
    }

    if (!recovery) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: date !== undefined && date !== ''
            ? `No recovery data for date: ${date}`
            : 'No recovery data available',
        },
      });
      return;
    }

    res.json({
      success: true,
      data: recovery,
    });
  })
);

// GET /health/recovery/history
// Get recovery history for the last N days
app.get(
  '/recovery/history',
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const userId = getUserId(req);
    const days = Math.min(Math.max(1, parseInt(String(req.query['days']), 10) || 7), 90);

    const history = await recoveryService.getRecoveryHistory(userId, days);

    res.json({
      success: true,
      data: history,
    });
  })
);

// GET /health/baseline
// Get recovery baseline
app.get(
  '/baseline',
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const userId = getUserId(req);

    const baseline = await recoveryService.getRecoveryBaseline(userId);

    if (!baseline) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'No baseline data available',
        },
      });
      return;
    }

    res.json({
      success: true,
      data: baseline,
    });
  })
);

// POST /health/weight/bulk
// Bulk sync weight entries from HealthKit
app.post(
  '/weight/bulk',
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const userId = getUserId(req);

    const parseResult = bulkWeightSyncSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: parseResult.error.errors,
        },
      });
      return;
    }

    const { weights } = parseResult.data;
    const added = await recoveryService.addWeightEntries(userId, weights);

    res.json({
      success: true,
      data: { added },
    });
  })
);

// GET /health/weight
// Get latest weight or weight history
app.get(
  '/weight',
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const userId = getUserId(req);
    const days = parseInt(String(req.query['days']), 10);

    if (days && days > 0) {
      const history = await recoveryService.getWeightHistory(userId, Math.min(days, 365));
      res.json({
        success: true,
        data: history,
      });
      return;
    }

    const weight = await recoveryService.getLatestWeight(userId);

    if (!weight) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'No weight data available',
        },
      });
      return;
    }

    res.json({
      success: true,
      data: weight,
    });
  })
);

// Error handler must be last
app.use(errorHandler);

export const healthSyncApp = app;
