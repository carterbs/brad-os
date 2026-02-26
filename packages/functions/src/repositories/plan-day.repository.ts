import type { Firestore } from 'firebase-admin/firestore';
import type {
  PlanDay,
  CreatePlanDayDTO,
  UpdatePlanDayDTO,
  DayOfWeek,
} from '../shared.js';
import { BaseRepository } from './base.repository.js';
import {
  isRecord,
  readNumber,
  readString,
} from './firestore-type-guards.js';

export class PlanDayRepository extends BaseRepository<
  PlanDay,
  CreatePlanDayDTO,
  UpdatePlanDayDTO & Record<string, unknown>
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

  protected parseEntity(id: string, data: Record<string, unknown>): PlanDay | null {
    const planId = readString(data, 'plan_id');
    const dayOfWeek = readNumber(data, 'day_of_week');
    const name = readString(data, 'name');
    const sortOrder = readNumber(data, 'sort_order');

    if (
      planId === null ||
      dayOfWeek === null ||
      name === null ||
      sortOrder === null
    ) {
      return null;
    }

    const isValidDayOfWeek = (value: number): value is DayOfWeek =>
      Number.isInteger(value) && value >= 0 && value <= 6;

    if (!isValidDayOfWeek(dayOfWeek)) {
      return null;
    }

    return {
      id,
      plan_id: planId,
      day_of_week: dayOfWeek,
      name,
      sort_order: sortOrder,
    };
  }

  async findByPlanId(planId: string): Promise<PlanDay[]> {
    const snapshot = await this.collection
      .where('plan_id', '==', planId)
      .orderBy('sort_order')
      .get();
    return snapshot.docs
      .map((doc) => {
        const data = doc.data();
        if (!isRecord(data)) {
          return null;
        }
        return this.parseEntity(doc.id, data);
      })
      .filter((planDay): planDay is PlanDay => planDay !== null);
  }

  async findAll(): Promise<PlanDay[]> {
    const snapshot = await this.collection
      .orderBy('plan_id')
      .orderBy('sort_order')
      .get();
    return snapshot.docs
      .map((doc) => {
        const data = doc.data();
        if (!isRecord(data)) {
          return null;
        }
        return this.parseEntity(doc.id, data);
      })
      .filter((planDay): planDay is PlanDay => planDay !== null);
  }
}
