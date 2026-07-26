import express, { type RequestHandler } from 'express';
import { createApiRouter } from './api-router.js';
import { assertAppCheckConfiguration } from './middleware/app-check.js';
import { withEnvironment } from './runtime/environment-context.js';
import { createRequestLogger } from './runtime/request-logger.js';

export interface CloudRunAppOptions {
  internalTaskApp?: RequestHandler;
  developmentOnly?: boolean;
}

export function createCloudRunApp(
  options: CloudRunAppOptions = {}
): express.Application {
  assertAppCheckConfiguration();

  const app = express();
  app.disable('x-powered-by');
  app.enable('strict routing');

  app.get('/healthz', (_req, res) => {
    res.json({
      success: true,
      data: {
        status: 'healthy',
      },
    });
  });

  app.use(
    '/api/dev',
    withEnvironment('dev'),
    createRequestLogger('dev'),
    createApiRouter()
  );
  if (options.developmentOnly !== true) {
    app.use(
      '/api/prod',
      withEnvironment('prod'),
      createRequestLogger('prod'),
      createApiRouter()
    );
  }

  if (
    options.developmentOnly !== true &&
    options.internalTaskApp !== undefined
  ) {
    app.use('/internal/tasks', options.internalTaskApp);
  }

  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Route not found',
      },
    });
  });

  return app;
}
