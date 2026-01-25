import { Router, type Request, type Response } from 'express';
import {
  createSuccessResponse,
  createErrorResponse,
} from '@brad-os/shared';
import { createMeditationSessionSchema } from '@brad-os/shared';
import { getMeditationSessionRepository } from '../repositories/index.js';

export const meditationSessionRouter = Router();

/**
 * POST /api/meditation-sessions
 * Create a new meditation session record.
 */
meditationSessionRouter.post('/', (req: Request, res: Response): void => {
  const parseResult = createMeditationSessionSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json(
      createErrorResponse(
        'VALIDATION_ERROR',
        'Invalid request body',
        parseResult.error.format()
      )
    );
    return;
  }

  try {
    const repository = getMeditationSessionRepository();
    const record = repository.create(parseResult.data);
    res.status(201).json(createSuccessResponse(record));
  } catch (error) {
    console.error('Failed to create meditation session:', error);
    res.status(500).json(createErrorResponse('INTERNAL_ERROR', 'Failed to create meditation session'));
  }
});

/**
 * GET /api/meditation-sessions/latest
 * Get the most recent meditation session.
 */
meditationSessionRouter.get('/latest', (_req: Request, res: Response): void => {
  try {
    const repository = getMeditationSessionRepository();
    const record = repository.getLatest();
    res.json(createSuccessResponse(record));
  } catch (error) {
    console.error('Failed to get latest meditation session:', error);
    res.status(500).json(createErrorResponse('INTERNAL_ERROR', 'Failed to get latest meditation session'));
  }
});

/**
 * GET /api/meditation-sessions/stats
 * Get aggregate statistics for meditation sessions.
 */
meditationSessionRouter.get('/stats', (_req: Request, res: Response): void => {
  try {
    const repository = getMeditationSessionRepository();
    const stats = repository.getStats();
    res.json(createSuccessResponse(stats));
  } catch (error) {
    console.error('Failed to get meditation session stats:', error);
    res.status(500).json(createErrorResponse('INTERNAL_ERROR', 'Failed to get meditation session stats'));
  }
});

/**
 * GET /api/meditation-sessions
 * Get all meditation sessions.
 */
meditationSessionRouter.get('/', (_req: Request, res: Response): void => {
  try {
    const repository = getMeditationSessionRepository();
    const records = repository.getAll();
    res.json(createSuccessResponse(records));
  } catch (error) {
    console.error('Failed to get meditation sessions:', error);
    res.status(500).json(createErrorResponse('INTERNAL_ERROR', 'Failed to get meditation sessions'));
  }
});
