import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import type { ZodSchema } from 'zod';
import type { Firestore } from 'firebase-admin/firestore';
import { validate } from './validate.js';
import { errorHandler } from './error-handler.js';
import { stripPathPrefix } from './strip-path-prefix.js';
import { requireAppCheck } from './app-check.js';
import { asyncHandler } from './async-handler.js';
import { getFirestoreDb } from '../firebase.js';
import { NotFoundError } from '../types/errors.js';
import type { IBaseRepository } from '../types/repository.js';

/**
 * Create an Express app with the standard middleware stack.
 * Use this for handlers that need custom routes beyond basic CRUD.
 */
export function createBaseApp(resourceName: string): express.Application {
  const app = express();
  app.use(cors({ origin: true }));
  app.use(express.json());
  app.use(stripPathPrefix(resourceName));
  app.use(requireAppCheck);
  return app;
}

interface ResourceRouterConfig<
  T extends { id: string },
  CreateDTO,
  UpdateDTO,
  TRepo extends IBaseRepository<T, CreateDTO, UpdateDTO>,
> {
  resourceName: string;
  displayName: string;
  RepoClass: new (db: Firestore) => TRepo;
  createSchema: ZodSchema<CreateDTO>;
  updateSchema: ZodSchema<UpdateDTO>;
}

/**
 * Create a fully-configured Express app with standard CRUD routes.
 * Handles GET /, GET /:id, POST /, PUT /:id, DELETE /:id.
 */
export function createResourceRouter<
  T extends { id: string },
  CreateDTO,
  UpdateDTO,
  TRepo extends IBaseRepository<T, CreateDTO, UpdateDTO>,
>(config: ResourceRouterConfig<T, CreateDTO, UpdateDTO, TRepo>): express.Application {
  const app = createBaseApp(config.resourceName);

  let repo: TRepo | null = null;
  function getRepo(): TRepo {
    if (repo === null) {
      repo = new config.RepoClass(getFirestoreDb());
    }
    return repo;
  }

  // GET /
  app.get('/', asyncHandler(async (_req: Request, res: Response, _next: NextFunction) => {
    const items = await getRepo().findAll();
    res.json({ success: true, data: items });
  }));

  // GET /:id
  app.get('/:id', asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const id = req.params['id'] ?? '';
    const item = await getRepo().findById(id);
    if (item === null) {
      next(new NotFoundError(config.displayName, id));
      return;
    }
    res.json({ success: true, data: item });
  }));

  // POST /
  app.post('/', validate(config.createSchema), asyncHandler(async (req: Request<unknown, unknown, CreateDTO>, res: Response, _next: NextFunction) => {
    const item = await getRepo().create(req.body);
    res.status(201).json({ success: true, data: item });
  }));

  // PUT /:id
  app.put('/:id', validate(config.updateSchema), asyncHandler(async (req: Request<Record<string, string>, unknown, UpdateDTO>, res: Response, next: NextFunction) => {
    const id = req.params['id'] ?? '';
    const item = await getRepo().update(id, req.body);
    if (item === null) {
      next(new NotFoundError(config.displayName, id));
      return;
    }
    res.json({ success: true, data: item });
  }));

  // DELETE /:id
  app.delete('/:id', asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const id = req.params['id'] ?? '';
    const deleted = await getRepo().delete(id);
    if (!deleted) {
      next(new NotFoundError(config.displayName, id));
      return;
    }
    res.json({ success: true, data: { deleted: true } });
  }));

  app.use(errorHandler);

  return app;
}
