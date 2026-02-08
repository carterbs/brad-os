/**
 * Strava Routes
 *
 * Routes for Strava webhook integration.
 * Note: Webhook endpoints don't require App Check authentication
 * since they are called by Strava servers.
 */

import { Router } from 'express';
import { stravaWebhookApp } from '../handlers/strava-webhook.js';

const router = Router();

// Mount the webhook app
// The webhook endpoints are:
// - GET /strava/webhook - Verification challenge
// - POST /strava/webhook - Activity events
router.use('/', stravaWebhookApp);

export default router;
