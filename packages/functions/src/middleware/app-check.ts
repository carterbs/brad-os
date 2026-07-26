import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { getAppCheck } from 'firebase-admin/app-check';
import type { ApiError } from '../shared.js';
import { logger } from '../runtime/logger.js';

export function assertAppCheckConfiguration(): void {
  const explicitBypass = process.env['APP_CHECK_BYPASS'] === 'true';
  if (!explicitBypass) {
    return;
  }
  if (process.env['NODE_ENV'] === 'production') {
    throw new Error('APP_CHECK_BYPASS cannot be enabled in production');
  }
  if (process.env['BRAD_LOCAL_DEV_ONLY'] !== 'true') {
    throw new Error('APP_CHECK_BYPASS requires BRAD_LOCAL_DEV_ONLY=true');
  }
  const firestoreEmulatorHost = process.env['FIRESTORE_EMULATOR_HOST'];
  if (firestoreEmulatorHost === undefined || firestoreEmulatorHost === '') {
    throw new Error('App Check bypass requires FIRESTORE_EMULATOR_HOST');
  }
  if (
    !firestoreEmulatorHost.startsWith('127.0.0.1:') &&
    !firestoreEmulatorHost.startsWith('localhost:') &&
    !firestoreEmulatorHost.startsWith('[::1]:')
  ) {
    throw new Error(
      'App Check bypass requires a loopback FIRESTORE_EMULATOR_HOST'
    );
  }
}

function shouldBypassAppCheck(): boolean {
  if (process.env['APP_CHECK_BYPASS'] !== 'true') {
    return false;
  }
  assertAppCheckConfiguration();
  return true;
}

/**
 * Middleware to verify Firebase App Check token.
 * Rejects requests without a valid token.
 * Bypasses verification only for loopback, development-only integration tests.
 */
export const requireAppCheck: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (shouldBypassAppCheck()) {
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
      logger.error('App Check verification failed', {
        error:
          error instanceof Error
            ? { message: error.message, name: error.name }
            : String(error),
      });
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
