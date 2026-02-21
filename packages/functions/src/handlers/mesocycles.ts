import { type Request, type Response, type NextFunction } from 'express';
import {
  createMesocycleSchema,
  type ApiResponse,
  type Mesocycle,
  type MesocycleWithDetails,
  type CreateMesocycleRequest,
} from '../shared.js';
import { validate } from '../middleware/validate.js';
import { errorHandler, NotFoundError, ValidationError, ConflictError } from '../middleware/error-handler.js';
import { createBaseApp } from '../middleware/create-resource-router.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { MesocycleService } from '../services/mesocycle.service.js';
import { getFirestoreDb } from '../firebase.js';

const app = createBaseApp('mesocycles');

// Lazy service initialization
let mesocycleService: MesocycleService | null = null;
function getService(): MesocycleService {
  if (mesocycleService === null) {
    mesocycleService = new MesocycleService(getFirestoreDb());
  }
  return mesocycleService;
}

// GET /mesocycles
app.get('/', asyncHandler(async (_req: Request, res: Response, _next: NextFunction): Promise<void> => {
  const service = getService();
  const mesocycles = await service.list();
  const response: ApiResponse<Mesocycle[]> = { success: true, data: mesocycles };
  res.json(response);
}));

// GET /mesocycles/active
app.get('/active', asyncHandler(async (_req: Request, res: Response, _next: NextFunction): Promise<void> => {
  const service = getService();
  const mesocycle = await service.getActive();
  const response: ApiResponse<MesocycleWithDetails | null> = { success: true, data: mesocycle };
  res.json(response);
}));

// GET /mesocycles/:id
app.get('/:id', asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const service = getService();
  const id = req.params['id'];

  if (id === undefined) {
    next(new NotFoundError('Mesocycle', 'unknown'));
    return;
  }

  const mesocycle = await service.getById(id);
  if (mesocycle === null) {
    next(new NotFoundError('Mesocycle', id));
    return;
  }

  const response: ApiResponse<MesocycleWithDetails> = { success: true, data: mesocycle };
  res.json(response);
}));

// POST /mesocycles
app.post('/', validate(createMesocycleSchema), asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const service = getService();
  const createRequest = req.body as CreateMesocycleRequest;
  try {
    const mesocycle = await service.create(createRequest);
    const response: ApiResponse<Mesocycle> = { success: true, data: mesocycle };
    res.status(201).json(response);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        next(new NotFoundError('Plan', createRequest.plan_id));
        return;
      }
      if (error.message.includes('already exists')) {
        next(new ConflictError(error.message));
        return;
      }
      if (error.message.includes('no workout days')) {
        next(new ValidationError(error.message));
        return;
      }
    }
    throw error;
  }
}));

// PUT /mesocycles/:id/start
app.put('/:id/start', asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const service = getService();
  const id = req.params['id'];

  if (id === undefined) {
    next(new NotFoundError('Mesocycle', 'unknown'));
    return;
  }

  try {
    const mesocycle = await service.start(id);
    const response: ApiResponse<Mesocycle> = { success: true, data: mesocycle };
    res.json(response);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        next(new NotFoundError('Mesocycle', id));
        return;
      }
      if (error.message.includes('Only pending')) {
        next(new ValidationError(error.message));
        return;
      }
      if (error.message.includes('already exists')) {
        next(new ConflictError(error.message));
        return;
      }
    }
    throw error;
  }
}));

// PUT /mesocycles/:id/complete
app.put('/:id/complete', asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const service = getService();
  const id = req.params['id'];

  if (id === undefined) {
    next(new NotFoundError('Mesocycle', 'unknown'));
    return;
  }

  try {
    const mesocycle = await service.complete(id);
    const response: ApiResponse<Mesocycle> = { success: true, data: mesocycle };
    res.json(response);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        next(new NotFoundError('Mesocycle', id));
        return;
      }
      if (error.message.includes('not active')) {
        next(new ValidationError(error.message));
        return;
      }
    }
    throw error;
  }
}));

// PUT /mesocycles/:id/cancel
app.put('/:id/cancel', asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const service = getService();
  const id = req.params['id'];

  if (id === undefined) {
    next(new NotFoundError('Mesocycle', 'unknown'));
    return;
  }

  try {
    const mesocycle = await service.cancel(id);
    const response: ApiResponse<Mesocycle> = { success: true, data: mesocycle };
    res.json(response);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        next(new NotFoundError('Mesocycle', id));
        return;
      }
      if (error.message.includes('not active')) {
        next(new ValidationError(error.message));
        return;
      }
    }
    throw error;
  }
}));

// Error handler must be last
app.use(errorHandler);

export const mesocyclesApp = app;
