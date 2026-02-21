import {
  createMealSchema,
  updateMealSchema,
} from '../shared.js';
import { createResourceRouter } from '../middleware/create-resource-router.js';
import { MealRepository } from '../repositories/meal.repository.js';

export const mealsApp = createResourceRouter({
  resourceName: 'meals',
  displayName: 'Meal',
  RepoClass: MealRepository,
  createSchema: createMealSchema,
  updateSchema: updateMealSchema,
});
