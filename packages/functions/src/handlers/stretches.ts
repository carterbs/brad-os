import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import { errorHandler, NotFoundError } from '../middleware/error-handler.js';
import { stripPathPrefix } from '../middleware/strip-path-prefix.js';
import { requireAppCheck } from '../middleware/app-check.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { StretchRepository } from '../repositories/stretch.repository.js';
import { getFirestoreDb } from '../firebase.js';

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());
app.use(stripPathPrefix('stretches'));
app.use(requireAppCheck);

// Lazy repository initialization
let stretchRepo: StretchRepository | null = null;
function getRepo(): StretchRepository {
  if (stretchRepo === null) {
    stretchRepo = new StretchRepository(getFirestoreDb());
  }
  return stretchRepo;
}

// GET / — all regions with stretches
app.get('/', asyncHandler(async (_req: Request, res: Response, _next: NextFunction) => {
  const regions = await getRepo().findAll();
  res.json({ success: true, data: regions });
}));

// GET /:region — single region with stretches
app.get('/:region', asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const region = req.params['region'] ?? '';
  const data = await getRepo().findByRegion(region);
  if (data === null) {
    next(new NotFoundError('StretchRegion', region));
    return;
  }
  res.json({ success: true, data });
}));

// Error handler must be last
app.use(errorHandler);

export const stretchesApp = app;
