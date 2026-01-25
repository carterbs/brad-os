import { Router, type Request, type Response } from 'express';
import {
  APP_VERSION,
  createSuccessResponse,
  type HealthCheckResponse,
} from '@brad-os/shared';

export const healthRouter = Router();

healthRouter.get('/', (_req: Request, res: Response): void => {
  const response: HealthCheckResponse = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: APP_VERSION,
  };
  res.json(createSuccessResponse(response));
});
