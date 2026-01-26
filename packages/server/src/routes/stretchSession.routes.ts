import { Router, type Request, type Response, type NextFunction } from 'express';
import {
  createSuccessResponse,
  createErrorResponse,
  type ApiResponse,
  type StretchSessionRecord,
} from '@brad-os/shared';
import { createStretchSessionSchema } from '@brad-os/shared';
import { getStretchSessionRepository } from '../repositories/index.js';
import { NotFoundError } from '../middleware/error-handler.js';

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
 * GET /api/stretch-sessions/:id
 * Get a stretch session by ID.
 */
stretchSessionRouter.get(
  '/:id',
  (req: Request, res: Response, next: NextFunction): void => {
    try {
      const repository = getStretchSessionRepository();
      const id = req.params['id'] ?? '';
      const session = repository.findById(id);

      if (!session) {
        throw new NotFoundError('Stretch session', id);
      }

      const response: ApiResponse<StretchSessionRecord> = {
        success: true,
        data: session,
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  }
);

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
