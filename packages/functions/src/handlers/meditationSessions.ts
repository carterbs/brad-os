import { type Request, type Response, type NextFunction } from 'express';
import { createMeditationSessionSchema, type CreateMeditationSessionRequest } from '../shared.js';
import { validate } from '../middleware/validate.js';
import { errorHandler, NotFoundError } from '../middleware/error-handler.js';
import { createBaseApp } from '../middleware/create-resource-router.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { MeditationSessionRepository } from '../repositories/meditationSession.repository.js';
import { getFirestoreDb } from '../firebase.js';

const app = createBaseApp('meditation-sessions');

// Lazy repository initialization
let repo: MeditationSessionRepository | null = null;
function getRepo(): MeditationSessionRepository {
  if (repo === null) {
    repo = new MeditationSessionRepository(getFirestoreDb());
  }
  return repo;
}

// POST /meditation-sessions
app.post('/', validate(createMeditationSessionSchema), asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const body = req.body as CreateMeditationSessionRequest;
  const session = await getRepo().create(body);
  res.status(201).json({ success: true, data: session });
}));

// GET /meditation-sessions
app.get('/', asyncHandler(async (_req: Request, res: Response, _next: NextFunction) => {
  const sessions = await getRepo().findAll();
  res.json({ success: true, data: sessions });
}));

// GET /meditation-sessions/stats
app.get('/stats', asyncHandler(async (_req: Request, res: Response, _next: NextFunction) => {
  const stats = await getRepo().getStats();
  res.json({ success: true, data: stats });
}));

// GET /meditation-sessions/latest
app.get('/latest', asyncHandler(async (_req: Request, res: Response, _next: NextFunction) => {
  const session = await getRepo().findLatest();
  res.json({ success: true, data: session });
}));

// GET /meditation-sessions/:id
app.get('/:id', asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const id = req.params['id'] ?? '';
  const session = await getRepo().findById(id);
  if (session === null) {
    next(new NotFoundError('MeditationSession', id));
    return;
  }
  res.json({ success: true, data: session });
}));

app.use(errorHandler);

export const meditationSessionsApp = app;
