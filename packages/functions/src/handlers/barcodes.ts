import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import {
  createBarcodeSchema,
  updateBarcodeSchema,
  type CreateBarcodeDTO,
  type UpdateBarcodeDTO,
} from '../shared.js';
import { validate } from '../middleware/validate.js';
import { errorHandler, NotFoundError } from '../middleware/error-handler.js';
import { stripPathPrefix } from '../middleware/strip-path-prefix.js';
import { requireAppCheck } from '../middleware/app-check.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { BarcodeRepository } from '../repositories/barcode.repository.js';
import { getFirestoreDb } from '../firebase.js';

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());
app.use(stripPathPrefix('barcodes'));
app.use(requireAppCheck);

// Lazy repository initialization
let barcodeRepo: BarcodeRepository | null = null;
function getRepo(): BarcodeRepository {
  if (barcodeRepo === null) {
    barcodeRepo = new BarcodeRepository(getFirestoreDb());
  }
  return barcodeRepo;
}

// GET /barcodes
app.get('/', asyncHandler(async (_req: Request, res: Response, _next: NextFunction) => {
  const barcodes = await getRepo().findAll();
  res.json({ success: true, data: barcodes });
}));

// GET /barcodes/:id
app.get('/:id', asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const id = req.params['id'] ?? '';
  const barcode = await getRepo().findById(id);
  if (barcode === null) {
    next(new NotFoundError('Barcode', id));
    return;
  }
  res.json({ success: true, data: barcode });
}));

// POST /barcodes
app.post('/', validate(createBarcodeSchema), asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const body = req.body as CreateBarcodeDTO;
  const barcode = await getRepo().create(body);
  res.status(201).json({ success: true, data: barcode });
}));

// PUT /barcodes/:id
app.put('/:id', validate(updateBarcodeSchema), asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const id = req.params['id'] ?? '';
  const body = req.body as UpdateBarcodeDTO;
  const barcode = await getRepo().update(id, body);
  if (barcode === null) {
    next(new NotFoundError('Barcode', id));
    return;
  }
  res.json({ success: true, data: barcode });
}));

// DELETE /barcodes/:id
app.delete('/:id', asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const id = req.params['id'] ?? '';
  const deleted = await getRepo().delete(id);
  if (!deleted) {
    next(new NotFoundError('Barcode', id));
    return;
  }
  res.json({ success: true, data: { deleted: true } });
}));

// Error handler must be last
app.use(errorHandler);

export const barcodesApp = app;
