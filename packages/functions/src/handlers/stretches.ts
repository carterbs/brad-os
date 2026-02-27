import { createResourceRouter } from '../middleware/create-resource-router.js';
import { StretchRepository } from '../repositories/stretch.repository.js';
import { createStretchSchema, updateStretchSchema } from '../shared.js';

export const stretchesApp = createResourceRouter({
  resourceName: 'stretches',
  displayName: 'StretchRegion',
  RepoClass: StretchRepository,
  createSchema: createStretchSchema,
  updateSchema: updateStretchSchema,
});
