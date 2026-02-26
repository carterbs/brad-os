import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import type {
  MealPlanSession,
  CreateMealPlanSessionDTO,
  UpdateMealPlanSessionDTO,
  MealPlanEntry,
  ConversationMessage,
} from '../shared.js';
import { BaseRepository } from './base.repository.js';
import type { Meal } from '../shared.js';
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
    const mealType = readEnum(entry, 'meal_type', ['breakfast', 'lunch', 'dinner'] as const);
    const mealId = readNullableString(entry, 'meal_id');
    const mealName = readNullableString(entry, 'meal_name');

    if (
      dayIndex === null ||
      mealType === null ||
      mealId === undefined ||
      mealName === undefined
    ) {
      return null;
    }

    return {
      day_index: dayIndex,
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
        const mealType = readEnum(operation, 'meal_type', ['breakfast', 'lunch', 'dinner'] as const);
        const newMealId = readNullableString(operation, 'new_meal_id');
        if (
          dayIndex === null ||
          mealType === null ||
          newMealId === undefined
        ) {
          return null;
        }

        operations.push({
          day_index: dayIndex,
          meal_type: mealType,
          new_meal_id: newMealId,
        });
      }
    }

    return {
      role,
      content,
      ...(operations === undefined ? {} : { operations }),
    };
  }

  protected parseMeal(meal: unknown): Meal | null {
    if (!isRecord(meal)) {
      return null;
    }

    const mealId = readString(meal, 'id');
    const name = readString(meal, 'name');
    const mealType = readEnum(meal, 'meal_type', ['breakfast', 'lunch', 'dinner'] as const);
    const effort = readNumber(meal, 'effort');
    const hasRedMeat = readBoolean(meal, 'has_red_meat');
    const prepAhead = readBoolean(meal, 'prep_ahead');
    const url = readString(meal, 'url');
    const lastPlanned = readNullableString(meal, 'last_planned');
    const createdAt = readString(meal, 'created_at');
    const updatedAt = readString(meal, 'updated_at');

    if (
      mealId === null ||
      name === null ||
      mealType === null ||
      effort === null ||
      hasRedMeat === null ||
      prepAhead === null ||
      url === null ||
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

  async appendHistory(sessionId: string, message: ConversationMessage): Promise<MealPlanSession | null> {
    const existing = await this.findById(sessionId);
    if (!existing) {
      return null;
    }

    await this.collection.doc(sessionId).update({
      history: FieldValue.arrayUnion(message),
      updated_at: this.updateTimestamp(),
    });

    return this.findById(sessionId);
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
  ): Promise<void> {
    await this.collection.doc(sessionId).update({
      history: FieldValue.arrayUnion(userMessage, assistantMessage),
      plan: updatedPlan,
      updated_at: this.updateTimestamp(),
    });
  }
}
