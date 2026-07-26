import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import {
  createEnvironmentProvider,
  getRequestEnvironment,
  runWithEnvironment,
  withEnvironment,
} from './environment-context.js';

describe('environment context', () => {
  it('fails closed outside an explicit environment context', () => {
    expect(() => getRequestEnvironment()).toThrow(
      'API environment is unavailable outside an explicit request context'
    );
  });

  it('keeps deliberately interleaved asynchronous work isolated', async () => {
    const releaseDev = Promise.withResolvers<void>();
    const releaseProd = Promise.withResolvers<void>();
    const observations: string[] = [];

    const devWork = runWithEnvironment('dev', async () => {
      observations.push(`dev-before:${getRequestEnvironment()}`);
      releaseProd.resolve();
      await releaseDev.promise;
      observations.push(`dev-after:${getRequestEnvironment()}`);
    });

    const prodWork = runWithEnvironment('prod', async () => {
      await releaseProd.promise;
      observations.push(`prod-before:${getRequestEnvironment()}`);
      releaseDev.resolve();
      await Promise.resolve();
      observations.push(`prod-after:${getRequestEnvironment()}`);
    });

    await Promise.all([devWork, prodWork]);

    expect(observations[0]).toBe('dev-before:dev');
    expect(observations).toHaveLength(4);
    expect(observations).toContain('prod-before:prod');
    expect(observations).toContain('prod-after:prod');
    expect(observations).toContain('dev-after:dev');
  });

  it('enters a fixed context through Express middleware', async () => {
    const app = express();
    app.use(withEnvironment('dev'));
    app.get('/', (_req, res) => {
      res.json({ environment: getRequestEnvironment() });
    });

    const response = await request(app).get('/');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ environment: 'dev' });
  });

  it('caches one provider value per environment and resets both', () => {
    const factory = vi.fn((environment: 'dev' | 'prod') => ({ environment }));
    const provider = createEnvironmentProvider(factory);

    const firstDev = runWithEnvironment('dev', () => provider.get());
    const secondDev = runWithEnvironment('dev', () => provider.get());
    const prod = runWithEnvironment('prod', () => provider.get());

    expect(firstDev).toBe(secondDev);
    expect(firstDev).not.toBe(prod);
    expect(factory).toHaveBeenCalledTimes(2);

    provider.reset();
    runWithEnvironment('dev', () => provider.get());

    expect(factory).toHaveBeenCalledTimes(3);
  });
});
