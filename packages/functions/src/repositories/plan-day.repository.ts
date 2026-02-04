import type { Firestore } from 'firebase-admin/firestore';
import type {
  PlanDay,
  CreatePlanDayDTO,
  UpdatePlanDayDTO,
} from '../shared.js';
import { BaseRepository } from './base.repository.js';

export class PlanDayRepository extends BaseRepository<
  PlanDay,
  CreatePlanDayDTO,
  UpdatePlanDayDTO
> {
  constructor(db?: Firestore) {
    super('plan_days', db);
  }

  async create(data: CreatePlanDayDTO): Promise<PlanDay> {
    const planDayData = {
      plan_id: data.plan_id,
      day_of_week: data.day_of_week,
      name: data.name,
      sort_order: data.sort_order,
    };

    const docRef = await this.collection.add(planDayData);
    const planDay: PlanDay = {
      id: docRef.id,
      ...planDayData,
    };

    return planDay;
  }

  async findById(id: string): Promise<PlanDay | null> {
    const doc = await this.collection.doc(id).get();
    if (!doc.exists) {
      return null;
    }
    return { id: doc.id, ...doc.data() } as PlanDay;
  }

  async findByIds(ids: string[]): Promise<Map<string, PlanDay>> {
    if (ids.length === 0) {
      return new Map();
    }

    const refs = ids.map((id) => this.collection.doc(id));
    const docs = await this.db.getAll(...refs);
    const result = new Map<string, PlanDay>();
    for (const doc of docs) {
      if (doc.exists) {
        result.set(doc.id, { id: doc.id, ...doc.data() } as PlanDay);
      }
    }
    return result;
  }

  async findByPlanId(planId: string): Promise<PlanDay[]> {
    const snapshot = await this.collection
      .where('plan_id', '==', planId)
      .orderBy('sort_order')
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as PlanDay);
  }

  async findAll(): Promise<PlanDay[]> {
    const snapshot = await this.collection
      .orderBy('plan_id')
      .orderBy('sort_order')
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as PlanDay);
  }

  async update(id: string, data: UpdatePlanDayDTO): Promise<PlanDay | null> {
    const existing = await this.findById(id);
    if (!existing) {
      return null;
    }

    const updates: Record<string, string | number> = {};

    if (data.day_of_week !== undefined) {
      updates['day_of_week'] = data.day_of_week;
    }

    if (data.name !== undefined) {
      updates['name'] = data.name;
    }

    if (data.sort_order !== undefined) {
      updates['sort_order'] = data.sort_order;
    }

    if (Object.keys(updates).length === 0) {
      return existing;
    }

    await this.collection.doc(id).update(updates);
    return this.findById(id);
  }

  async delete(id: string): Promise<boolean> {
    const existing = await this.findById(id);
    if (!existing) {
      return false;
    }
    await this.collection.doc(id).delete();
    return true;
  }
}
