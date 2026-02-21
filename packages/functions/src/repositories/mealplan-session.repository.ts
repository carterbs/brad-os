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

export class MealPlanSessionRepository extends BaseRepository<
  MealPlanSession,
  CreateMealPlanSessionDTO,
  UpdateMealPlanSessionDTO
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

  async findAll(): Promise<MealPlanSession[]> {
    const snapshot = await this.collection.orderBy('created_at', 'desc').get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as MealPlanSession);
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
