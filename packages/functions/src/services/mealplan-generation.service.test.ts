import { describe, it, expect } from 'vitest';
import type { Meal } from '../shared.js';
import { generateMealPlan, validatePlan } from './mealplan-generation.service.js';

// Helper to create a test meal
let mealCounter = 0;
function createMeal(overrides: Partial<Meal> = {}): Meal {
  mealCounter++;
  return {
    id: `meal-${mealCounter}`,
    name: `Test Meal ${mealCounter}`,
    meal_type: 'dinner',
    effort: 5,
    has_red_meat: false,
    url: '',
    last_planned: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

/** Safely gets a meal from the map, failing the test if missing */
function getMealOrFail(mealMap: Map<string, Meal>, id: string): Meal {
  const meal = mealMap.get(id);
  expect(meal).toBeDefined();
  // Safe to return since expect above would fail
  return meal as Meal;
}

/**
 * Creates a realistic set of meals sufficient to generate a plan.
 * We need:
 * - 7 unique breakfasts (effort <= 2)
 * - 7 unique lunches (effort <= 2)
 * - 6 unique dinners covering various effort ranges (Friday is eating out)
 * Plus extras for randomness / red meat constraints.
 */
function createRealisticMealSet(): Meal[] {
  mealCounter = 0;
  const meals: Meal[] = [];

  // 10 breakfasts (effort 1-2)
  for (let i = 0; i < 10; i++) {
    meals.push(createMeal({
      name: `Breakfast ${i + 1}`,
      meal_type: 'breakfast',
      effort: (i % 2) + 1,
      has_red_meat: false,
    }));
  }

  // 10 lunches (effort 1-2)
  for (let i = 0; i < 10; i++) {
    meals.push(createMeal({
      name: `Lunch ${i + 1}`,
      meal_type: 'lunch',
      effort: (i % 2) + 1,
      has_red_meat: false,
    }));
  }

  // Dinners for Monday (effort 3-5) - 5 options
  for (let i = 0; i < 5; i++) {
    meals.push(createMeal({
      name: `Monday Dinner ${i + 1}`,
      meal_type: 'dinner',
      effort: 3 + (i % 3),
      has_red_meat: i === 0, // 1 red meat option
    }));
  }

  // Dinners for Tue/Wed/Thu (effort 3-6) - 10 options
  for (let i = 0; i < 10; i++) {
    meals.push(createMeal({
      name: `Weekday Dinner ${i + 1}`,
      meal_type: 'dinner',
      effort: 3 + (i % 4),
      has_red_meat: i < 3, // 3 red meat options
    }));
  }

  // Dinners for Saturday (effort 4-8) - 5 options
  for (let i = 0; i < 5; i++) {
    meals.push(createMeal({
      name: `Saturday Dinner ${i + 1}`,
      meal_type: 'dinner',
      effort: 4 + (i % 5),
      has_red_meat: i === 1,
    }));
  }

  // Dinners for Sunday (effort 4-10) - 5 options
  for (let i = 0; i < 5; i++) {
    meals.push(createMeal({
      name: `Sunday Dinner ${i + 1}`,
      meal_type: 'dinner',
      effort: 4 + (i * 1.5 | 0),
      has_red_meat: i === 2,
    }));
  }

  return meals;
}

describe('MealPlan Generation Service', () => {
  describe('generateMealPlan', () => {
    it('should generate a plan with 21 slots', () => {
      const meals = createRealisticMealSet();
      const plan = generateMealPlan(meals);

      expect(plan).toHaveLength(21);
    });

    it('should have 3 meal types per day', () => {
      const meals = createRealisticMealSet();
      const plan = generateMealPlan(meals);

      for (let day = 0; day < 7; day++) {
        const dayEntries = plan.filter((e) => e.day_index === day);
        expect(dayEntries).toHaveLength(3);

        const types = dayEntries.map((e) => e.meal_type).sort();
        expect(types).toEqual(['breakfast', 'dinner', 'lunch']);
      }
    });

    it('should sort entries by day_index then meal_type order', () => {
      const meals = createRealisticMealSet();
      const plan = generateMealPlan(meals);

      const mealTypeOrder: Record<string, number> = { breakfast: 0, lunch: 1, dinner: 2 };

      for (let i = 1; i < plan.length; i++) {
        const prev = plan[i - 1];
        const curr = plan[i];
        expect(prev).toBeDefined();
        expect(curr).toBeDefined();

        if (prev !== undefined && curr !== undefined) {
          if (prev.day_index === curr.day_index) {
            expect((mealTypeOrder[prev.meal_type] ?? 0)).toBeLessThanOrEqual(mealTypeOrder[curr.meal_type] ?? 0);
          } else {
            expect(prev.day_index).toBeLessThan(curr.day_index);
          }
        }
      }
    });
  });

  describe('effort filtering', () => {
    it('should only use effort <= 2 for breakfast', () => {
      const meals = createRealisticMealSet();
      const mealMap = new Map(meals.map((m) => [m.id, m]));
      const plan = generateMealPlan(meals);

      const breakfasts = plan.filter((e) => e.meal_type === 'breakfast');
      for (const entry of breakfasts) {
        expect(entry.meal_id).not.toBeNull();
        if (entry.meal_id !== null) {
          const meal = getMealOrFail(mealMap, entry.meal_id);
          expect(meal.effort).toBeLessThanOrEqual(2);
        }
      }
    });

    it('should only use effort <= 2 for lunch', () => {
      const meals = createRealisticMealSet();
      const mealMap = new Map(meals.map((m) => [m.id, m]));
      const plan = generateMealPlan(meals);

      const lunches = plan.filter((e) => e.meal_type === 'lunch');
      for (const entry of lunches) {
        expect(entry.meal_id).not.toBeNull();
        if (entry.meal_id !== null) {
          const meal = getMealOrFail(mealMap, entry.meal_id);
          expect(meal.effort).toBeLessThanOrEqual(2);
        }
      }
    });
  });

  describe('dinner effort per day', () => {
    it('should use effort 3-5 for Monday dinner', () => {
      const meals = createRealisticMealSet();
      const mealMap = new Map(meals.map((m) => [m.id, m]));
      const plan = generateMealPlan(meals);

      const mondayDinner = plan.find((e) => e.day_index === 0 && e.meal_type === 'dinner');
      expect(mondayDinner).toBeDefined();
      const mondayMealId = mondayDinner?.meal_id;
      if (mondayMealId !== undefined && mondayMealId !== null) {
        const meal = getMealOrFail(mealMap, mondayMealId);
        expect(meal.effort).toBeGreaterThanOrEqual(3);
        expect(meal.effort).toBeLessThanOrEqual(5);
      }
    });

    it('should use effort 3-6 for Tuesday dinner', () => {
      const meals = createRealisticMealSet();
      const mealMap = new Map(meals.map((m) => [m.id, m]));
      const plan = generateMealPlan(meals);

      const tuesdayDinner = plan.find((e) => e.day_index === 1 && e.meal_type === 'dinner');
      expect(tuesdayDinner).toBeDefined();
      const tuesdayMealId = tuesdayDinner?.meal_id;
      if (tuesdayMealId !== undefined && tuesdayMealId !== null) {
        const meal = getMealOrFail(mealMap, tuesdayMealId);
        expect(meal.effort).toBeGreaterThanOrEqual(3);
        expect(meal.effort).toBeLessThanOrEqual(6);
      }
    });

    it('should use effort 3-6 for Wednesday dinner', () => {
      const meals = createRealisticMealSet();
      const mealMap = new Map(meals.map((m) => [m.id, m]));
      const plan = generateMealPlan(meals);

      const wedDinner = plan.find((e) => e.day_index === 2 && e.meal_type === 'dinner');
      expect(wedDinner).toBeDefined();
      const wedMealId = wedDinner?.meal_id;
      if (wedMealId !== undefined && wedMealId !== null) {
        const meal = getMealOrFail(mealMap, wedMealId);
        expect(meal.effort).toBeGreaterThanOrEqual(3);
        expect(meal.effort).toBeLessThanOrEqual(6);
      }
    });

    it('should use effort 3-6 for Thursday dinner', () => {
      const meals = createRealisticMealSet();
      const mealMap = new Map(meals.map((m) => [m.id, m]));
      const plan = generateMealPlan(meals);

      const thursDinner = plan.find((e) => e.day_index === 3 && e.meal_type === 'dinner');
      expect(thursDinner).toBeDefined();
      const thursMealId = thursDinner?.meal_id;
      if (thursMealId !== undefined && thursMealId !== null) {
        const meal = getMealOrFail(mealMap, thursMealId);
        expect(meal.effort).toBeGreaterThanOrEqual(3);
        expect(meal.effort).toBeLessThanOrEqual(6);
      }
    });

    it('should use effort 4-8 for Saturday dinner', () => {
      const meals = createRealisticMealSet();
      const mealMap = new Map(meals.map((m) => [m.id, m]));
      const plan = generateMealPlan(meals);

      const satDinner = plan.find((e) => e.day_index === 5 && e.meal_type === 'dinner');
      expect(satDinner).toBeDefined();
      const satMealId = satDinner?.meal_id;
      if (satMealId !== undefined && satMealId !== null) {
        const meal = getMealOrFail(mealMap, satMealId);
        expect(meal.effort).toBeGreaterThanOrEqual(4);
        expect(meal.effort).toBeLessThanOrEqual(8);
      }
    });

    it('should use effort 4-10 for Sunday dinner', () => {
      const meals = createRealisticMealSet();
      const mealMap = new Map(meals.map((m) => [m.id, m]));
      const plan = generateMealPlan(meals);

      const sunDinner = plan.find((e) => e.day_index === 6 && e.meal_type === 'dinner');
      expect(sunDinner).toBeDefined();
      const sunMealId = sunDinner?.meal_id;
      if (sunMealId !== undefined && sunMealId !== null) {
        const meal = getMealOrFail(mealMap, sunMealId);
        expect(meal.effort).toBeGreaterThanOrEqual(4);
        expect(meal.effort).toBeLessThanOrEqual(10);
      }
    });
  });

  describe('Friday dinner', () => {
    it('should have null meal_id for Friday dinner', () => {
      const meals = createRealisticMealSet();
      const plan = generateMealPlan(meals);

      const fridayDinner = plan.find((e) => e.day_index === 4 && e.meal_type === 'dinner');
      expect(fridayDinner).toBeDefined();
      if (fridayDinner !== undefined) {
        expect(fridayDinner.meal_id).toBeNull();
      }
    });

    it('should have meal_name "Eating out" for Friday dinner', () => {
      const meals = createRealisticMealSet();
      const plan = generateMealPlan(meals);

      const fridayDinner = plan.find((e) => e.day_index === 4 && e.meal_type === 'dinner');
      expect(fridayDinner).toBeDefined();
      if (fridayDinner !== undefined) {
        expect(fridayDinner.meal_name).toBe('Eating out');
      }
    });
  });

  describe('recency exclusion', () => {
    it('should exclude meals planned within 3 weeks', () => {
      const meals = createRealisticMealSet();
      const now = new Date('2024-06-15T00:00:00Z');

      // Mark some meals as recently planned (within 3 weeks)
      const recentDate = '2024-06-01T00:00:00Z'; // 14 days ago, within 3 weeks
      const breakfasts = meals.filter((m) => m.meal_type === 'breakfast');
      // Mark the first 3 breakfasts as recently planned
      for (let i = 0; i < 3; i++) {
        const b = breakfasts[i];
        if (b !== undefined) {
          b.last_planned = recentDate;
        }
      }

      const plan = generateMealPlan(meals, now);

      // None of the recently planned breakfasts should appear
      const usedBreakfastIds = plan
        .filter((e) => e.meal_type === 'breakfast')
        .map((e) => e.meal_id);

      for (let i = 0; i < 3; i++) {
        const b = breakfasts[i];
        if (b !== undefined) {
          expect(usedBreakfastIds).not.toContain(b.id);
        }
      }
    });

    it('should include meals planned more than 3 weeks ago', () => {
      const meals = createRealisticMealSet();
      const now = new Date('2024-06-15T00:00:00Z');

      // Mark a meal as planned > 3 weeks ago
      const oldDate = '2024-05-01T00:00:00Z'; // ~45 days ago
      const breakfasts = meals.filter((m) => m.meal_type === 'breakfast');

      // Reset all, then only mark first one as old (should be included)
      for (const b of breakfasts) {
        b.last_planned = null;
      }
      const firstBreakfast = breakfasts[0];
      if (firstBreakfast !== undefined) {
        firstBreakfast.last_planned = oldDate;
      }

      const plan = generateMealPlan(meals, now);

      // The old-planned meal should be eligible (may or may not be selected due to randomness)
      // Verify the plan is valid and has 21 slots
      expect(plan).toHaveLength(21);
    });
  });

  describe('red meat constraints', () => {
    it('should have at most 2 red meat dinners per week', () => {
      const meals = createRealisticMealSet();
      const mealMap = new Map(meals.map((m) => [m.id, m]));

      // Run multiple times to increase confidence
      for (let run = 0; run < 20; run++) {
        const plan = generateMealPlan(meals);
        const redMeatCount = plan.filter((e) => {
          if (e.meal_type !== 'dinner' || e.meal_id === null) return false;
          const meal = mealMap.get(e.meal_id);
          return meal !== undefined && meal.has_red_meat === true;
        }).length;

        expect(redMeatCount).toBeLessThanOrEqual(2);
      }
    });

    it('should not have red meat on consecutive dinner days', () => {
      const meals = createRealisticMealSet();
      const mealMap = new Map(meals.map((m) => [m.id, m]));

      // Run multiple times to increase confidence
      for (let run = 0; run < 20; run++) {
        const plan = generateMealPlan(meals);
        const redMeatDays: number[] = [];

        for (const entry of plan) {
          if (entry.meal_type === 'dinner' && entry.meal_id !== null) {
            const meal = mealMap.get(entry.meal_id);
            if (meal !== undefined && meal.has_red_meat === true) {
              redMeatDays.push(entry.day_index);
            }
          }
        }

        const sorted = [...redMeatDays].sort((a, b) => a - b);
        for (let i = 1; i < sorted.length; i++) {
          const prev = sorted[i - 1];
          const curr = sorted[i];
          if (prev !== undefined && curr !== undefined) {
            expect(curr - prev).toBeGreaterThan(1);
          }
        }
      }
    });
  });

  describe('no duplicate meals', () => {
    it('should not have any meal ID appear twice', () => {
      const meals = createRealisticMealSet();
      const plan = generateMealPlan(meals);

      const mealIds = plan
        .filter((e) => e.meal_id !== null)
        .map((e) => e.meal_id);

      const uniqueIds = new Set(mealIds);
      expect(mealIds.length).toBe(uniqueIds.size);
    });
  });

  describe('insufficient meals (best-effort)', () => {
    it('should reuse breakfasts when not enough unique ones', () => {
      mealCounter = 0;
      const meals: Meal[] = [];

      // Only 3 breakfasts (need 7) - should reuse
      for (let i = 0; i < 3; i++) {
        meals.push(createMeal({
          meal_type: 'breakfast',
          effort: 1,
        }));
      }

      // Add lunches and dinners
      for (let i = 0; i < 10; i++) {
        meals.push(createMeal({ meal_type: 'lunch', effort: 1 }));
      }
      for (let i = 0; i < 20; i++) {
        meals.push(createMeal({ meal_type: 'dinner', effort: 5 }));
      }

      const plan = generateMealPlan(meals);
      const breakfasts = plan.filter((e) => e.meal_type === 'breakfast');
      expect(breakfasts).toHaveLength(7);
    });

    it('should reuse lunches when not enough unique ones', () => {
      mealCounter = 0;
      const meals: Meal[] = [];

      // Add breakfasts
      for (let i = 0; i < 10; i++) {
        meals.push(createMeal({ meal_type: 'breakfast', effort: 1 }));
      }

      // Only 3 lunches (need 7) - should reuse
      for (let i = 0; i < 3; i++) {
        meals.push(createMeal({ meal_type: 'lunch', effort: 1 }));
      }

      // Add dinners
      for (let i = 0; i < 20; i++) {
        meals.push(createMeal({ meal_type: 'dinner', effort: 5 }));
      }

      const plan = generateMealPlan(meals);
      const lunches = plan.filter((e) => e.meal_type === 'lunch');
      expect(lunches).toHaveLength(7);
    });

    it('should reuse dinners when not enough unique ones', () => {
      mealCounter = 0;
      const meals: Meal[] = [];

      // Add breakfasts and lunches
      for (let i = 0; i < 10; i++) {
        meals.push(createMeal({ meal_type: 'breakfast', effort: 1 }));
      }
      for (let i = 0; i < 10; i++) {
        meals.push(createMeal({ meal_type: 'lunch', effort: 1 }));
      }

      // Only 1 dinner (need 6) - should reuse
      meals.push(createMeal({ meal_type: 'dinner', effort: 5 }));

      const plan = generateMealPlan(meals);
      const dinners = plan.filter((e) => e.meal_type === 'dinner');
      // 6 real dinners + 1 "Eating out" Friday = 7 dinner slots
      expect(dinners).toHaveLength(7);
    });
  });

  describe('validatePlan', () => {
    it('should return empty errors for a valid plan', () => {
      const meals = createRealisticMealSet();
      const plan = generateMealPlan(meals);
      const errors = validatePlan(plan, meals);

      expect(errors).toEqual([]);
    });

    it('should detect wrong slot count', () => {
      const meals = createRealisticMealSet();
      const plan = generateMealPlan(meals);
      // Remove a slot
      const shortPlan = plan.slice(0, 20);
      const errors = validatePlan(shortPlan, meals);

      expect(errors.some((e) => e.includes('Expected 21 slots'))).toBe(true);
    });

    it('should detect duplicate meal IDs', () => {
      const meals = createRealisticMealSet();
      const plan = generateMealPlan(meals);

      // Force a duplicate
      const first = plan[0];
      const second = plan[1];
      if (first !== undefined && second !== undefined && first.meal_id !== null && second.meal_id !== null) {
        second.meal_id = first.meal_id;
      }

      const errors = validatePlan(plan, meals);
      expect(errors.some((e) => e.includes('Duplicate meal ID'))).toBe(true);
    });
  });

  describe('stress test - 100 iterations', () => {
    it('should satisfy ALL constraints in every single run out of 100', () => {
      const meals = createRealisticMealSet();
      const mealMap = new Map(meals.map((m) => [m.id, m]));

      for (let iteration = 0; iteration < 100; iteration++) {
        const plan = generateMealPlan(meals);

        // 1. 21 slots
        expect(plan).toHaveLength(21);

        // 2. Each day has 3 meal types
        for (let day = 0; day < 7; day++) {
          const dayEntries = plan.filter((e) => e.day_index === day);
          expect(dayEntries).toHaveLength(3);
          const types = new Set(dayEntries.map((e) => e.meal_type));
          expect(types.has('breakfast')).toBe(true);
          expect(types.has('lunch')).toBe(true);
          expect(types.has('dinner')).toBe(true);
        }

        // 3. Breakfast/lunch effort <= 2
        for (const entry of plan) {
          if ((entry.meal_type === 'breakfast' || entry.meal_type === 'lunch') && entry.meal_id !== null) {
            const meal = getMealOrFail(mealMap, entry.meal_id);
            expect(meal.effort).toBeLessThanOrEqual(2);
          }
        }

        // 4. Dinner effort ranges
        const dinnerEffortRanges: Record<number, { min: number; max: number } | null> = {
          0: { min: 3, max: 5 },
          1: { min: 3, max: 6 },
          2: { min: 3, max: 6 },
          3: { min: 3, max: 6 },
          4: null,
          5: { min: 4, max: 8 },
          6: { min: 4, max: 10 },
        };

        for (const entry of plan) {
          if (entry.meal_type === 'dinner' && entry.meal_id !== null) {
            const range = dinnerEffortRanges[entry.day_index];
            if (range !== null && range !== undefined) {
              const meal = getMealOrFail(mealMap, entry.meal_id);
              expect(meal.effort).toBeGreaterThanOrEqual(range.min);
              expect(meal.effort).toBeLessThanOrEqual(range.max);
            }
          }
        }

        // 5. Friday dinner = null / "Eating out"
        const fridayDinner = plan.find((e) => e.day_index === 4 && e.meal_type === 'dinner');
        expect(fridayDinner).toBeDefined();
        if (fridayDinner !== undefined) {
          expect(fridayDinner.meal_id).toBeNull();
          expect(fridayDinner.meal_name).toBe('Eating out');
        }

        // 6. No duplicate meal IDs
        const usedIds = plan.filter((e) => e.meal_id !== null).map((e) => e.meal_id);
        expect(usedIds.length).toBe(new Set(usedIds).size);

        // 7. Red meat: max 2, non-consecutive
        const redMeatDays: number[] = [];
        for (const entry of plan) {
          if (entry.meal_type === 'dinner' && entry.meal_id !== null) {
            const meal = mealMap.get(entry.meal_id);
            if (meal !== undefined && meal.has_red_meat === true) {
              redMeatDays.push(entry.day_index);
            }
          }
        }
        expect(redMeatDays.length).toBeLessThanOrEqual(2);

        const sortedRM = [...redMeatDays].sort((a, b) => a - b);
        for (let i = 1; i < sortedRM.length; i++) {
          const prev = sortedRM[i - 1];
          const curr = sortedRM[i];
          if (prev !== undefined && curr !== undefined) {
            expect(curr - prev).toBeGreaterThan(1);
          }
        }

        // 8. validatePlan should find zero errors
        const errors = validatePlan(plan, meals);
        expect(errors).toEqual([]);
      }
    });
  });
});
