import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import { getApp } from 'firebase-admin/app';
import { getRemoteConfig } from 'firebase-admin/remote-config';
import { type SynthesizeRequest, synthesizeSchema } from '../shared.js';
import { validate } from '../middleware/validate.js';
import { errorHandler } from '../middleware/error-handler.js';
import { stripPathPrefix } from '../middleware/strip-path-prefix.js';
import { requireAppCheck } from '../middleware/app-check.js';
import { asyncHandler } from '../middleware/async-handler.js';

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());
app.use(stripPathPrefix('tts'));
app.use(requireAppCheck);

const DEFAULT_VOICE = 'en-US-Chirp3-HD-Algenib';

interface GoogleTtsResponse {
  audioContent: string;
}

function deriveLanguageCode(voiceName: string): string {
  // Voice names like "en-US-Chirp3-HD-Algenib" → "en-US"
  const parts = voiceName.split('-');
  if (parts.length >= 2) {
    return `${parts[0]}-${parts[1]}`;
  }
  return 'en-US';
}

async function getAccessToken(): Promise<string> {
  const credential = getApp().options.credential;
  if (credential === undefined) {
    throw new Error('No credential available on Firebase app');
  }
  const token = await credential.getAccessToken();
  return token.access_token;
}

async function getTtsVoice(): Promise<string> {
  try {
    const rc = getRemoteConfig();
    const template = await rc.getServerTemplate({
      defaultConfig: { TTS_VOICE: DEFAULT_VOICE },
    });
    const config = template.evaluate();
    const voice = config.getString('TTS_VOICE');
    return voice !== '' ? voice : DEFAULT_VOICE;
  } catch (err) {
    console.warn('Failed to fetch Remote Config, using default voice:', err);
    return DEFAULT_VOICE;
  }
}

// POST /tts/synthesize
app.post('/synthesize', validate(synthesizeSchema), asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const { text } = req.body as SynthesizeRequest;

  const voice = await getTtsVoice();
  const languageCode = deriveLanguageCode(voice);

  let accessToken: string;
  try {
    accessToken = await getAccessToken();
  } catch (err) {
    console.error('Failed to get access token:', err);
    res.status(500).json({
      success: false,
      error: { code: 'AUTH_ERROR', message: 'Failed to obtain credentials for TTS API' },
    });
    return;
  }

  const googleResponse = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
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

  if (!googleResponse.ok) {
    const errorBody = await googleResponse.text();
    console.error('Google TTS API error:', googleResponse.status, errorBody);
    res.status(502).json({
      success: false,
      error: { code: 'TTS_API_ERROR', message: `Google TTS API returned ${googleResponse.status}` },
    });
    return;
  }

  const data = await googleResponse.json() as GoogleTtsResponse;
  res.json({ success: true, data: { audio: data.audioContent } });
}));

// Error handler must be last
app.use(errorHandler);

export const ttsApp = app;
