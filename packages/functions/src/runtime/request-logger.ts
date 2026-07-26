import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { logger } from './logger.js';
import type { ApiEnvironment } from './environment-context.js';

let firstApiRequest = true;

function requestIdFrom(request: Request): string {
  const supplied = request.get('x-request-id');
  if (
    supplied !== undefined &&
    supplied.length > 0 &&
    supplied.length <= 128 &&
    /^[\w.:/-]+$/.test(supplied)
  ) {
    return supplied;
  }
  return randomUUID();
}

function pathWithoutQuery(request: Request): string {
  return new URL(request.originalUrl, 'http://localhost').pathname;
}

/**
 * Emit one body-free structured record when an API response completes.
 */
export function createRequestLogger(
  environment: ApiEnvironment
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const startedAt = performance.now();
    const requestId = requestIdFrom(req);
    const coldStart = firstApiRequest;
    firstApiRequest = false;

    res.setHeader('x-request-id', requestId);
    res.once('finish', () => {
      logger.info('HTTP request completed', {
        requestId,
        environment,
        method: req.method,
        path: pathWithoutQuery(req),
        status: res.statusCode,
        elapsedMs: Math.round(performance.now() - startedAt),
        revision: process.env['K_REVISION'],
        coldStart,
      });
    });

    next();
  };
}

export function resetRequestLoggerForTests(): void {
  firstApiRequest = true;
}
