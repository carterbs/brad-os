/**
 * Today Coach Handlers
 *
 * Express app for the holistic Today Coach AI endpoint.
 * Aggregates recovery, lifting, cycling, stretching, meditation, and weight
 * data to deliver a personalized daily briefing.
 */

import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import { defineSecret } from 'firebase-functions/params';
import { errorHandler } from '../middleware/error-handler.js';
import { stripPathPrefix } from '../middleware/strip-path-prefix.js';
import { requireAppCheck } from '../middleware/app-check.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { buildTodayCoachContext } from '../services/today-coach-data.service.js';
import { getTodayCoachRecommendation } from '../services/today-coach.service.js';
import * as recoveryService from '../services/firestore-recovery.service.js';
import type { RecoverySnapshot } from '../shared.js';

const openaiApiKey = defineSecret('OPENAI_API_KEY');

/**
 * Get user ID from request headers.
 */
function getUserId(req: Request): string {
  const userId = req.headers['x-user-id'];
  if (typeof userId === 'string' && userId.length > 0) {
    return userId;
  }
  return 'default-user';
}

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());
app.use(stripPathPrefix('today-coach'));
app.use(requireAppCheck);

// POST /today-coach/recommend
app.post(
  '/recommend',
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const userId = getUserId(req);

    // Recovery data: prefer from request body (iOS-provided), fallback to Firestore
    const requestBody = req.body as { recovery?: RecoverySnapshot };
    let recovery: RecoverySnapshot | undefined = requestBody.recovery;

    if (recovery === undefined) {
      const storedRecovery = await recoveryService.getLatestRecoverySnapshot(userId);
      if (storedRecovery === null) {
        res.status(400).json({
          success: false,
          error: {
            code: 'RECOVERY_NOT_SYNCED',
            message: 'No recovery data available. Enable HealthKit sync in the app.',
          },
        });
        return;
      }
      recovery = storedRecovery;
    }

    // Get timezone offset from headers
    const timezoneOffset = parseInt(req.headers['x-timezone-offset'] as string, 10) || 0;

    // Aggregate all activity data
    const coachContext = await buildTodayCoachContext(userId, recovery, timezoneOffset);

    // Get OpenAI API key
    const apiKey = openaiApiKey.value();
    if (!apiKey) {
      res.status(500).json({
        success: false,
        error: { code: 'CONFIG_ERROR', message: 'OpenAI API key not configured' },
      });
      return;
    }

    // Get AI recommendation
    const recommendation = await getTodayCoachRecommendation(coachContext, apiKey);

    res.json({ success: true, data: recommendation });
  })
);

// Error handler must be last
app.use(errorHandler);

export const todayCoachApp = app;
