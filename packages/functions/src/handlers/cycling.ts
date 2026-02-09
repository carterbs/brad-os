/**
 * Cycling Handlers
 *
 * Express app for cycling-related endpoints.
 */

import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import {
  createFTPEntrySchema,
  createTrainingBlockSchema,
  createWeightGoalSchema,
  calculateVO2MaxSchema,
  updateCyclingProfileSchema,
  type CyclingActivity,
  type CreateTrainingBlockInput,
} from '../shared.js';
import { validate } from '../middleware/validate.js';
import { errorHandler, NotFoundError } from '../middleware/error-handler.js';
import { stripPathPrefix } from '../middleware/strip-path-prefix.js';
import { requireAppCheck } from '../middleware/app-check.js';
import { asyncHandler } from '../middleware/async-handler.js';
import * as cyclingService from '../services/firestore-cycling.service.js';
import * as stravaService from '../services/strava.service.js';
import {
  calculateTrainingLoadMetrics,
  getWeekInBlock,
  type DailyTSS,
} from '../services/training-load.service.js';
import {
  estimateVO2MaxFromFTP,
  categorizeVO2Max,
} from '../services/vo2max.service.js';

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());
app.use(stripPathPrefix('cycling'));
app.use(requireAppCheck);

// For now, we'll use a header to identify the user
// In production, this would come from Firebase Auth
function getUserId(req: Request): string {
  const userId = req.headers['x-user-id'];
  if (typeof userId === 'string' && userId.length > 0) {
    return userId;
  }
  // Default to a test user for development
  return 'default-user';
}

// ============ Cycling Activities ============

// GET /cycling/activities
app.get(
  '/activities',
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const userId = getUserId(req);
    const limitParam = req.query['limit'];
    const limit =
      typeof limitParam === 'string' ? parseInt(limitParam, 10) : undefined;

    const activities = await cyclingService.getCyclingActivities(
      userId,
      limit !== undefined && !isNaN(limit) && limit > 0 ? limit : undefined
    );

    res.json({ success: true, data: activities });
  })
);

// GET /cycling/activities/:id
app.get(
  '/activities/:id',
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const userId = getUserId(req);
    const id = req.params['id'] ?? '';

    const activity = await cyclingService.getCyclingActivityById(userId, id);
    if (activity === null) {
      next(new NotFoundError('CyclingActivity', id));
      return;
    }

    res.json({ success: true, data: activity });
  })
);

// POST /cycling/activities
app.post(
  '/activities',
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const userId = getUserId(req);
    const body = req.body as Omit<CyclingActivity, 'id'>;

    // Ensure userId is set correctly
    const activityData: Omit<CyclingActivity, 'id'> = {
      ...body,
      userId,
    };

    const activity = await cyclingService.createCyclingActivity(
      userId,
      activityData
    );

    res.status(201).json({ success: true, data: activity });
  })
);

// DELETE /cycling/activities/:id
app.delete(
  '/activities/:id',
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const userId = getUserId(req);
    const id = req.params['id'] ?? '';

    const deleted = await cyclingService.deleteCyclingActivity(userId, id);
    if (!deleted) {
      next(new NotFoundError('CyclingActivity', id));
      return;
    }

    res.json({ success: true, data: { deleted: true } });
  })
);

// ============ Training Load ============

// GET /cycling/training-load
app.get(
  '/training-load',
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const userId = getUserId(req);

    // Get activities for the last 60 days for accurate CTL calculation
    const activities = await cyclingService.getCyclingActivities(userId);

    // Filter to last 60 days and map to DailyTSS format
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    const dailyTSS: DailyTSS[] = activities
      .filter((a) => new Date(a.date) >= sixtyDaysAgo)
      .map((a) => ({
        date: a.date,
        tss: a.tss,
      }));

    // Calculate training load metrics
    const metrics = calculateTrainingLoadMetrics(dailyTSS, 60);

    // Get recent workouts (last 7 days) for the response
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentCyclingWorkouts = activities.filter(
      (a) => new Date(a.date) >= sevenDaysAgo
    );

    res.json({
      success: true,
      data: {
        recentCyclingWorkouts,
        atl: metrics.atl,
        ctl: metrics.ctl,
        tsb: metrics.tsb,
      },
    });
  })
);

// ============ FTP ============

// GET /cycling/ftp
app.get(
  '/ftp',
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const userId = getUserId(req);

    const ftp = await cyclingService.getCurrentFTP(userId);

    res.json({ success: true, data: ftp });
  })
);

// GET /cycling/ftp/history
app.get(
  '/ftp/history',
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const userId = getUserId(req);

    const history = await cyclingService.getFTPHistory(userId);

    res.json({ success: true, data: history });
  })
);

// POST /cycling/ftp
app.post(
  '/ftp',
  validate(createFTPEntrySchema),
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const userId = getUserId(req);
    const body = req.body as { value: number; date: string; source: 'manual' | 'test' };

    const ftp = await cyclingService.createFTPEntry(userId, body);

    res.status(201).json({ success: true, data: ftp });
  })
);

// ============ Training Blocks ============

// GET /cycling/block
app.get(
  '/block',
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const userId = getUserId(req);

    const block = await cyclingService.getCurrentTrainingBlock(userId);

    // If there's an active block, calculate and update the current week
    if (block !== null) {
      const currentWeek = getWeekInBlock(block.startDate);
      if (currentWeek !== block.currentWeek && currentWeek > 0) {
        await cyclingService.updateTrainingBlockWeek(
          userId,
          block.id,
          currentWeek
        );
        block.currentWeek = currentWeek;
      }
    }

    res.json({ success: true, data: block });
  })
);

// GET /cycling/blocks
app.get(
  '/blocks',
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const userId = getUserId(req);

    const blocks = await cyclingService.getTrainingBlocks(userId);

    res.json({ success: true, data: blocks });
  })
);

// POST /cycling/block
app.post(
  '/block',
  validate(createTrainingBlockSchema),
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const userId = getUserId(req);
    const body = req.body as CreateTrainingBlockInput;

    // Complete any existing active block first
    const currentBlock = await cyclingService.getCurrentTrainingBlock(userId);
    if (currentBlock !== null) {
      await cyclingService.completeTrainingBlock(userId, currentBlock.id);
    }

    const block = await cyclingService.createTrainingBlock(userId, body);

    res.status(201).json({ success: true, data: block });
  })
);

// PUT /cycling/block/:id/complete
app.put(
  '/block/:id/complete',
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const userId = getUserId(req);
    const id = req.params['id'] ?? '';

    const completed = await cyclingService.completeTrainingBlock(userId, id);
    if (!completed) {
      next(new NotFoundError('TrainingBlock', id));
      return;
    }

    res.json({ success: true, data: { completed: true } });
  })
);

// ============ Weight Goal ============

// GET /cycling/weight-goal
app.get(
  '/weight-goal',
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const userId = getUserId(req);

    const goal = await cyclingService.getWeightGoal(userId);

    res.json({ success: true, data: goal });
  })
);

// POST /cycling/weight-goal
app.post(
  '/weight-goal',
  validate(createWeightGoalSchema),
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const userId = getUserId(req);
    const body = req.body as {
      targetWeightLbs: number;
      targetDate: string;
      startWeightLbs: number;
      startDate: string;
    };

    const goal = await cyclingService.setWeightGoal(userId, body);

    res.status(201).json({ success: true, data: goal });
  })
);

// ============ Strava Sync ============

// POST /cycling/sync
// Sync historical activities from Strava
app.post(
  '/sync',
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const userId = getUserId(req);

    // Get user's Strava tokens
    const tokens = await cyclingService.getStravaTokens(userId);
    if (tokens === null) {
      res.status(400).json({
        success: false,
        error: 'Strava not connected. Please connect Strava first.',
      });
      return;
    }

    // Get user's current FTP for TSS calculation
    const ftpEntry = await cyclingService.getCurrentFTP(userId);
    const ftp = ftpEntry?.value ?? 200; // Default to 200 if not set

    // Refresh tokens if needed
    let accessToken = tokens.accessToken;
    if (stravaService.areTokensExpired(tokens)) {
      const clientId = process.env['STRAVA_CLIENT_ID'] ?? '';
      const clientSecret = process.env['STRAVA_CLIENT_SECRET'] ?? '';

      if (!clientId || !clientSecret) {
        res.status(500).json({
          success: false,
          error: 'Strava credentials not configured on server.',
        });
        return;
      }

      const newTokens = await stravaService.refreshStravaTokens(
        clientId,
        clientSecret,
        tokens.refreshToken
      );
      await cyclingService.setStravaTokens(userId, newTokens);
      accessToken = newTokens.accessToken;
    }

    // Fetch activities (up to 200 per page, get 2 pages = 400 activities)
    const allActivities: stravaService.StravaActivity[] = [];
    for (let page = 1; page <= 2; page++) {
      const activities = await stravaService.fetchStravaActivities(
        accessToken,
        page,
        200
      );
      if (activities.length === 0) break;
      allActivities.push(...activities);
    }

    // Filter to cycling activities only
    const cyclingActivities = stravaService.filterCyclingActivities(allActivities);

    // Get existing activity Strava IDs to avoid duplicates
    const existingActivities = await cyclingService.getCyclingActivities(userId);
    const existingStravaIds = new Set(existingActivities.map((a) => a.stravaId));

    // Process and save new activities
    let imported = 0;
    let skipped = 0;

    for (const stravaActivity of cyclingActivities) {
      if (existingStravaIds.has(stravaActivity.id)) {
        skipped++;
        continue;
      }

      // Only process activities with power data
      const hasWeightedPower = stravaActivity.weighted_average_watts !== undefined && stravaActivity.weighted_average_watts !== null && stravaActivity.weighted_average_watts > 0;
      const hasAvgPower = stravaActivity.average_watts !== undefined && stravaActivity.average_watts !== null && stravaActivity.average_watts > 0;
      if (!hasWeightedPower && !hasAvgPower) {
        skipped++;
        continue;
      }

      const processedActivity = stravaService.processStravaActivity(
        stravaActivity,
        ftp,
        userId
      );

      await cyclingService.createCyclingActivity(userId, processedActivity);
      imported++;
    }

    res.json({
      success: true,
      data: {
        total: cyclingActivities.length,
        imported,
        skipped,
        message: `Imported ${imported} activities, skipped ${skipped} (already synced or no power data).`,
      },
    });
  })
);

// ============ VO2 Max ============

// GET /cycling/vo2max
app.get(
  '/vo2max',
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const userId = getUserId(req);

    const latest = await cyclingService.getLatestVO2Max(userId);
    const history = await cyclingService.getVO2MaxHistory(userId);

    res.json({
      success: true,
      data: {
        latest: latest
          ? { ...latest, category: categorizeVO2Max(latest.value) }
          : null,
        history,
      },
    });
  })
);

// POST /cycling/vo2max/calculate
app.post(
  '/vo2max/calculate',
  validate(calculateVO2MaxSchema),
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const userId = getUserId(req);
    const { weightKg } = req.body as { weightKg: number };

    // Get current FTP
    const ftpEntry = await cyclingService.getCurrentFTP(userId);
    if (ftpEntry === null) {
      res.status(400).json({
        success: false,
        error: 'No FTP set. Please set your FTP first.',
      });
      return;
    }

    // Calculate VO2 max from FTP
    const vo2max = estimateVO2MaxFromFTP(ftpEntry.value, weightKg);
    if (vo2max === null) {
      res.status(400).json({
        success: false,
        error: 'Invalid FTP or weight values.',
      });
      return;
    }

    // Save the estimate
    const estimate = await cyclingService.saveVO2MaxEstimate(userId, {
      userId,
      date: new Date().toISOString().split('T')[0] ?? new Date().toISOString(),
      value: vo2max,
      method: 'ftp_derived',
      sourcePower: ftpEntry.value,
      sourceWeight: weightKg,
      createdAt: new Date().toISOString(),
    });

    // Also save weight to cycling profile
    await cyclingService.setCyclingProfile(userId, { weightKg });

    res.status(201).json({
      success: true,
      data: {
        ...estimate,
        category: categorizeVO2Max(vo2max),
      },
    });
  })
);

// ============ Cycling Profile ============

// GET /cycling/profile
app.get(
  '/profile',
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const userId = getUserId(req);

    const profile = await cyclingService.getCyclingProfile(userId);

    res.json({ success: true, data: profile });
  })
);

// PUT /cycling/profile
app.put(
  '/profile',
  validate(updateCyclingProfileSchema),
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const userId = getUserId(req);
    const body = req.body as { weightKg: number; maxHR?: number; restingHR?: number };

    const profile = await cyclingService.setCyclingProfile(userId, body);

    res.json({ success: true, data: profile });
  })
);

// ============ Efficiency Factor ============

// GET /cycling/ef
app.get(
  '/ef',
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const userId = getUserId(req);

    // Get activities with EF data
    const activities = await cyclingService.getCyclingActivities(userId);

    // Filter to activities with EF data and steady rides (IF < 0.88)
    const efHistory = activities
      .filter((a) => a.ef !== undefined && a.ef > 0 && a.intensityFactor < 0.88)
      .map((a) => ({
        activityId: a.id,
        date: a.date,
        ef: a.ef ?? 0,
        normalizedPower: a.normalizedPower,
        avgHeartRate: a.avgHeartRate,
        activityType: a.type,
      }));

    res.json({ success: true, data: efHistory });
  })
);

// Error handler must be last
app.use(errorHandler);

export const cyclingApp = app;
