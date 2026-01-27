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
export function stripPathPrefix(resourceName: string) {
  // Match /api/dev/<resource> or /api/prod/<resource>
  const devPattern = new RegExp(`^/api/dev/${resourceName}`);
  const prodPattern = new RegExp(`^/api/prod/${resourceName}`);

  return (req: Request, _res: Response, next: NextFunction) => {
    if (devPattern.test(req.url)) {
      req.url = req.url.replace(devPattern, '') || '/';
    } else if (prodPattern.test(req.url)) {
      req.url = req.url.replace(prodPattern, '') || '/';
    }
    next();
  };
}
