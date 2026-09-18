import { describe, it, expect } from 'vitest';
import type { Meal, MealPlanEntry, CritiqueOperation } from '../shared.js';
import { createMeal, createMealPlanEntry } from '../__tests__/utils/index.js';
import { applyOperations } from './mealplan-operations.service.js';

function createTestPlan(): MealPlanEntry[] {
  return [
    createMealPlanEntry({ day_index: 0, meal_type: 'breakfast', meal_id: 'meal-b1', meal_name: 'Oatmeal' }),
    createMealPlanEntry({ day_index: 0, meal_type: 'lunch', meal_id: 'meal-l1', meal_name: 'Sandwich' }),
    createMealPlanEntry({ day_index: 0, meal_type: 'dinner', meal_id: 'meal-d1', meal_name: 'Pasta' }),
    createMealPlanEntry({ day_index: 1, meal_type: 'breakfast', meal_id: 'meal-b2', meal_name: 'Eggs' }),
    createMealPlanEntry({ day_index: 1, meal_type: 'lunch', meal_id: 'meal-l2', meal_name: 'Salad' }),
    createMealPlanEntry({ day_index: 1, meal_type: 'dinner', meal_id: 'meal-d2', meal_name: 'Steak' }),
    createMealPlanEntry({ day_index: 2, meal_type: 'breakfast', meal_id: 'meal-b3', meal_name: 'Toast' }),
    createMealPlanEntry({ day_index: 2, meal_type: 'lunch', meal_id: 'meal-l3', meal_name: 'Soup' }),
    createMealPlanEntry({ day_index: 2, meal_type: 'dinner', meal_id: null, meal_name: null }),
  ];
}

function createTestMeals(): Meal[] {
  return [
    createMeal({ id: 'meal-b1', name: 'Oatmeal', meal_type: 'breakfast', effort: 1 }),
    createMeal({ id: 'meal-l1', name: 'Sandwich', meal_type: 'lunch', effort: 1 }),
    createMeal({ id: 'meal-d1', name: 'Pasta', meal_type: 'dinner', effort: 4 }),
    createMeal({ id: 'meal-b2', name: 'Eggs', meal_type: 'breakfast', effort: 2 }),
    createMeal({ id: 'meal-l2', name: 'Salad', meal_type: 'lunch', effort: 1 }),
    createMeal({ id: 'meal-d2', name: 'Steak', meal_type: 'dinner', effort: 5, has_red_meat: true, prep_ahead: false }),
    createMeal({ id: 'meal-b3', name: 'Toast', meal_type: 'breakfast', effort: 1 }),
    createMeal({ id: 'meal-l3', name: 'Soup', meal_type: 'lunch', effort: 2 }),
    createMeal({ id: 'meal-new', name: 'Chicken Stir Fry', meal_type: 'dinner', effort: 5 }),
    createMeal({ id: 'meal-extra', name: 'Tacos', meal_type: 'dinner', effort: 4 }),
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

    it('should reject a batch with an invalid meal ID', () => {
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

    it('should reject a batch with out-of-range dayIndex values', () => {
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

    it.each([0.5, Number.NaN, Number.POSITIVE_INFINITY])('rejects non-integer day index %s without modifying the plan', (dayIndex) => {
      const plan = createTestPlan();
      const result = applyOperations(plan, [
        { day_index: dayIndex, meal_type: 'dinner', new_meal_id: 'meal-new' },
      ], createTestMeals());
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Invalid day_index');
      expect(result.updatedPlan).toEqual(plan);
    });

    it('should reject a batch with an invalid mealType', () => {
      const plan = createTestPlan();
      const meals = createTestMeals();
      const operations: CritiqueOperation[] = [
        { day_index: 0, meal_type: 'snack' as 'dinner', new_meal_id: 'meal-new' },
      ];

      const { errors } = applyOperations(plan, operations, meals);

      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('Invalid meal_type');
    });

    it('should reject a batch that would create a duplicate meal in the plan', () => {
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

    it('should apply multiple operations as one batch', () => {
      const plan = createTestPlan();
      const meals = createTestMeals();
      const operations: CritiqueOperation[] = [
        // Fill an empty slot and replace an occupied slot in one batch.
        { day_index: 2, meal_type: 'dinner', new_meal_id: 'meal-new' },
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

    it('should allow two occupied slots to swap meals simultaneously', () => {
      const plan = createTestPlan();
      const meals = createTestMeals();
      const operations: CritiqueOperation[] = [
        { day_index: 0, meal_type: 'dinner', new_meal_id: 'meal-d2' },
        { day_index: 1, meal_type: 'dinner', new_meal_id: 'meal-d1' },
      ];

      const { updatedPlan, errors } = applyOperations(plan, operations, meals);

      expect(errors).toEqual([]);
      expect(updatedPlan.find((entry) => entry.day_index === 0 && entry.meal_type === 'dinner')?.meal_id)
        .toBe('meal-d2');
      expect(updatedPlan.find((entry) => entry.day_index === 1 && entry.meal_type === 'dinner')?.meal_id)
        .toBe('meal-d1');
    });

    it('should return the original plan when any operation in the batch is invalid', () => {
      const plan = createTestPlan();
      const meals = createTestMeals();
      const operations: CritiqueOperation[] = [
        { day_index: 0, meal_type: 'dinner', new_meal_id: 'meal-new' },
        { day_index: 1, meal_type: 'dinner', new_meal_id: 'missing-meal' },
      ];

      const { updatedPlan, errors } = applyOperations(plan, operations, meals);

      expect(errors).toHaveLength(1);
      expect(updatedPlan).toEqual(plan);
      expect(updatedPlan).not.toBe(plan);
    });

    it('should reject multiple operations targeting the same slot', () => {
      const plan = createTestPlan();
      const meals = createTestMeals();
      const operations: CritiqueOperation[] = [
        { day_index: 0, meal_type: 'dinner', new_meal_id: 'meal-new' },
        { day_index: 0, meal_type: 'dinner', new_meal_id: 'meal-extra' },
      ];

      const { updatedPlan, errors } = applyOperations(plan, operations, meals);

      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('Multiple operations target');
      expect(updatedPlan).toEqual(plan);
    });

    it('should reject an operation targeting a slot that is not in the plan', () => {
      const plan = createTestPlan();

      const { updatedPlan, errors } = applyOperations(
        plan,
        [{ day_index: 6, meal_type: 'dinner', new_meal_id: 'meal-new' }],
        createTestMeals()
      );

      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('No plan entry found');
      expect(updatedPlan).toEqual(plan);
    });

    it('should reject an ambiguous slot duplicated in the input plan', () => {
      const plan = createTestPlan();
      plan.push(createMealPlanEntry({
        day_index: 0,
        meal_type: 'dinner',
        meal_id: null,
        meal_name: null,
      }));

      const { updatedPlan, errors } = applyOperations(
        plan,
        [{ day_index: 0, meal_type: 'dinner', new_meal_id: 'meal-new' }],
        createTestMeals()
      );

      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('Multiple plan entries found');
      expect(updatedPlan).toEqual(plan);
    });

    it('should return plan unchanged with empty operations array', () => {
      const plan = createTestPlan();
      const meals = createTestMeals();
      const operations: CritiqueOperation[] = [];

      const { updatedPlan, errors } = applyOperations(plan, operations, meals);

      expect(errors).toEqual([]);
      expect(updatedPlan).toEqual(plan);
    });

    it('should swap adult breakfast without changing family breakfast', () => {
      const plan: MealPlanEntry[] = [
        createMealPlanEntry({
          day_index: 2,
          meal_track: 'family',
          meal_type: 'breakfast',
          meal_id: 'meal-family-breakfast',
          meal_name: 'Pancakes',
        }),
        createMealPlanEntry({
          day_index: 2,
          meal_track: 'adult',
          meal_type: 'breakfast',
          meal_id: 'meal-adult-breakfast',
          meal_name: 'Protein Oats',
        }),
      ];
      const meals: Meal[] = [
        createMeal({
          id: 'meal-family-breakfast',
          name: 'Pancakes',
          meal_type: 'breakfast',
          audience: 'family',
          effort: 1,
        }),
        createMeal({
          id: 'meal-adult-breakfast',
          name: 'Protein Oats',
          meal_type: 'breakfast',
          audience: 'adult',
          effort: 1,
        }),
        createMeal({
          id: 'meal-adult-new',
          name: 'Greek Yogurt Bowl',
          meal_type: 'breakfast',
          audience: 'adult',
          effort: 1,
        }),
      ];
      const operations: CritiqueOperation[] = [
        {
          day_index: 2,
          meal_track: 'adult',
          meal_type: 'breakfast',
          new_meal_id: 'meal-adult-new',
        },
      ];

      const { updatedPlan, errors } = applyOperations(plan, operations, meals);

      expect(errors).toEqual([]);
      const familyBreakfast = updatedPlan.find(
        (entry) => entry.day_index === 2 && entry.meal_track === 'family' && entry.meal_type === 'breakfast'
      );
      const adultBreakfast = updatedPlan.find(
        (entry) => entry.day_index === 2 && entry.meal_track === 'adult' && entry.meal_type === 'breakfast'
      );
      expect(familyBreakfast?.meal_id).toBe('meal-family-breakfast');
      expect(adultBreakfast?.meal_id).toBe('meal-adult-new');
      expect(adultBreakfast?.meal_name).toBe('Greek Yogurt Bowl');
    });

    it('should reject a family meal for an adult breakfast slot', () => {
      const plan: MealPlanEntry[] = [
        createMealPlanEntry({
          day_index: 2,
          meal_track: 'adult',
          meal_type: 'breakfast',
          meal_id: 'meal-adult-breakfast',
          meal_name: 'Protein Oats',
        }),
      ];
      const meals: Meal[] = [
        createMeal({
          id: 'meal-adult-breakfast',
          name: 'Protein Oats',
          meal_type: 'breakfast',
          audience: 'adult',
          effort: 1,
        }),
        createMeal({
          id: 'meal-family-breakfast',
          name: 'Pancakes',
          meal_type: 'breakfast',
          audience: 'family',
          effort: 1,
        }),
      ];
      const operations: CritiqueOperation[] = [
        {
          day_index: 2,
          meal_track: 'adult',
          meal_type: 'breakfast',
          new_meal_id: 'meal-family-breakfast',
        },
      ];

      const { updatedPlan, errors } = applyOperations(plan, operations, meals);

      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('family');
      expect(errors[0]).toContain('adult');
      expect(updatedPlan[0]?.meal_id).toBe('meal-adult-breakfast');
    });

    it('should reject swap that would exceed max prep-ahead meals', () => {
      // Plan already has 3 prep-ahead meals
      const plan: MealPlanEntry[] = [
        { day_index: 0, meal_type: 'breakfast', meal_id: 'meal-pa1', meal_name: 'Prep Breakfast' },
        { day_index: 0, meal_type: 'lunch', meal_id: 'meal-pa2', meal_name: 'Prep Lunch 1' },
        { day_index: 0, meal_type: 'dinner', meal_id: 'meal-d1', meal_name: 'Pasta' },
        { day_index: 1, meal_type: 'breakfast', meal_id: 'meal-b1', meal_name: 'Oatmeal' },
        { day_index: 1, meal_type: 'lunch', meal_id: 'meal-pa3', meal_name: 'Prep Lunch 2' },
        { day_index: 1, meal_type: 'dinner', meal_id: 'meal-d2', meal_name: 'Steak' },
      ];
      const meals: Meal[] = [
        createMeal({ id: 'meal-pa1', name: 'Prep Breakfast', meal_type: 'breakfast', effort: 1, prep_ahead: true }),
        createMeal({ id: 'meal-pa2', name: 'Prep Lunch 1', meal_type: 'lunch', effort: 1, prep_ahead: true }),
        createMeal({ id: 'meal-pa3', name: 'Prep Lunch 2', meal_type: 'lunch', effort: 1, prep_ahead: true }),
        createMeal({ id: 'meal-d1', name: 'Pasta', meal_type: 'dinner', effort: 4 }),
        createMeal({ id: 'meal-b1', name: 'Oatmeal', meal_type: 'breakfast', effort: 1 }),
        createMeal({ id: 'meal-d2', name: 'Steak', meal_type: 'dinner', effort: 5 }),
        createMeal({ id: 'meal-pa4', name: 'Another Prep Meal', meal_type: 'dinner', effort: 4, prep_ahead: true }),
      ];

      // Try to swap day 0 dinner to a prep-ahead meal (would make 4 total)
      const operations: CritiqueOperation[] = [
        { day_index: 0, meal_type: 'dinner', new_meal_id: 'meal-pa4' },
      ];

      const { updatedPlan, errors } = applyOperations(plan, operations, meals);

      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('prep-ahead');
      // Slot unchanged
      const dinner = updatedPlan.find((e) => e.day_index === 0 && e.meal_type === 'dinner');
      expect(dinner?.meal_id).toBe('meal-d1');
    });

    it('should allow swap to prep-ahead when replacing an existing prep-ahead meal', () => {
      // Plan has 3 prep-ahead. Swapping one prep-ahead for another should be fine (still 3).
      const plan: MealPlanEntry[] = [
        { day_index: 0, meal_type: 'lunch', meal_id: 'meal-pa1', meal_name: 'Prep Lunch 1' },
        { day_index: 1, meal_type: 'lunch', meal_id: 'meal-pa2', meal_name: 'Prep Lunch 2' },
        { day_index: 2, meal_type: 'lunch', meal_id: 'meal-pa3', meal_name: 'Prep Lunch 3' },
      ];
      const meals: Meal[] = [
        createMeal({ id: 'meal-pa1', name: 'Prep Lunch 1', meal_type: 'lunch', effort: 1, prep_ahead: true }),
        createMeal({ id: 'meal-pa2', name: 'Prep Lunch 2', meal_type: 'lunch', effort: 1, prep_ahead: true }),
        createMeal({ id: 'meal-pa3', name: 'Prep Lunch 3', meal_type: 'lunch', effort: 1, prep_ahead: true }),
        createMeal({ id: 'meal-pa4', name: 'Prep Lunch 4', meal_type: 'lunch', effort: 1, prep_ahead: true }),
      ];

      // Replace one prep-ahead with another prep-ahead
      const operations: CritiqueOperation[] = [
        { day_index: 0, meal_type: 'lunch', new_meal_id: 'meal-pa4' },
      ];

      const { updatedPlan, errors } = applyOperations(plan, operations, meals);

      expect(errors).toEqual([]);
      const lunch = updatedPlan.find((e) => e.day_index === 0 && e.meal_type === 'lunch');
      expect(lunch?.meal_id).toBe('meal-pa4');
    });

    it('should evaluate the prep-ahead limit from the final batch without order dependence', () => {
      const plan: MealPlanEntry[] = [
        createMealPlanEntry({ day_index: 0, meal_type: 'lunch', meal_id: 'meal-pa1', meal_name: 'Prep Lunch 1' }),
        createMealPlanEntry({ day_index: 1, meal_type: 'lunch', meal_id: 'meal-pa2', meal_name: 'Prep Lunch 2' }),
        createMealPlanEntry({ day_index: 2, meal_type: 'lunch', meal_id: 'meal-pa3', meal_name: 'Prep Lunch 3' }),
        createMealPlanEntry({ day_index: 3, meal_type: 'lunch', meal_id: 'meal-normal1', meal_name: 'Normal Lunch 1' }),
      ];
      const meals: Meal[] = [
        createMeal({ id: 'meal-pa1', name: 'Prep Lunch 1', meal_type: 'lunch', prep_ahead: true }),
        createMeal({ id: 'meal-pa2', name: 'Prep Lunch 2', meal_type: 'lunch', prep_ahead: true }),
        createMeal({ id: 'meal-pa3', name: 'Prep Lunch 3', meal_type: 'lunch', prep_ahead: true }),
        createMeal({ id: 'meal-pa4', name: 'Prep Lunch 4', meal_type: 'lunch', prep_ahead: true }),
        createMeal({ id: 'meal-normal1', name: 'Normal Lunch 1', meal_type: 'lunch', prep_ahead: false }),
        createMeal({ id: 'meal-normal2', name: 'Normal Lunch 2', meal_type: 'lunch', prep_ahead: false }),
      ];
      const operations: CritiqueOperation[] = [
        { day_index: 3, meal_type: 'lunch', new_meal_id: 'meal-pa4' },
        { day_index: 0, meal_type: 'lunch', new_meal_id: 'meal-normal2' },
      ];

      const { updatedPlan, errors } = applyOperations(plan, operations, meals);

      expect(errors).toEqual([]);
      expect(updatedPlan.filter((entry) => {
        const meal = meals.find((candidate) => candidate.id === entry.meal_id);
        return meal?.prep_ahead === true;
      })).toHaveLength(3);
    });

    it('should allow repeated adult breakfasts when the catalog has fewer than seven choices', () => {
      const plan: MealPlanEntry[] = [
        createMealPlanEntry({
          day_index: 0,
          meal_track: 'adult',
          meal_type: 'breakfast',
          meal_id: 'adult-1',
          meal_name: 'Protein Oats',
        }),
        createMealPlanEntry({
          day_index: 1,
          meal_track: 'adult',
          meal_type: 'breakfast',
          meal_id: 'adult-2',
          meal_name: 'Eggs',
        }),
      ];
      const meals: Meal[] = [
        createMeal({ id: 'adult-1', name: 'Protein Oats', meal_type: 'breakfast', audience: 'adult' }),
        createMeal({ id: 'adult-2', name: 'Eggs', meal_type: 'breakfast', audience: 'adult' }),
      ];

      const { updatedPlan, errors } = applyOperations(
        plan,
        [{ day_index: 1, meal_track: 'adult', meal_type: 'breakfast', new_meal_id: 'adult-1' }],
        meals
      );

      expect(errors).toEqual([]);
      expect(updatedPlan.map((entry) => entry.meal_id)).toEqual(['adult-1', 'adult-1']);
    });

    it('should reject repeated adult breakfasts when the catalog has seven choices', () => {
      const plan: MealPlanEntry[] = [
        createMealPlanEntry({
          day_index: 0,
          meal_track: 'adult',
          meal_type: 'breakfast',
          meal_id: 'adult-1',
          meal_name: 'Adult Breakfast 1',
        }),
        createMealPlanEntry({
          day_index: 1,
          meal_track: 'adult',
          meal_type: 'breakfast',
          meal_id: 'adult-2',
          meal_name: 'Adult Breakfast 2',
        }),
      ];
      const meals = Array.from({ length: 7 }, (_, index) => createMeal({
        id: `adult-${index + 1}`,
        name: `Adult Breakfast ${index + 1}`,
        meal_type: 'breakfast',
        audience: 'adult',
      }));

      const { updatedPlan, errors } = applyOperations(
        plan,
        [{ day_index: 1, meal_track: 'adult', meal_type: 'breakfast', new_meal_id: 'adult-1' }],
        meals
      );

      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('already exists elsewhere');
      expect(updatedPlan).toEqual(plan);
    });

    it('should preserve an existing fallback duplicate during an unrelated edit', () => {
      const plan = createTestPlan();
      const repeatedLunch = plan.find(
        (entry) => entry.day_index === 1 && entry.meal_type === 'lunch'
      );
      if (repeatedLunch !== undefined) {
        repeatedLunch.meal_id = 'meal-l1';
        repeatedLunch.meal_name = 'Sandwich';
      }

      const { updatedPlan, errors } = applyOperations(
        plan,
        [{ day_index: 0, meal_type: 'dinner', new_meal_id: 'meal-new' }],
        createTestMeals()
      );

      expect(errors).toEqual([]);
      expect(updatedPlan.filter((entry) => entry.meal_id === 'meal-l1')).toHaveLength(2);
      expect(updatedPlan.find((entry) => entry.day_index === 0 && entry.meal_type === 'dinner')?.meal_id)
        .toBe('meal-new');
    });

    it('should allow an unrelated edit when the existing plan is already above the prep-ahead limit', () => {
      const plan: MealPlanEntry[] = [
        createMealPlanEntry({ day_index: 0, meal_type: 'lunch', meal_id: 'meal-pa1', meal_name: 'Prep Lunch 1' }),
        createMealPlanEntry({ day_index: 1, meal_type: 'lunch', meal_id: 'meal-pa2', meal_name: 'Prep Lunch 2' }),
        createMealPlanEntry({ day_index: 2, meal_type: 'lunch', meal_id: 'meal-pa3', meal_name: 'Prep Lunch 3' }),
        createMealPlanEntry({ day_index: 3, meal_type: 'lunch', meal_id: 'meal-pa4', meal_name: 'Prep Lunch 4' }),
        createMealPlanEntry({ day_index: 0, meal_type: 'dinner', meal_id: 'meal-d1', meal_name: 'Dinner 1' }),
      ];
      const meals: Meal[] = [
        createMeal({ id: 'meal-pa1', name: 'Prep Lunch 1', meal_type: 'lunch', prep_ahead: true }),
        createMeal({ id: 'meal-pa2', name: 'Prep Lunch 2', meal_type: 'lunch', prep_ahead: true }),
        createMeal({ id: 'meal-pa3', name: 'Prep Lunch 3', meal_type: 'lunch', prep_ahead: true }),
        createMeal({ id: 'meal-pa4', name: 'Prep Lunch 4', meal_type: 'lunch', prep_ahead: true }),
        createMeal({ id: 'meal-d1', name: 'Dinner 1', meal_type: 'dinner', prep_ahead: false }),
        createMeal({ id: 'meal-d2', name: 'Dinner 2', meal_type: 'dinner', prep_ahead: false }),
      ];

      const { updatedPlan, errors } = applyOperations(
        plan,
        [{ day_index: 0, meal_type: 'dinner', new_meal_id: 'meal-d2' }],
        meals
      );

      expect(errors).toEqual([]);
      expect(updatedPlan.find((entry) => entry.meal_type === 'dinner')?.meal_id).toBe('meal-d2');
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
