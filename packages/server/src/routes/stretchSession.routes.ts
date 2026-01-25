import { Router, type Request, type Response } from 'express';
import {
  createSuccessResponse,
  createErrorResponse,
} from '@lifting/shared';
import { createStretchSessionSchema } from '@lifting/shared';
import { getStretchSessionRepository } from '../repositories/index.js';

export const stretchSessionRouter = Router();

/**
 * POST /api/stretch-sessions
 * Create a new stretch session record.
 */
stretchSessionRouter.post('/', (req: Request, res: Response): void => {
  const parseResult = createStretchSessionSchema.safeParse(req.body);
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
    const repository = getStretchSessionRepository();
    const record = repository.create(parseResult.data);
    res.status(201).json(createSuccessResponse(record));
  } catch (error) {
    console.error('Failed to create stretch session:', error);
    res.status(500).json(createErrorResponse('INTERNAL_ERROR', 'Failed to create stretch session'));
  }
});

/**
 * GET /api/stretch-sessions/latest
 * Get the most recent stretch session.
 */
stretchSessionRouter.get('/latest', (_req: Request, res: Response): void => {
  try {
    const repository = getStretchSessionRepository();
    const record = repository.getLatest();
    res.json(createSuccessResponse(record));
  } catch (error) {
    console.error('Failed to get latest stretch session:', error);
    res.status(500).json(createErrorResponse('INTERNAL_ERROR', 'Failed to get latest stretch session'));
  }
});

/**
 * GET /api/stretch-sessions
 * Get all stretch sessions.
 */
stretchSessionRouter.get('/', (_req: Request, res: Response): void => {
  try {
    const repository = getStretchSessionRepository();
    const records = repository.getAll();
    res.json(createSuccessResponse(records));
  } catch (error) {
    console.error('Failed to get stretch sessions:', error);
    res.status(500).json(createErrorResponse('INTERNAL_ERROR', 'Failed to get stretch sessions'));
  }
});
