import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { info, error as logError } from 'firebase-functions/logger';
import { getAppCheck } from 'firebase-admin/app-check';
import type { ApiError } from '../shared.js';

// Log once at startup if running in emulator mode
if (process.env['FUNCTIONS_EMULATOR'] === 'true') {
  info('Running in emulator - App Check verification disabled');
}

/**
 * Middleware to verify Firebase App Check token.
 * Rejects requests without a valid token.
 * Bypasses verification in emulator mode.
 */
export const requireAppCheck: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Bypass App Check in emulator
  if (process.env['FUNCTIONS_EMULATOR'] === 'true') {
    next();
    return;
  }

  const appCheckToken = req.headers['x-firebase-appcheck'];

  if (typeof appCheckToken !== 'string' || appCheckToken === '') {
    const response: ApiError = {
      success: false,
      error: {
        code: 'APP_CHECK_MISSING',
        message: 'Missing App Check token',
      },
    };
    res.status(401).json(response);
    return;
  }

  getAppCheck()
    .verifyToken(appCheckToken)
    .then(() => {
      next();
    })
    .catch((error: unknown) => {
      logError('App Check verification failed:', error);
      const response: ApiError = {
        success: false,
        error: {
          code: 'APP_CHECK_INVALID',
          message: 'Invalid App Check token',
        },
      };
      res.status(401).json(response);
    });
};
