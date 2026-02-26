import { type Request, type Response, type NextFunction } from 'express';
import { errorHandler, NotFoundError } from '../middleware/error-handler.js';
import { createBaseApp } from '../middleware/create-resource-router.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { GuidedMeditationRepository } from '../repositories/guided-meditation.repository.js';
import { getFirestoreDb } from '../firebase.js';
import { GuidedMeditationService } from '../services/guided-meditation.service.js';

const app = createBaseApp('guidedMeditations');

// Lazy service initialization
let guidedMeditationService: GuidedMeditationService | null = null;
function getService(): GuidedMeditationService {
  if (guidedMeditationService === null) {
    const repository = new GuidedMeditationRepository(getFirestoreDb());
    guidedMeditationService = new GuidedMeditationService(repository);
  }
  return guidedMeditationService;
}

// GET / — list categories (also handle /categories for iOS client compatibility)
app.get('/', asyncHandler(async (_req: Request, res: Response, _next: NextFunction) => {
  const categories = await getService().listCategories();
  res.json({ success: true, data: categories });
}));

app.get('/categories', asyncHandler(async (_req: Request, res: Response, _next: NextFunction) => {
  const categories = await getService().listCategories();
  res.json({ success: true, data: categories });
}));

// GET /category/:category — list scripts by category (without segments/interjections)
app.get('/category/:category', asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const category = req.params['category'] ?? '';
  const scripts = await getService().listScriptsByCategory(category);
  res.json({ success: true, data: scripts });
}));

// GET /:id — get full script with segments and interjections
app.get('/:id', asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const id = req.params['id'] ?? '';
  const script = await getService().getScriptById(id);
  if (script === null) {
    next(new NotFoundError('GuidedMeditationScript', id));
    return;
  }
  res.json({ success: true, data: script });
}));

// Error handler must be last
app.use(errorHandler);

export const guidedMeditationsApp = app;
