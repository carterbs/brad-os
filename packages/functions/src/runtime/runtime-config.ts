import { z } from 'zod';

const booleanStringSchema = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true');

const portSchema = z.coerce.number().int().min(1).max(65_535);

export interface RuntimeConfig {
  port: number;
  projectId: string | undefined;
  nodeEnvironment: string;
  serviceName: string;
  revisionName: string | undefined;
  appCheckBypass: boolean;
}

/**
 * Read only the runtime settings shared by the HTTP server.
 *
 * Feature-specific integrations validate their own environment variables so
 * shallow health checks and local container tests do not require every secret.
 */
export function readRuntimeConfig(
  environment: NodeJS.ProcessEnv = process.env
): RuntimeConfig {
  const port = portSchema.parse(environment['PORT'] ?? '8080');
  const appCheckBypass = booleanStringSchema.parse(
    environment['APP_CHECK_BYPASS'] ?? 'false'
  );

  return {
    port,
    projectId:
      environment['GOOGLE_CLOUD_PROJECT'] ?? environment['GCLOUD_PROJECT'],
    nodeEnvironment: environment['NODE_ENV'] ?? 'development',
    serviceName: environment['K_SERVICE'] ?? 'brad-os-api-local',
    revisionName: environment['K_REVISION'],
    appCheckBypass,
  };
}
