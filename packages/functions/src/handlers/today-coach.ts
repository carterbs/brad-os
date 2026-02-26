/**
 * Today Coach Handlers
 *
 * Express app for the holistic Today Coach AI endpoint.
 * Aggregates recovery, lifting, cycling, stretching, meditation, and weight
 * data to deliver a personalized daily briefing.
 */

import { type Request, type Response, type NextFunction } from 'express';
import { defineSecret } from 'firebase-functions/params';
import { info } from 'firebase-functions/logger';
import { errorHandler } from '../middleware/error-handler.js';
import { createBaseApp } from '../middleware/create-resource-router.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { buildTodayCoachContext } from '../services/today-coach-data.service.js';
import { getTodayCoachRecommendation } from '../services/today-coach.service.js';
import { validate } from '../middleware/validate.js';
import * as recoveryService from '../services/firestore-recovery.service.js';
import { coachRecommendRequestSchema, type RecoverySnapshot } from '../shared.js';

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

const app = createBaseApp('today-coach');

// POST /today-coach/recommend
app.post(
  '/recommend',
  validate(coachRecommendRequestSchema),
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const userId = getUserId(req);
    const requestBody = coachRecommendRequestSchema.parse(req.body);

    // Recovery data: prefer from request body (iOS-provided), fallback to Firestore
    let recovery: RecoverySnapshot | undefined;
    if (requestBody.recovery !== undefined) {
      recovery = requestBody.recovery;
    }

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
    const timezoneOffsetHeader = req.headers['x-timezone-offset'];
    const timezoneOffsetValue = Array.isArray(timezoneOffsetHeader) ? timezoneOffsetHeader[0] : timezoneOffsetHeader;
    const parsedTimezoneOffset = typeof timezoneOffsetValue === 'string' ? Number.parseInt(timezoneOffsetValue, 10) : NaN;
    const timezoneOffset = Number.isNaN(parsedTimezoneOffset) ? 0 : parsedTimezoneOffset;

    // Aggregate all activity data
    const coachContext = await buildTodayCoachContext(userId, recovery, timezoneOffset);

    // Debug logging
    info('[TodayCoach] Context built', {
      hasTodaysWorkout: coachContext.todaysWorkout !== null,
      workoutDetails: coachContext.todaysWorkout,
      userId,
    });

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
