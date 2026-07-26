const DEFAULT_API_URL = 'http://127.0.0.1:5001/api/dev';

export const INTEGRATION_API_URL = (
  process.env['BRAD_IT_API_URL'] ?? DEFAULT_API_URL
).replace(/\/+$/u, '');

export const HEALTH_URL = `${INTEGRATION_API_URL}/health`;

export function integrationApiUrl(route: string): string {
  return `${INTEGRATION_API_URL}/${route.replace(/^\/+/u, '')}`;
}
