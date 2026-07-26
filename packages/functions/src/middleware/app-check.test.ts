import type { NextFunction, Request, Response } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';

const verifyToken = vi.hoisted(() => vi.fn());

vi.mock('firebase-admin/app-check', () => ({
  getAppCheck: () => ({
    verifyToken,
  }),
}));

vi.mock('../runtime/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { assertAppCheckConfiguration, requireAppCheck } from './app-check.js';

function createResponse(): {
  response: Response;
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
} {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  return {
    response: { status } as unknown as Response,
    status,
    json,
  };
}

describe('App Check runtime guards', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    verifyToken.mockReset();
  });

  it('allows an explicit bypass only in loopback development-only mode', () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('APP_CHECK_BYPASS', 'true');
    vi.stubEnv('BRAD_LOCAL_DEV_ONLY', 'true');
    vi.stubEnv('FIRESTORE_EMULATOR_HOST', '127.0.0.1:8080');
    const next = vi.fn();
    const { response } = createResponse();

    requireAppCheck({ headers: {} } as Request, response, next as NextFunction);

    expect(next).toHaveBeenCalledOnce();
    expect(verifyToken).not.toHaveBeenCalled();
  });

  it('rejects the bypass when no Firestore emulator is configured', () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('APP_CHECK_BYPASS', 'true');
    vi.stubEnv('BRAD_LOCAL_DEV_ONLY', 'true');
    vi.stubEnv('FIRESTORE_EMULATOR_HOST', '');

    expect(() => assertAppCheckConfiguration()).toThrow(
      'App Check bypass requires FIRESTORE_EMULATOR_HOST'
    );
  });

  it('rejects the bypass in production even if an emulator host is present', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_CHECK_BYPASS', 'true');
    vi.stubEnv('BRAD_LOCAL_DEV_ONLY', 'true');
    vi.stubEnv('FIRESTORE_EMULATOR_HOST', '127.0.0.1:8080');

    expect(() => assertAppCheckConfiguration()).toThrow(
      'APP_CHECK_BYPASS cannot be enabled in production'
    );
  });

  it('rejects a bypass unless the server is development-only', () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('APP_CHECK_BYPASS', 'true');
    vi.stubEnv('FIRESTORE_EMULATOR_HOST', '127.0.0.1:8080');

    expect(() => assertAppCheckConfiguration()).toThrow(
      'APP_CHECK_BYPASS requires BRAD_LOCAL_DEV_ONLY=true'
    );
  });

  it('rejects a bypass for a non-loopback emulator host', () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('APP_CHECK_BYPASS', 'true');
    vi.stubEnv('BRAD_LOCAL_DEV_ONLY', 'true');
    vi.stubEnv('FIRESTORE_EMULATOR_HOST', 'firestore:8080');

    expect(() => assertAppCheckConfiguration()).toThrow(
      'App Check bypass requires a loopback FIRESTORE_EMULATOR_HOST'
    );
  });

  it('does not treat the retired Functions emulator flag as a bypass', () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('FUNCTIONS_EMULATOR', 'true');
    vi.stubEnv('FIRESTORE_EMULATOR_HOST', '127.0.0.1:8080');
    const next = vi.fn();
    const { response, status } = createResponse();

    requireAppCheck({ headers: {} } as Request, response, next as NextFunction);

    expect(status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('keeps missing-token behavior unchanged without a bypass', () => {
    vi.stubEnv('APP_CHECK_BYPASS', 'false');
    const next = vi.fn();
    const { response, status, json } = createResponse();

    requireAppCheck({ headers: {} } as Request, response, next as NextFunction);

    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: 'APP_CHECK_MISSING',
        message: 'Missing App Check token',
      },
    });
    expect(next).not.toHaveBeenCalled();
  });
});
