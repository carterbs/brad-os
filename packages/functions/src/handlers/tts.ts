import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
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

// POST /tts/synthesize
app.post('/synthesize', validate(synthesizeSchema), asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const { text } = req.body as SynthesizeRequest;

  const apiKey = process.env['GOOGLE_TTS_API_KEY'] ?? '';
  if (apiKey === '') {
    res.status(500).json({
      success: false,
      error: { code: 'MISSING_SECRET', message: 'TTS API key not configured' },
    });
    return;
  }

  const voice = process.env['TTS_VOICE'] ?? 'en-US-Chirp3-HD-Algenib';
  const languageCode = deriveLanguageCode(voice);

  const googleResponse = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode, name: voice },
      audioConfig: { audioEncoding: 'MP3' },
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
