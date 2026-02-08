/**
 * Cycling Coach Handlers
 *
 * Express app for AI cycling coach endpoints.
 */

import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import { defineSecret } from 'firebase-functions/params';
import { errorHandler } from '../middleware/error-handler.js';
import { stripPathPrefix } from '../middleware/strip-path-prefix.js';
import { requireAppCheck } from '../middleware/app-check.js';
import { asyncHandler } from '../middleware/async-handler.js';
import * as cyclingService from '../services/firestore-cycling.service.js';
import { getCyclingRecommendation } from '../services/cycling-coach.service.js';
import {
  calculateTrainingLoadMetrics,
  getWeekInBlock,
  type DailyTSS,
} from '../services/training-load.service.js';
import type { RecoverySnapshot, CyclingCoachRequest } from '../shared.js';

// Define secret for OpenAI API key
const openaiApiKey = defineSecret('OPENAI_API_KEY');

// Training philosophy - condensed key points for the AI coach
const TRAINING_PHILOSOPHY = `## Weekly Structure

Three cycling sessions per week:

### Session 1 (Tuesday): VO2max Intervals
- Duration: 45-60 minutes
- Protocol: Sprint interval training (SIT) or short HIIT
- Options: 30/30 intervals (10-15 reps), 30/120 intervals (6-8 reps), 40/20 intervals (15-20 reps)

### Session 2 (Thursday): Threshold Development
- Duration: 45-60 minutes
- Protocol: Sweet spot or threshold intervals
- Options: 3x10-15min at 88-94% FTP, 2x20min at 88-94% FTP, 4x8-10min at 95-105% FTP

### Session 3 (Saturday): Fun
- Duration: 30-90 minutes (athlete's choice)
- ALWAYS prescribe fun - no structured workout

## Power Zones (% of FTP)
- Z1 Active Recovery: <55%
- Z2 Endurance: 56-75%
- Z3 Tempo: 76-90%
- Z4 Lactate Threshold: 91-105%
- Z5 VO2max: 106-120%
- Z6 Anaerobic: 121-150%

## 8-Week Periodization

Weeks 1-2 (Adaptation): Lower volume (8-10 x 30/30 or 5-6 x 30/120)
Weeks 3-4 (Build): Increase volume (12-15 x 30/30 or 7-8 x 30/120)
Week 5 (Recovery): Reduce by 30-40%
Weeks 6-7 (Peak): Maximum volume (15-20 x 40/20)
Week 8 (Test): FTP test

## Recovery-Based Adjustments

Ready (score >= 70): Full volume
Moderate (score 50-69): 80-90% volume, reduce interval count by 1-2
Recover (score < 50): Recovery ride only or day off

## Lifting Interference

Heavy lower body yesterday: Reduce cycling volume by 20%, avoid threshold
Heavy lower body today: Recovery ride only
Upper body only: No adjustments needed`;

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());
app.use(stripPathPrefix('cycling-coach'));
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

/**
 * Determine session type based on day of week.
 */
function getSessionType(date: Date): 'vo2max' | 'threshold' | 'fun' {
  const day = date.getDay();
  switch (day) {
    case 2: return 'vo2max';    // Tuesday
    case 4: return 'threshold'; // Thursday
    case 6: return 'fun';       // Saturday
    default: return 'fun';      // Other days default to fun
  }
}

/**
 * Calculate days since a date.
 */
function daysSince(dateString: string): number {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

// POST /cycling-coach/recommend
app.post(
  '/recommend',
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const userId = getUserId(req);

    // Recovery data comes from iOS (HealthKit)
    const { recovery } = req.body as { recovery?: RecoverySnapshot };
    if (!recovery) {
      res.status(400).json({
        success: false,
        error: { code: 'RECOVERY_REQUIRED', message: 'Recovery data required' },
      });
      return;
    }

    // Fetch data from Firestore in parallel
    const [activities, ftp, block] = await Promise.all([
      cyclingService.getCyclingActivities(userId, 60), // Last 60 days for CTL
      cyclingService.getCurrentFTP(userId),
      cyclingService.getCurrentTrainingBlock(userId),
    ]);

    if (!ftp) {
      res.status(400).json({
        success: false,
        error: { code: 'FTP_REQUIRED', message: 'FTP not set. Please set your FTP first.' },
      });
      return;
    }

    // Calculate training load metrics
    const dailyTSS: DailyTSS[] = activities.map((a) => ({
      date: a.date,
      tss: a.tss,
    }));
    const metrics = calculateTrainingLoadMetrics(dailyTSS, 60);

    // Build coach request
    const now = new Date();
    const weekInBlock = block ? getWeekInBlock(block.startDate) : 1;

    const coachRequest: CyclingCoachRequest = {
      recovery,
      trainingLoad: {
        recentCyclingWorkouts: activities.slice(0, 7), // Last 7 activities
        atl: metrics.atl,
        ctl: metrics.ctl,
        tsb: metrics.tsb,
      },
      recentLiftingWorkouts: [], // TODO: Integrate with lifting data
      athlete: {
        ftp: ftp.value,
        ftpLastTestedDate: ftp.date,
        goals: block?.goals ?? [],
        weekInBlock,
        blockStartDate: block?.startDate ?? (now.toISOString().split('T')[0] ?? ''),
      },
      weight: {
        currentLbs: 0, // TODO: Get from HealthKit data if available
        trend7DayLbs: 0,
        trend30DayLbs: 0,
      },
      schedule: {
        dayOfWeek: now.toLocaleDateString('en-US', { weekday: 'long' }),
        sessionType: getSessionType(now),
        liftingSchedule: {
          today: { planned: false },
          tomorrow: { planned: false },
          yesterday: { completed: false },
        },
      },
    };

    // Get OpenAI API key
    const apiKey = openaiApiKey.value();
    if (!apiKey) {
      res.status(500).json({
        success: false,
        error: { code: 'CONFIG_ERROR', message: 'OpenAI API key not configured' },
      });
      return;
    }

    // Get recommendation from AI coach
    const recommendation = await getCyclingRecommendation(
      coachRequest,
      TRAINING_PHILOSOPHY,
      apiKey
    );

    // Check if FTP test should be suggested (8+ weeks since last test)
    if (recommendation.suggestFTPTest !== true && daysSince(ftp.date) >= 56) {
      recommendation.suggestFTPTest = true;
      recommendation.warnings = recommendation.warnings ?? [];
      recommendation.warnings.push({
        type: 'ftp_stale',
        message: `Your FTP was last tested ${daysSince(ftp.date)} days ago. Consider retesting.`,
      });
    }

    res.json({ success: true, data: recommendation });
  })
);

// Error handler must be last
app.use(errorHandler);

export const cyclingCoachApp = app;
