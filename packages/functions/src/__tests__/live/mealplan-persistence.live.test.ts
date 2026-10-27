import { readFileSync } from 'node:fs';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { expect, it } from 'vitest';
import { mealPlanSessionSchema } from '../../schemas/mealplan.schema.js';
import { MealPlanSessionRepository } from '../../repositories/mealplan-session.repository.js';
import { runWithEnvironment } from '../../runtime/environment-context.js';
import type { MealPlanEntry } from '../../shared.js';

it('persistence: stale finalization leaves the session and meal recency unchanged', async () => {
  if (process.env['FIRESTORE_EMULATOR_HOST'] !== '127.0.0.1:8080') {
    throw new Error('This integration test requires the disposable local Firestore emulator');
  }
  const app = initializeApp({ projectId: 'demo-jev-eval' }, 'jev-finalize-cas-' + process.pid);
  const db = getFirestore(app);
  const repository = new MealPlanSessionRepository(db);
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/may-catalog.json', import.meta.url), 'utf8')) as unknown;
  const catalog = mealPlanSessionSchema.shape.meals_snapshot.parse(fixture);
  const id = 'jev-finalize-cas-' + process.pid;
  const old = { ...catalog.find((meal) => meal.name === 'Garlic linguine')!, id: id + '-old', last_planned: null };
  const replacement = { ...catalog.find((meal) => meal.name === 'Frozen Pizza')!, id: id + '-new', last_planned: null };
  const sessionRef = db.collection('dev_meal_plan_sessions').doc(id);
  const mealRefs = [old, replacement].map((meal) => db.collection('dev_meals').doc(meal.id));
  const plan: MealPlanEntry[] = [{ day_index: 1, meal_track: 'family', meal_type: 'dinner', meal_id: old.id, meal_name: old.name }];
  const timestamp = '2026-09-20T12:00:00.000Z';
  try {
    const batch = db.batch();
    batch.set(sessionRef, { plan, meals_snapshot: [old, replacement], history: [], is_finalized: false, created_at: timestamp, updated_at: timestamp });
    for (const meal of [old, replacement]) batch.set(db.collection('dev_meals').doc(meal.id), meal);
    await batch.commit();
    const initial = await runWithEnvironment('dev', () => repository.findById(id));
    expect(initial).not.toBeNull();

    // A new conversation can have the same timestamp and unchanged plan.
    await sessionRef.update({ history: [{ role: 'user', content: 'Keep this draft for now.' }] });
    const beforeHistoryConflict = (await sessionRef.get()).data();
    const mealsBefore = await Promise.all(mealRefs.map(async (ref) => (await ref.get()).data()));
    expect(await runWithEnvironment('dev', () => repository.finalize(id, initial!))).toBeNull();
    expect((await sessionRef.get()).data()).toEqual(beforeHistoryConflict);
    expect(await Promise.all(mealRefs.map(async (ref) => (await ref.get()).data()))).toEqual(mealsBefore);

    const beforePlanChange = await runWithEnvironment('dev', () => repository.findById(id));
    expect(beforePlanChange).not.toBeNull();
    const updatedPlan = [{ ...plan[0]!, meal_id: replacement.id, meal_name: replacement.name }];
    await sessionRef.update({ plan: updatedPlan });
    const beforePlanConflict = (await sessionRef.get()).data();
    expect(await runWithEnvironment('dev', () => repository.finalize(id, beforePlanChange!))).toBeNull();
    expect((await sessionRef.get()).data()).toEqual(beforePlanConflict);
    expect(await Promise.all(mealRefs.map(async (ref) => (await ref.get()).data()))).toEqual(mealsBefore);

    const current = await runWithEnvironment('dev', () => repository.findById(id));
    expect(current).not.toBeNull();
    const finalized = await runWithEnvironment('dev', () => repository.finalize(id, current!));
    expect(finalized?.is_finalized).toBe(true);
    expect(finalized?.plan).toEqual(updatedPlan);
    expect(finalized?.history).toEqual(current!.history);
    expect(await runWithEnvironment('dev', () => repository.findById(id))).toEqual(finalized);
    expect((await mealRefs[0]!.get()).data()).toEqual(mealsBefore[0]);
    expect((await mealRefs[1]!.get()).get('last_planned')).toBe(finalized!.updated_at);
    expect((await mealRefs[1]!.get()).get('updated_at')).toBe(finalized!.updated_at);
  } finally {
    const cleanup = db.batch();
    cleanup.delete(sessionRef);
    for (const ref of mealRefs) cleanup.delete(ref);
    await cleanup.commit();
    await db.terminate();
    await deleteApp(app);
  }
});
