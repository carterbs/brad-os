import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from 'express';
import {
  createMesocycleSchema,
  type ApiResponse,
  type Mesocycle,
  type MesocycleWithDetails,
  type CreateMesocycleRequest,
} from '@lifting/shared';
import { validate } from '../middleware/validate.js';
import {
  NotFoundError,
  ValidationError,
  ConflictError,
} from '../middleware/error-handler.js';
import { getMesocycleService } from '../services/index.js';

export const mesocycleRouter = Router();

// GET /api/mesocycles
mesocycleRouter.get(
  '/',
  (_req: Request, res: Response, next: NextFunction): void => {
    try {
      const service = getMesocycleService();
      const mesocycles = service.list();

      const response: ApiResponse<Mesocycle[]> = {
        success: true,
        data: mesocycles,
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/mesocycles/active
mesocycleRouter.get(
  '/active',
  (_req: Request, res: Response, next: NextFunction): void => {
    try {
      const service = getMesocycleService();
      const mesocycle = service.getActive();

      const response: ApiResponse<MesocycleWithDetails | null> = {
        success: true,
        data: mesocycle,
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/mesocycles/:id
mesocycleRouter.get(
  '/:id',
  (req: Request, res: Response, next: NextFunction): void => {
    try {
      const service = getMesocycleService();
      const id = parseInt(req.params['id'] ?? '', 10);

      if (isNaN(id)) {
        throw new NotFoundError('Mesocycle', req.params['id'] ?? 'unknown');
      }

      const mesocycle = service.getById(id);

      if (!mesocycle) {
        throw new NotFoundError('Mesocycle', id);
      }

      const response: ApiResponse<MesocycleWithDetails> = {
        success: true,
        data: mesocycle,
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/mesocycles
mesocycleRouter.post(
  '/',
  validate(createMesocycleSchema),
  (req: Request, res: Response, next: NextFunction): void => {
    try {
      const service = getMesocycleService();
      const createRequest = req.body as CreateMesocycleRequest;
      const mesocycle = service.create(createRequest);

      const response: ApiResponse<Mesocycle> = {
        success: true,
        data: mesocycle,
      };
      res.status(201).json(response);
    } catch (error) {
      // Convert service errors to HTTP errors
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
  }
);

// PUT /api/mesocycles/:id/start
mesocycleRouter.put(
  '/:id/start',
  (req: Request, res: Response, next: NextFunction): void => {
    try {
      const service = getMesocycleService();
      const id = parseInt(req.params['id'] ?? '', 10);

      if (isNaN(id)) {
        throw new NotFoundError('Mesocycle', req.params['id'] ?? 'unknown');
      }

      const mesocycle = service.start(id);

      const response: ApiResponse<Mesocycle> = {
        success: true,
        data: mesocycle,
      };
      res.json(response);
    } catch (error) {
      // Convert service errors to HTTP errors
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          next(
            new NotFoundError(
              'Mesocycle',
              req.params['id'] ?? 'unknown'
            )
          );
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
  }
);

// PUT /api/mesocycles/:id/complete
mesocycleRouter.put(
  '/:id/complete',
  (req: Request, res: Response, next: NextFunction): void => {
    try {
      const service = getMesocycleService();
      const id = parseInt(req.params['id'] ?? '', 10);

      if (isNaN(id)) {
        throw new NotFoundError('Mesocycle', req.params['id'] ?? 'unknown');
      }

      const mesocycle = service.complete(id);

      const response: ApiResponse<Mesocycle> = {
        success: true,
        data: mesocycle,
      };
      res.json(response);
    } catch (error) {
      // Convert service errors to HTTP errors
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          next(
            new NotFoundError(
              'Mesocycle',
              req.params['id'] ?? 'unknown'
            )
          );
          return;
        }
        if (error.message.includes('not active')) {
          next(new ValidationError(error.message));
          return;
        }
      }
      next(error);
    }
  }
);

// PUT /api/mesocycles/:id/cancel
mesocycleRouter.put(
  '/:id/cancel',
  (req: Request, res: Response, next: NextFunction): void => {
    try {
      const service = getMesocycleService();
      const id = parseInt(req.params['id'] ?? '', 10);

      if (isNaN(id)) {
        throw new NotFoundError('Mesocycle', req.params['id'] ?? 'unknown');
      }

      const mesocycle = service.cancel(id);

      const response: ApiResponse<Mesocycle> = {
        success: true,
        data: mesocycle,
      };
      res.json(response);
    } catch (error) {
      // Convert service errors to HTTP errors
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          next(
            new NotFoundError(
              'Mesocycle',
              req.params['id'] ?? 'unknown'
            )
          );
          return;
        }
        if (error.message.includes('not active')) {
          next(new ValidationError(error.message));
          return;
        }
      }
      next(error);
    }
  }
);
