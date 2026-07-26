import type { Request, Response, NextFunction } from 'express';

/**
 * Middleware to strip path prefixes added by Firebase Hosting rewrites.
 *
 * When using hosting rewrites like:
 *   { "source": "/api/dev/exercises/**", "function": "devExercises" }
 *
 * The Express app receives the full path "/api/dev/exercises/123",
 * but our routes expect just "/123".
 *
 * This middleware detects and strips the prefix so routes match correctly.
 */
export function stripPathPrefix(
  resourceName: string
): (req: Request, _res: Response, next: NextFunction) => void {
  const prefixes = [`/api/dev/${resourceName}`, `/api/prod/${resourceName}`];

  return (req: Request, _res: Response, next: NextFunction): void => {
    for (const prefix of prefixes) {
      if (
        req.url === prefix ||
        req.url.startsWith(`${prefix}/`) ||
        req.url.startsWith(`${prefix}?`)
      ) {
        const remainder = req.url.slice(prefix.length);
        req.url =
          remainder === ''
            ? '/'
            : remainder.startsWith('?')
              ? `/${remainder}`
              : remainder;
        break;
      }
    }
    next();
  };
}
