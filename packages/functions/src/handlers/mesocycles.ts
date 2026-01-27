import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import {
  createMesocycleSchema,
  type ApiResponse,
  type Mesocycle,
  type MesocycleWithDetails,
  type CreateMesocycleRequest,
} from '@brad-os/shared';
import { validate } from '../middleware/validate.js';
import { errorHandler, NotFoundError, ValidationError, ConflictError } from '../middleware/error-handler.js';
import { stripPathPrefix } from '../middleware/strip-path-prefix.js';
import { requireAppCheck } from '../middleware/app-check.js';
import { MesocycleService } from '../services/mesocycle.service.js';
import { getFirestoreDb } from '../firebase.js';

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());
app.use(stripPathPrefix('mesocycles'));
app.use(requireAppCheck);

// Lazy service initialization
let mesocycleService: MesocycleService | null = null;
function getService(): MesocycleService {
  if (!mesocycleService) {
    mesocycleService = new MesocycleService(getFirestoreDb());
  }
  return mesocycleService;
}

// GET /mesocycles
app.get('/', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const service = getService();
    const mesocycles = await service.list();
    const response: ApiResponse<Mesocycle[]> = { success: true, data: mesocycles };
    res.json(response);
  } catch (error) {
    next(error);
  }
});

// GET /mesocycles/active
app.get('/active', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const service = getService();
    const mesocycle = await service.getActive();
    const response: ApiResponse<MesocycleWithDetails | null> = { success: true, data: mesocycle };
    res.json(response);
  } catch (error) {
    next(error);
  }
});

// GET /mesocycles/:id
app.get('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const service = getService();
    const id = req.params['id'];

    if (!id) {
      throw new NotFoundError('Mesocycle', 'unknown');
    }

    const mesocycle = await service.getById(id);
    if (!mesocycle) {
      throw new NotFoundError('Mesocycle', id);
    }

    const response: ApiResponse<MesocycleWithDetails> = { success: true, data: mesocycle };
    res.json(response);
  } catch (error) {
    next(error);
  }
});

// POST /mesocycles
app.post('/', validate(createMesocycleSchema), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const service = getService();
    const createRequest = req.body as CreateMesocycleRequest;
    const mesocycle = await service.create(createRequest);
    const response: ApiResponse<Mesocycle> = { success: true, data: mesocycle };
    res.status(201).json(response);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        next(new NotFoundError('Plan', (req.body as CreateMesocycleRequest).plan_id));
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
    next(error);
  }
});

// PUT /mesocycles/:id/start
app.put('/:id/start', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const service = getService();
    const id = req.params['id'];

    if (!id) {
      throw new NotFoundError('Mesocycle', 'unknown');
    }

    const mesocycle = await service.start(id);
    const response: ApiResponse<Mesocycle> = { success: true, data: mesocycle };
    res.json(response);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        next(new NotFoundError('Mesocycle', req.params['id'] ?? 'unknown'));
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
    next(error);
  }
});

// PUT /mesocycles/:id/complete
app.put('/:id/complete', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const service = getService();
    const id = req.params['id'];

    if (!id) {
      throw new NotFoundError('Mesocycle', 'unknown');
    }

    const mesocycle = await service.complete(id);
    const response: ApiResponse<Mesocycle> = { success: true, data: mesocycle };
    res.json(response);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        next(new NotFoundError('Mesocycle', req.params['id'] ?? 'unknown'));
        return;
      }
      if (error.message.includes('not active')) {
        next(new ValidationError(error.message));
        return;
      }
    }
    next(error);
  }
});

// PUT /mesocycles/:id/cancel
app.put('/:id/cancel', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const service = getService();
    const id = req.params['id'];

    if (!id) {
      throw new NotFoundError('Mesocycle', 'unknown');
    }

    const mesocycle = await service.cancel(id);
    const response: ApiResponse<Mesocycle> = { success: true, data: mesocycle };
    res.json(response);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        next(new NotFoundError('Mesocycle', req.params['id'] ?? 'unknown'));
        return;
      }
      if (error.message.includes('not active')) {
        next(new ValidationError(error.message));
        return;
      }
    }
    next(error);
  }
});

// Error handler must be last
app.use(errorHandler);

export const mesocyclesApp = app;
