import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import { errorHandler, NotFoundError } from '../middleware/error-handler.js';
import { stripPathPrefix } from '../middleware/strip-path-prefix.js';
import { requireAppCheck } from '../middleware/app-check.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { GuidedMeditationRepository } from '../repositories/guided-meditation.repository.js';
import { getFirestoreDb } from '../firebase.js';

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());
app.use(stripPathPrefix('guidedMeditations'));
app.use(requireAppCheck);

// Lazy repository initialization
let guidedMeditationRepo: GuidedMeditationRepository | null = null;
function getRepo(): GuidedMeditationRepository {
  if (guidedMeditationRepo === null) {
    guidedMeditationRepo = new GuidedMeditationRepository(getFirestoreDb());
  }
  return guidedMeditationRepo;
}

// GET / — list categories (also handle /categories for iOS client compatibility)
app.get('/', asyncHandler(async (_req: Request, res: Response, _next: NextFunction) => {
  const categories = await getRepo().getCategories();
  res.json({ success: true, data: categories });
}));

app.get('/categories', asyncHandler(async (_req: Request, res: Response, _next: NextFunction) => {
  const categories = await getRepo().getCategories();
  res.json({ success: true, data: categories });
}));

// GET /category/:category — list scripts by category (without segments/interjections)
app.get('/category/:category', asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const category = req.params['category'] ?? '';
  const scripts = await getRepo().findAllByCategory(category);
  res.json({ success: true, data: scripts });
}));

// GET /:id — get full script with segments and interjections
app.get('/:id', asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const id = req.params['id'] ?? '';
  const script = await getRepo().findById(id);
  if (script === null) {
    next(new NotFoundError('GuidedMeditationScript', id));
    return;
  }
  res.json({ success: true, data: script });
}));

// Error handler must be last
app.use(errorHandler);

export const guidedMeditationsApp = app;
