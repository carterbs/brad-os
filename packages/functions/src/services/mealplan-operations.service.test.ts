import { describe, it, expect } from 'vitest';
import type { Meal, MealPlanEntry, CritiqueOperation } from '../shared.js';
import { applyOperations } from './mealplan-operations.service.js';

function createTestMeal(overrides: Partial<Meal> = {}): Meal {
  return {
    id: 'meal-1',
    name: 'Test Meal',
    meal_type: 'dinner',
    effort: 5,
    has_red_meat: false,
    prep_ahead: false,
    url: '',
    last_planned: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function createTestPlan(): MealPlanEntry[] {
  return [
    { day_index: 0, meal_type: 'breakfast', meal_id: 'meal-b1', meal_name: 'Oatmeal' },
    { day_index: 0, meal_type: 'lunch', meal_id: 'meal-l1', meal_name: 'Sandwich' },
    { day_index: 0, meal_type: 'dinner', meal_id: 'meal-d1', meal_name: 'Pasta' },
    { day_index: 1, meal_type: 'breakfast', meal_id: 'meal-b2', meal_name: 'Eggs' },
    { day_index: 1, meal_type: 'lunch', meal_id: 'meal-l2', meal_name: 'Salad' },
    { day_index: 1, meal_type: 'dinner', meal_id: 'meal-d2', meal_name: 'Steak' },
    { day_index: 2, meal_type: 'breakfast', meal_id: 'meal-b3', meal_name: 'Toast' },
    { day_index: 2, meal_type: 'lunch', meal_id: 'meal-l3', meal_name: 'Soup' },
    { day_index: 2, meal_type: 'dinner', meal_id: null, meal_name: null },
  ];
}

function createTestMeals(): Meal[] {
  return [
    createTestMeal({ id: 'meal-b1', name: 'Oatmeal', meal_type: 'breakfast', effort: 1 }),
    createTestMeal({ id: 'meal-l1', name: 'Sandwich', meal_type: 'lunch', effort: 1 }),
    createTestMeal({ id: 'meal-d1', name: 'Pasta', meal_type: 'dinner', effort: 4 }),
    createTestMeal({ id: 'meal-b2', name: 'Eggs', meal_type: 'breakfast', effort: 2 }),
    createTestMeal({ id: 'meal-l2', name: 'Salad', meal_type: 'lunch', effort: 1 }),
    createTestMeal({ id: 'meal-d2', name: 'Steak', meal_type: 'dinner', effort: 5, has_red_meat: true, prep_ahead: false }),
    createTestMeal({ id: 'meal-b3', name: 'Toast', meal_type: 'breakfast', effort: 1 }),
    createTestMeal({ id: 'meal-l3', name: 'Soup', meal_type: 'lunch', effort: 2 }),
    createTestMeal({ id: 'meal-new', name: 'Chicken Stir Fry', meal_type: 'dinner', effort: 5 }),
    createTestMeal({ id: 'meal-extra', name: 'Tacos', meal_type: 'dinner', effort: 4 }),
  ];
}

describe('MealPlan Operations Service', () => {
  describe('applyOperations', () => {
    it('should swap a valid meal ID into an existing slot', () => {
      const plan = createTestPlan();
      const meals = createTestMeals();
      const operations: CritiqueOperation[] = [
        { day_index: 0, meal_type: 'dinner', new_meal_id: 'meal-new' },
      ];

      const { updatedPlan, errors } = applyOperations(plan, operations, meals);

      expect(errors).toEqual([]);
      const dinner = updatedPlan.find(
        (e) => e.day_index === 0 && e.meal_type === 'dinner'
      );
      expect(dinner?.meal_id).toBe('meal-new');
      expect(dinner?.meal_name).toBe('Chicken Stir Fry');
    });

    it('should add a meal to a null slot', () => {
      const plan = createTestPlan();
      const meals = createTestMeals();
      const operations: CritiqueOperation[] = [
        { day_index: 2, meal_type: 'dinner', new_meal_id: 'meal-new' },
      ];

      const { updatedPlan, errors } = applyOperations(plan, operations, meals);

      expect(errors).toEqual([]);
      const dinner = updatedPlan.find(
        (e) => e.day_index === 2 && e.meal_type === 'dinner'
      );
      expect(dinner?.meal_id).toBe('meal-new');
      expect(dinner?.meal_name).toBe('Chicken Stir Fry');
    });

    it('should remove a meal by setting newMealId to null', () => {
      const plan = createTestPlan();
      const meals = createTestMeals();
      const operations: CritiqueOperation[] = [
        { day_index: 0, meal_type: 'dinner', new_meal_id: null },
      ];

      const { updatedPlan, errors } = applyOperations(plan, operations, meals);

      expect(errors).toEqual([]);
      const dinner = updatedPlan.find(
        (e) => e.day_index === 0 && e.meal_type === 'dinner'
      );
      expect(dinner?.meal_id).toBeNull();
      expect(dinner?.meal_name).toBeNull();
    });

    it('should skip operation with invalid meal ID and collect error', () => {
      const plan = createTestPlan();
      const meals = createTestMeals();
      const operations: CritiqueOperation[] = [
        { day_index: 0, meal_type: 'dinner', new_meal_id: 'nonexistent-id' },
      ];

      const { updatedPlan, errors } = applyOperations(plan, operations, meals);

      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('nonexistent-id');
      expect(errors[0]).toContain('not found');
      // Original plan unchanged for that slot
      const dinner = updatedPlan.find(
        (e) => e.day_index === 0 && e.meal_type === 'dinner'
      );
      expect(dinner?.meal_id).toBe('meal-d1');
    });

    it('should skip operation with out-of-range dayIndex and collect error', () => {
      const plan = createTestPlan();
      const meals = createTestMeals();
      const operations: CritiqueOperation[] = [
        { day_index: 7, meal_type: 'dinner', new_meal_id: 'meal-new' },
        { day_index: -1, meal_type: 'dinner', new_meal_id: 'meal-new' },
      ];

      const { errors } = applyOperations(plan, operations, meals);

      expect(errors).toHaveLength(2);
      expect(errors[0]).toContain('Invalid day_index 7');
      expect(errors[1]).toContain('Invalid day_index -1');
    });

    it('should skip operation with invalid mealType and collect error', () => {
      const plan = createTestPlan();
      const meals = createTestMeals();
      const operations: CritiqueOperation[] = [
        { day_index: 0, meal_type: 'snack' as 'dinner', new_meal_id: 'meal-new' },
      ];

      const { errors } = applyOperations(plan, operations, meals);

      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('Invalid meal_type');
    });

    it('should skip operation that would create a duplicate meal in the plan', () => {
      const plan = createTestPlan();
      const meals = createTestMeals();
      // Try to put meal-d1 into day 1 dinner, but meal-d1 already exists at day 0 dinner
      const operations: CritiqueOperation[] = [
        { day_index: 1, meal_type: 'dinner', new_meal_id: 'meal-d1' },
      ];

      const { updatedPlan, errors } = applyOperations(plan, operations, meals);

      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('already exists elsewhere');
      // Day 1 dinner unchanged
      const dinner = updatedPlan.find(
        (e) => e.day_index === 1 && e.meal_type === 'dinner'
      );
      expect(dinner?.meal_id).toBe('meal-d2');
    });

    it('should apply multiple operations in order', () => {
      const plan = createTestPlan();
      const meals = createTestMeals();
      const operations: CritiqueOperation[] = [
        // First, remove the existing dinner from day 0
        { day_index: 0, meal_type: 'dinner', new_meal_id: null },
        // Then add meal-new to day 2 dinner (null slot)
        { day_index: 2, meal_type: 'dinner', new_meal_id: 'meal-new' },
        // Now put meal-d1 back in day 0 — this should succeed since we removed it
        { day_index: 0, meal_type: 'dinner', new_meal_id: 'meal-extra' },
      ];

      const { updatedPlan, errors } = applyOperations(plan, operations, meals);

      expect(errors).toEqual([]);
      const day0 = updatedPlan.find((e) => e.day_index === 0 && e.meal_type === 'dinner');
      const day2 = updatedPlan.find((e) => e.day_index === 2 && e.meal_type === 'dinner');
      expect(day0?.meal_id).toBe('meal-extra');
      expect(day0?.meal_name).toBe('Tacos');
      expect(day2?.meal_id).toBe('meal-new');
      expect(day2?.meal_name).toBe('Chicken Stir Fry');
    });

    it('should return plan unchanged with empty operations array', () => {
      const plan = createTestPlan();
      const meals = createTestMeals();
      const operations: CritiqueOperation[] = [];

      const { updatedPlan, errors } = applyOperations(plan, operations, meals);

      expect(errors).toEqual([]);
      expect(updatedPlan).toEqual(plan);
    });

    it('should not mutate the original plan array', () => {
      const plan = createTestPlan();
      const originalPlan = plan.map((e) => ({ ...e }));
      const meals = createTestMeals();
      const operations: CritiqueOperation[] = [
        { day_index: 0, meal_type: 'dinner', new_meal_id: 'meal-new' },
      ];

      applyOperations(plan, operations, meals);

      expect(plan).toEqual(originalPlan);
    });
  });
});
