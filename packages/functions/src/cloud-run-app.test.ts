import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./runtime/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { ENDPOINT_MANIFEST } from './endpoint-manifest.js';
import { API_ROUTE_MOUNTS, createApiRouter } from './api-router.js';
import { createCloudRunApp } from './cloud-run-app.js';

describe('unified Cloud Run app', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('mounts every non-debug manifest route exactly once', () => {
    const expectedRoutes = ENDPOINT_MANIFEST.filter(
      (entry) => entry.devOnly !== true
    )
      .map((entry) => `${entry.routePath}:${entry.handlerFile}`)
      .sort();
    const actualRoutes = API_ROUTE_MOUNTS.map(
      (entry) => `${entry.routePath}:${entry.handlerFile}`
    ).sort();

    expect(actualRoutes).toEqual(expectedRoutes);
    expect(new Set(actualRoutes).size).toBe(actualRoutes.length);
    expect(createApiRouter()).toBeDefined();
  });

  it('serves shallow health without entering an API environment', async () => {
    const response = await request(createCloudRunApp()).get('/healthz');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: {
        status: 'healthy',
      },
    });
  });

  it('serves the same health handler in explicit dev and prod contexts', async () => {
    const app = createCloudRunApp();

    const [devResponse, prodResponse] = await Promise.all([
      request(app).get('/api/dev/health'),
      request(app).get('/api/prod/health'),
    ]);

    expect(devResponse.status).toBe(200);
    expect(prodResponse.status).toBe(200);
    expect(devResponse.body.data.environment).toBe('dev');
    expect(prodResponse.body.data.environment).toBe('prod');
    expect(devResponse.body.data.runtime).toBe('cloud-run');
    expect(prodResponse.body.data.runtime).toBe('cloud-run');
    expect(devResponse.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(prodResponse.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('mounts an injected internal task app before the terminal 404', async () => {
    const internalTaskApp = express();
    internalTaskApp.post('/:environment/ping', (req, res) => {
      res.json({ environment: req.params['environment'] });
    });

    const response = await request(createCloudRunApp({ internalTaskApp })).post(
      '/internal/tasks/dev/ping'
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ environment: 'dev' });
  });

  it.each([
    '/api/staging/health',
    '/api/development/health',
    '/api/prod-health',
    '/debug',
    '/api/dev/unknown',
  ])('fails closed with the standard envelope for %s', async (path) => {
    const response = await request(createCloudRunApp()).get(path);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Route not found',
      },
    });
  });

  it('rejects a production App Check bypass at app creation', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_CHECK_BYPASS', 'true');
    vi.stubEnv('FIRESTORE_EMULATOR_HOST', '127.0.0.1:8080');

    expect(() => createCloudRunApp()).toThrow(
      'APP_CHECK_BYPASS cannot be enabled in production'
    );
  });
});
