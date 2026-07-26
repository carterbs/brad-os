import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { getAppCheck } from 'firebase-admin/app-check';
import type { ApiError } from '../shared.js';
import { logger } from '../runtime/logger.js';

// Log once at startup if running in emulator mode
if (process.env['FUNCTIONS_EMULATOR'] === 'true') {
  logger.info(
    'Running in Functions emulator - App Check verification disabled'
  );
}

export function assertAppCheckConfiguration(): void {
  const explicitBypass = process.env['APP_CHECK_BYPASS'] === 'true';
  const functionsEmulator = process.env['FUNCTIONS_EMULATOR'] === 'true';
  if (!explicitBypass && !functionsEmulator) {
    return;
  }
  if (process.env['NODE_ENV'] === 'production') {
    const source = explicitBypass ? 'APP_CHECK_BYPASS' : 'FUNCTIONS_EMULATOR';
    throw new Error(`${source} cannot be enabled in production`);
  }
  if (
    process.env['FIRESTORE_EMULATOR_HOST'] === undefined ||
    process.env['FIRESTORE_EMULATOR_HOST'] === ''
  ) {
    throw new Error('App Check bypass requires FIRESTORE_EMULATOR_HOST');
  }
}

function shouldBypassAppCheck(): boolean {
  if (
    process.env['FUNCTIONS_EMULATOR'] !== 'true' &&
    process.env['APP_CHECK_BYPASS'] !== 'true'
  ) {
    return false;
  }
  assertAppCheckConfiguration();
  return true;
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
