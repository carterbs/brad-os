/**
 * Health Sync Handlers
 *
 * Express app for syncing HealthKit data to Firebase.
 */

import { type Request, type Response, type NextFunction } from 'express';
import { info, warn } from 'firebase-functions/logger';
import { errorHandler } from '../middleware/error-handler.js';
import { createBaseApp } from '../middleware/create-resource-router.js';
import { asyncHandler } from '../middleware/async-handler.js';
import * as recoveryService from '../services/firestore-recovery.service.js';
import {
  syncHealthDataSchema,
  getRecoveryQuerySchema,
  bulkWeightSyncSchema,
  createWeightEntrySchema,
  bulkHRVSyncSchema,
  bulkRHRSyncSchema,
  bulkSleepSyncSchema,
} from '../shared.js';

const TAG = '[Health Sync]';

const app = createBaseApp('health-sync');

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
    const start = Date.now();
    const userId = getUserId(req);
    info(`${TAG} POST /sync`, { userId });

    // Validate request body
    const parseResult = syncHealthDataSchema.safeParse(req.body);
    if (!parseResult.success) {
      warn(`${TAG} POST /sync validation failed`, { userId, errors: parseResult.error.issues });
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: parseResult.error.issues,
        },
      });
      return;
    }

    const { recovery, baseline, weight } = parseResult.data;
    info(`${TAG} POST /sync payload`, {
      userId,
      recoveryDate: recovery.date,
      score: recovery.score,
      state: recovery.state,
      hrvMs: recovery.hrvMs,
      rhrBpm: recovery.rhrBpm,
      sleepHours: recovery.sleepHours,
      hasBaseline: Boolean(baseline),
      hasWeight: Boolean(weight),
      weightLbs: weight?.weightLbs,
    });

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

    info(`${TAG} POST /sync complete`, { userId, recoveryDate: recovery.date, baselineUpdated, weightAdded, elapsedMs: Date.now() - start });
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
    const dateParam = req.query['date'];
    info(`${TAG} GET /recovery`, { userId, date: dateParam });

    // Validate query parameters
    const parseResult = getRecoveryQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
      warn(`${TAG} GET /recovery validation failed`, { userId, errors: parseResult.error.issues });
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid query parameters',
          details: parseResult.error.issues,
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
      info(`${TAG} GET /recovery not found`, { userId, date });
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

    info(`${TAG} GET /recovery found`, { userId, recoveryDate: recovery.date, score: recovery.score, state: recovery.state });
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
    const parsed = parseInt(String(req.query['days']), 10);
    const days = Math.min(Math.max(1, Number.isNaN(parsed) ? 7 : parsed), 90);
    info(`${TAG} GET /recovery/history`, { userId, days });

    const history = await recoveryService.getRecoveryHistory(userId, days);

    info(`${TAG} GET /recovery/history result`, { userId, days, count: history.length });
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
    info(`${TAG} GET /baseline`, { userId });

    const baseline = await recoveryService.getRecoveryBaseline(userId);

    if (!baseline) {
      info(`${TAG} GET /baseline not found`, { userId });
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'No baseline data available',
        },
      });
      return;
    }

    info(`${TAG} GET /baseline found`, { userId, hrvMedian: baseline.hrvMedian, rhrMedian: baseline.rhrMedian, sampleCount: baseline.sampleCount });
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
    const start = Date.now();
    const userId = getUserId(req);
    info(`${TAG} POST /weight/bulk`, { userId });

    const parseResult = bulkWeightSyncSchema.safeParse(req.body);
    if (!parseResult.success) {
      warn(`${TAG} POST /weight/bulk validation failed`, { userId, errors: parseResult.error.issues });
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: parseResult.error.issues,
        },
      });
      return;
    }

    const { weights } = parseResult.data;
    info(`${TAG} POST /weight/bulk processing`, { userId, entryCount: weights.length, dateRange: weights.length > 0 ? { first: weights[0]?.date, last: weights[weights.length - 1]?.date } : null });
    const added = await recoveryService.addWeightEntries(userId, weights);

    info(`${TAG} POST /weight/bulk complete`, { userId, added, elapsedMs: Date.now() - start });
    res.json({
      success: true,
      data: { added },
    });
  })
);

// POST /health/weight
// Create or update a single manual weight entry
app.post(
  '/weight',
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const start = Date.now();
    const userId = getUserId(req);
    info(`${TAG} POST /weight`, { userId });

    const parseResult = createWeightEntrySchema.safeParse(req.body);
    if (!parseResult.success) {
      warn(`${TAG} POST /weight validation failed`, { userId, errors: parseResult.error.issues });
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: parseResult.error.issues,
        },
      });
      return;
    }

    const payload = {
      ...parseResult.data,
      source: parseResult.data.source ?? 'manual',
    };
    const entry = await recoveryService.addWeightEntry(userId, payload);

    info(`${TAG} POST /weight complete`, {
      userId,
      date: entry.date,
      weightLbs: entry.weightLbs,
      source: entry.source,
      elapsedMs: Date.now() - start,
    });

    res.status(201).json({
      success: true,
      data: entry,
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
    info(`${TAG} GET /weight`, { userId, days: days || 'latest' });

    if (days && days > 0) {
      const history = await recoveryService.getWeightHistory(userId, Math.min(days, 365));
      info(`${TAG} GET /weight history result`, { userId, days, count: history.length });
      res.json({
        success: true,
        data: history,
      });
      return;
    }

    const weight = await recoveryService.getLatestWeight(userId);

    if (!weight) {
      info(`${TAG} GET /weight not found`, { userId });
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'No weight data available',
        },
      });
      return;
    }

    info(`${TAG} GET /weight found`, { userId, date: weight.date, weightLbs: weight.weightLbs });
    res.json({
      success: true,
      data: weight,
    });
  })
);

// POST /health/hrv/bulk
// Bulk sync HRV entries from HealthKit
app.post(
  '/hrv/bulk',
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const start = Date.now();
    const userId = getUserId(req);
    info(`${TAG} POST /hrv/bulk`, { userId });

    const parseResult = bulkHRVSyncSchema.safeParse(req.body);
    if (!parseResult.success) {
      warn(`${TAG} POST /hrv/bulk validation failed`, { userId, errors: parseResult.error.issues });
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: parseResult.error.issues,
        },
      });
      return;
    }

    const { entries } = parseResult.data;
    info(`${TAG} POST /hrv/bulk processing`, { userId, entryCount: entries.length, dateRange: entries.length > 0 ? { first: entries[0]?.date, last: entries[entries.length - 1]?.date } : null });
    const added = await recoveryService.addHRVEntries(userId, entries);

    info(`${TAG} POST /hrv/bulk complete`, { userId, added, elapsedMs: Date.now() - start });
    res.json({
      success: true,
      data: { added },
    });
  })
);

// GET /health/hrv
// Get latest HRV or HRV history
app.get(
  '/hrv',
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const userId = getUserId(req);
    const days = parseInt(String(req.query['days']), 10);
    info(`${TAG} GET /hrv`, { userId, days: days || 'latest' });

    if (days && days > 0) {
      const history = await recoveryService.getHRVHistory(userId, Math.min(days, 3650));
      info(`${TAG} GET /hrv history result`, { userId, days, count: history.length });
      res.json({
        success: true,
        data: history,
      });
      return;
    }

    // Default: return latest (last 1 day)
    const history = await recoveryService.getHRVHistory(userId, 1);
    if (history.length === 0) {
      info(`${TAG} GET /hrv not found`, { userId });
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'No HRV data available',
        },
      });
      return;
    }

    info(`${TAG} GET /hrv found`, { userId, date: history[0]?.date, avgMs: history[0]?.avgMs });
    res.json({
      success: true,
      data: history[0],
    });
  })
);

// POST /health/rhr/bulk
// Bulk sync RHR entries from HealthKit
app.post(
  '/rhr/bulk',
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const start = Date.now();
    const userId = getUserId(req);
    info(`${TAG} POST /rhr/bulk`, { userId });

    const parseResult = bulkRHRSyncSchema.safeParse(req.body);
    if (!parseResult.success) {
      warn(`${TAG} POST /rhr/bulk validation failed`, { userId, errors: parseResult.error.issues });
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: parseResult.error.issues,
        },
      });
      return;
    }

    const { entries } = parseResult.data;
    info(`${TAG} POST /rhr/bulk processing`, { userId, entryCount: entries.length, dateRange: entries.length > 0 ? { first: entries[0]?.date, last: entries[entries.length - 1]?.date } : null });
    const added = await recoveryService.addRHREntries(userId, entries);

    info(`${TAG} POST /rhr/bulk complete`, { userId, added, elapsedMs: Date.now() - start });
    res.json({
      success: true,
      data: { added },
    });
  })
);

// GET /health/rhr
// Get latest RHR or RHR history
app.get(
  '/rhr',
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const userId = getUserId(req);
    const days = parseInt(String(req.query['days']), 10);
    info(`${TAG} GET /rhr`, { userId, days: days || 'latest' });

    if (days && days > 0) {
      const history = await recoveryService.getRHRHistory(userId, Math.min(days, 3650));
      info(`${TAG} GET /rhr history result`, { userId, days, count: history.length });
      res.json({
        success: true,
        data: history,
      });
      return;
    }

    const history = await recoveryService.getRHRHistory(userId, 1);
    if (history.length === 0) {
      info(`${TAG} GET /rhr not found`, { userId });
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'No RHR data available',
        },
      });
      return;
    }

    info(`${TAG} GET /rhr found`, { userId, date: history[0]?.date, avgBpm: history[0]?.avgBpm });
    res.json({
      success: true,
      data: history[0],
    });
  })
);

// POST /health/sleep/bulk
// Bulk sync sleep entries from HealthKit
app.post(
  '/sleep/bulk',
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const start = Date.now();
    const userId = getUserId(req);
    info(`${TAG} POST /sleep/bulk`, { userId });

    const parseResult = bulkSleepSyncSchema.safeParse(req.body);
    if (!parseResult.success) {
      warn(`${TAG} POST /sleep/bulk validation failed`, { userId, errors: parseResult.error.issues });
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: parseResult.error.issues,
        },
      });
      return;
    }

    const { entries } = parseResult.data;
    info(`${TAG} POST /sleep/bulk processing`, { userId, entryCount: entries.length, dateRange: entries.length > 0 ? { first: entries[0]?.date, last: entries[entries.length - 1]?.date } : null });
    const added = await recoveryService.addSleepEntries(userId, entries);

    info(`${TAG} POST /sleep/bulk complete`, { userId, added, elapsedMs: Date.now() - start });
    res.json({
      success: true,
      data: { added },
    });
  })
);

// GET /health/sleep
// Get latest sleep or sleep history
app.get(
  '/sleep',
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const userId = getUserId(req);
    const days = parseInt(String(req.query['days']), 10);
    info(`${TAG} GET /sleep`, { userId, days: days || 'latest' });

    if (days && days > 0) {
      const history = await recoveryService.getSleepHistory(userId, Math.min(days, 3650));
      info(`${TAG} GET /sleep history result`, { userId, days, count: history.length });
      res.json({
        success: true,
        data: history,
      });
      return;
    }

    const history = await recoveryService.getSleepHistory(userId, 1);
    if (history.length === 0) {
      info(`${TAG} GET /sleep not found`, { userId });
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'No sleep data available',
        },
      });
      return;
    }

    info(`${TAG} GET /sleep found`, { userId, date: history[0]?.date, totalSleepMinutes: history[0]?.totalSleepMinutes, sleepEfficiency: history[0]?.sleepEfficiency });
    res.json({
      success: true,
      data: history[0],
    });
  })
);

// Error handler must be last
app.use(errorHandler);

export const healthSyncApp = app;
