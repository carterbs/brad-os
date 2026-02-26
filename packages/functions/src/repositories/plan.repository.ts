import type { Firestore } from 'firebase-admin/firestore';
import type { Plan, CreatePlanDTO, UpdatePlanDTO } from '../shared.js';
import { BaseRepository } from './base.repository.js';
import { getCollectionName } from '../firebase.js';
import {
  isRecord,
  readNumber,
  readString,
} from './firestore-type-guards.js';

export class PlanRepository extends BaseRepository<
  Plan,
  CreatePlanDTO,
  UpdatePlanDTO & Record<string, unknown>
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

  protected parseEntity(id: string, data: Record<string, unknown>): Plan | null {
    const name = readString(data, 'name');
    const durationWeeks = readNumber(data, 'duration_weeks');
    const createdAt = readString(data, 'created_at');
    const updatedAt = readString(data, 'updated_at');

    if (
      name === null ||
      durationWeeks === null ||
      createdAt === null ||
      updatedAt === null
    ) {
      return null;
    }

    return {
      id,
      name,
      duration_weeks: durationWeeks,
      created_at: createdAt,
      updated_at: updatedAt,
    };
  }

  async findAll(): Promise<Plan[]> {
    const snapshot = await this.collection.orderBy('name').get();
    return snapshot.docs
      .map((doc) => {
        const data = doc.data();
        if (!isRecord(data)) {
          return null;
        }
        return this.parseEntity(doc.id, data);
      })
      .filter((plan): plan is Plan => plan !== null);
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
