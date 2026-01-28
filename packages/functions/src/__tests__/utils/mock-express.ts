/**
 * Mock Express request/response utilities for handler testing.
 *
 * These utilities allow testing Express route handlers in isolation
 * without setting up a full Express server.
 */

import { vi, expect } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

// ============ Mock Request ============

export interface MockRequestOptions {
  params?: Record<string, string>;
  query?: Record<string, string | string[] | undefined>;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
  method?: string;
  url?: string;
  path?: string;
}

/**
 * Create a mock Express Request object with sensible defaults.
 */
export function createMockRequest(options: MockRequestOptions = {}): Request {
  const req = {
    params: options.params ?? {},
    query: options.query ?? {},
    body: options.body ?? {},
    headers: options.headers ?? {},
    method: options.method ?? 'GET',
    url: options.url ?? '/',
    path: options.path ?? '/',
    get: vi.fn((headerName: string) => {
      const headers = options.headers ?? {};
      return headers[headerName.toLowerCase()] as string | undefined;
    }),
  } as unknown as Request;

  return req;
}

// ============ Mock Response ============

export interface MockResponse extends Response {
  /** The status code that was set via .status() */
  _status: number;
  /** The JSON data that was sent via .json() */
  _json: unknown;
  /** The data that was sent via .send() */
  _data: unknown;
  /** Headers that were set via .set() or .setHeader() */
  _headers: Record<string, string>;
  /** Whether .end() was called */
  _ended: boolean;
}

/**
 * Create a mock Express Response object that captures output.
 *
 * Access captured values via:
 * - res._status: The HTTP status code
 * - res._json: The JSON response body
 * - res._data: The raw response data (from .send())
 * - res._headers: Response headers
 * - res._ended: Whether the response was ended
 */
export function createMockResponse(): MockResponse {
  const res = {
    _status: 200,
    _json: undefined as unknown,
    _data: undefined as unknown,
    _headers: {} as Record<string, string>,
    _ended: false,

    status: vi.fn(function (this: MockResponse, code: number) {
      this._status = code;
      return this;
    }),

    json: vi.fn(function (this: MockResponse, data: unknown) {
      this._json = data;
      this._data = data;
      this._ended = true;
      return this;
    }),

    send: vi.fn(function (this: MockResponse, data: unknown) {
      this._data = data;
      this._ended = true;
      return this;
    }),

    end: vi.fn(function (this: MockResponse) {
      this._ended = true;
      return this;
    }),

    set: vi.fn(function (
      this: MockResponse,
      field: string | Record<string, string>,
      value?: string
    ) {
      if (typeof field === 'object') {
        Object.assign(this._headers, field);
      } else if (value !== undefined) {
        this._headers[field] = value;
      }
      return this;
    }),

    setHeader: vi.fn(function (this: MockResponse, name: string, value: string) {
      this._headers[name] = value;
      return this;
    }),

    getHeader: vi.fn(function (this: MockResponse, name: string) {
      return this._headers[name];
    }),

    type: vi.fn(function (this: MockResponse, type: string) {
      this._headers['Content-Type'] = type;
      return this;
    }),

    redirect: vi.fn(function (
      this: MockResponse,
      statusOrUrl: number | string,
      url?: string
    ) {
      if (typeof statusOrUrl === 'number') {
        this._status = statusOrUrl;
        this._headers['Location'] = url ?? '';
      } else {
        this._status = 302;
        this._headers['Location'] = statusOrUrl;
      }
      this._ended = true;
      return this;
    }),

    sendStatus: vi.fn(function (this: MockResponse, code: number) {
      this._status = code;
      this._ended = true;
      return this;
    }),
  } as unknown as MockResponse;

  return res;
}

// ============ Mock Next Function ============

export interface MockNextFunction extends NextFunction {
  /** Whether next was called */
  called: boolean;
  /** The error passed to next, if any */
  error: unknown;
}

/**
 * Create a mock Express NextFunction that captures calls.
 */
export function createMockNext(): MockNextFunction {
  const nextFn = vi.fn((err?: unknown) => {
    nextFn.called = true;
    nextFn.error = err;
  }) as unknown as MockNextFunction;

  nextFn.called = false;
  nextFn.error = undefined;

  return nextFn;
}

// ============ Combined Mock Context ============

export interface MockRequestContext {
  req: Request;
  res: MockResponse;
  next: MockNextFunction;
}

/**
 * Create a complete mock context for testing Express handlers.
 *
 * @example
 * ```typescript
 * const { req, res, next } = createMockContext({
 *   params: { id: 'exercise-123' },
 *   body: { name: 'New Exercise' }
 * });
 *
 * await handler(req, res, next);
 *
 * expect(res._status).toBe(200);
 * expect(res._json).toEqual({ success: true, data: { ... } });
 * ```
 */
export function createMockContext(
  requestOptions: MockRequestOptions = {}
): MockRequestContext {
  return {
    req: createMockRequest(requestOptions),
    res: createMockResponse(),
    next: createMockNext(),
  };
}

// ============ Assertion Helpers ============

/**
 * Assert that the response returned a successful JSON response.
 */
export function expectSuccessResponse(
  res: MockResponse,
  expectedData?: unknown
): void {
  expect(res._status).toBe(200);
  expect(res._json).toBeDefined();

  const json = res._json as { success: boolean; data?: unknown };
  expect(json.success).toBe(true);

  if (expectedData !== undefined) {
    expect(json.data).toEqual(expectedData);
  }
}

/**
 * Assert that the response returned a created (201) JSON response.
 */
export function expectCreatedResponse(
  res: MockResponse,
  expectedData?: unknown
): void {
  expect(res._status).toBe(201);
  expect(res._json).toBeDefined();

  const json = res._json as { success: boolean; data?: unknown };
  expect(json.success).toBe(true);

  if (expectedData !== undefined) {
    expect(json.data).toEqual(expectedData);
  }
}

/**
 * Assert that the response returned an error response.
 */
export function expectErrorResponse(
  res: MockResponse,
  expectedStatus: number,
  expectedCode?: string
): void {
  expect(res._status).toBe(expectedStatus);
  expect(res._json).toBeDefined();

  const json = res._json as { success: boolean; error?: { code: string } };
  expect(json.success).toBe(false);

  if (expectedCode !== undefined) {
    expect(json.error?.code).toBe(expectedCode);
  }
}

/**
 * Assert that the response returned a 404 not found error.
 */
export function expectNotFoundResponse(
  res: MockResponse,
  expectedCode: string = 'NOT_FOUND'
): void {
  expectErrorResponse(res, 404, expectedCode);
}

/**
 * Assert that the response returned a 400 bad request error.
 */
export function expectBadRequestResponse(
  res: MockResponse,
  expectedCode: string = 'VALIDATION_ERROR'
): void {
  expectErrorResponse(res, 400, expectedCode);
}
