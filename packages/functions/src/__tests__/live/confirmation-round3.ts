import { expect, it } from 'vitest';
import type { Meal, MealPlanEntry, MealPlanSession } from '../../shared.js';
import type { FreshConfirmationHelpers } from './confirmation-round2.js';

function syntheticMeal(
  id: string,
  name: string,
  mealType: Meal['meal_type'],
  audience: Meal['audience'] = 'family',
): Meal {
  return {
    id: `boundary-${id}`,
    name,
    meal_type: mealType,
    audience,
    effort: 2,
    has_red_meat: false,
    prep_ahead: false,
    url: null,
    last_planned: null,
    created_at: '2026-09-20T12:00:00.000Z',
    updated_at: '2026-09-20T12:00:00.000Z',
  };
}

async function boundaryFixture(h: FreshConfirmationHelpers): Promise<MealPlanSession> {
  const familyBreakfast = syntheticMeal('berry-oats', 'Berry oatmeal', 'breakfast');
  const adultBreakfast = syntheticMeal('tomato-eggs', 'Tomato egg scramble', 'breakfast', 'adult');
  const mondayDinner = syntheticMeal('lemon-chicken', 'Lemon chicken rice bowls', 'dinner');
  const wednesdayDinner = syntheticMeal('white-beans', 'White bean skillet', 'dinner');
  const lunch = syntheticMeal('chickpea-wraps', 'Chickpea salad wraps', 'lunch');
  const assigned = (day: number, meal: Meal): MealPlanEntry => ({
    day_index: day,
    meal_track: meal.audience,
    meal_type: meal.meal_type,
    meal_id: meal.id,
    meal_name: meal.name,
  });
  // Synthetic, complete catalog for every populated slot and feasible alternative.
  // Friday's explicit empty label is an untouched preservation control.
  return h.create([
    assigned(0, familyBreakfast),
    assigned(0, adultBreakfast),
    assigned(0, mondayDinner),
    assigned(1, lunch),
    assigned(2, wednesdayDinner),
    { day_index: 4, meal_track: 'family', meal_type: 'dinner', meal_id: null, meal_name: 'Eating out' },
  ], [
    familyBreakfast, adultBreakfast, mondayDinner, wednesdayDinner, lunch,
    syntheticMeal('banana-pancakes', 'Banana pancakes', 'breakfast'),
    syntheticMeal('pear-ricotta', 'Pear ricotta toast', 'breakfast', 'adult'),
    syntheticMeal('tuna-pitas', 'Tuna cucumber pitas', 'lunch'),
    syntheticMeal('ginger-tofu', 'Ginger tofu noodles', 'dinner'),
    syntheticMeal('baked-cod', 'Baked cod with couscous', 'dinner'),
  ]);
}

function expectCleared(h: FreshConfirmationHelpers, session: MealPlanSession, day: number,
  type: MealPlanEntry['meal_type']): void {
  expect(h.slotAt(session, day, type)).toMatchObject({ meal_id: null, meal_name: null });
}

export function registerBoundaryConfirmations(h: FreshConfirmationHelpers): void {
  it('boundary-confirmation: audience answer releases the entire pending compound request', async () => {
    const before = await boundaryFixture(h);
    const waiting = await h.critique(before,
      'Please put a different breakfast on Monday and choose a new family dinner for Wednesday.',
      { outcome: 'clarification_required' });
    expect(waiting.plan).toEqual(before.plan);

    const after = await h.critique(waiting,
      "The grown-ups' breakfast is the one I meant; you can go ahead now.",
      { outcome: 'applied' });
    h.expectReplacement(before, after, 0, 'breakfast', 'adult');
    h.expectReplacement(before, after, 2);
    h.expectPreserved(before, after, [
      h.slotAt(before, 0, 'breakfast', 'adult'), h.slotAt(before, 2, 'dinner'),
    ]);
  });

  it('boundary-confirmation: withdrawing an unresolved clause retains the remaining edits', async () => {
    const before = await boundaryFixture(h);
    const waiting = await h.critique(before,
      "I'd like to change Monday breakfast and Tuesday lunch. We also won't be home for Wednesday supper, so leave that meal blank.",
      { outcome: 'clarification_required' });
    expect(waiting.plan).toEqual(before.plan);

    const after = await h.critique(waiting,
      'Drop the breakfast change. Go ahead with everything else from that request.',
      { outcome: 'applied' });
    h.expectReplacement(before, after, 1, 'lunch');
    expectCleared(h, after, 2, 'dinner');
    h.expectPreserved(before, after, [
      h.slotAt(before, 1, 'lunch'), h.slotAt(before, 2, 'dinner'),
    ]);
  });

  it('boundary-confirmation: acknowledging the distinction and a meeting time grants no edit scope', async () => {
    const before = await boundaryFixture(h);
    const waiting = await h.critique(before,
      'Find another Monday breakfast, and please give us a different Wednesday dinner as well.',
      { outcome: 'clarification_required' });
    expect(waiting.plan).toEqual(before.plan);

    const after = await h.critique(waiting,
      'Thanks, that distinction makes sense. All I can confirm so far is that the 7:30 appointment is Monday.',
      { context: { calendar_context: 'Monday: appointment at 7:30 AM. No meal attendance information is available.' } });
    expect(after.plan).toEqual(before.plan);
    expect(after.history.at(-1)?.operations ?? []).toEqual([]);
  });

  it('boundary-confirmation: fresh rejection replaces food without replaying completed removals', async () => {
    const before = await boundaryFixture(h);
    const cleared = await h.critique(before,
      "We won't need Monday supper or Tuesday lunch; please leave those two spaces empty.",
      { outcome: 'applied' });
    expectCleared(h, cleared, 0, 'dinner');
    expectCleared(h, cleared, 1, 'lunch');
    h.expectPreserved(before, cleared, [
      h.slotAt(before, 0, 'dinner'), h.slotAt(before, 1, 'lunch'),
    ]);

    const after = await h.critique(cleared,
      "Wednesday's white bean skillet doesn't appeal to us. Pick another family dinner for that day and change the adults' Monday breakfast too.",
      { outcome: 'applied' });
    h.expectReplacement(cleared, after, 2);
    h.expectReplacement(cleared, after, 0, 'breakfast', 'adult');
    h.expectPreserved(cleared, after, [
      h.slotAt(cleared, 2, 'dinner'), h.slotAt(cleared, 0, 'breakfast', 'adult'),
    ]);
    const operations = after.history.at(-1)?.operations;
    expect(operations).toHaveLength(2);
    expect(operations).toEqual(expect.arrayContaining([
      expect.objectContaining({ day_index: 2, meal_track: 'family', meal_type: 'dinner' }),
      expect.objectContaining({ day_index: 0, meal_track: 'adult', meal_type: 'breakfast' }),
    ]));
  });
}
