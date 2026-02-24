import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import type { Response } from 'supertest';
import { type ApiResponse } from '../__tests__/utils/index.js';

// Mock firebase before importing the handler
vi.mock('../firebase.js', () => ({
  getFirestoreDb: vi.fn(),
}));

// Mock app-check middleware
vi.mock('../middleware/app-check.js', () => ({
  requireAppCheck: (_req: unknown, _res: unknown, next: () => void): void => next(),
}));

// Mock firebase-admin/app with vi.hoisted
const mockGetApp = vi.hoisted(() => vi.fn());
vi.mock('firebase-admin/app', () => ({
  getApp: mockGetApp,
}));

// Mock firebase-admin/remote-config with vi.hoisted
const mockGetRemoteConfig = vi.hoisted(() => vi.fn());
vi.mock('firebase-admin/remote-config', () => ({
  getRemoteConfig: mockGetRemoteConfig,
}));

// Mock firebase-functions/logger
vi.mock('firebase-functions/logger', () => ({
  warn: vi.fn(),
  error: vi.fn(),
}));

// Import after mocks
import { ttsApp } from './tts.js';

function setupHappyPathMocks(): void {
  mockGetApp.mockReturnValue({
    options: {
      credential: {
        getAccessToken: vi.fn().mockResolvedValue({ access_token: 'test-token' }),
      },
    },
  });

  mockGetRemoteConfig.mockReturnValue({
    getServerTemplate: vi.fn().mockResolvedValue({
      evaluate: (): { getString: (key: string) => string } => ({
        getString: (key: string): string => key === 'TTS_VOICE' ? 'en-US-Chirp3-HD-Algenib' : '',
      }),
    }),
  });

  const mockFetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ audioContent: 'base64-audio-data' }),
  });
  vi.stubGlobal('fetch', mockFetch);
}

describe('TTS Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('POST /synthesize', () => {
    it('should return synthesized audio on success', async () => {
      setupHappyPathMocks();

      const response = await request(ttsApp)
        .post('/synthesize')
        .send({ text: 'Hello world' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: { audio: 'base64-audio-data' },
      });
    });

    it('should return 400 for empty text', async () => {
      const response: Response = await request(ttsApp)
        .post('/synthesize')
        .send({ text: '' });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for missing text', async () => {
      const response: Response = await request(ttsApp)
        .post('/synthesize')
        .send({});
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should return 500 AUTH_ERROR when getAccessToken throws', async () => {
      mockGetApp.mockReturnValue({
        options: {
          credential: {
            getAccessToken: vi.fn().mockRejectedValue(new Error('credential failure')),
          },
        },
      });

      mockGetRemoteConfig.mockReturnValue({
        getServerTemplate: vi.fn().mockResolvedValue({
          evaluate: (): { getString: (key: string) => string } => ({
            getString: (key: string): string => key === 'TTS_VOICE' ? 'en-US-Chirp3-HD-Algenib' : '',
          }),
        }),
      });

      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);

      const response: Response = await request(ttsApp)
        .post('/synthesize')
        .send({ text: 'Hello world' });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(500);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('AUTH_ERROR');
    });

    it('should return 502 TTS_API_ERROR when Google TTS returns non-ok', async () => {
      mockGetApp.mockReturnValue({
        options: {
          credential: {
            getAccessToken: vi.fn().mockResolvedValue({ access_token: 'test-token' }),
          },
        },
      });

      mockGetRemoteConfig.mockReturnValue({
        getServerTemplate: vi.fn().mockResolvedValue({
          evaluate: (): { getString: (key: string) => string } => ({
            getString: (key: string): string => key === 'TTS_VOICE' ? 'en-US-Chirp3-HD-Algenib' : '',
          }),
        }),
      });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: () => Promise.resolve('Service Unavailable'),
      });
      vi.stubGlobal('fetch', mockFetch);

      const response: Response = await request(ttsApp)
        .post('/synthesize')
        .send({ text: 'Hello world' });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(502);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('TTS_API_ERROR');
      expect(body.error?.message).toContain('503');
    });

    it('should fall back to default voice when Remote Config fails', async () => {
      mockGetApp.mockReturnValue({
        options: {
          credential: {
            getAccessToken: vi.fn().mockResolvedValue({ access_token: 'test-token' }),
          },
        },
      });

      mockGetRemoteConfig.mockReturnValue({
        getServerTemplate: vi.fn().mockRejectedValue(new Error('Remote Config unavailable')),
      });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ audioContent: 'fallback-audio' }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const response = await request(ttsApp)
        .post('/synthesize')
        .send({ text: 'Hello world' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: { audio: 'fallback-audio' },
      });

      // Verify fetch was called with the default voice
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const callArgs = mockFetch.mock.calls[0] as [string, { body: string }];
      expect(callArgs[0]).toBe('https://texttospeech.googleapis.com/v1/text:synthesize');
      expect(callArgs[1].body).toContain('en-US-Chirp3-HD-Algenib');
    });
  });
});
