import type { BaseEntity } from './database.js';

// ============ Meals ============

export type MealType = 'breakfast' | 'lunch' | 'dinner';

export interface Meal extends BaseEntity {
  name: string;
  meal_type: MealType;
  effort: number;
  has_red_meat: boolean;
  url: string;
  last_planned: string | null;
}

