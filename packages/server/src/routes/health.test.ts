import { describe, it, expect } from 'vitest';
import { type Request, type Response } from 'express';
import { healthRouter } from './health.js';
import { type ApiResponse, type HealthCheckResponse } from '@brad-os/shared';

interface RouteLayer {
  route?: {
    stack: Array<{
      handle: (req: Request, res: Response) => void;
    }>;
  };
}

describe('health router', () => {
  it('should return health check response', () => {
    const mockReq = {} as Request;
    let capturedResponse: ApiResponse<HealthCheckResponse> | undefined;
    const mockRes = {
      json: (response: ApiResponse<HealthCheckResponse>): Response => {
        capturedResponse = response;
        return mockRes as unknown as Response;
      },
    } as unknown as Response;

    // Get the handler from the router with proper typing
    const layer = healthRouter.stack[0] as RouteLayer | undefined;
    const handler = layer?.route?.stack[0]?.handle;

    if (handler === undefined) {
      throw new Error('Handler not found');
    }

    handler(mockReq, mockRes);

    expect(capturedResponse).toBeDefined();
    expect(capturedResponse?.success).toBe(true);
    expect(capturedResponse?.data?.status).toBe('ok');
    expect(typeof capturedResponse?.data?.version).toBe('string');
    expect(typeof capturedResponse?.data?.timestamp).toBe('string');
  });
});
