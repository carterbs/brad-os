import type { Firestore } from 'firebase-admin/firestore';
import { isDeepStrictEqual } from 'node:util';
import { getCollectionName } from '../firebase.js';
import type {
  MealPlanSession,
  CreateMealPlanSessionDTO,
  UpdateMealPlanSessionDTO,
  MealPlanEntry,
  ConversationMessage,
  CritiqueContext,
} from '../shared.js';
import { BaseRepository } from './base.repository.js';
import { critiqueContextSchema, type Meal } from '../shared.js';
import {
  isRecord,
  readBoolean,
  readEnum,
  readNumber,
  readNullableString,
  readString,
} from './firestore-type-guards.js';

export class MealPlanSessionRepository extends BaseRepository<
  MealPlanSession,
  CreateMealPlanSessionDTO,
  UpdateMealPlanSessionDTO & Record<string, unknown>
> {
  constructor(db?: Firestore) {
    super('meal_plan_sessions', db);
  }

  async create(data: CreateMealPlanSessionDTO): Promise<MealPlanSession> {
    const timestamps = this.createTimestamps();
    const sessionData = {
      plan: data.plan,
      meals_snapshot: data.meals_snapshot,
      history: data.history,
      is_finalized: data.is_finalized,
      ...timestamps,
    };

    const docRef = await this.collection.add(sessionData);
    const session: MealPlanSession = {
      id: docRef.id,
      ...sessionData,
    };

    return session;
  }

  protected parseMealPlanEntry(entry: unknown): MealPlanEntry | null {
    if (!isRecord(entry)) {
      return null;
    }

    const dayIndex = readNumber(entry, 'day_index');
    const rawMealTrack = entry['meal_track'];
    const mealTrack =
      rawMealTrack === undefined
        ? 'family'
        : readEnum(entry, 'meal_track', ['family', 'adult'] as const);
    const mealType = readEnum(entry, 'meal_type', ['breakfast', 'lunch', 'dinner'] as const);
    const mealId = readNullableString(entry, 'meal_id');
    const mealName = readNullableString(entry, 'meal_name');

    if (
      dayIndex === null ||
      mealTrack === null ||
      mealType === null ||
      mealId === undefined ||
      mealName === undefined
    ) {
      return null;
    }

    return {
      day_index: dayIndex,
      meal_track: mealTrack,
      meal_type: mealType,
      meal_id: mealId,
      meal_name: mealName,
    };
  }

  protected parseConversationMessage(message: unknown): ConversationMessage | null {
    if (!isRecord(message)) {
      return null;
    }

    const role = readEnum(message, 'role', ['user', 'assistant'] as const);
    const content = readString(message, 'content');
    const operationsRaw = message['operations'];
    if (role === null || content === null) {
      return null;
    }

    let context: CritiqueContext | undefined;
    if (message['context'] !== undefined) {
      const parsedContext = critiqueContextSchema.safeParse(message['context']);
      if (!parsedContext.success) {
        return null;
      }
      context = parsedContext.data;
    }

    let previousAssignments: MealPlanEntry[] | undefined;
    const previousAssignmentsRaw = message['previous_assignments'];
    if (previousAssignmentsRaw !== undefined) {
      if (!Array.isArray(previousAssignmentsRaw)) {
        return null;
      }
      previousAssignments = [];
      for (const assignment of previousAssignmentsRaw) {
        const parsedAssignment = this.parseMealPlanEntry(assignment);
        if (parsedAssignment === null) {
          return null;
        }
        previousAssignments.push(parsedAssignment);
      }
    }

    let operations;
    if (operationsRaw !== undefined) {
      if (!Array.isArray(operationsRaw)) {
        return null;
      }

      operations = [];
      for (const operation of operationsRaw) {
        if (!isRecord(operation)) {
          return null;
        }

        const dayIndex = readNumber(operation, 'day_index');
        const rawMealTrack = operation['meal_track'];
        const mealTrack =
          rawMealTrack === undefined
            ? 'family'
            : readEnum(operation, 'meal_track', ['family', 'adult'] as const);
        const mealType = readEnum(operation, 'meal_type', ['breakfast', 'lunch', 'dinner'] as const);
        const newMealId = readNullableString(operation, 'new_meal_id');
        if (
          dayIndex === null ||
          mealTrack === null ||
          mealType === null ||
          newMealId === undefined
        ) {
          return null;
        }

        operations.push({
          day_index: dayIndex,
          meal_track: mealTrack,
          meal_type: mealType,
          new_meal_id: newMealId,
        });
      }
    }

    return {
      role,
      content,
      ...(context === undefined ? {} : { context }),
      ...(operations === undefined ? {} : { operations }),
      ...(previousAssignments === undefined ? {} : { previous_assignments: previousAssignments }),
    };
  }

  protected parseMeal(meal: unknown): Meal | null {
    if (!isRecord(meal)) {
      return null;
    }

    const mealId = readString(meal, 'id');
    const name = readString(meal, 'name');
    const mealType = readEnum(meal, 'meal_type', ['breakfast', 'lunch', 'dinner'] as const);
    const rawAudience = meal['audience'];
    const audience =
      rawAudience === undefined
        ? 'family'
        : readEnum(meal, 'audience', ['family', 'adult'] as const);
    const effort = readNumber(meal, 'effort');
    const hasRedMeat = readBoolean(meal, 'has_red_meat');
    const prepAhead = readBoolean(meal, 'prep_ahead');
    const url = readNullableString(meal, 'url');
    const lastPlanned = readNullableString(meal, 'last_planned');
    const createdAt = readString(meal, 'created_at');
    const updatedAt = readString(meal, 'updated_at');

    if (
      mealId === null ||
      name === null ||
      mealType === null ||
      audience === null ||
      effort === null ||
      hasRedMeat === null ||
      prepAhead === null ||
      url === undefined ||
      lastPlanned === undefined ||
      createdAt === null ||
      updatedAt === null
    ) {
      return null;
    }

    return {
      id: mealId,
      name,
      meal_type: mealType,
      audience,
      effort,
      has_red_meat: hasRedMeat,
      prep_ahead: prepAhead,
      url,
      last_planned: lastPlanned,
      created_at: createdAt,
      updated_at: updatedAt,
    };
  }

  protected parseEntity(id: string, data: Record<string, unknown>): MealPlanSession | null {
    const planRaw = data['plan'];
    const mealsSnapshotRaw = data['meals_snapshot'];
    const historyRaw = data['history'];
    const isFinalized = readBoolean(data, 'is_finalized');
    const createdAt = readString(data, 'created_at');
    const updatedAt = readString(data, 'updated_at');

    if (!Array.isArray(planRaw) || !Array.isArray(mealsSnapshotRaw) || !Array.isArray(historyRaw) || isFinalized === null || createdAt === null || updatedAt === null) {
      return null;
    }

    const plan: MealPlanEntry[] = [];
    for (const entry of planRaw) {
      const parsedEntry = this.parseMealPlanEntry(entry);
      if (parsedEntry === null) {
        return null;
      }
      plan.push(parsedEntry);
    }

    const mealsSnapshot: Meal[] = [];
    for (const meal of mealsSnapshotRaw) {
      const parsedMeal = this.parseMeal(meal);
      if (parsedMeal === null) {
        return null;
      }
      mealsSnapshot.push(parsedMeal);
    }

    const history: ConversationMessage[] = [];
    for (const message of historyRaw) {
      const parsedMessage = this.parseConversationMessage(message);
      if (parsedMessage === null) {
        return null;
      }
      history.push(parsedMessage);
    }

    return {
      id,
      plan,
      meals_snapshot: mealsSnapshot,
      history,
      is_finalized: isFinalized,
      created_at: createdAt,
      updated_at: updatedAt,
    };
  }

  async findAll(): Promise<MealPlanSession[]> {
    const snapshot = await this.collection.orderBy('created_at', 'desc').get();
    return snapshot.docs
      .map((doc) => {
        const data = doc.data();
        if (!isRecord(data)) {
          return null;
        }
        return this.parseEntity(doc.id, data);
      })
      .filter((session): session is MealPlanSession => session !== null);
  }

  async findLatest(): Promise<MealPlanSession | null> {
    const snapshot = await this.collection
      .orderBy('created_at', 'desc')
      .limit(1)
      .get();
    const latest = snapshot.docs[0];
    if (latest === undefined) {
      return null;
    }
    const data = latest.data();
    if (!isRecord(data)) {
      return null;
    }
    return this.parseEntity(latest.id, data);
  }

  async appendHistory(sessionId: string, message: ConversationMessage): Promise<MealPlanSession | null> {
    const docRef = this.collection.doc(sessionId);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(docRef);
      const existing = snapshot.exists ? this.docToEntity(snapshot) : null;
      if (existing === null) {
        return null;
      }
      const history = [...existing.history, message];
      const updatedAt = existing.updated_at;
      transaction.update(docRef, { history, updated_at: updatedAt });
      return { ...existing, history, updated_at: updatedAt };
    });
  }

  async updatePlan(sessionId: string, entries: MealPlanEntry[]): Promise<MealPlanSession | null> {
    const existing = await this.findById(sessionId);
    if (!existing) {
      return null;
    }

    await this.collection.doc(sessionId).update({
      plan: entries,
      updated_at: this.updateTimestamp(),
    });

    return this.findById(sessionId);
  }

  async applyCritiqueUpdates(
    sessionId: string,
    userMessage: ConversationMessage,
    assistantMessage: ConversationMessage,
    updatedPlan: MealPlanEntry[],
    expectedSession: MealPlanSession,
  ): Promise<boolean> {
    const docRef = this.collection.doc(sessionId);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(docRef);
      const current = snapshot.exists ? this.docToEntity(snapshot) : null;
      // Compare the complete loaded state, not only its millisecond timestamp:
      // concurrent edits can share a timestamp and still invalidate the decision.
      if (current === null || !isDeepStrictEqual(current, expectedSession)) {
        return false;
      }
      transaction.update(docRef, {
        history: [...current.history, userMessage, assistantMessage],
        plan: updatedPlan,
        // Recency uses this timestamp; clarification/history alone is not a new plan.
        updated_at: isDeepStrictEqual(current.plan, updatedPlan) ? current.updated_at : this.updateTimestamp(),
      });
      return true;
    });
  }

  async finalize(sessionId: string, expectedSession: MealPlanSession, activeMealIds?: ReadonlyArray<string>): Promise<MealPlanSession | null> {
    const docRef = this.collection.doc(sessionId);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(docRef);
      const current = snapshot.exists ? this.docToEntity(snapshot) : null;
      if (current === null || current.is_finalized || !isDeepStrictEqual(current, expectedSession)) {
        return null;
      }
      const meals = this.db.collection(getCollectionName('meals'));
      const mealIds = [...new Set(current.plan.flatMap((entry) => entry.meal_id === null || (activeMealIds !== undefined && !activeMealIds.includes(entry.meal_id)) ? [] : [entry.meal_id]))];
      const mealRefs = mealIds.map((id) => meals.doc(id));
      // Firestore requires every read before the first write. Including the meal
      // documents also makes concurrent recency changes retry this whole commit.
      const mealSnapshots = await Promise.all(mealRefs.map((ref) => transaction.get(ref)));
      const updatedAt = this.updateTimestamp();
      transaction.update(docRef, { is_finalized: true, updated_at: updatedAt });
      mealSnapshots.forEach((meal, index) => {
        const data = meal.exists ? meal.data() : undefined;
        if (!isRecord(data) || this.parseMeal({ ...data, id: meal.id, last_planned: data['last_planned'] ?? null }) === null) {
          return;
        }
        transaction.update(mealRefs[index]!, { last_planned: updatedAt, updated_at: updatedAt });
      });
      return { ...current, is_finalized: true, updated_at: updatedAt };
    });
  }
}
