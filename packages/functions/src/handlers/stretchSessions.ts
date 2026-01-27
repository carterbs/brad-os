import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import { createStretchSessionSchema } from '@brad-os/shared';
import { validate } from '../middleware/validate.js';
import { errorHandler, NotFoundError } from '../middleware/error-handler.js';
import { stripPathPrefix } from '../middleware/strip-path-prefix.js';
import { StretchSessionRepository } from '../repositories/stretchSession.repository.js';
import { getFirestoreDb } from '../firebase.js';

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());
app.use(stripPathPrefix('stretch-sessions'));

// Lazy repository initialization
let repo: StretchSessionRepository | null = null;
function getRepo(): StretchSessionRepository {
  if (!repo) {
    repo = new StretchSessionRepository(getFirestoreDb());
  }
  return repo;
}

// POST /stretch-sessions
app.post('/', validate(createStretchSessionSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const session = await getRepo().create(req.body);
    res.status(201).json({ success: true, data: session });
  } catch (error) {
    next(error);
  }
});

// GET /stretch-sessions
app.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const sessions = await getRepo().findAll();
    res.json({ success: true, data: sessions });
  } catch (error) {
    next(error);
  }
});

// GET /stretch-sessions/latest
app.get('/latest', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const session = await getRepo().findLatest();
    res.json({ success: true, data: session });
  } catch (error) {
    next(error);
  }
});

// GET /stretch-sessions/:id
app.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const session = await getRepo().findById(req.params['id'] ?? '');
    if (!session) {
      throw new NotFoundError('StretchSession', req.params['id'] ?? '');
    }
    res.json({ success: true, data: session });
  } catch (error) {
    next(error);
  }
});

// Error handler must be last
app.use(errorHandler);

export const stretchSessionsApp = app;
