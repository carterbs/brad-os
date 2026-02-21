import type { Firestore } from 'firebase-admin/firestore';
import type { Plan, CreatePlanDTO, UpdatePlanDTO } from '../shared.js';
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

  async findAll(): Promise<Plan[]> {
    const snapshot = await this.collection.orderBy('name').get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Plan);
  }

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
