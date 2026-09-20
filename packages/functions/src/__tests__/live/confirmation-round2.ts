import { expect, it } from 'vitest';
import type { Meal } from '../../types/meal.js';
import type {
  CritiqueContext,
  MealPlanEntry,
  MealPlanSession,
} from '../../types/mealplan.js';


export interface FreshConfirmationHelpers {
  catalog: Meal[];
  historicalCatalog: Meal[];
  generate(): Promise<MealPlanSession>;
  create(plan: MealPlanEntry[], meals: Meal[]): Promise<MealPlanSession>;
  critique(
    session: MealPlanSession,
    text: string,
    options?: { outcome?: string; context?: CritiqueContext },
  ): Promise<MealPlanSession>;
  slotAt(
    session: MealPlanSession,
    day: number,
    type: MealPlanEntry['meal_type'],
    track?: MealPlanEntry['meal_track'],
  ): MealPlanEntry;
  mealFor(session: MealPlanSession, slot: MealPlanEntry): Meal;
  expectReplacement(
    before: MealPlanSession,
    after: MealPlanSession,
    day: number,
    type?: MealPlanEntry['meal_type'],
    track?: MealPlanEntry['meal_track'],
  ): void;
  expectPreserved(
    before: MealPlanSession,
    after: MealPlanSession,
    changed: MealPlanEntry[],
  ): void;
}


function assignment(day: number, meal: Meal): MealPlanEntry {
  return {
    day_index: day,
    meal_track: meal.audience,
    meal_type: meal.meal_type,
    meal_id: meal.id,
    meal_name: meal.name,
  };
}

function emptyDinner(day: number, label: string): MealPlanEntry {
  return {
    day_index: day,
    meal_track: 'family',
    meal_type: 'dinner',
    meal_id: null,
    meal_name: label,
  };
}

function expectIdentity(slot: MealPlanEntry, meal: MealPlanEntry | Meal): void {
  if ('day_index' in meal) {
    expect(slot.meal_id).toBe(meal.meal_id);
    expect(slot.meal_name).toBe(meal.meal_name);
  } else {
    expect(slot.meal_id).toBe(meal.id);
    expect(slot.meal_name).toBe(meal.name);
  }
}

export function registerFreshConfirmations(h: FreshConfirmationHelpers): void {
  function savedMeal(id: string, name: string, overrides: Partial<Meal> = {}): Meal {
    return {
      id: `fresh-${id}`,
      name,
      meal_type: 'dinner',
      audience: 'family',
      effort: 2,
      has_red_meat: false,
      prep_ahead: false,
      url: null,
      last_planned: null,
      created_at: '2026-09-01T00:00:00.000Z',
      updated_at: '2026-09-01T00:00:00.000Z',
      ...overrides,
    };
  }

  it('fresh-confirmation: the original household request controls a contradictory forwarded summary', async (): Promise<void> => {
    const before = await h.generate();
    const monday = h.slotAt(before, 0, 'dinner');
    const wednesday = h.slotAt(before, 2, 'dinner');
    const friday = h.slotAt(before, 4, 'dinner');
    expect(monday.meal_id).not.toBeNull();
    expect(wednesday.meal_id).not.toBeNull();
    expect(friday.meal_id).toBeNull();

    const forwarded = 'Remove Monday supper, retain Wednesday supper, and fill the Friday supper opening.';
    const after = await h.critique(before, forwarded, {
      outcome: 'applied',
      context: {
        original_request: 'I am not looking forward to the meal in Monday’s supper box; find us something else to eat that night. Wednesday our hosts are feeding the whole family, so take that dinner off our cooking plan. Friday’s existing eating-out arrangement and every other box should stay exactly as they are.',
        interpretation: forwarded,
      },
    });

    h.expectReplacement(before, after, 0);
    expect(h.slotAt(after, 2, 'dinner').meal_id).toBeNull();
    expect(h.slotAt(after, 4, 'dinner')).toEqual(friday);
    h.expectPreserved(before, after, [monday, wednesday]);
  });

  it('fresh-confirmation: exchanging two cooking nights retains dish identities and an existing repeated packed lunch', async (): Promise<void> => {
    const pie = savedMeal('transfer-pie', 'Leek and potato pie');
    const fish = savedMeal('transfer-fish', 'Ginger trout with rice');
    const packed = savedMeal('transfer-lunch', 'Hummus and cucumber pita', { meal_type: 'lunch' });
    const adult = savedMeal('transfer-adult', 'Pear and yogurt bowl', { meal_type: 'breakfast', audience: 'adult' });
    const before = await h.create([
      assignment(0, pie), assignment(5, fish), assignment(0, packed),
      assignment(2, packed), assignment(0, adult), emptyDinner(4, 'Dinner at the grandparents'),
    ], [pie, fish, packed, adult]);
    const monday = h.slotAt(before, 0, 'dinner');
    const saturday = h.slotAt(before, 5, 'dinner');

    const after = await h.critique(before, 'The oven repair moved. Trade Monday’s family supper with Saturday’s family supper, carrying each saved dish across intact. The identical pitas packed for Monday and Wednesday are deliberate; keep both, along with the other arrangements.', { outcome: 'applied' });

    expectIdentity(h.slotAt(after, 0, 'dinner'), saturday);
    expectIdentity(h.slotAt(after, 5, 'dinner'), monday);
    expect(after.plan.filter((slot) => slot.meal_id === packed.id)).toHaveLength(2);
    h.expectPreserved(before, after, [monday, saturday]);
  });

  it('fresh-confirmation: an audience omission pauses both cancellations until the audience is supplied', async (): Promise<void> => {
    const before = await h.generate();
    const familyBreakfast = h.slotAt(before, 1, 'breakfast', 'family');
    const adultBreakfast = h.slotAt(before, 1, 'breakfast', 'adult');
    const thursdayDinner = h.slotAt(before, 3, 'dinner');
    expect(familyBreakfast.meal_id).not.toBeNull();
    expect(adultBreakfast.meal_id).not.toBeNull();
    expect(thursdayDinner.meal_id).not.toBeNull();

    const paused = await h.critique(before, 'Tuesday breakfast is already arranged elsewhere, so remove it. Thursday’s family dinner is also unnecessary because our visitors are bringing supper.', { outcome: 'clarification_required' });
    expect(paused.plan).toEqual(before.plan);

    const after = await h.critique(paused, 'Only the adults have Tuesday breakfast covered. Please carry out those two cancellations now; the children still need their Tuesday breakfast.', { outcome: 'applied' });
    expect(h.slotAt(after, 1, 'breakfast', 'adult').meal_id).toBeNull();
    expect(h.slotAt(after, 3, 'dinner').meal_id).toBeNull();
    expect(h.slotAt(after, 1, 'breakfast', 'family')).toEqual(familyBreakfast);
    h.expectPreserved(before, after, [adultBreakfast, thursdayDinner]);
  });

  it('fresh-confirmation: missing nutrition and allergy evidence prevents every proposed edit', async (): Promise<void> => {
    const breakfast = savedMeal('evidence-current', 'Berry kefir bowl', { meal_type: 'breakfast', audience: 'adult' });
    const proteinCup = savedMeal('evidence-cup', 'High-Protein Sunflower Breakfast Cup', { meal_type: 'breakfast', audience: 'adult' });
    const porridge = savedMeal('evidence-porridge', 'Peanut-Free Protein Porridge', { meal_type: 'breakfast', audience: 'adult' });
    const toast = savedMeal('evidence-toast', 'Toast with plum jam', { meal_type: 'breakfast' });
    const stew = savedMeal('evidence-stew', 'White bean and kale stew');
    const noodles = savedMeal('evidence-noodles', 'Sesame noodles with cabbage');
    const before = await h.create([
      assignment(2, breakfast), assignment(2, toast), assignment(0, stew),
      assignment(3, noodles), emptyDinner(4, 'Already arranged'),
    ], [breakfast, proteinCup, porridge, toast, stew, noodles]);

    const after = await h.critique(before, 'For the adults’ Wednesday breakfast, choose a saved alternative that you can verify provides at least 45 grams of protein per serving, has no dairy ingredients, and is safe for a severe peanut allergy including cross-contact. Also exchange Monday and Thursday family dinners. Treat these as one revision; if the breakfast guarantees cannot be verified from the saved information, leave the entire plan alone.', { outcome: 'insufficient_evidence' });

    expect(after.plan).toEqual(before.plan);
    expect(after.meals_snapshot).toEqual(before.meals_snapshot);
  });

  it('fresh-confirmation: a second rejection keeps both earlier pairs excluded while replacing the same two nights', async (): Promise<void> => {
    const aubergine = savedMeal('reject-aubergine', 'Aubergine bake with couscous');
    const trout = savedMeal('reject-trout', 'Trout parcels with new potatoes');
    const lentils = savedMeal('reject-lentils', 'Lentil shepherd’s pie');
    const gnocchi = savedMeal('reject-gnocchi', 'Pesto gnocchi with green beans');
    const tagine = savedMeal('reject-tagine', 'Chickpea tagine with rice');
    const frittata = savedMeal('reject-frittata', 'Spinach and feta frittata');
    const toast = savedMeal('reject-toast', 'Avocado toast', { meal_type: 'breakfast', audience: 'adult' });
    const before = await h.create([
      assignment(0, aubergine), assignment(1, trout), assignment(0, toast),
      emptyDinner(4, 'Restaurant reservation'),
    ], [aubergine, trout, lentils, gnocchi, tagine, frittata, toast]);

    const first = await h.critique(before, 'Monday’s aubergine bake and Tuesday’s trout parcels are both out for this week. Put Lentil shepherd’s pie on Monday and Pesto gnocchi with green beans on Tuesday instead. Keep all the other boxes.', { outcome: 'applied' });
    expectIdentity(h.slotAt(first, 0, 'dinner'), lentils);
    expectIdentity(h.slotAt(first, 1, 'dinner'), gnocchi);
    h.expectPreserved(before, first, [h.slotAt(before, 0, 'dinner'), h.slotAt(before, 1, 'dinner')]);

    const after = await h.critique(first, 'Neither of those replacements appeals either. Find us two different dinners for those same nights. The original aubergine and trout meals are still ruled out too, and everything outside those two supper boxes should stay put.', { outcome: 'applied' });
    const changedIds = [h.slotAt(after, 0, 'dinner').meal_id, h.slotAt(after, 1, 'dinner').meal_id];
    expect(new Set(changedIds)).toEqual(new Set([tagine.id, frittata.id]));
    h.expectReplacement(first, after, 0);
    h.expectReplacement(first, after, 1);
    h.expectPreserved(first, after, [h.slotAt(first, 0, 'dinner'), h.slotAt(first, 1, 'dinner')]);
  });

  it('fresh-confirmation: a selective undo restores the original assignment while retaining the other accepted revision', async (): Promise<void> => {
    const before = await h.generate();
    const originalMonday = h.slotAt(before, 0, 'dinner');
    const originalWednesday = h.slotAt(before, 2, 'dinner');
    const first = await h.critique(before, 'The family dinners on Monday and Wednesday both miss the mark. Choose a different saved dinner for each of those nights, leaving the rest of the week alone.', { outcome: 'applied' });
    h.expectReplacement(before, first, 0);
    h.expectReplacement(before, first, 2);
    h.expectPreserved(before, first, [originalMonday, originalWednesday]);
    const acceptedWednesday = h.slotAt(first, 2, 'dinner');

    const after = await h.critique(first, 'I take back my objection to the original Monday meal. Put Monday back to what it had before my last message. Wednesday’s new choice is good, so keep that revision and all the other arrangements.', { outcome: 'applied' });

    expectIdentity(h.slotAt(after, 0, 'dinner'), originalMonday);
    expect(h.slotAt(after, 2, 'dinner')).toEqual(acceptedWednesday);
    h.expectPreserved(first, after, [h.slotAt(first, 0, 'dinner')]);
  });

  it('fresh-confirmation: the only admissible replacement respects week budgets, saved type, audience, and existing dish repeats', async (): Promise<void> => {
    const rejected = savedMeal('limits-current', 'Chicken drumsticks and rice');
    const steak = savedMeal('limits-steak', 'Steak with green beans', { has_red_meat: true });
    const pork = savedMeal('limits-pork', 'Pork chops with apples', { has_red_meat: true });
    const enchiladas = savedMeal('limits-enchiladas', 'Vegetable enchiladas');
    const tortellini = savedMeal('limits-packed-one', 'Chilled tortellini with peas', { meal_type: 'lunch', prep_ahead: true });
    const riceSalad = savedMeal('limits-packed-two', 'Cold rice salad', { meal_type: 'lunch', prep_ahead: true });
    const muffins = savedMeal('limits-packed-three', 'Harvest vegetable muffins', { meal_type: 'lunch', prep_ahead: true });
    const cod = savedMeal('limits-valid', 'Cod with lemon and peas');
    const thirdRed = savedMeal('limits-extra-red', 'Lamb patties with cucumber', { has_red_meat: true });
    const fourthPrep = savedMeal('limits-extra-prep', 'Overnight bean casserole', { prep_ahead: true });
    const tooMuchWork = savedMeal('limits-effort', 'Handmade spinach ravioli', { effort: 5 });
    const sameCore = savedMeal('limits-repeat', 'Roasted vegetable enchiladas with avocado');
    const wrongType = savedMeal('limits-type', 'Evening salmon rice bowl', { meal_type: 'lunch' });
    const wrongAudience = savedMeal('limits-audience', 'Adult lemon trout plate', { audience: 'adult' });
    const before = await h.create([
      assignment(0, rejected), assignment(1, steak), assignment(2, pork),
      assignment(3, enchiladas), assignment(5, enchiladas),
      assignment(0, tortellini), assignment(1, riceSalad), assignment(2, muffins),
      emptyDinner(4, 'Takeout already ordered'),
    ], [rejected, steak, pork, enchiladas, tortellini, riceSalad, muffins, cod,
      thirdRed, fourthPrep, tooMuchWork, sameCore, wrongType, wrongAudience]);
    expect(before.plan.filter((slot) => slot.meal_id === enchiladas.id)).toHaveLength(2);
    expect(before.plan.filter((slot) => slot.meal_id !== null && h.mealFor(before, slot).has_red_meat)).toHaveLength(2);
    expect(before.plan.filter((slot) => slot.meal_id !== null && h.mealFor(before, slot).prep_ahead)).toHaveLength(3);

    const after = await h.critique(before, 'We are passing on Monday’s chicken drumsticks, but still need a family dinner there. Pick another saved dinner within the usual effort and weekly red-meat and prep-ahead limits. The two existing enchilada nights are intentional; keep them both, but do not add a third enchilada night or repeat another scheduled dish. Leave the packed lunches and takeout arrangement alone.', { outcome: 'applied' });

    expectIdentity(h.slotAt(after, 0, 'dinner'), cod);
    expect(after.plan.filter((slot) => slot.meal_id === enchiladas.id)).toHaveLength(2);
    h.expectPreserved(before, after, [h.slotAt(before, 0, 'dinner')]);
  });

  it('fresh-confirmation: an explicitly chosen celebration dish overrides effort for just its requested dinner', async (): Promise<void> => {
    const celebration = h.catalog.find((meal) => meal.id === 'meal_9');
    if (!celebration) throw new Error('The retained Marry Me Chicken fixture is required');
    expect(celebration.name).toBe('Marry Me Chicken, naan, fruit');
    expect(celebration.meal_type).toBe('dinner');
    expect(celebration.audience).toBe('family');
    expect(celebration.effort).toBeGreaterThan(4);
    expect(celebration.has_red_meat).toBe(false);
    expect(celebration.prep_ahead).toBe(false);
    const before = await h.generate();
    expect(before.plan.some((slot) => slot.meal_id === celebration.id)).toBe(false);

    const after = await h.critique(before, 'Monday is our celebration night. Please put the exact saved dish “Marry Me Chicken, naan, fruit” in the family dinner box. I know that recipe takes more work than our normal dinner limit and am expressly choosing it for this one night. Keep every other meal and every blank or labeled opening exactly as planned.', { outcome: 'applied' });

    expectIdentity(h.slotAt(after, 0, 'dinner'), celebration);
    h.expectPreserved(before, after, [h.slotAt(before, 0, 'dinner')]);
  });
}
