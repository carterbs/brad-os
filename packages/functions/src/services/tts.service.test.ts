import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_TTS_VOICE,
  deriveLanguageCode,
  TtsApiError,
  TtsAuthError,
  TtsService,
  type TtsServiceDeps,
} from './tts.service.js';

function createDeps(overrides: Partial<TtsServiceDeps> = {}): TtsServiceDeps {
  const getAccessToken = vi.fn().mockResolvedValue({ access_token: 'token-123' });
  const getServerTemplate = vi.fn().mockResolvedValue({
    evaluate: (): { getString: () => string } => ({ getString: () => 'en-US-Chirp3-HD-Algenib' }),
  });
  const fetchFn = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ audioContent: 'base64-audio' }),
  });

  return {
    getApp: () => ({ options: { credential: { getAccessToken } } }),
    getRemoteConfig: () => ({ getServerTemplate }),
    fetchFn: fetchFn as unknown as typeof fetch,
    warn: vi.fn(),
    ...overrides,
  };
}

describe('TtsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('derives language code from standard voice string', () => {
    expect(deriveLanguageCode('en-US-Chirp3-HD-Algenib')).toBe('en-US');
    expect(deriveLanguageCode('invalidvoice')).toBe('en-US');
  });

  it('returns remote-config voice when available', async () => {
    const service = new TtsService(createDeps());
    const voice = await service.getVoice();
    expect(voice).toBe('en-US-Chirp3-HD-Algenib');
  });

  it('falls back to default voice when remote config returns empty string', async () => {
    const deps = createDeps({
      getRemoteConfig: (): ReturnType<TtsServiceDeps['getRemoteConfig']> => ({
        getServerTemplate: vi.fn().mockResolvedValue({
          evaluate: (): { getString: () => string } => ({ getString: () => '' }),
        }),
      }),
    });

    const service = new TtsService(deps);
    await expect(service.getVoice()).resolves.toBe(DEFAULT_TTS_VOICE);
  });

  it('falls back to default voice when remote config throws', async () => {
    const warnSpy = vi.fn();
    const deps = createDeps({
      getRemoteConfig: () => ({
        getServerTemplate: vi.fn().mockRejectedValue(new Error('rc unavailable')),
      }),
      warn: warnSpy,
    });

    const service = new TtsService(deps);
    const voice = await service.getVoice();

    expect(voice).toBe(DEFAULT_TTS_VOICE);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('throws TtsAuthError when credential is missing', async () => {
    const deps = createDeps({
      getApp: () => ({ options: { credential: undefined } }),
    });

    const service = new TtsService(deps);
    await expect(service.getAccessToken()).rejects.toBeInstanceOf(TtsAuthError);
  });

  it('throws TtsAuthError when getAccessToken fails', async () => {
    const deps = createDeps({
      getApp: () => ({
        options: {
          credential: {
            getAccessToken: vi.fn().mockRejectedValue(new Error('credential failure')),
          },
        },
      }),
    });

    const service = new TtsService(deps);
    await expect(service.getAccessToken()).rejects.toBeInstanceOf(TtsAuthError);
  });

  it('synthesizes speech and sends expected payload', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ audioContent: 'audio-blob' }),
    });

    const service = new TtsService(createDeps({ fetchFn: fetchFn as unknown as typeof fetch }));
    const audio = await service.synthesize('hello world');

    expect(audio).toBe('audio-blob');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const call = fetchFn.mock.calls[0] as [string, { body: string }];
    expect(call[0]).toBe('https://texttospeech.googleapis.com/v1/text:synthesize');
    expect(call[1].body).toContain('hello world');
    expect(call[1].body).toContain('en-US');
  });

  it('throws TtsApiError when upstream API fails', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: () => Promise.resolve({ message: 'Service Unavailable' }),
    });

    const service = new TtsService(createDeps({ fetchFn: fetchFn as unknown as typeof fetch }));

    await expect(service.synthesize('hello world')).rejects.toBeInstanceOf(TtsApiError);
    await expect(service.synthesize('hello world')).rejects.toMatchObject({ statusCode: 503 });
  });
});
