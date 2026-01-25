import { Router, type Request, type Response, type NextFunction } from 'express';
import {
  scheduleNotificationSchema,
  cancelNotificationSchema,
  type ApiResponse,
  type ScheduleNotificationInput,
  type CancelNotificationInput,
} from '@brad-os/shared';
import { validate } from '../middleware/validate.js';
import { getNotificationService } from '../services/index.js';

export const notificationRouter = Router();

// GET /api/notifications/vapid-key
notificationRouter.get(
  '/vapid-key',
  (_req: Request, res: Response, next: NextFunction): void => {
    try {
      const service = getNotificationService();
      const publicKey = service.getVapidPublicKey();

      if (publicKey === null) {
        res.status(503).json({
          success: false,
          error: {
            code: 'VAPID_NOT_CONFIGURED',
            message: 'Push notifications are not configured on the server',
          },
        });
        return;
      }

      const response: ApiResponse<{ publicKey: string }> = {
        success: true,
        data: { publicKey },
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/notifications/schedule
notificationRouter.post(
  '/schedule',
  validate(scheduleNotificationSchema),
  (req: Request, res: Response, next: NextFunction): void => {
    try {
      const service = getNotificationService();
      const input = req.body as ScheduleNotificationInput;

      service.schedule(input);

      const response: ApiResponse<{ scheduled: boolean }> = {
        success: true,
        data: { scheduled: true },
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/notifications/cancel
notificationRouter.post(
  '/cancel',
  validate(cancelNotificationSchema),
  (req: Request, res: Response, next: NextFunction): void => {
    try {
      const service = getNotificationService();
      const input = req.body as CancelNotificationInput;

      const cancelled = service.cancel(input.tag);

      const response: ApiResponse<{ cancelled: boolean }> = {
        success: true,
        data: { cancelled },
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  }
);
