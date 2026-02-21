import { type Request, type Response, type NextFunction } from 'express';
import { createStretchSessionSchema, type CreateStretchSessionRequest } from '../shared.js';
import { validate } from '../middleware/validate.js';
import { errorHandler, NotFoundError } from '../middleware/error-handler.js';
import { createBaseApp } from '../middleware/create-resource-router.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { StretchSessionRepository } from '../repositories/stretchSession.repository.js';
import { getFirestoreDb } from '../firebase.js';

const app = createBaseApp('stretch-sessions');

// Lazy repository initialization
let repo: StretchSessionRepository | null = null;
function getRepo(): StretchSessionRepository {
  if (repo === null) {
    repo = new StretchSessionRepository(getFirestoreDb());
  }
  return repo;
}

// POST /stretch-sessions
app.post('/', validate(createStretchSessionSchema), asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const body = req.body as CreateStretchSessionRequest;
  const session = await getRepo().create(body);
  res.status(201).json({ success: true, data: session });
}));

// GET /stretch-sessions
app.get('/', asyncHandler(async (_req: Request, res: Response, _next: NextFunction) => {
  const sessions = await getRepo().findAll();
  res.json({ success: true, data: sessions });
}));

// GET /stretch-sessions/latest
app.get('/latest', asyncHandler(async (_req: Request, res: Response, _next: NextFunction) => {
  const session = await getRepo().findLatest();
  res.json({ success: true, data: session });
}));

// GET /stretch-sessions/:id
app.get('/:id', asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const id = req.params['id'] ?? '';
  const session = await getRepo().findById(id);
  if (session === null) {
    next(new NotFoundError('StretchSession', id));
    return;
  }
  res.json({ success: true, data: session });
}));

app.use(errorHandler);

export const stretchSessionsApp = app;
