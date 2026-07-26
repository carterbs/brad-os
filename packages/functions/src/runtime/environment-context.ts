import { AsyncLocalStorage } from 'node:async_hooks';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

export type ApiEnvironment = 'dev' | 'prod';

interface EnvironmentContext {
  environment: ApiEnvironment;
}

export interface EnvironmentProvider<T> {
  get(): T;
  reset(environment?: ApiEnvironment): void;
}

const environmentStorage = new AsyncLocalStorage<EnvironmentContext>();

/**
 * Return the environment assigned by the outer HTTP adapter.
 *
 * This deliberately has no process-wide or production fallback. A missing
 * context is a programming error because silently selecting production could
 * turn a malformed dev request into a production write.
 */
export function getRequestEnvironment(): ApiEnvironment {
  const context = environmentStorage.getStore();
  if (context === undefined) {
    throw new Error(
      'API environment is unavailable outside an explicit request context'
    );
  }
  return context.environment;
}

/**
 * Run arbitrary synchronous or asynchronous work in an explicit environment.
 */
export function runWithEnvironment<T>(
  environment: ApiEnvironment,
  callback: () => T
): T {
  return environmentStorage.run({ environment }, callback);
}

/**
 * Express middleware for adapters whose environment is fixed by their mount.
 */
export function withEnvironment(environment: ApiEnvironment): RequestHandler {
  return (_req: Request, _res: Response, next: NextFunction): void => {
    runWithEnvironment(environment, next);
  };
}

/**
 * Cache one value per logical API environment.
 *
 * Most repositories now resolve collection names at operation time and can be
 * shared safely. This helper is available for services that intentionally keep
 * environment-specific state or dependencies.
 */
export function createEnvironmentProvider<T>(
  factory: (environment: ApiEnvironment) => T
): EnvironmentProvider<T> {
  const values = new Map<ApiEnvironment, T>();

  return {
    get(): T {
      const environment = getRequestEnvironment();
      const existing = values.get(environment);
      if (existing !== undefined) {
        return existing;
      }

      const value = factory(environment);
      values.set(environment, value);
      return value;
    },
    reset(environment?: ApiEnvironment): void {
      if (environment === undefined) {
        values.clear();
        return;
      }
      values.delete(environment);
    },
  };
}
