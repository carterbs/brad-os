import { getApp } from 'firebase-admin/app';
import { getRemoteConfig } from 'firebase-admin/remote-config';
import { warn } from 'firebase-functions/logger';

import type { FirebaseAppLike, GoogleTtsResponse, RemoteConfigLike, TtsServiceDeps } from '../types/tts.js';

export type { GoogleTtsResponse, TtsServiceDeps } from '../types/tts.js';

export const DEFAULT_TTS_VOICE = 'en-US-Chirp3-HD-Algenib';

export class TtsAuthError extends Error {
  constructor(message = 'Failed to obtain credentials for TTS API') {
    super(message);
    this.name = 'TtsAuthError';
  }
}

export class TtsApiError extends Error {
  constructor(public readonly statusCode: number, message?: string) {
    super(message ?? `Google TTS API returned ${statusCode}`);
    this.name = 'TtsApiError';
  }
}

export function deriveLanguageCode(voiceName: string): string {
  const parts = voiceName.split('-');
  if (parts.length >= 2) {
    return `${parts[0]}-${parts[1]}`;
  }
  return 'en-US';
}

export class TtsService {
  constructor(private readonly deps: TtsServiceDeps = {
    getApp: () => getApp() as FirebaseAppLike,
    getRemoteConfig: () => getRemoteConfig() as RemoteConfigLike,
    fetchFn: fetch,
    warn,
  }) {}

  async getAccessToken(): Promise<string> {
    const credential = this.deps.getApp().options.credential;
    if (credential === undefined) {
      throw new TtsAuthError('No credential available on Firebase app');
    }

    try {
      const token = await credential.getAccessToken();
      return token.access_token;
    } catch {
      throw new TtsAuthError();
    }
  }

  async getVoice(): Promise<string> {
    try {
      const remoteConfig = this.deps.getRemoteConfig();
      const template = await remoteConfig.getServerTemplate({
        defaultConfig: { TTS_VOICE: DEFAULT_TTS_VOICE },
      });
      const value = template.evaluate().getString('TTS_VOICE');
      return value !== '' ? value : DEFAULT_TTS_VOICE;
    } catch (error) {
      this.deps.warn('Failed to fetch Remote Config, using default voice:', error);
      return DEFAULT_TTS_VOICE;
    }
  }

  async synthesize(text: string): Promise<string> {
    const voice = await this.getVoice();
    const languageCode = deriveLanguageCode(voice);
    const accessToken = await this.getAccessToken();

    const response = await this.deps.fetchFn('https://texttospeech.googleapis.com/v1/text:synthesize', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode, name: voice },
        audioConfig: { audioEncoding: 'MP3', sampleRateHertz: 48000 },
      }),
    });

    if (!response.ok) {
      throw new TtsApiError(response.status);
    }

    const body = await response.json() as GoogleTtsResponse;
    return body.audioContent;
  }
}
