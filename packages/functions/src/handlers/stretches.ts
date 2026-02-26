import { type Request, type Response, type NextFunction } from 'express';
import { NotFoundError } from '../middleware/error-handler.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { createResourceRouter } from '../middleware/create-resource-router.js';
import { StretchRepository } from '../repositories/stretch.repository.js';
import { createStretchSchema, updateStretchSchema } from '../shared.js';

export const stretchesApp = createResourceRouter({
  resourceName: 'stretches',
  displayName: 'StretchRegion',
  RepoClass: StretchRepository,
  createSchema: createStretchSchema,
  updateSchema: updateStretchSchema,
  registerCustomRoutes: ({ app, getRepo }) => {
    app.get('/:region', asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
      const region = req.params['region'] ?? '';
      const data = await getRepo().findByRegion(region);
      if (data === null) {
        next(new NotFoundError('StretchRegion', region));
        return;
      }
      res.json({ success: true, data });
    }));
  },
});
