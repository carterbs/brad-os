import type { Firestore } from 'firebase-admin/firestore';
import type { Plan, CreatePlanDTO, UpdatePlanDTO } from '@brad-os/shared';
import { BaseRepository } from './base.repository.js';
import { getCollectionName } from '../firebase.js';

export class PlanRepository extends BaseRepository<
  Plan,
  CreatePlanDTO,
  UpdatePlanDTO
> {
  constructor(db?: Firestore) {
    super('plans', db);
  }

  async create(data: CreatePlanDTO): Promise<Plan> {
    const timestamps = this.createTimestamps();
    const planData = {
      name: data.name,
      duration_weeks: data.duration_weeks ?? 6,
      ...timestamps,
    };

    const docRef = await this.collection.add(planData);
    const plan: Plan = {
      id: docRef.id,
      ...planData,
    };

    return plan;
  }

  async findById(id: string): Promise<Plan | null> {
    const doc = await this.collection.doc(id).get();
    if (!doc.exists) {
      return null;
    }
    return { id: doc.id, ...doc.data() } as Plan;
  }

  async findAll(): Promise<Plan[]> {
    const snapshot = await this.collection.orderBy('name').get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Plan);
  }

  async update(id: string, data: UpdatePlanDTO): Promise<Plan | null> {
    const existing = await this.findById(id);
    if (!existing) {
      return null;
    }

    const updates: Record<string, string | number> = {};

    if (data.name !== undefined) {
      updates['name'] = data.name;
    }

    if (data.duration_weeks !== undefined) {
      updates['duration_weeks'] = data.duration_weeks;
    }

    if (Object.keys(updates).length === 0) {
      return existing;
    }

    updates['updated_at'] = this.updateTimestamp();

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

  /**
   * Check if plan is referenced by any mesocycles
   */
  async isInUse(id: string): Promise<boolean> {
    const mesocyclesCollection = this.db.collection(
      getCollectionName('mesocycles')
    );
    const snapshot = await mesocyclesCollection
      .where('plan_id', '==', id)
      .limit(1)
      .get();
    return !snapshot.empty;
  }
}
