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
  protected override includeTimestampOnUpdate = false;

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
}
