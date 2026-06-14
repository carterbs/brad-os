import type { MealPlanEntry, MealPlanSession } from '../shared.js';
import type { MealRepository } from '../repositories/meal.repository.js';
import type { MealPlanSessionRepository } from '../repositories/mealplan-session.repository.js';

export interface MealPlanRecencyReconciliationParams {
  previousPlan: ReadonlyArray<MealPlanEntry>;
  nextPlan: ReadonlyArray<MealPlanEntry>;
  sessionRepository: MealPlanSessionRepository;
  mealRepository: MealRepository;
}

export interface MealPlanRecencyReconciliationResult {
  affectedMealIds: string[];
}

export function getUniquePlannedMealIds(
  plan: ReadonlyArray<MealPlanEntry>
): string[] {
  const mealIds = new Set<string>();
  for (const entry of plan) {
    if (entry.meal_id !== null) {
      mealIds.add(entry.meal_id);
    }
  }
  return [...mealIds];
}

export function getAffectedMealIds(
  previousPlan: ReadonlyArray<MealPlanEntry>,
  nextPlan: ReadonlyArray<MealPlanEntry>
): string[] {
  const affectedMealIds = new Set(getUniquePlannedMealIds(previousPlan));
  for (const mealId of getUniquePlannedMealIds(nextPlan)) {
    affectedMealIds.add(mealId);
  }
  return [...affectedMealIds].sort();
}

export async function markPlanMealsLastPlanned(
  mealRepository: MealRepository,
  plan: ReadonlyArray<MealPlanEntry>,
  timestamp: string
): Promise<void> {
  const mealIds = getUniquePlannedMealIds(plan);
  await Promise.all(
    mealIds.map((mealId) => mealRepository.updateLastPlanned(mealId, timestamp))
  );
}

export async function reconcileMealLastPlanned(
  mealRepository: MealRepository,
  sessionRepository: MealPlanSessionRepository,
  mealIds: ReadonlyArray<string>
): Promise<void> {
  const uniqueMealIds = [...new Set(mealIds)];
  if (uniqueMealIds.length === 0) {
    return;
  }

  const finalizedSessions = (await sessionRepository.findAll()).filter(
    (session) => session.is_finalized
  );
  const latestByMealId = findLatestFinalizedPlanDates(
    finalizedSessions,
    uniqueMealIds
  );

  await Promise.all(
    uniqueMealIds.map((mealId) =>
      mealRepository.updateLastPlanned(
        mealId,
        latestByMealId.get(mealId) ?? null
      )
    )
  );
}

export async function reconcileMealLastPlannedForPlanChange({
  previousPlan,
  nextPlan,
  sessionRepository,
  mealRepository,
}: MealPlanRecencyReconciliationParams): Promise<MealPlanRecencyReconciliationResult> {
  const affectedMealIds = getAffectedMealIds(previousPlan, nextPlan);
  if (affectedMealIds.length === 0) {
    return { affectedMealIds };
  }

  await reconcileMealLastPlanned(
    mealRepository,
    sessionRepository,
    affectedMealIds
  );

  return { affectedMealIds };
}

function findLatestFinalizedPlanDates(
  sessions: ReadonlyArray<MealPlanSession>,
  mealIds: ReadonlyArray<string>
): Map<string, string> {
  const requestedMealIds = new Set(mealIds);
  const latestByMealId = new Map<string, string>();

  for (const session of sessions) {
    for (const entry of session.plan) {
      if (entry.meal_id === null || !requestedMealIds.has(entry.meal_id)) {
        continue;
      }

      const existing = latestByMealId.get(entry.meal_id);
      if (existing === undefined || session.updated_at > existing) {
        latestByMealId.set(entry.meal_id, session.updated_at);
      }
    }
  }

  return latestByMealId;
}
