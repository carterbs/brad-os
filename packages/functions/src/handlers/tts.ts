import { type Request, type Response, type NextFunction } from 'express';
import { error as logError } from 'firebase-functions/logger';
import { type SynthesizeRequest, synthesizeSchema } from '../shared.js';
import { validate } from '../middleware/validate.js';
import { errorHandler } from '../middleware/error-handler.js';
import { createBaseApp } from '../middleware/create-resource-router.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { TtsApiError, TtsAuthError, TtsService } from '../services/tts.service.js';

const app = createBaseApp('tts');

// POST /tts/synthesize
app.post('/synthesize', validate(synthesizeSchema), asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const { text } = req.body as SynthesizeRequest;
  const ttsService = new TtsService();
  try {
    const audio = await ttsService.synthesize(text);
    res.json({ success: true, data: { audio } });
  } catch (error) {
    if (error instanceof TtsAuthError) {
      logError('Failed to get access token:', error);
      res.status(500).json({
        success: false,
        error: { code: 'AUTH_ERROR', message: 'Failed to obtain credentials for TTS API' },
      });
      return;
    }

    if (error instanceof TtsApiError) {
      logError('Google TTS API error:', error.statusCode, error.message);
      res.status(502).json({
        success: false,
        error: { code: 'TTS_API_ERROR', message: `Google TTS API returned ${error.statusCode}` },
      });
      return;
    }

    throw error;
  }
}));

// Error handler must be last
app.use(errorHandler);

export const ttsApp = app;
