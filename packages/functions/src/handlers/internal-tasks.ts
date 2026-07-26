import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import { asyncHandler } from '../middleware/async-handler.js';
import { errorHandler } from '../middleware/error-handler.js';
import {
  stravaActivityTaskPayloadSchema,
  stravaTaskEnvironmentSchema,
} from '../shared.js';
import {
  deriveStravaEventId,
  getStravaTaskStore,
  StravaTaskAuthenticationError,
  verifyStravaTaskAuthorization,
} from '../services/strava-task.service.js';
import { runWithEnvironment } from '../runtime/environment-context.js';
import { logger } from '../runtime/logger.js';
import { processStravaActivityEvent } from './strava-webhook.js';

const TAG = '[Internal Tasks]';

const app = express();

/**
 * Authenticate before parsing a caller-controlled request body. Cloud Run is
 * publicly invokable, so the internal path must enforce the exact task
 * service-account identity itself.
 */
app.use(
  asyncHandler(
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        await verifyStravaTaskAuthorization(req.get('authorization'));
        next();
      } catch (error) {
        if (error instanceof StravaTaskAuthenticationError) {
          res.status(error.statusCode).json({
            success: false,
            error: {
              code: error.code,
              message: error.message,
            },
          });
          return;
        }
        throw error;
      }
    }
  )
);
app.use(express.json({ limit: '32kb' }));

app.post(
  '/:environment/strava-activity',
  asyncHandler(
    async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
      const environmentResult = stravaTaskEnvironmentSchema.safeParse(
        req.params['environment']
      );
      if (!environmentResult.success) {
        res.status(404).json({
          success: false,
          error: {
            code: 'TASK_ROUTE_NOT_FOUND',
            message: 'Unknown task environment',
          },
        });
        return;
      }

      const payloadResult = stravaActivityTaskPayloadSchema.safeParse(req.body);
      if (!payloadResult.success) {
        res.status(400).json({
          success: false,
          error: {
            code: 'TASK_PAYLOAD_INVALID',
            message: 'Invalid Strava task payload',
            details: payloadResult.error.issues,
          },
        });
        return;
      }

      const environment = environmentResult.data;
      const payload = payloadResult.data;
      const expectedEventId = deriveStravaEventId(environment, payload.event);
      if (payload.eventId !== expectedEventId) {
        res.status(400).json({
          success: false,
          error: {
            code: 'TASK_EVENT_ID_INVALID',
            message: 'Task event ID does not match its payload',
          },
        });
        return;
      }

      const outcome = await runWithEnvironment(environment, async () => {
        const store = getStravaTaskStore();
        const claim = await store.claim(payload);

        if (claim.status === 'completed') {
          return 'duplicate' as const;
        }
        if (claim.status === 'in_progress') {
          return claim.status;
        }

        try {
          await processStravaActivityEvent(payload.event);
          await store.complete(payload.eventId, claim.claimToken);
          return 'completed' as const;
        } catch (processingError) {
          try {
            await store.fail(
              payload.eventId,
              claim.claimToken,
              processingError
            );
          } catch (recordError) {
            logger.error(`${TAG} Failed to record task failure`, {
              eventId: payload.eventId,
              error:
                recordError instanceof Error
                  ? recordError.message
                  : 'Unknown Firestore error',
            });
          }
          throw processingError;
        }
      });

      if (outcome === 'in_progress') {
        res.set('Retry-After', '10');
        res.status(503).json({
          success: false,
          error: {
            code: 'TASK_ALREADY_PROCESSING',
            message: 'Strava task is already processing',
          },
        });
        return;
      }

      res.json({
        success: true,
        data: {
          eventId: payload.eventId,
          status: outcome,
        },
      });
    }
  )
);

app.use(errorHandler);

export const internalTasksApp = app;
