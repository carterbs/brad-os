import type { BaseEntity } from './database.js';

// ============ Meals ============

export type MealType = 'breakfast' | 'lunch' | 'dinner';
export type MealAudience = 'family' | 'adult';
export type MealTrack = 'family' | 'adult';

export interface Meal extends BaseEntity {
  name: string;
  meal_type: MealType;
  audience: MealAudience;
  effort: number;
  has_red_meat: boolean;
  prep_ahead: boolean;
  url: string | null;
  last_planned: string | null;
}
