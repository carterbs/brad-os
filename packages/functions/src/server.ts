import type { Server } from 'node:http';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import type express from 'express';
import { createCloudRunApp } from './cloud-run-app.js';
import { initializeFirebase } from './firebase.js';
import { internalTasksApp } from './handlers/internal-tasks.js';
import { logger } from './runtime/logger.js';
import { readRuntimeConfig } from './runtime/runtime-config.js';

const SHUTDOWN_GRACE_PERIOD_MS = 10_000;

export function startServer(
  app: express.Application = createCloudRunApp({
    internalTaskApp: internalTasksApp,
  })
): Server {
  const config = readRuntimeConfig();
  initializeFirebase();

  const server = app.listen(config.port, '0.0.0.0', () => {
    logger.info('Cloud Run API listening', {
      port: config.port,
      service: config.serviceName,
      revision: config.revisionName,
      projectId: config.projectId,
    });
  });

  server.on('error', (error) => {
    logger.error('Cloud Run API server error', {
      error: {
        name: error.name,
        message: error.message,
      },
    });
  });

  process.once('SIGTERM', () => {
    logger.info('SIGTERM received; draining HTTP requests');
    const forceCloseTimer = setTimeout(() => {
      logger.warn('HTTP drain deadline exceeded; closing active connections');
      server.closeAllConnections();
    }, SHUTDOWN_GRACE_PERIOD_MS);
    forceCloseTimer.unref();

    server.close((error) => {
      clearTimeout(forceCloseTimer);
      if (error !== undefined) {
        logger.error('HTTP server shutdown failed', {
          error: {
            name: error.name,
            message: error.message,
          },
        });
        process.exitCode = 1;
        return;
      }
      logger.info('HTTP server shutdown complete');
    });
  });

  return server;
}

function isMainModule(): boolean {
  const entrypoint = process.argv[1];
  if (entrypoint === undefined) {
    return false;
  }
  return fileURLToPath(import.meta.url) === resolve(entrypoint);
}

if (isMainModule()) {
  try {
    startServer();
  } catch (error) {
    logger.error('Cloud Run API startup failed', {
      error:
        error instanceof Error
          ? { name: error.name, message: error.message }
          : String(error),
    });
    process.exitCode = 1;
  }
}
